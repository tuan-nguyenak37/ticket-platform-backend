import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { TicketReservation } from '../orders/entities/ticket-reservation.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ReservationStatus } from '../orders/enums/reservation-status.enum';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketOwnership } from './entities/ticket-ownership.entity';
import { TicketIssuanceService } from './ticket-issuance.service';

describe('Paid-order ticket issuance', () => {
  const service = new TicketIssuanceService();
  const issuedAt = new Date('2035-01-01T00:05:00Z');
  let order: Order;
  let item: OrderItem;
  let payment: Payment;
  let reservation: TicketReservation;
  let tickets: Ticket[];
  let manager: EntityManager;
  const database = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
    create: jest.fn(),
    insert: jest.fn(),
  };

  const existingTicket = (ticketNumber: number): Ticket =>
    Object.assign(new Ticket(), {
      ticketId: `ticket_existing_${ticketNumber}`,
      orderItemId: item.orderItemId,
      ticketTypeId: item.ticketTypeId,
      ownerUserId: order.userId,
      ticketNumber,
      status: TicketStatus.ACTIVE,
      credentials: [
        { credentialId: `cred_existing_${ticketNumber}`, revokedAt: null },
      ],
      ownerships: [{ fromUserId: null, toUserId: order.userId }],
    });

  beforeEach(() => {
    jest.resetAllMocks();
    order = Object.assign(new Order(), {
      orderId: 'ord_paid',
      userId: 'user_buyer',
      status: OrderStatus.PAID,
      totalAmount: '380000',
      discountAmount: '20000',
    });
    item = Object.assign(new OrderItem(), {
      orderId: order.orderId,
      orderItemId: 'item_paid',
      ticketTypeId: 'ttype_paid',
      unitPrice: '200000',
      quantity: 2,
    });
    payment = Object.assign(new Payment(), {
      orderId: order.orderId,
      status: PaymentStatus.SUCCEEDED,
      amount: '380000',
    });
    reservation = Object.assign(new TicketReservation(), {
      orderId: order.orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      status: ReservationStatus.CONSUMED,
    });
    tickets = [];
    const records = new Map<unknown, unknown>([
      [Order, order],
      [OrderItem, item],
      [Payment, payment],
      [TicketReservation, reservation],
    ]);
    database.findOneBy.mockImplementation(async (entity: unknown) =>
      records.get(entity),
    );
    database.findOne.mockResolvedValue(order);
    database.find.mockImplementation(async () => tickets);
    database.query.mockResolvedValue([{ issuedAt }]);
    database.create.mockImplementation(
      (_entity: unknown, data: Partial<Ticket>) =>
        Object.assign(new Ticket(), data, { credentials: [], ownerships: [] }),
    );
    database.insert.mockImplementation(
      async (entity: unknown, rows: object[]) => {
        if (entity === Ticket) tickets.push(...(rows as Ticket[]));
        if (entity === TicketCredential) {
          for (const credential of rows as TicketCredential[]) {
            tickets
              .find((ticket) => ticket.ticketId === credential.ticketId)!
              .credentials.push(credential);
          }
        }
        if (entity === TicketOwnership) {
          for (const ownership of rows as TicketOwnership[]) {
            tickets
              .find((ticket) => ticket.ticketId === ownership.ticketId)!
              .ownerships.push(ownership);
          }
        }
      },
    );
    manager = database as unknown as EntityManager;
  });

  it.each([
    'unpaid order',
    'failed payment',
    'wrong amount',
    'unconsumed reservation',
    'wrong quantity',
    'wrong ticket type',
    'wrong total',
  ])('rejects %s before inserting any tickets', async (scenario) => {
    if (scenario === 'unpaid order') order.status = OrderStatus.PENDING_PAYMENT;
    if (scenario === 'failed payment') payment.status = PaymentStatus.FAILED;
    if (scenario === 'wrong amount') payment.amount = '1';
    if (scenario === 'unconsumed reservation')
      reservation.status = ReservationStatus.ACTIVE;
    if (scenario === 'wrong quantity') reservation.quantity = 1;
    if (scenario === 'wrong ticket type')
      reservation.ticketTypeId = 'ttype_other';
    if (scenario === 'wrong total') order.totalAmount = '400000';
    await expect(service.issue(manager, order.orderId)).rejects.toThrow(
      ConflictException,
    );
    expect(database.insert).not.toHaveBeenCalled();
  });

  it('locks the order and creates one credential and initial ownership per ticket', async () => {
    await expect(service.issue(manager, order.orderId)).resolves.toEqual({
      orderId: order.orderId,
      quantity: 2,
      created: 2,
    });
    expect(database.findOne).toHaveBeenCalledWith(Order, {
      where: { orderId: order.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(database.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      database.insert.mock.invocationCallOrder[0],
    );
    expect(tickets.map((ticket) => ticket.ticketNumber)).toEqual([1, 2]);
    for (const ticket of tickets) {
      expect(ticket.ownerUserId).toBe(order.userId);
      expect(ticket.issuedAt).toEqual(issuedAt);
      expect(ticket.credentials).toHaveLength(1);
      expect(ticket.credentials[0].revokedAt).toBeNull();
      expect(ticket.ownerships).toHaveLength(1);
      expect(ticket.ownerships[0]).toMatchObject({
        fromUserId: null,
        toUserId: order.userId,
      });
    }
  });

  it('rejects a repeated new-payment issuance without adding more tickets', async () => {
    tickets = [existingTicket(1), existingTicket(2)];
    await expect(service.issue(manager, order.orderId)).rejects.toThrow(
      'Tickets already exist',
    );
    expect(database.insert).not.toHaveBeenCalled();
  });

  it('requires complete issuance for reads', async () => {
    tickets = [existingTicket(1)];
    await expect(service.inspect(manager, order.orderId)).rejects.toThrow(
      'Ticket issuance is incomplete',
    );
  });

  it.each([
    'duplicate number',
    'out of range',
    'wrong type',
    'missing credential',
    'missing ownership',
  ])('rejects corrupt issuance: %s', async (scenario) => {
    tickets = [existingTicket(1), existingTicket(2)];
    if (scenario === 'duplicate number') tickets[1].ticketNumber = 1;
    if (scenario === 'out of range') tickets[1].ticketNumber = 3;
    if (scenario === 'wrong type') tickets[1].ticketTypeId = 'ttype_other';
    if (scenario === 'missing credential') tickets[1].credentials = [];
    if (scenario === 'missing ownership') tickets[1].ownerships = [];
    await expect(service.inspect(manager, order.orderId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('fills only missing ticket numbers in the explicit internal backfill mode', async () => {
    tickets = [existingTicket(2)];
    await expect(service.issue(manager, order.orderId, true)).resolves.toEqual({
      orderId: order.orderId,
      quantity: 2,
      created: 1,
    });
    expect(tickets.map((ticket) => ticket.ticketNumber).sort()).toEqual([1, 2]);
    expect(database.insert.mock.calls[0][1]).toHaveLength(1);
  });
});
