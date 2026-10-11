import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderPaymentsService } from './order-payments.service';
import {
  mockBuyerPrincipal,
  mockSellerPrincipal,
  mockAdminPrincipal,
  mockPendingOrder,
  mockPaidOrder,
  mockDisputedOrder,
  mockCreateOrderDto,
  mockOpenDisputeDto,
  mockDisputeReplyDto,
  mockResolveDisputeDto,
} from './test/orders.mock-data';
import { OrderResponse } from './orders.dto';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<Partial<OrdersService>>;
  let paymentsService: jest.Mocked<Partial<OrderPaymentsService>>;

  const mockResponseItem = OrderResponse.from(mockPendingOrder);

  beforeEach(async () => {
    ordersService = {
      create: jest.fn().mockResolvedValue(mockResponseItem),
      list: jest.fn().mockResolvedValue({
        items: [mockResponseItem],
        total: 1,
        page: 1,
        limit: 20,
      }),
      detail: jest.fn().mockResolvedValue(mockResponseItem),
      cancel: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'cancelled',
      }),
      file: jest.fn().mockResolvedValue({
        mimetype: 'application/pdf',
        buffer: Buffer.from('mock ticket pdf content'),
      }),
      dispute: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'disputed',
      }),
      reply: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'disputed',
      }),
      resolve: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'refunded',
      }),
    };

    paymentsService = {
      start: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        payment: { payment_id: 'pay_001', status: 'pending' },
      }),
      result: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'paid',
      }),
      refund: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        status: 'refunded',
      }),
      payout: jest.fn().mockResolvedValue({
        ...mockResponseItem,
        payoutStatus: 'paid',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: ordersService },
        { provide: OrderPaymentsService, useValue: paymentsService },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates an order with idempotency key', async () => {
      const result = await controller.create(
        mockBuyerPrincipal,
        mockCreateOrderDto,
        'idempotency-key-12345',
      );
      expect(ordersService.create).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        mockCreateOrderDto,
        'idempotency-key-12345',
      );
      expect(result).toEqual(mockResponseItem);
    });
  });

  describe('mine & detail', () => {
    it('lists orders belonging to current user', async () => {
      const query = { page: 1, limit: 20 };
      const result = await controller.mine(mockBuyerPrincipal, query);
      expect(ordersService.list).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        query,
      );
      expect(result.items).toHaveLength(1);
    });

    it('returns detail of an order', async () => {
      const result = await controller.detail(mockBuyerPrincipal, {
        id: 'ord_mock_001',
      });
      expect(ordersService.detail).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
      );
      expect(result).toEqual(mockResponseItem);
    });
  });

  describe('cancel', () => {
    it('cancels pending order', async () => {
      const result = await controller.cancel(mockBuyerPrincipal, {
        id: 'ord_mock_001',
      });
      expect(ordersService.cancel).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
      );
      expect(result.status).toBe('cancelled');
    });
  });

  describe('payment start & result', () => {
    it('initiates mock payment', async () => {
      const result = await controller.start(mockBuyerPrincipal, {
        id: 'ord_mock_001',
      });
      expect(paymentsService.start).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
      );
      expect(result.payment?.status).toBe('pending');
    });

    it('processes mock payment result', async () => {
      const result = await controller.result(
        mockBuyerPrincipal,
        { id: 'ord_mock_001' },
        { result: 'success' },
      );
      expect(paymentsService.result).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
        'success',
      );
      expect(result.status).toBe('paid');
    });
  });

  describe('file streaming', () => {
    it('streams ticket file with secure download headers', async () => {
      const headers: Record<string, string> = {};
      let sentBuffer: Buffer | null = null;

      const mockRes = {
        setHeader: jest.fn((k: string, v: string) => {
          headers[k] = v;
        }),
        send: jest.fn((buf: Buffer) => {
          sentBuffer = buf;
        }),
      } as unknown as Response;

      await controller.file(
        mockBuyerPrincipal,
        { id: 'ord_mock_001' },
        mockRes,
      );

      expect(ordersService.file).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
      );
      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['Cache-Control']).toBe('no-store');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Disposition']).toBe('attachment');
      expect(sentBuffer).toEqual(Buffer.from('mock ticket pdf content'));
    });
  });

  describe('disputes', () => {
    it('opens dispute for paid order', async () => {
      const result = await controller.dispute(
        mockBuyerPrincipal,
        { id: 'ord_mock_001' },
        mockOpenDisputeDto,
      );
      expect(ordersService.dispute).toHaveBeenCalledWith(
        mockBuyerPrincipal,
        'ord_mock_001',
        mockOpenDisputeDto,
      );
      expect(result.status).toBe('disputed');
    });

    it('seller replies to dispute', async () => {
      const result = await controller.reply(
        mockSellerPrincipal,
        { id: 'ord_mock_001' },
        mockDisputeReplyDto,
      );
      expect(ordersService.reply).toHaveBeenCalledWith(
        mockSellerPrincipal,
        'ord_mock_001',
        mockDisputeReplyDto.response,
      );
      expect(result.status).toBe('disputed');
    });
  });

  describe('admin & moderator management', () => {
    it('lists all orders for admin', async () => {
      const query = { page: 1, limit: 10 };
      await controller.manage(mockAdminPrincipal, query);
      expect(ordersService.list).toHaveBeenCalledWith(
        mockAdminPrincipal,
        query,
        true,
      );
    });

    it('gets full order detail for admin', async () => {
      await controller.manageDetail(mockAdminPrincipal, {
        id: 'ord_mock_001',
      });
      expect(ordersService.detail).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'ord_mock_001',
        true,
      );
    });

    it('admin resolves dispute', async () => {
      const result = await controller.resolve(
        mockAdminPrincipal,
        { id: 'ord_mock_001' },
        mockResolveDisputeDto,
      );
      expect(ordersService.resolve).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'ord_mock_001',
        mockResolveDisputeDto,
      );
      expect(result.status).toBe('refunded');
    });

    it('admin triggers mock refund', async () => {
      await controller.refund(mockAdminPrincipal, { id: 'ord_mock_001' });
      expect(paymentsService.refund).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'ord_mock_001',
      );
    });

    it('admin triggers mock payout to seller', async () => {
      await controller.payout(mockAdminPrincipal, { id: 'ord_mock_001' });
      expect(paymentsService.payout).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'ord_mock_001',
      );
    });
  });
});
