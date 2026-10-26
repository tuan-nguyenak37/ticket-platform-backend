import { BadRequestException } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { MockPayments1791888005000 } from '../../database/migrations/1791888005000-MockPayments';
import type { Principal } from '../auth/authorization/principal';
import { OrdersService } from '../orders/orders.service';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { parsePaymentMethod } from './payment-method';

describe('Payment request boundary', () => {
  it.each(['BANK_TRANSFER', 'CARD', 'WALLET'] as const)(
    'accepts only the supported method %s',
    (method) => {
      expect(parsePaymentMethod({ method })).toBe(method);
    },
  );

  it.each([
    null,
    [],
    'CARD',
    { method: 'UNKNOWN' },
    { amount: '1' },
    {
      method: 'CARD',
      cardNumber: 'not-collected',
    },
  ])('rejects malformed requests and client payment details: %p', (body) => {
    expect(() => parsePaymentMethod(body)).toThrow(BadRequestException);
  });

  it('allows an absent method without inferring success', () => {
    expect(parsePaymentMethod(undefined)).toBeUndefined();
    expect(parsePaymentMethod({})).toBeUndefined();
  });
});

describe('Payment record storage contract', () => {
  it('declares one record per order, a parent reference and nonnegative amounts', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new MockPayments1791888005000().up({
      query,
    } as unknown as QueryRunner);
    const statements = query.mock.calls
      .map(([sql]: [string]) => sql)
      .join('\n');
    expect(statements).toContain('"order_id" varchar(40) NOT NULL UNIQUE');
    expect(statements).toContain('REFERENCES "orders"');
    expect(statements).toContain('"amount" >= 0');
  });

  it('returns a stored outcome only after an ownership-scoped order lookup', async () => {
    const actor: Principal = {
      user_id: 'user_buyer',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      sessionId: 'session_buyer',
    };
    const orders = {
      findOne: jest.fn().mockResolvedValue({
        orderId: 'ord_owned',
        status: OrderStatus.PAID,
        totalAmount: '200000',
        item: { unitPrice: '200000', quantity: 1, ticketTypeId: 'ttype_owned' },
        reservation: { expiresAt: new Date('2035-01-01T00:10:00Z') },
      }),
    };
    const payment = {
      paymentId: 'pay_example',
      orderId: 'ord_owned',
      status: PaymentStatus.SUCCEEDED,
      amount: '200000',
      processedAt: new Date('2035-01-01T00:05:00Z'),
      privateField: 'never returned',
    };
    const payments = { findOneBy: jest.fn().mockResolvedValue(payment) };
    const database = { getRepository: jest.fn().mockReturnValue(payments) };
    const service = Reflect.construct(OrdersService, [
      orders,
      database,
    ]) as OrdersService;
    const result = await service.findOne(actor, 'ord_owned');
    expect(orders.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'ord_owned', userId: actor.user_id },
      }),
    );
    expect(database.getRepository).toHaveBeenCalledWith(Payment);
    expect(result.payment).toMatchObject({
      paymentId: 'pay_example',
      status: PaymentStatus.SUCCEEDED,
      amount: '200000',
    });
    expect(result.payment).not.toHaveProperty('privateField');
  });
});
