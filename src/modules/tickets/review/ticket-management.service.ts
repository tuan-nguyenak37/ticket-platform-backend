import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { UploadsService } from '../../../common/uploads/uploads.service';
import { Ticket } from '../entities/ticket.entity';
import { TicketCheck } from '../entities/ticket-check.entity';
import { TicketReview } from '../entities/ticket-review.entity';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import { TicketResponseDto } from '../dto/ticket-response.dto';
import { ManageTicketsDto } from '../dto/manage-tickets.dto';
import type { Principal } from '../../auth/authorization/principal';
import { CheckOutcome, CheckStatus } from './check.types';
import { TicketReviewService } from './ticket-review.service';
import { TicketReportService } from './ticket-report.service';

@Injectable()
export class TicketManagementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly reviews: TicketReviewService,
    private readonly reports: TicketReportService,
  ) {}

  async list(actor: Principal, query: ManageTicketsDto) {
    this.reviews.requireManager(actor);
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BadRequestException('Invalid price range');
    const builder = this.dataSource
      .getRepository(Ticket)
      .createQueryBuilder('ticket')
      .innerJoinAndSelect('ticket.event', 'event')
      .leftJoinAndMapOne(
        'ticket.check',
        TicketCheck,
        'scan_check',
        'scan_check.ticketId = ticket.ticket_id',
      )
      .where('ticket.status = :status', {
        status: query.status ?? TicketStatus.PENDING_REVIEW,
      });
    if (query.checkStatus)
      builder.andWhere('scan_check.status = :checkStatus', {
        checkStatus: query.checkStatus,
      });
    if (!query.status && !query.checkStatus) {
      builder.andWhere(
        '(scan_check.outcome = :needs OR scan_check.status = :failed OR scan_check.ticketId IS NULL)',
        { needs: CheckOutcome.NEEDS_REVIEW, failed: CheckStatus.FAILED },
      );
    }
    if (query.reviewMethod)
      builder.andWhere('ticket.reviewMethod = :method', {
        method: query.reviewMethod,
      });
    if (query.eventId)
      builder.andWhere('ticket.eventId = :eventId', { eventId: query.eventId });
    if (query.categoryId)
      builder.andWhere('event.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.ticketTier)
      builder.andWhere('lower(ticket.ticketTier) = lower(:tier)', {
        tier: query.ticketTier,
      });
    if (query.q)
      builder.andWhere(
        '(strpos(lower(event.name), lower(:q)) > 0 OR strpos(lower(ticket.ticketTier), lower(:q)) > 0)',
        { q: query.q },
      );
    if (query.minPrice !== undefined)
      builder.andWhere('ticket.price >= :min', { min: query.minPrice });
    if (query.maxPrice !== undefined)
      builder.andWhere('ticket.price <= :max', { max: query.maxPrice });
    const [tickets, total] = await builder
      .orderBy('ticket.createdAt', 'ASC')
      .addOrderBy('ticket.ticket_id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: tickets.map((ticket) => {
        const check = (ticket as Ticket & { check?: TicketCheck }).check;
        return {
          ...TicketResponseDto.from(ticket),
          event: TicketResponseDto.listItem(ticket).event,
          check: check
            ? {
                status: check.status,
                outcome: check.outcome,
                version: check.version,
                errorCode: check.errorCode,
              }
            : null,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async detail(actor: Principal, id: string) {
    this.reviews.requireManager(actor);
    const ticket = await this.dataSource
      .getRepository(Ticket)
      .findOne({ where: { ticket_id: id }, relations: { event: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const check = await this.dataSource
      .getRepository(TicketCheck)
      .findOneBy({ ticketId: id });
    const review = await this.dataSource
      .getRepository(TicketReview)
      .findOneBy({ ticketId: id });
    const report = check?.scan
      ? await this.reports.report(
          this.dataSource.manager,
          ticket,
          ticket.event,
          check.scan,
        )
      : null;
    if (report && check?.errorCode === 'auto_review_failed') {
      report.outcome = CheckOutcome.NEEDS_REVIEW;
      report.reasons.push('auto_review_failed');
    }
    return {
      ...TicketResponseDto.from(ticket),
      event: TicketResponseDto.listItem(ticket).event,
      fileUrl: `/api/tickets/manage/${id}/file`,
      check: check
        ? {
            status: check.status,
            outcome: report?.outcome ?? check.outcome,
            version: check.version,
            attempts: check.attempts,
            completedAt: check.completedAt,
            errorCode: check.errorCode,
            engineVersion: check.scan?.engineVersion ?? null,
            codes:
              check.scan?.codes.map(
                ({ fingerprint: _private, ...code }) => code,
              ) ?? [],
            report,
          }
        : null,
      review: review
        ? {
            decision: review.decision,
            method: review.method,
            actorId: review.actorId,
            checkVersion: review.checkVersion,
            selectedCodeId: review.selectedCodeId,
            note: review.note,
            createdAt: review.createdAt,
            report: review.report,
          }
        : null,
    };
  }

  async file(actor: Principal, id: string) {
    this.reviews.requireManager(actor);
    const ticket = await this.dataSource
      .getRepository(Ticket)
      .findOne({ where: { ticket_id: id }, select: { ticketFileUrl: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.uploads.readTicketFile(this.filename(ticket.ticketFileUrl));
  }

  filename(url: string) {
    try {
      const filename = new URL(url, 'http://local').searchParams.get('file');
      if (!filename) throw new Error();
      return filename;
    } catch {
      throw new NotFoundException('Ticket file not found');
    }
  }

  async enqueue(actor: Principal, id: string) {
    this.reviews.requireManager(actor);
    return this.dataSource.transaction(async (manager) => {
      const ticket = await manager.findOne(Ticket, {
        where: { ticket_id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.status !== TicketStatus.PENDING_REVIEW)
        throw new ConflictException('Only pending tickets can be checked');
      const existing = await manager.findOne(TicketCheck, {
        where: { ticketId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        existing &&
        [CheckStatus.QUEUED, CheckStatus.PROCESSING].includes(existing.status)
      )
        return {
          ticket_id: id,
          status: existing.status,
          version: existing.version,
        };
      if (existing && Date.now() - existing.updatedAt.getTime() < 60000)
        throw new ConflictException('Wait one minute before checking again');
      if (!ticket.fileHash) {
        const file = await this.uploads.readTicketFile(
          this.filename(ticket.ticketFileUrl),
        );
        ticket.fileHash = createHash('sha256')
          .update(file.buffer)
          .digest('hex');
        await manager.save(ticket);
      }
      const check =
        existing ?? manager.create(TicketCheck, { ticketId: id, version: 0 });
      check.version += 1;
      check.status = CheckStatus.QUEUED;
      check.outcome = null;
      check.attempts = 0;
      check.leaseToken = null;
      check.leaseUntil = null;
      check.nextAttemptAt = new Date();
      check.errorCode = null;
      check.completedAt = null;
      await manager.save(check);
      return { ticket_id: id, status: check.status, version: check.version };
    });
  }
}
