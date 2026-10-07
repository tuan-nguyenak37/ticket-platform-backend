import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { createHash } from 'crypto';
import { Ticket } from '../entities/ticket.entity';
import { TicketCheck } from '../entities/ticket-check.entity';
import { TicketReview } from '../entities/ticket-review.entity';
import { Event } from '../../events/entities/event.entity';
import { EventStatus } from '../../events/entities/enums/event-status.enum';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import type { Principal } from '../../auth/authorization/principal';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { ReviewTicketDto } from '../dto/review-ticket.dto';
import { TicketResponseDto } from '../dto/ticket-response.dto';
import { CheckOutcome, CheckStatus, ReviewMethod } from './check.types';
import { TicketReportService } from './ticket-report.service';

@Injectable()
export class TicketReviewService {
  private readonly logger = new Logger('TicketReview');
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly reports: TicketReportService,
  ) {}

  requireManager(actor: Principal) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role))
      throw new ForbiddenException();
  }

  async review(actor: Principal, id: string, dto: ReviewTicketDto) {
    this.requireManager(actor);
    return this.decide(id, dto, actor);
  }

  async autoApprove(id: string, version: number) {
    if (!this.config.get<boolean>('TICKET_AUTO_APPROVE_ENABLED', false)) return;
    try {
      await this.decide(id, { decision: 'approve', checkVersion: version });
      this.logger.log(
        JSON.stringify({
          action: 'tickets.review.automatic',
          targetId: id,
          result: 'allowed',
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      await this.dataSource
        .getRepository(TicketCheck)
        .update(
          { ticketId: id, version, status: CheckStatus.COMPLETED },
          {
            outcome: CheckOutcome.NEEDS_REVIEW,
            errorCode:
              error instanceof ConflictException ||
              error instanceof NotFoundException
                ? null
                : 'auto_review_failed',
          },
        );
      this.logger.log(
        JSON.stringify({
          action: 'tickets.review.automatic',
          targetId: id,
          result: 'needs_review',
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private async decide(id: string, dto: ReviewTicketDto, actor?: Principal) {
    try {
      return await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) => {
          const identity = await manager.findOne(Ticket, {
            where: { ticket_id: id },
            select: { ticket_id: true, eventId: true },
          });
          if (!identity) throw new NotFoundException('Ticket not found');
          const event = await manager.findOne(Event, {
            where: { event_id: identity.eventId },
            lock: { mode: 'pessimistic_read' },
          });
          const ticket = await manager.findOne(Ticket, {
            where: { ticket_id: id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!ticket || !event)
            throw new NotFoundException('Ticket not found');
          if (actor?.user_id === ticket.sellerId)
            throw new ForbiddenException('Cannot review your own ticket');
          if (ticket.status !== TicketStatus.PENDING_REVIEW)
            throw new ConflictException('Ticket is no longer pending review');
          const check = await manager.findOne(TicketCheck, {
            where: { ticketId: id },
            lock: { mode: 'pessimistic_write' },
          });
          let report = check?.scan
            ? await this.reports.report(manager, ticket, event, check.scan)
            : null;
          let selectedCodeId: string | null = null;
          if (dto.decision === 'approve') {
            if (
              !check ||
              check.status !== CheckStatus.COMPLETED ||
              !check.scan ||
              check.version !== dto.checkVersion
            ) {
              throw new ConflictException(
                'A completed current check version is required',
              );
            }
            if (
              event.status !== EventStatus.PUBLISHED ||
              event.endTime.getTime() <= Date.now()
            )
              throw new ConflictException('Event is not eligible');
            const code = actor
              ? check.scan.codes.find(
                  (candidate) => candidate.id === dto.selectedCodeId,
                )
              : check.scan.codes.length === 1
                ? check.scan.codes[0]
                : undefined;
            if (!code)
              throw new ConflictException(
                'A decoded ticket code must be selected',
              );
            const lock = createHash('sha256')
              .update(ticket.eventId)
              .update(':')
              .update(code.fingerprint)
              .digest();
            await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
              lock.readInt32BE(0),
              lock.readInt32BE(4),
            ]);
            // READ COMMITTED sees reviews committed by the previous lock holder.
            report = await this.reports.report(
              manager,
              ticket,
              event,
              check.scan,
            );
            const duplicate = await manager.findOne(Ticket, {
              where: {
                eventId: ticket.eventId,
                approvedCodeFingerprint: code.fingerprint,
                status: In([
                  TicketStatus.AVAILABLE,
                  TicketStatus.HOLDING,
                  TicketStatus.SOLD,
                ]),
              },
              select: { ticket_id: true },
            });
            if (duplicate)
              throw new ConflictException('Ticket code is already approved');
            if (!actor && report.outcome !== CheckOutcome.PASSED)
              throw new ConflictException('Manual review is required');
            if (actor && report.reasons.length && !dto.note?.trim())
              throw new BadRequestException(
                'A note is required to resolve check warnings',
              );
            ticket.approvedCodeFingerprint = code.fingerprint;
            selectedCodeId = code.id;
            ticket.status = TicketStatus.AVAILABLE;
            ticket.rejectionReason = null;
          } else {
            if (!dto.reason?.trim())
              throw new BadRequestException('A rejection reason is required');
            ticket.status = TicketStatus.REJECTED;
            ticket.rejectionReason = dto.reason.trim();
          }
          // The transaction/duplicate lookup may have waited past the event's end.
          if (
            dto.decision === 'approve' &&
            event.endTime.getTime() <= Date.now()
          )
            throw new ConflictException('Event has ended');
          ticket.verifiedBy = actor?.user_id ?? null;
          ticket.verifiedAt = new Date();
          ticket.reviewMethod = actor
            ? ReviewMethod.MANUAL
            : ReviewMethod.AUTOMATIC;
          await manager.insert(TicketReview, {
            ticketId: id,
            decision: dto.decision,
            method: ticket.reviewMethod,
            actorId: actor?.user_id ?? null,
            checkVersion: check?.version ?? null,
            selectedCodeId,
            note: dto.decision === 'reject' ? dto.reason : (dto.note ?? null),
            report,
          });
          return TicketResponseDto.from(await manager.save(ticket));
        },
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Ticket or code has already been reviewed');
      }
      throw error;
    }
  }
}
