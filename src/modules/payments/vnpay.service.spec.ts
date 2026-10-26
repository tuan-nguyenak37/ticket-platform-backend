import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { OrdersService } from '../orders/orders.service';
import { ResaleService } from '../resale/resale.service';
import { VnpayClient, type VnpayParams } from './vnpay.client';
import { VnpayService } from './vnpay.service';
import { VnpayTransaction } from './entities/vnpay-transaction.entity';
import type { Principal } from '../auth/authorization/principal';

describe('VNPay IPN and checkout', () => {
  function fixture() {
    const now = new Date();
    const config = new ConfigService({
      PAYMENT_PROVIDER: 'VNPAY',
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_HASH_SECRET: 'test-secret',
      VNPAY_RETURN_URL: 'http://localhost:7000/api/v1/payments/vnpay/return',
      VNPAY_FRONTEND_URL: 'http://localhost:3000',
    });
    const client = new VnpayClient(config);
    const transaction = Object.assign(new VnpayTransaction(), {
      txnRef: 'vnp_test',
      orderId: 'order',
      userId: 'buyer',
      kind: 'orders',
      amount: '100000',
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 600_000),
      paymentUrl:
        'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signed=fixture',
    });
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(transaction),
      findOneBy: jest.fn().mockResolvedValue(transaction),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      countBy: jest.fn().mockResolvedValue(0),
      createQueryBuilder: () => builder,
    };
    const manager = {
      getRepository: () => repository,
      query: jest.fn().mockResolvedValue([{ now }]),
    };
    const db = {
      getRepository: () => repository,
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const order = {
      status: 'PENDING_PAYMENT',
      totalAmount: '100000',
      price: '100000',
      expiresAt: transaction.expiresAt.toISOString(),
      payment: null as { paymentId: string } | null,
    };
    const orders = {
      findOne: jest.fn().mockResolvedValue(order),
      pay: jest
        .fn()
        .mockResolvedValue({ payment: { paymentId: 'vnp_123456' } }),
    };
    const resale = {
      reserve: jest
        .fn()
        .mockResolvedValue({ ...order, resaleOrderId: 'resale-order' }),
      orderDetail: jest.fn().mockResolvedValue(order),
      pay: jest
        .fn()
        .mockResolvedValue({ payment: { paymentId: 'vnp_123456' } }),
    };
    const service = new VnpayService(
      db as unknown as DataSource,
      client,
      orders as unknown as OrdersService,
      resale as unknown as ResaleService,
      config,
    );
    const signed = (overrides: VnpayParams = {}) => {
      const parameters = {
        vnp_TxnRef: 'vnp_test',
        vnp_TmnCode: 'TESTCODE',
        vnp_Amount: '10000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: '123456',
        vnp_BankCode: 'NCB',
        vnp_OrderInfo: 'Thanh toan ve',
        ...overrides,
      };
      return { ...parameters, vnp_SecureHash: client.sign(parameters) };
    };
    return {
      service,
      transaction,
      repository,
      builder,
      db,
      orders,
      resale,
      signed,
      order,
      config,
      manager,
    };
  }

  it('fulfills a valid payment and acknowledges repeated IPN without issuing again', async () => {
    const { service, transaction, orders, signed } = fixture();
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '00',
    });
    expect(transaction.status).toBe('SUCCEEDED');
    expect(transaction.paymentId).toBe('vnp_123456');
    expect(orders.pay).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'buyer' }),
      'order',
      undefined,
      expect.objectContaining({ reference: 'order:order', txnRef: 'vnp_test' }),
    );
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '02',
    });
    expect(orders.pay).toHaveBeenCalledTimes(1);
  });

  it('uses the resale settlement path for resale IPN', async () => {
    const { service, transaction, orders, resale, signed } = fixture();
    transaction.kind = 'resale';
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '00',
    });
    expect(orders.pay).not.toHaveBeenCalled();
    expect(resale.pay).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'buyer' }),
      'order',
      undefined,
      expect.objectContaining({ reference: 'resale:order' }),
    );
  });

  it('rejects forged IPN before opening a transaction', async () => {
    const { service, db, orders, signed } = fixture();
    await expect(
      service.ipn({ ...signed(), vnp_Amount: '1' }),
    ).resolves.toMatchObject({ RspCode: '97' });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed but mismatched amount', async () => {
    const { service, orders, repository, signed } = fixture();
    await expect(
      service.ipn(signed({ vnp_Amount: '100' })),
    ).resolves.toMatchObject({ RspCode: '04' });
    expect(repository.save).not.toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('acknowledges failed/cancelled payments without fulfilling the order', async () => {
    const { service, orders, transaction, signed } = fixture();
    await expect(
      service.ipn(
        signed({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
      ),
    ).resolves.toMatchObject({ RspCode: '00' });
    expect(transaction.status).toBe('FAILED');
    expect(transaction.providerResult).toMatchObject({
      vnp_ResponseCode: '24',
    });
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('records successful money movement needing manual review when the order expired', async () => {
    const { service, orders, transaction, signed, order } = fixture();
    orders.pay.mockRejectedValue(new ConflictException('Order expired'));
    order.status = 'EXPIRED';
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '00',
    });
    expect(transaction.status).toBe('REVIEW');
    expect(transaction.failureCode).toBe('PAID_NOT_FULFILLED');
    expect(transaction.providerResult).toMatchObject({
      vnp_TransactionNo: '123456',
    });
  });

  it('requests IPN retry after a transient processing error', async () => {
    const { service, orders, transaction, repository, signed } = fixture();
    orders.pay.mockRejectedValue(new Error('database unavailable'));
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '99',
    });
    expect(transaction.status).toBe('PENDING');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('preserves successful provider evidence if the account becomes inaccessible', async () => {
    const { service, orders, transaction, signed } = fixture();
    orders.pay.mockRejectedValue(new ForbiddenException('Suspended account'));
    orders.findOne.mockRejectedValue(
      new ForbiddenException('Suspended account'),
    );
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '00',
    });
    expect(transaction.status).toBe('REVIEW');
    expect(transaction.paymentId).toBe('vnp_123456');
  });

  it('recovers a committed order payment if a post-payment step fails', async () => {
    const { service, orders, transaction, signed, order } = fixture();
    order.status = 'PAID';
    order.payment = { paymentId: 'vnp_123456' };
    orders.pay.mockRejectedValue(new Error('notification unavailable'));
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '00',
    });
    expect(transaction.status).toBe('SUCCEEDED');
  });

  it('rejects unknown transaction references', async () => {
    const { service, repository, signed } = fixture();
    repository.findOne.mockResolvedValue(null);
    await expect(service.ipn(signed())).resolves.toMatchObject({
      RspCode: '01',
    });
  });

  it('never fulfills from browser return, even with a valid success signature', async () => {
    const { service, orders, repository, db, signed } = fixture();
    await expect(service.returnUrl(signed())).resolves.toBe(
      'http://localhost:3000/checkout/orders/order?vnpay=returned',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
    await expect(
      service.returnUrl({ ...signed(), vnp_Amount: '1' }),
    ).resolves.toBe('http://localhost:3000/account/orders?vnpay=invalid');
  });

  const actor = { user_id: 'buyer' } as Principal;
  const body = {
    recipient: {
      name: 'Buyer',
      email: 'buyer@example.com',
      phone: '0901234567',
    },
  };

  it('reserves only when payment starts and uses the same database transaction', async () => {
    const { service, resale, db, manager, repository } = fixture();
    const result = await service.startResale(
      actor,
      'listing',
      body,
      '127.0.0.1',
    );
    expect(resale.reserve).toHaveBeenCalledWith(actor, 'listing', manager);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result.resaleOrderId).toBe('resale-order');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'resale',
        orderId: 'resale-order',
        amount: '100000',
      }),
    );
    expect(resale.pay).not.toHaveBeenCalled();
  });

  it.each([{ recipient: {} }, { ...body, amount: '1' }, null])(
    'validates payment input before acquiring a resale hold',
    async (input) => {
      const { service, resale, db } = fixture();
      await expect(
        service.startResale(actor, 'listing', input, '127.0.0.1'),
      ).rejects.toThrow();
      expect(resale.reserve).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it('creates a signed payment link from the server-owned order amount', async () => {
    const { service, repository, orders } = fixture();
    const result = await service.start(
      actor,
      'orders',
      'order',
      body,
      '127.0.0.1',
    );
    expect(new URL(result.paymentUrl!).searchParams.get('vnp_Amount')).toBe(
      '10000000',
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'buyer',
        amount: '100000',
        status: 'PENDING',
      }),
    );
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('reuses the pending link rather than opening another payment attempt', async () => {
    const { service, repository, builder, transaction } = fixture();
    builder.getOne.mockResolvedValue(transaction);
    await expect(
      service.start(actor, 'orders', 'order', {}, '127.0.0.1'),
    ).resolves.toMatchObject({ paymentUrl: transaction.paymentUrl });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects client-controlled amounts and expired orders', async () => {
    const { service, order, repository } = fixture();
    await expect(
      service.start(
        actor,
        'orders',
        'order',
        { ...body, amount: '1' },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    order.status = 'EXPIRED';
    await expect(
      service.start(actor, 'orders', 'order', body, '127.0.0.1'),
    ).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not expose another buyer order', async () => {
    const { service, orders, repository } = fixture();
    orders.findOne.mockRejectedValue(new ConflictException('Not owned'));
    await expect(
      service.start(actor, 'orders', 'order', body, '127.0.0.1'),
    ).rejects.toThrow();
    await expect(service.latest(actor, 'orders', 'order')).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('returns retryable 99 rather than signature error 97 for missing merchant configuration', async () => {
    const { service, signed, config, db } = fixture();
    const parameters = signed();
    config.set('VNPAY_HASH_SECRET', '');
    await expect(service.ipn(parameters)).resolves.toMatchObject({
      RspCode: '99',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('keeps a non-success transaction status instead of displaying response code 00 as failure', async () => {
    const { service, transaction, signed, orders } = fixture();
    await expect(
      service.ipn(
        signed({ vnp_ResponseCode: '00', vnp_TransactionStatus: '02' }),
      ),
    ).resolves.toMatchObject({ RspCode: '00' });
    expect(transaction.status).toBe('FAILED');
    expect(transaction.failureCode).toBe('02');
    expect(orders.pay).not.toHaveBeenCalled();
  });
});
