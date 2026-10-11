import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateOrderDto,
  DisputeReplyDto,
  ListOrdersDto,
  MockResultDto,
  OpenDisputeDto,
  OrderIdDto,
  OrderResponse,
  ResolveDisputeDto,
} from '../orders.dto';
import { OrderStatus } from '../order.entity';
import {
  mockPendingOrder,
  mockPendingPayment,
  mockOpenDispute,
} from '../test/orders.mock-data';

describe('Orders DTO Validation & Serialization', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('CreateOrderDto', () => {
    it('accepts valid ticketId and trims spaces', async () => {
      const result = (await pipe.transform(
        { ticketId: '  tkt_valid_123  ' },
        { type: 'body', metatype: CreateOrderDto },
      )) as CreateOrderDto;
      expect(result.ticketId).toBe('tkt_valid_123');
    });

    it('rejects empty or excessively long ticketId', async () => {
      await expect(
        pipe.transform(
          { ticketId: '' },
          { type: 'body', metatype: CreateOrderDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { ticketId: 'a'.repeat(41) },
          { type: 'body', metatype: CreateOrderDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OrderIdDto', () => {
    it('accepts valid alphanumeric ID with dashes and underscores', async () => {
      const result = (await pipe.transform(
        { id: 'ord_123-abc_XYZ' },
        { type: 'param', metatype: OrderIdDto },
      )) as OrderIdDto;
      expect(result.id).toBe('ord_123-abc_XYZ');
    });

    it('rejects IDs with invalid characters or too long', async () => {
      await expect(
        pipe.transform(
          { id: 'ord 123; DROP TABLE' },
          { type: 'param', metatype: OrderIdDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { id: 'a'.repeat(45) },
          { type: 'param', metatype: OrderIdDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ListOrdersDto', () => {
    it('applies default pagination values', async () => {
      const result = (await pipe.transform(
        {},
        { type: 'query', metatype: ListOrdersDto },
      )) as ListOrdersDto;
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('transforms and accepts valid side and status filters', async () => {
      const result = (await pipe.transform(
        { page: '2', limit: '50', side: 'buyer', status: OrderStatus.PENDING },
        { type: 'query', metatype: ListOrdersDto },
      )) as ListOrdersDto;
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.side).toBe('buyer');
      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('rejects invalid side or status', async () => {
      await expect(
        pipe.transform(
          { side: 'invalid_side' },
          { type: 'query', metatype: ListOrdersDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { status: 'invalid_status' },
          { type: 'query', metatype: ListOrdersDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('MockResultDto', () => {
    it('accepts success, failed, or cancelled', async () => {
      for (const res of ['success', 'failed', 'cancelled']) {
        const dto = (await pipe.transform(
          { result: res },
          { type: 'body', metatype: MockResultDto },
        )) as MockResultDto;
        expect(dto.result).toBe(res);
      }
    });

    it('rejects other strings', async () => {
      await expect(
        pipe.transform(
          { result: 'pending' },
          { type: 'body', metatype: MockResultDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OpenDisputeDto', () => {
    it('accepts valid reason and evidence', async () => {
      const result = (await pipe.transform(
        {
          reason: '   Vé không hợp lệ   ',
          evidence: '   Ảnh chụp lỗi tại cổng soát vé   ',
        },
        { type: 'body', metatype: OpenDisputeDto },
      )) as OpenDisputeDto;
      expect(result.reason).toBe('Vé không hợp lệ');
      expect(result.evidence).toBe('Ảnh chụp lỗi tại cổng soát vé');
    });

    it('rejects empty strings or oversized fields', async () => {
      await expect(
        pipe.transform(
          { reason: '', evidence: 'proof' },
          { type: 'body', metatype: OpenDisputeDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { reason: 'a'.repeat(2001), evidence: 'proof' },
          { type: 'body', metatype: OpenDisputeDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('DisputeReplyDto', () => {
    it('accepts trimmed response string', async () => {
      const result = (await pipe.transform(
        { response: '  Giải trình từ người bán  ' },
        { type: 'body', metatype: DisputeReplyDto },
      )) as DisputeReplyDto;
      expect(result.response).toBe('Giải trình từ người bán');
    });

    it('rejects empty response', async () => {
      await expect(
        pipe.transform(
          { response: '' },
          { type: 'body', metatype: DisputeReplyDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ResolveDisputeDto', () => {
    it('accepts accept or reject decision with note', async () => {
      const result = (await pipe.transform(
        { decision: 'accept', note: '  Đồng ý hoàn tiền cho người mua  ' },
        { type: 'body', metatype: ResolveDisputeDto },
      )) as ResolveDisputeDto;
      expect(result.decision).toBe('accept');
      expect(result.note).toBe('Đồng ý hoàn tiền cho người mua');
    });

    it('rejects invalid decision enum', async () => {
      await expect(
        pipe.transform(
          { decision: 'pending', note: 'note' },
          { type: 'body', metatype: ResolveDisputeDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OrderResponse.from serialization', () => {
    it('correctly maps order fields without exposing unwanted details', () => {
      const res = OrderResponse.from(mockPendingOrder);
      expect(res.order_id).toBe(mockPendingOrder.order_id);
      expect(res.amount).toBe(mockPendingOrder.amount);
      expect(res.status).toBe(mockPendingOrder.status);
      expect(res).not.toHaveProperty('payment');
      expect(res).not.toHaveProperty('dispute');
    });

    it('includes payment and dispute when supplied', () => {
      const res = OrderResponse.from(
        mockPendingOrder,
        mockPendingPayment,
        mockOpenDispute,
      );
      expect(res.payment?.payment_id).toBe(mockPendingPayment.payment_id);
      expect(res.dispute?.dispute_id).toBe(mockOpenDispute.dispute_id);
      expect(res.payment?.status).toBe(mockPendingPayment.status);
      expect(res.dispute?.status).toBe('open');
    });
  });
});
