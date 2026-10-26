import { ConflictException } from '@nestjs/common';
import type { Principal } from '../auth/authorization/principal';
import { OrdersService } from '../orders/orders.service';

describe('order payment orchestration', () => {
  const actor = { user_id: 'buyer' } as Principal;

  function setup() {
    const order = {
      orderId: 'ord_test',
      userId: 'buyer',
      totalAmount: '100000',
      status: 'PENDING_PAYMENT',
    };
    const prior = jest.fn().mockResolvedValue(null);
    const process = jest.fn().mockReturnValue({ transactionId: 'prj_test' });
    const consume = jest.fn().mockImplementation(() => {
      order.status = 'PAID';
    });
    const issue = jest.fn();
    const inspect = jest.fn();
    const sendOrderAfterPayment = jest.fn();
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: () => ({ findOneBy: prior }),
      create: (_entity: unknown, data: unknown) => data,
      save: jest
        .fn()
        .mockImplementation((_entity: unknown, data: unknown) =>
          Promise.resolve(data),
        ),
    };
    const service: OrdersService = Object.assign(
      Object.create(OrdersService.prototype),
      {
        withLockedOrder: (
          _actor: unknown,
          _orderId: unknown,
          _checkOrganizer: unknown,
          callback: (...args: unknown[]) => Promise<unknown>,
        ) =>
          callback(
            manager,
            order,
            { unitPrice: '100000', quantity: 1 },
            { status: 'ACTIVE' },
            {},
            { status: 'ACTIVE' },
          ),
        reservationTime: jest
          .fn()
          .mockResolvedValue({ valid: true, currentTime: new Date() }),
        consume,
        issuance: { issue, inspect },
        tickets: { sendOrderAfterPayment },
        paymentProcessing: { process },
        response: () => ({ status: order.status }),
        paymentResponse: (payment: unknown) => payment,
      },
    );
    return { service, order, prior, process, consume, issue, inspect, manager };
  }

  it('processes the server amount before saving the payment and issuing tickets', async () => {
    const fixture = setup();
    const result = await fixture.service.pay(actor, 'ord_test');
    expect(fixture.process).toHaveBeenCalledWith(
      'order:ord_test',
      '100000',
      undefined,
      undefined,
    );
    expect(fixture.process.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.consume.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      payment: { paymentId: 'prj_test', status: 'SUCCEEDED', amount: '100000' },
    });
    expect(fixture.issue).toHaveBeenCalledTimes(1);
    expect(fixture.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO web_notifications'),
      [
        expect.any(String),
        'buyer',
        'ORDER_PAID',
        'ord_test',
        expect.any(String),
        expect.any(String),
        '/checkout/orders/ord_test',
      ],
    );
  });

  it('returns an existing payment without processing or issuing again', async () => {
    const fixture = setup();
    fixture.order.status = 'PAID';
    fixture.prior.mockResolvedValue({
      paymentId: 'prj_existing',
      status: 'SUCCEEDED',
      amount: '100000',
    });
    await fixture.service.pay(actor, 'ord_test');
    expect(fixture.process).not.toHaveBeenCalled();
    expect(fixture.issue).not.toHaveBeenCalled();
    expect(fixture.inspect).toHaveBeenCalled();
    expect(fixture.manager.query).not.toHaveBeenCalled();
  });

  it('rejects cancelled orders without calling the gateway', async () => {
    const fixture = setup();
    fixture.order.status = 'CANCELLED';
    await expect(fixture.service.pay(actor, 'ord_test')).rejects.toThrow(
      ConflictException,
    );
    expect(fixture.process).not.toHaveBeenCalled();
  });

  it('does not consume inventory, save payment or issue tickets when processing fails', async () => {
    const fixture = setup();
    fixture.process.mockImplementation(() => {
      throw new Error('Payment failed');
    });
    await expect(fixture.service.pay(actor, 'ord_test')).rejects.toThrow(
      'Payment failed',
    );
    expect(fixture.consume).not.toHaveBeenCalled();
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.issue).not.toHaveBeenCalled();
    expect(fixture.manager.query).not.toHaveBeenCalled();
  });
});
