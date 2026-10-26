import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Principal } from '../auth/authorization/principal';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { TicketInventory } from '../events/ticket-types/entities/ticket-inventory.entity';
import { TicketTypeStatus } from '../events/ticket-types/enums/ticket-type-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { TicketReservation } from './entities/ticket-reservation.entity';
import { OrderStatus } from './enums/order-status.enum';
import { ReservationStatus } from './enums/reservation-status.enum';
import { OrdersService } from './orders.service';

describe('Order creation and stock holds', () => {
  const actor: Principal = {
    user_id: 'user_buyer',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    sessionId: 'session_buyer',
  };
  const now = new Date('2035-01-01T00:00:00Z');
  const orders = { findOne: jest.fn(), findAndCount: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    query: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  const expiry = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  let service: OrdersService;
  let ticket: TicketType;
  let reserved: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    reserved = true;
    orders.findOne.mockResolvedValue(null);
    ticket = Object.assign(new TicketType(), {
      ticketTypeId: 'ttype_sale',
      showingId: 'show_sale',
      name: 'Standard',
      status: TicketTypeStatus.ACTIVE,
      saleStartAt: new Date('2034-01-01'),
      saleEndAt: new Date('2035-01-31'),
      maxPerOrder: 4,
      price: '200000',
    });
    const showing = {
      showingId: ticket.showingId,
      eventId: 'event_sale',
      startTime: new Date('2035-02-01'),
    };
    const event = {
      eventId: showing.eventId,
      organizerId: 'org_sale',
      status: EventStatus.PUBLISHED,
    };
    const repository = (record: object) => ({
      findOneBy: jest.fn().mockResolvedValue(record),
      findOne: jest.fn().mockResolvedValue(record),
    });
    const repositories = new Map<unknown, unknown>([
      [Order, orders],
      [TicketType, repository(ticket)],
      [Showing, repository(showing)],
      [Event, repository(event)],
      [
        Organizer,
        repository({
          organizerId: event.organizerId,
          status: OrganizerStatus.ACTIVE,
        }),
      ],
      [TicketInventory, repository({ ticketTypeId: ticket.ticketTypeId })],
      [TicketReservation, { createQueryBuilder: () => expiry }],
    ]);
    expiry.getMany.mockResolvedValue([]);
    manager.getRepository.mockImplementation((entity: unknown) => {
      const value = repositories.get(entity);
      if (!value) throw new Error('Unexpected repository');
      return value;
    });
    manager.create.mockImplementation(
      (_entity: unknown, record: object) => record,
    );
    manager.save.mockImplementation((_entity: unknown, record: object) =>
      Promise.resolve(record),
    );
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT clock_timestamp()'))
        return Promise.resolve([{ current_time: now }]);
      if (sql.includes('reserved_quantity = reserved_quantity +'))
        return Promise.resolve([
          reserved ? [{ ticket_type_id: ticket.ticketTypeId }] : [],
          reserved ? 1 : 0,
        ]);
      return Promise.resolve([]);
    });
    database.transaction.mockImplementation(
      async (operation: (transaction: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );
    service = Reflect.construct(OrdersService, [
      orders,
      database,
    ]) as OrdersService;
  });

  it('creates a priced order and ten-minute hold for the selected showing tier', async () => {
    const result = await service.create(actor, 'checkout_example', {
      ticketTypeId: ticket.ticketTypeId,
      quantity: 2,
    });
    expect(result.totalAmount).toBe('400000');
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(result.expiresAt).toBe('2035-01-01T00:10:00.000Z');
    expect(manager.save).toHaveBeenCalledTimes(3);
  });

  it('does not persist an order when conditional stock reservation loses', async () => {
    reserved = false;
    await expect(
      service.create(actor, 'checkout_example', {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('requires an idempotency key and enforces per-order limits', async () => {
    await expect(
      service.create(actor, undefined, {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(actor, 'checkout_example', {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('replays a matching order without taking a second reservation', async () => {
    orders.findOne.mockResolvedValue({
      orderId: 'ord_existing',
      status: OrderStatus.PENDING_PAYMENT,
      totalAmount: '200000',
      discountCode: null,
      registrationAnswers: [],
      item: {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 1,
        unitPrice: '200000',
      },
      reservation: { status: ReservationStatus.ACTIVE, expiresAt: now },
    });
    const result = await service.create(actor, 'checkout_example', {
      ticketTypeId: ticket.ticketTypeId,
      quantity: 1,
    });
    expect(result.orderId).toBe('ord_existing');
    expect(database.transaction).not.toHaveBeenCalled();
    await expect(
      service.create(actor, 'checkout_example', {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides another buyer order with an ownership-scoped lookup', async () => {
    await expect(service.findOne(actor, 'ord_foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orders.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'ord_foreign', userId: actor.user_id },
      }),
    );
  });

  it('rejects client-calculated totals through DTO whitelisting', async () => {
    const errors = await validate(
      plainToInstance(CreateOrderDto, {
        ticketTypeId: ticket.ticketTypeId,
        quantity: 1,
        totalAmount: 1,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.some((error) => error.property === 'totalAmount')).toBe(true);
  });
});
