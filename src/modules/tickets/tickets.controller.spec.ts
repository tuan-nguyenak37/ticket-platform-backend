import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { ConfigService } from '@nestjs/config';
import { TicketFileInterceptor } from './ticket-file.interceptor';
import { TicketManagementService } from './review/ticket-management.service';
import { TicketReviewService } from './review/ticket-review.service';
import {
  mockSellerPrincipal,
  mockCreateTicketDto,
  mockValidTicketFile,
  mockAvailableTicket,
} from './test/tickets.mock-data';
import { TicketSort } from './dto/list-tickets.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';

describe('TicketsController', () => {
  let controller: TicketsController;
  let ticketsService: jest.Mocked<Partial<TicketsService>>;
  let managementService: jest.Mocked<Partial<TicketManagementService>>;
  let reviewService: jest.Mocked<Partial<TicketReviewService>>;

  const mockResponseItem = TicketResponseDto.from(mockAvailableTicket);

  beforeEach(async () => {
    ticketsService = {
      mine: jest.fn().mockResolvedValue({
        items: [mockResponseItem],
        total: 1,
        page: 1,
        limit: 10,
      }),
      myDetail: jest.fn().mockResolvedValue(mockResponseItem),
      list: jest.fn().mockResolvedValue({
        items: [mockResponseItem],
        total: 1,
        page: 1,
        limit: 10,
      }),
      cancel: jest.fn().mockResolvedValue({
        ticket_id: 'tkt_mock_001',
        status: 'cancelled',
      }),
      create: jest.fn().mockResolvedValue(mockResponseItem),
    };

    managementService = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      detail: jest.fn().mockResolvedValue({ ticket: mockAvailableTicket }),
      file: jest.fn().mockResolvedValue({
        mimetype: 'application/pdf',
        buffer: Buffer.from('mock file content'),
      }),
      enqueue: jest.fn().mockResolvedValue({ queued: true }),
    };

    reviewService = {
      review: jest.fn().mockResolvedValue({ status: 'approved' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        { provide: TicketsService, useValue: ticketsService },
        { provide: TicketManagementService, useValue: managementService },
        { provide: TicketReviewService, useValue: reviewService },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: TicketFileInterceptor, useValue: { intercept: jest.fn() } },
      ],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('mine (GET /api/tickets/me)', () => {
    it('returns seller owned tickets', async () => {
      const query = { page: 1, limit: 10, sort: TicketSort.NEWEST };
      const result = await controller.mine(mockSellerPrincipal, query);
      expect(ticketsService.mine).toHaveBeenCalledWith(mockSellerPrincipal, query);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('myDetail (GET /api/tickets/me/:id)', () => {
    it('returns detail of owned ticket', async () => {
      const result = await controller.myDetail(mockSellerPrincipal, 'tkt_mock_001');
      expect(ticketsService.myDetail).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_mock_001',
      );
      expect(result).toBe(mockResponseItem);
    });
  });

  describe('manage endpoints', () => {
    it('manageList calls management.list', async () => {
      const query = { page: 1, limit: 10 };
      await controller.manageList(mockSellerPrincipal, query as any);
      expect(managementService.list).toHaveBeenCalledWith(
        mockSellerPrincipal,
        query,
      );
    });

    it('manageDetail calls management.detail', async () => {
      await controller.manageDetail(mockSellerPrincipal, 'tkt_123');
      expect(managementService.detail).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_123',
      );
    });

    it('manageFile streams file with proper headers', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.manageFile(mockSellerPrincipal, 'tkt_123', mockRes);

      expect(managementService.file).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_123',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff',
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('check calls management.enqueue', async () => {
      await controller.check(mockSellerPrincipal, 'tkt_123');
      expect(managementService.enqueue).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_123',
      );
    });

    it('review calls reviews.review', async () => {
      const dto = { action: 'approve' } as any;
      await controller.review(mockSellerPrincipal, 'tkt_123', dto);
      expect(reviewService.review).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_123',
        dto,
      );
    });
  });

  describe('list (GET /api/tickets)', () => {
    it('returns public list of tickets', async () => {
      const query = { page: 1, limit: 10, sort: TicketSort.NEWEST };
      const result = await controller.list(query);
      expect(ticketsService.list).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('cancel (DELETE /api/tickets/:id)', () => {
    it('cancels owned ticket', async () => {
      const result = await controller.cancel(mockSellerPrincipal, 'tkt_mock_001');
      expect(ticketsService.cancel).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'tkt_mock_001',
      );
      expect(result).toEqual({ ticket_id: 'tkt_mock_001', status: 'cancelled' });
    });
  });

  describe('create (POST /api/tickets)', () => {
    it('creates ticket with upload files', async () => {
      const files = { ticketFile: [mockValidTicketFile] };
      const result = await controller.create(
        mockSellerPrincipal,
        mockCreateTicketDto,
        files,
      );
      expect(ticketsService.create).toHaveBeenCalledWith(
        mockSellerPrincipal,
        mockCreateTicketDto,
        files,
      );
      expect(result).toBe(mockResponseItem);
    });
  });
});
