import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Ticket } from './entities/ticket.entity';
import { TicketStatus } from './entities/enums/ticket-status.enum';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import {
  createMockTicket,
  createMockEvent,
  mockAvailableTicket,
  mockCreateTicketDto,
  mockSellerPrincipal,
  mockValidTicketFile,
  mockEndedEvent,
  mockDraftEvent,
} from './test/tickets.mock-data';
import { TicketSort } from './dto/list-tickets.dto';

describe('TicketsService', () => {
  let service: TicketsService;
  let dataSource: jest.Mocked<any>;
  let uploadsService: jest.Mocked<any>;

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockAvailableTicket], 1]),
    getOne: jest.fn().mockResolvedValue(mockAvailableTicket),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockAvailableTicket], 1]);
    mockQueryBuilder.getOne.mockResolvedValue(mockAvailableTicket);

    uploadsService = {
      validate: jest.fn(),
      save: jest.fn().mockResolvedValue({ filename: 'saved_ticket.pdf' }),
      removeTicketFile: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: DataSource, useValue: dataSource },
        { provide: UploadsService, useValue: uploadsService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mine', () => {
    it('throws BadRequestException if minPrice > maxPrice', async () => {
      await expect(
        service.mine(mockSellerPrincipal, {
          minPrice: 500,
          maxPrice: 100,
          page: 1,
          limit: 10,
          sort: TicketSort.NEWEST,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns paginated tickets owned by the seller with all filters', async () => {
      const result = await service.mine(mockSellerPrincipal, {
        status: TicketStatus.AVAILABLE,
        eventId: 'evt_123',
        categoryId: 'cat_music',
        ticketTier: 'VIP',
        q: 'concert',
        minPrice: 100,
        maxPrice: 500,
        page: 2,
        limit: 10,
        sort: TicketSort.PRICE_ASC,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ticket.sellerId = :sellerId',
        { sellerId: mockSellerPrincipal.user_id },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ticket.status = :status',
        { status: TicketStatus.AVAILABLE },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });

  describe('myDetail', () => {
    it('returns detail of an owned ticket', async () => {
      const result = await service.myDetail(
        mockSellerPrincipal,
        mockAvailableTicket.ticket_id,
      );
      expect(result.ticket_id).toBe(mockAvailableTicket.ticket_id);
    });

    it('throws NotFoundException when owned ticket is not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      await expect(
        service.myDetail(mockSellerPrincipal, 'non_existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels ticket successfully when affected is 1', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
      const result = await service.cancel(
        mockSellerPrincipal,
        mockAvailableTicket.ticket_id,
      );
      expect(result).toEqual({
        ticket_id: mockAvailableTicket.ticket_id,
        status: TicketStatus.CANCELLED,
      });
    });

    it('throws NotFoundException if user does not own the ticket', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 });
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancel(mockSellerPrincipal, 'other_ticket'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if owned ticket is in non-cancellable status (sold/holding)', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 });
      mockRepository.findOne.mockResolvedValue({ ticket_id: 'tkt_sold_001' });

      await expect(
        service.cancel(mockSellerPrincipal, 'tkt_sold_001'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('throws BadRequestException if minPrice > maxPrice', async () => {
      await expect(
        service.list({
          minPrice: 900,
          maxPrice: 100,
          page: 1,
          limit: 10,
          sort: TicketSort.NEWEST,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns public list of tickets with filters', async () => {
      const result = await service.list({
        eventId: 'evt_1',
        categoryId: 'cat_1',
        ticketTier: 'VIP',
        minPrice: 100,
        maxPrice: 500,
        q: 'rock',
        page: 1,
        limit: 10,
        sort: TicketSort.PRICE_DESC,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ticket.status = :ticketStatus',
        { ticketStatus: TicketStatus.AVAILABLE },
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('create', () => {
    it('throws BadRequestException if no ticket file or multiple files provided', async () => {
      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {}),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {
          ticketFile: [mockValidTicketFile, mockValidTicketFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates ticket successfully inside transaction and enqueues check', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(createMockEvent()),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation((ticket) => Promise.resolve(ticket)),
        insert: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) => {
          return await cb(mockManager);
        },
      );

      const result = await service.create(
        mockSellerPrincipal,
        mockCreateTicketDto,
        { ticketFile: [mockValidTicketFile] },
      );

      expect(uploadsService.validate).toHaveBeenCalledWith(mockValidTicketFile, false);
      expect(uploadsService.save).toHaveBeenCalledWith(mockValidTicketFile, 'tickets');
      expect(mockManager.save).toHaveBeenCalled();
      expect(mockManager.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws NotFoundException if event does not exist', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) => {
          return await cb(mockManager);
        },
      );

      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {
          ticketFile: [mockValidTicketFile],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if event is not published', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockDraftEvent),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) => {
          return await cb(mockManager);
        },
      );

      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {
          ticketFile: [mockValidTicketFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if event has already ended', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockEndedEvent),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) => {
          return await cb(mockManager);
        },
      );

      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {
          ticketFile: [mockValidTicketFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cleans up saved file if an error occurs inside transaction', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(createMockEvent()),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockRejectedValue(new Error('DB failure during save')),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) => {
          return await cb(mockManager);
        },
      );

      await expect(
        service.create(mockSellerPrincipal, mockCreateTicketDto, {
          ticketFile: [mockValidTicketFile],
        }),
      ).rejects.toThrow('DB failure during save');

      expect(uploadsService.removeTicketFile).toHaveBeenCalledWith('saved_ticket.pdf');
    });
  });
});
