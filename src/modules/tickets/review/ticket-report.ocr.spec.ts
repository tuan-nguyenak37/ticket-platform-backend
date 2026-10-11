import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { TicketReportService } from './ticket-report.service';
import { CheckOutcome, ScanResult } from './check.types';
import { Ticket } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { EventStatus } from '../../events/entities/enums/event-status.enum';

describe('OCR evidence in ticket reports', () => {
  it('blocks approval for an unparseable optional price even when required fields match', async () => {
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const manager = {
      getRepository: () => ({ createQueryBuilder: () => query }),
      count: jest.fn().mockResolvedValue(0),
    } as unknown as EntityManager;
    const service = new TicketReportService(
      new ConfigService({ TICKET_AUTO_APPROVE_ENABLED: true }),
    );
    const scan: ScanResult = {
      engineVersion: 'test',
      codes: [{ id: '1', format: 'QR', fingerprint: 'test', page: 1, box: [] }],
      fields: {
        eventName: { value: 'Demo', confidence: 99, evidence: [] },
        date: { value: '20/12/2099', confidence: 99, evidence: [] },
        ticketTier: { value: 'VIP', confidence: 99, evidence: [] },
        originalPrice: {
          value: null,
          confidence: 0,
          evidence: [
            { text: 'Face value: USD 100', confidence: 99, page: 1, box: [] },
          ],
        },
      },
    };
    const ticket = {
      ticket_id: '1',
      eventId: '1',
      ticketTier: 'VIP',
      originalPrice: 500000,
    } as Ticket;
    const event = {
      name: 'Demo',
      startTime: new Date('2099-12-20T12:00:00Z'),
      endTime: new Date('2099-12-20T15:00:00Z'),
      status: EventStatus.PUBLISHED,
    } as Event;
    const report = await service.report(manager, ticket, event, scan);
    expect(report.outcome).toBe(CheckOutcome.NEEDS_REVIEW);
    expect(report.reasons).toEqual(['field_originalPrice_uncertain']);
    delete scan.fields.originalPrice;
    expect((await service.report(manager, ticket, event, scan)).outcome).toBe(
      CheckOutcome.PASSED,
    );
  });
});
