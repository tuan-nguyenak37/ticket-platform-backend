import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, In, IsNull } from 'typeorm';
import { Ticket } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { EventStatus } from '../../events/entities/enums/event-status.enum';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import {
  CheckOutcome,
  CheckReport,
  FieldComparison,
  ScanResult,
} from './check.types';

const normalize = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const dateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  return {
    date: `${get('day')}/${get('month')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
};

@Injectable()
export class TicketReportService {
  constructor(private readonly config: ConfigService) {}
  async report(
    manager: EntityManager,
    ticket: Ticket,
    event: Event,
    scan: ScanResult,
  ): Promise<CheckReport> {
    const localTime = dateParts(event.startTime);
    const expected: Record<string, string | null> = {
      eventName: event.name,
      date: localTime.date,
      time: localTime.time,
      venue: event.venueName,
      ticketTier: ticket.ticketTier,
      seat: ticket.seatInfo || null,
      originalPrice: String(Number(ticket.originalPrice)),
    };
    const required = new Set(['eventName', 'date', 'ticketTier']);
    if (ticket.seatInfo) required.add('seat');
    const reasons: string[] = [];
    const fields: FieldComparison[] = Object.entries(expected).map(
      ([field, target]) => {
        const extracted = scan.fields[field];
        const value = extracted?.value ?? null;
        let status: FieldComparison['status'] = 'missing';
        if (value === null && extracted?.evidence.length) status = 'uncertain';
        if (value !== null && target !== null) {
          status =
            (extracted?.confidence ?? 0) < 95
              ? 'uncertain'
              : normalize(value) === normalize(target)
                ? 'match'
                : 'mismatch';
        } else if (value !== null) status = 'uncertain';
        if (
          (required.has(field) && status !== 'match') ||
          (value !== null && status !== 'match') ||
          status === 'uncertain'
        ) {
          reasons.push(`field_${field}_${status}`);
        }
        return {
          field,
          expected: target,
          observed: value,
          status,
          confidence: extracted?.confidence ?? 0,
          evidence: extracted?.evidence ?? [],
        };
      },
    );
    if (scan.codes.length === 0) reasons.push('code_missing');
    if (scan.codes.length > 1) reasons.push('multiple_codes');
    if (
      event.status !== EventStatus.PUBLISHED ||
      event.endTime.getTime() <= Date.now()
    )
      reasons.push('event_not_eligible');

    const fingerprints = scan.codes.map((code) => code.fingerprint);
    const duplicateQuery = manager
      .getRepository(Ticket)
      .createQueryBuilder('other')
      .leftJoin(
        'ticket_checks',
        'scan_check',
        'scan_check.ticket_id = other.ticket_id',
      )
      .select(['other.ticket_id', 'other.status', 'other.fileHash'])
      .where('other.ticket_id <> :id', { id: ticket.ticket_id });
    const matches: string[] = [];
    if (ticket.fileHash) {
      matches.push('other.fileHash = :fileHash');
      duplicateQuery.setParameter('fileHash', ticket.fileHash);
    }
    if (fingerprints.length) {
      matches.push(`(other.eventId = :eventId AND (
        other.approvedCodeFingerprint IN (:...fingerprints)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(scan_check.scan->'codes', '[]'::jsonb)) code
          WHERE code->>'fingerprint' IN (:...fingerprints))
      ))`);
      duplicateQuery.setParameters({ eventId: ticket.eventId, fingerprints });
    }
    const duplicates: CheckReport['duplicates'] = [];
    if (matches.length) {
      const records = await duplicateQuery
        .andWhere(`(${matches.join(' OR ')})`)
        .orderBy(
          `CASE WHEN other.status IN ('available', 'holding', 'sold') THEN 0 ELSE 1 END`,
          'ASC',
        )
        .addOrderBy('other.ticket_id', 'ASC')
        .limit(100)
        .getMany();
      for (const other of records) {
        duplicates.push({
          ticketId: other.ticket_id,
          status: other.status,
          kind: other.fileHash === ticket.fileHash ? 'file' : 'code',
        });
      }
    }
    if (duplicates.length) reasons.push('duplicate_detected');
    if (!this.config.get<boolean>('TICKET_AUTO_APPROVE_ENABLED', false))
      reasons.push('automatic_approval_disabled');
    const legacyCount = await manager.count(Ticket, {
      where: {
        approvedCodeFingerprint: IsNull(),
        status: In([
          TicketStatus.AVAILABLE,
          TicketStatus.HOLDING,
          TicketStatus.SOLD,
        ]),
      },
    });
    if (legacyCount) reasons.push('legacy_codes_unchecked');
    return {
      outcome: reasons.length ? CheckOutcome.NEEDS_REVIEW : CheckOutcome.PASSED,
      reasons,
      fields,
      duplicates,
    };
  }
}
