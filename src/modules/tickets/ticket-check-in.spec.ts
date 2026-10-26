import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { ResaleListing } from '../resale/entities/resale-listing.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketCheckInService } from './ticket-check-in.service';
import { TicketQrService } from './ticket-qr.service';
import { TicketsService } from './tickets.service';

function fixture() {
  const actor: Principal = {
    user_id: 'user_owner',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    sessionId: 'session_owner',
  };
  const payload = `pv1.example.${'A'.repeat(43)}`;
  const user = { user_id: actor.user_id, status: UserStatus.ACTIVE };
  const organizer = {
    organizerId: 'org_event',
    status: OrganizerStatus.ACTIVE,
  };
  const event = {
    eventId: 'event_selected',
    organizerId: organizer.organizerId,
    status: EventStatus.PUBLISHED,
  };
  const showing = {
    showingId: 'showing_selected',
    eventId: event.eventId,
    name: 'Evening showing',
    startTime: new Date('2035-01-01T12:00:00Z'),
    endTime: new Date('2035-01-01T15:00:00Z'),
  };
  const ticketType = {
    ticketTypeId: 'type_standard',
    showingId: showing.showingId,
    name: 'Standard',
  };
  const ticket: Ticket = Object.assign(new Ticket(), {
    ticketId: 'ticket_first',
    ticketTypeId: ticketType.ticketTypeId,
    orderItemId: 'item_paid',
    ownerUserId: 'user_buyer',
    ticketNumber: 1,
    status: TicketStatus.ACTIVE,
    checkedInAt: null,
    checkedInBy: null,
  });
  const state = {
    owner: true,
    listed: false,
    now: new Date('2035-01-01T11:00:00Z'),
  };
  const manager = {
    findOneBy: jest.fn((entity: unknown, where: Record<string, unknown>) => {
      if (entity === Event)
        return Promise.resolve(where.eventId === event.eventId ? event : null);
      if (entity === Ticket)
        return Promise.resolve(
          where.ticketId === ticket.ticketId ? { ...ticket } : null,
        );
      throw new Error('Unexpected reference lookup');
    }),
    findOne: jest.fn(
      (entity: unknown, options: { where: Record<string, unknown> }) => {
        if (entity === User) return Promise.resolve(user);
        if (entity === Organizer) return Promise.resolve(organizer);
        if (entity === Event) return Promise.resolve(event);
        if (entity === OrganizerMember)
          return Promise.resolve(
            state.owner ? { memberId: 'member_owner' } : null,
          );
        if (entity === Showing)
          return Promise.resolve(
            options.where.showingId === showing.showingId &&
              options.where.eventId === showing.eventId
              ? showing
              : null,
          );
        if (entity === TicketType)
          return Promise.resolve(
            options.where.showingId === ticketType.showingId
              ? ticketType
              : null,
          );
        if (entity === Ticket) return Promise.resolve({ ...ticket });
        throw new Error('Unexpected locked lookup');
      },
    ),
    existsBy: jest.fn().mockImplementation(() => Promise.resolve(state.listed)),
    query: jest
      .fn()
      .mockImplementation(() => Promise.resolve([{ now: state.now }])),
    update: jest
      .fn()
      .mockImplementation(
        (_entity: unknown, _where: unknown, values: Partial<Ticket>) => {
          if (ticket.checkedInAt) return Promise.resolve({ affected: 0 });
          Object.assign(ticket, values);
          return Promise.resolve({ affected: 1 });
        },
      ),
  };
  let previous = Promise.resolve();
  const source = {
    transaction: jest.fn(
      async (operation: (transaction: EntityManager) => Promise<unknown>) => {
        const waiting = previous;
        let release: (() => void) | undefined;
        previous = new Promise<void>((resolve) => {
          release = resolve;
        });
        await waiting;
        try {
          return await operation(manager as unknown as EntityManager);
        } finally {
          release?.();
        }
      },
    ),
  };
  const qr = {
    verify: jest.fn().mockResolvedValue({ ticketId: ticket.ticketId }),
  };
  const service = new TicketCheckInService(
    source as unknown as DataSource,
    qr as unknown as TicketQrService,
  );
  const scan = () =>
    service.checkIn(event.eventId, showing.showingId, actor, payload);
  return {
    service,
    scan,
    actor,
    payload,
    user,
    organizer,
    event,
    showing,
    ticketType,
    ticket,
    state,
    manager,
    source,
    qr,
  };
}

