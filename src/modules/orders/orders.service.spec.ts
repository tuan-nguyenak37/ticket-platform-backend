import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrderStore, LockedOrder } from './order-store.service';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Order, OrderDispute, OrderStatus } from './order.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../tickets/entities/enums/ticket-status.enum';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import {
  mockBuyerPrincipal,
  mockSellerPrincipal,
  mockAdminPrincipal,
  mockPendingOrder,
  mockPaidOrder,
  mockDisputedOrder,
  mockCreateOrderDto,
  mockOpenDisputeDto,
  mockResolveDisputeDto,
} from './test/orders.mock-data';
import { OrderResponse } from './orders.dto';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderStore: Partial<OrderStore>;
  let configService: Partial<ConfigService>;
  let uploadsService: Partial<UploadsService>;

  const createActiveEvent = () => {
    const event = new Event();
    event.event_id = 'evt_mock_001';
    event.name = 'Concert 2026';
    event.status = EventStatus.PUBLISHED;
    event.endTime = new Date(Date.now() + 86400000 * 2);
    return event;
  };

  const createActiveTicket = () => {
    const ticket = new Ticket();
    ticket.ticket_id = 'tkt_mock_001';
    ticket.eventId = 'evt_mock_001';
    ticket.status = TicketStatus.AVAILABLE;
    ticket.price = 500000;
    ticket.sellerId = mockSellerPrincipal.user_id;
    return ticket;
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ORDER_PAYMENT_TIMEOUT_MINUTES') return 15;
        return defaultValue;
      }),
    };

    uploadsService = {
      readTicketFile: jest.fn().mockResolvedValue({
        mimetype: 'application/pdf',
        buffer: Buffer.from('mock pdf'),
      }),
    };

    orderStore = {
      db: {} as any,
      manager: jest.fn(),
      locked: jest.fn(),
      response: jest.fn().mockImplementation((manager, order) => {
        return OrderResponse.from(order);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderStore, useValue: orderStore },
        { provide: ConfigService, useValue: configService },
        { provide: UploadsService, useValue: uploadsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws BadRequestException if idempotency key is missing or invalid', async () => {
      await expect(
        service.create(mockBuyerPrincipal, mockCreateOrderDto, undefined),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(mockBuyerPrincipal, mockCreateOrderDto, 'short'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(
          mockBuyerPrincipal,
          mockCreateOrderDto,
          'invalid key with spaces!!!',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing order if idempotency key was already used for the same ticket', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOneBy: jest.fn().mockResolvedValue(mockPendingOrder),
      };

      (orderStore as any).db = {
        transaction: jest.fn((mode, callback) => callback(mockManager)),
      };

      const result = await service.create(
        mockBuyerPrincipal,
        mockCreateOrderDto,
        'valid-idempotency-key-001',
      );

      expect(result.order_id).toBe(mockPendingOrder.order_id);
    });

    it('throws ConflictException if idempotency key was used for a different ticket', async () => {
      const existingOrderDifferentTicket = {
        ...mockPendingOrder,
        ticketId: 'tkt_other_999',
      };
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOneBy: jest.fn().mockResolvedValue(existingOrderDifferentTicket),
      };

      (orderStore as any).db = {
        transaction: jest.fn((mode, callback) => callback(mockManager)),
      };

      await expect(
        service.create(
          mockBuyerPrincipal,
          mockCreateOrderDto,
          'valid-idempotency-key-001',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if ticket does not exist', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOneBy: jest.fn().mockResolvedValue(null),
      };

      (orderStore as any).db = {
        transaction: jest.fn((mode, callback) => callback(mockManager)),
      };

      await expect(
        service.create(
          mockBuyerPrincipal,
          mockCreateOrderDto,
          'valid-idempotency-key-001',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if user attempts to purchase their own ticket', async () => {
      const mockTicket = createActiveTicket();
      mockTicket.sellerId = mockBuyerPrincipal.user_id; // same as buyer!

      const mockEvent = createActiveEvent();

      const mockManager = {
        query: jest.fn().mockResolvedValue([{ now: new Date().toISOString() }]),
        findOneBy: jest.fn().mockImplementation((entity) => {
          if (entity === Order) return null;
          if (entity === Ticket) return mockTicket;
          return null;
        }),
        findOneOrFail: jest.fn().mockImplementation((entity) => {
          if (entity === Event) return mockEvent;
          if (entity === Ticket) return mockTicket;
          return null;
        }),
      };

      (orderStore as any).db = {
        transaction: jest.fn((mode, callback) => callback(mockManager)),
      };

      await expect(
        service.create(
          mockBuyerPrincipal,
          mockCreateOrderDto,
          'valid-idempotency-key-001',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates and saves new order when all conditions are valid', async () => {
      const mockTicket = createActiveTicket();
      const mockEvent = createActiveEvent();

      const mockSeller = new User();
      mockSeller.user_id = mockSellerPrincipal.user_id;
      mockSeller.status = UserStatus.ACTIVE;

      const createdOrder = new Order();
      createdOrder.order_id = 'ord_new_123';
      createdOrder.status = OrderStatus.PENDING;
      createdOrder.amount = '500000.00';

      const mockManager = {
        query: jest.fn().mockResolvedValue([{ now: new Date().toISOString() }]),
        findOneBy: jest.fn().mockImplementation((entity) => {
          if (entity === Order) return null;
          if (entity === Ticket) return mockTicket;
          if (entity === User) return mockSeller;
          return null;
        }),
        findOneOrFail: jest.fn().mockImplementation((entity) => {
          if (entity === Event) return mockEvent;
          if (entity === Ticket) return mockTicket;
          return null;
        }),
        create: jest.fn().mockReturnValue(createdOrder),
        save: jest.fn().mockResolvedValue(createdOrder),
      };

      (orderStore as any).db = {
        transaction: jest.fn((mode, callback) => callback(mockManager)),
      };

      const result = await service.create(
        mockBuyerPrincipal,
        mockCreateOrderDto,
        'valid-idempotency-key-001',
      );

      expect(result.order_id).toBe('ord_new_123');
      expect(mockManager.save).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels pending order and marks reason as buyer_cancelled', async () => {
      const order = { ...mockPendingOrder, status: OrderStatus.PENDING };
      const event = createActiveEvent();
      const ticket = createActiveTicket();

      const context: LockedOrder = {
        manager: { save: jest.fn().mockResolvedValue(order) } as any,
        order: order as any,
        ticket: ticket as any,
        event: event as any,
        now: new Date('2026-03-01T10:02:00Z'),
      };

      orderStore.locked = jest.fn((id, work) => work(context));

      const result = await service.cancel(mockBuyerPrincipal, 'ord_mock_001');
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.reason).toBe('buyer_cancelled');
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('throws ConflictException if order is not pending', async () => {
      const order = { ...mockPaidOrder, status: OrderStatus.PAID };
      const event = createActiveEvent();
      const ticket = createActiveTicket();

      const context: LockedOrder = {
        manager: { save: jest.fn().mockResolvedValue(order) } as any,
        order: order as any,
        ticket: ticket as any,
        event: event as any,
        now: new Date('2026-03-01T10:02:00Z'),
      };

      orderStore.locked = jest.fn((id, work) => work(context));

      await expect(
        service.cancel(mockBuyerPrincipal, 'ord_paid_002'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('dispute', () => {
    it('throws ConflictException if order is not paid or delivered', async () => {
      const order = { ...mockPendingOrder, status: OrderStatus.PENDING };
      const event = createActiveEvent();
      const ticket = createActiveTicket();

      const context: LockedOrder = {
        manager: {
          existsBy: jest.fn().mockResolvedValue(false),
          save: jest.fn().mockResolvedValue(order),
        } as any,
        order: order as any,
        ticket: ticket as any,
        event: event as any,
        now: new Date('2026-03-01T10:02:00Z'),
      };

      orderStore.locked = jest.fn((id, work) => work(context));

      await expect(
        service.dispute(
          mockBuyerPrincipal,
          'ord_mock_001',
          mockOpenDisputeDto,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if dispute window has expired', async () => {
      const order = {
        ...mockPaidOrder,
        status: OrderStatus.DELIVERED,
        disputeUntil: new Date('2026-03-01T00:00:00Z'),
      };
      const event = createActiveEvent();
      event.endTime = new Date('2026-03-01T00:00:00Z');
      const ticket = createActiveTicket();

      const context: LockedOrder = {
        manager: {
          existsBy: jest.fn().mockResolvedValue(false),
          save: jest.fn().mockResolvedValue(order),
        } as any,
        order: order as any,
        ticket: ticket as any,
        event: event as any,
        now: new Date('2026-03-10T00:00:00Z'), // Past disputeUntil and event.endTime + 86400000!
      };

      orderStore.locked = jest.fn((id, work) => work(context));

      await expect(
        service.dispute(
          mockBuyerPrincipal,
          'ord_paid_002',
          mockOpenDisputeDto,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('calls manager check when manage is true', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockPendingOrder], 1]),
      };

      (orderStore as any).db = {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        }),
      };

      await service.list(mockAdminPrincipal, { page: 1, limit: 10 }, true);

      expect(orderStore.manager).toHaveBeenCalledWith(mockAdminPrincipal);
      expect(queryBuilder.getManyAndCount).toHaveBeenCalled();
    });
  });
});
