import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Ticket } from '../entities/ticket.entity';
import { TicketCheck } from '../entities/ticket-check.entity';
import { Event } from '../../events/entities/event.entity';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import { UploadsService } from '../../../common/uploads/uploads.service';
import { CheckOutcome, CheckStatus, ScanResult } from './check.types';
import {
  LocalTicketScanner,
  ScanFailure,
} from './local-ticket-scanner.service';
import { TicketReportService } from './ticket-report.service';
import { TicketReviewService } from './ticket-review.service';

@Injectable()
export class TicketCheckWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('TicketCheckWorker');
  private stopping = false;
  private loop?: Promise<void>;
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly scanner: LocalTicketScanner,
    private readonly uploads: UploadsService,
    private readonly reports: TicketReportService,
    private readonly reviews: TicketReviewService,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('TICKET_WORKER_ENABLED', false)) return;
    await this.start();
  }

  async start() {
    if (this.loop) return;
    const secret = this.config.get<string>('TICKET_CODE_HMAC_SECRET');
    if (!secret || secret.length < 32)
      throw new Error('Ticket worker requires TICKET_CODE_HMAC_SECRET');
    await this.scanner.ready();
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    await this.loop;
  }

  private async run() {
    while (!this.stopping) {
      try {
        const check = await this.claim();
        if (check) await this.process(check);
      } catch {
        this.logger.error(
          JSON.stringify({
            action: 'tickets.check.worker',
            result: 'failed',
            errorCode: 'worker_iteration_failed',
          }),
        );
      }
      if (!this.stopping)
        await new Promise<void>((accept) => setTimeout(accept, 2000));
    }
  }

  private async claim() {
    const now = new Date();
    await this.dataSource
      .getRepository(TicketCheck)
      .createQueryBuilder()
      .update()
      .set({
        status: CheckStatus.FAILED,
        outcome: CheckOutcome.NEEDS_REVIEW,
        errorCode: 'lease_attempts_exhausted',
        leaseToken: null,
        leaseUntil: null,
        completedAt: now,
      })
      .where('status = :status AND "leaseUntil" < :now AND attempts >= 3', {
        status: CheckStatus.PROCESSING,
        now,
      })
      .execute();
    return this.dataSource.transaction(async (manager) => {
      const check = await manager
        .getRepository(TicketCheck)
        .createQueryBuilder('job')
        .where(
          '(job.status = :queued AND job.nextAttemptAt <= :now) OR (job.status = :processing AND job.leaseUntil < :now AND job.attempts < 3)',
          {
            queued: CheckStatus.QUEUED,
            processing: CheckStatus.PROCESSING,
            now,
          },
        )
        .orderBy('job.nextAttemptAt', 'ASC')
        .addOrderBy('job.ticketId', 'ASC')
        .limit(1)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!check) return null;
      check.status = CheckStatus.PROCESSING;
      check.attempts += 1;
      check.startedAt = now;
      check.leaseToken = randomUUID();
      check.leaseUntil = new Date(now.getTime() + 180000);
      return manager.save(check);
    });
  }

  private async process(job: TicketCheck) {
    const started = Date.now();
    try {
      const ticket = await this.dataSource
        .getRepository(Ticket)
        .findOneBy({ ticket_id: job.ticketId });
      if (!ticket || ticket.status !== TicketStatus.PENDING_REVIEW) {
        await this.finish(job, null);
        return;
      }
      const filename = new URL(
        ticket.ticketFileUrl,
        'http://local',
      ).searchParams.get('file');
      if (!filename) throw new ScanFailure('file_missing');
      const file = await this.uploads.readTicketFile(filename);
      if (
        createHash('sha256').update(file.buffer).digest('hex') !==
        ticket.fileHash
      )
        throw new ScanFailure('file_changed');
      const result = await this.scanner.scan(
        this.uploads.ticketFilePath(filename),
      );
      await this.finish(job, result);
      await this.reviews.autoApprove(job.ticketId, job.version);
      this.logger.log(
        JSON.stringify({
          action: 'tickets.check',
          targetId: job.ticketId,
          version: job.version,
          result: 'completed',
          durationMs: Date.now() - started,
        }),
      );
    } catch (error) {
      const failure =
        error instanceof ScanFailure
          ? error
          : new ScanFailure('check_failed', true);
      await this.dataSource
        .getRepository(TicketCheck)
        .createQueryBuilder()
        .update()
        .set({
          status:
            failure.retryable && job.attempts < 3
              ? CheckStatus.QUEUED
              : CheckStatus.FAILED,
          outcome: CheckOutcome.NEEDS_REVIEW,
          errorCode: failure.code,
          nextAttemptAt: new Date(Date.now() + 10000 * job.attempts),
          leaseToken: null,
          leaseUntil: null,
          completedAt: new Date(),
        })
        .where(
          'ticket_id = :id AND version = :version AND "leaseToken" = :token',
          { id: job.ticketId, version: job.version, token: job.leaseToken },
        )
        .execute();
      this.logger.error(
        JSON.stringify({
          action: 'tickets.check',
          targetId: job.ticketId,
          version: job.version,
          result: 'failed',
          errorCode: failure.code,
          durationMs: Date.now() - started,
        }),
      );
    }
  }

  private async finish(job: TicketCheck, scan: ScanResult | null) {
    await this.dataSource.transaction(async (manager) => {
      const identity = await manager.findOne(Ticket, {
        where: { ticket_id: job.ticketId },
        select: { eventId: true },
      });
      if (!identity) return;
      const event = await manager.findOne(Event, {
        where: { event_id: identity.eventId },
        lock: { mode: 'pessimistic_read' },
      });
      const ticket = await manager.findOne(Ticket, {
        where: { ticket_id: job.ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      const check = await manager.findOne(TicketCheck, {
        where: { ticketId: job.ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !ticket ||
        !event ||
        !check ||
        check.version !== job.version ||
        check.leaseToken !== job.leaseToken ||
        !check.leaseUntil ||
        check.leaseUntil.getTime() <= Date.now()
      )
        return;
      check.status =
        !scan || ticket.status !== TicketStatus.PENDING_REVIEW
          ? CheckStatus.SKIPPED
          : CheckStatus.COMPLETED;
      if (check.status === CheckStatus.COMPLETED && scan) {
        check.scan = scan;
        check.outcome = (
          await this.reports.report(manager, ticket, event, scan)
        ).outcome;
      }
      check.completedAt = new Date();
      check.leaseToken = null;
      check.leaseUntil = null;
      check.errorCode = null;
      await manager.save(check);
    });
  }
}