describe('Owner-only ticket check-in', () => {
  it('requires explicit event and showing identifiers before opening a transaction', () => {
    const { service, actor, payload, source } = fixture();
    expect(() => service.checkIn('event_selected', '', actor, payload)).toThrow(
      BadRequestException,
    );
    expect(source.transaction).not.toHaveBeenCalled();
  });
  it('locks the ticket, rechecks the QR and records one admission without private buyer data', async () => {
    const { scan, manager, qr, actor, state } = fixture();
    const result = await scan();
    expect(result).toMatchObject({
      result: 'CHECKED_IN',
      admitted: true,
      alreadyCheckedIn: false,
      checkedInAt: state.now.toISOString(),
      checkedInBy: actor.user_id,
      showingId: 'showing_selected',
      ticketTypeName: 'Standard',
    });
    expect(manager.findOne).toHaveBeenCalledWith(Ticket, {
      where: { ticketId: 'ticket_first' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(qr.verify).toHaveBeenCalledTimes(2);
    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('payload');
    expect(result).not.toHaveProperty('ownerUserId');
    expect(result).not.toHaveProperty('email');
  });

  it('rejects an inactive account before inspecting the QR', async () => {
    const { scan, user, qr, manager } = fixture();
    user.status = UserStatus.SUSPENDED;
    await expect(scan()).rejects.toBeInstanceOf(ForbiddenException);
    expect(qr.verify).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('does not grant admission to non-owners, even with an ADMIN role', async () => {
    const { scan, actor, state, qr } = fixture();
    actor.role = UserRole.ADMIN;
    state.owner = false;
    await expect(scan()).rejects.toBeInstanceOf(ForbiddenException);
    expect(qr.verify).not.toHaveBeenCalled();
  });

  it('rejects a suspended Organizer and an unpublished event', async () => {
    const suspended = fixture();
    suspended.organizer.status = OrganizerStatus.SUSPENDED;
    await expect(suspended.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_ORGANIZER_SUSPENDED' },
    });
    const unpublished = fixture();
    unpublished.event.status = EventStatus.DRAFT;
    await expect(unpublished.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_EVENT_NOT_PUBLISHED' },
    });
  });

  it('rejects a showing outside the selected event before reading the QR', async () => {
    const { scan, showing, qr } = fixture();
    showing.eventId = 'event_other';
    await expect(scan()).rejects.toBeInstanceOf(NotFoundException);
    expect(qr.verify).not.toHaveBeenCalled();
  });

  it('rejects a ticket for another showing without changing it', async () => {
    const { scan, ticketType, manager } = fixture();
    ticketType.showingId = 'showing_other';
    await expect(scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_WRONG_SHOWING' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('maps revoked or invalid QR to 400, not an access-session 401', async () => {
    const { scan, qr, manager } = fixture();
    qr.verify.mockRejectedValue(
      new UnauthorizedException('Credential revoked'),
    );
    await expect(scan()).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects a credential revoked between initial verification and the row lock', async () => {
    const { scan, qr, manager } = fixture();
    qr.verify.mockResolvedValueOnce({ ticketId: 'ticket_first' });
    qr.verify.mockRejectedValueOnce(
      new UnauthorizedException('Credential revoked'),
    );
    await expect(scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_INVALID_QR' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('preserves paid-order consistency failures without admitting the ticket', async () => {
    const { scan, qr, manager } = fixture();
    qr.verify.mockRejectedValue(new ConflictException('Issuance inconsistent'));
    await expect(scan()).rejects.toBeInstanceOf(ConflictException);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('opens at the exact 24-hour boundary using database time', async () => {
    const { scan, state, showing } = fixture();
    state.now = new Date(showing.startTime.getTime() - 86400000);
    await expect(scan()).resolves.toMatchObject({ admitted: true });
  });

  it('rejects a scan before opening and at the end of a showing', async () => {
    const early = fixture();
    early.state.now = new Date(early.showing.startTime.getTime() - 86400001);
    await expect(early.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_NOT_OPEN' },
    });
    const closed = fixture();
    closed.state.now = closed.showing.endTime;
    await expect(closed.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_CLOSED' },
    });
    expect(early.manager.update).not.toHaveBeenCalled();
    expect(closed.manager.update).not.toHaveBeenCalled();
  });

  it('does not consume a ticket listed or reserved for resale', async () => {
    const { scan, state, manager } = fixture();
    state.listed = true;
    await expect(scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_TICKET_LISTED' },
    });
    expect(manager.existsBy).toHaveBeenCalledWith(
      ResaleListing,
      expect.objectContaining({ ticketId: 'ticket_first' }),
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('returns the original admission on retry without overwriting its operator or time', async () => {
    const { scan, ticket, manager } = fixture();
    const originalTime = new Date('2035-01-01T10:00:00Z');
    ticket.checkedInAt = originalTime;
    ticket.checkedInBy = 'user_original_owner';
    await expect(scan()).resolves.toMatchObject({
      result: 'ALREADY_CHECKED_IN',
      admitted: false,
      alreadyCheckedIn: true,
      checkedInAt: originalTime.toISOString(),
      checkedInBy: 'user_original_owner',
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('produces one new admission for concurrent requests serialized by the transaction fixture', async () => {
    const { scan, manager } = fixture();
    const results = await Promise.all([scan(), scan()]);
    expect(results.filter((result) => result.admitted)).toHaveLength(1);
    expect(results.filter((result) => result.alreadyCheckedIn)).toHaveLength(1);
    expect(manager.update).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent admission data and a failed conditional write', async () => {
    const inconsistent = fixture();
    inconsistent.ticket.checkedInBy = 'user_missing_time';
    await expect(inconsistent.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_STATE_INVALID' },
    });
    const changed = fixture();
    changed.manager.update.mockResolvedValueOnce({ affected: 0 });
    await expect(changed.scan()).rejects.toMatchObject({
      response: { code: 'CHECK_IN_TICKET_CHANGED' },
    });
  });

  it('blocks ownership transfer of an admitted ticket before issuing new credentials', async () => {
    const { ticket, manager } = fixture();
    ticket.checkedInAt = new Date('2035-01-01T11:00:00Z');
    ticket.checkedInBy = 'user_owner';
    const issuance = { inspect: jest.fn() };
    const tickets = Reflect.construct(TicketsService, [
      undefined,
      issuance,
    ]) as TicketsService;
    await expect(
      tickets.transferOwnership(
        manager as unknown as EntityManager,
        ticket,
        ticket.ownerUserId,
        'user_new_buyer',
        new Date('2035-01-01T11:01:00Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(issuance.inspect).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('guards a stale transfer snapshot with a conditional not-checked-in write', async () => {
    const { ticket } = fixture();
    ticket.orderItem = { orderId: 'order_paid' } as Ticket['orderItem'];
    const manager = {
      find: jest
        .fn()
        .mockResolvedValue([{ credentialId: 'credential_current' }]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(),
    };
    const issuance = { inspect: jest.fn().mockResolvedValue(undefined) };
    const tickets = Reflect.construct(TicketsService, [
      undefined,
      issuance,
    ]) as TicketsService;
    await expect(
      tickets.transferOwnership(
        manager as unknown as EntityManager,
        ticket,
        ticket.ownerUserId,
        'user_new_buyer',
        new Date('2035-01-01T11:01:00Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.update).toHaveBeenCalledWith(
      Ticket,
      expect.objectContaining({ checkedInAt: IsNull(), checkedInBy: IsNull() }),
      { ownerUserId: 'user_new_buyer' },
    );
    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(manager.insert).not.toHaveBeenCalled();
  });
});
