import { CheckoutService } from './checkout.service';
import { CheckoutSession } from './entities/checkout-session.entity';
import type { Principal } from '../auth/authorization/principal';

describe('checkout email verification flow', () => {
  const actor = { user_id: 'buyer' } as Principal;

  function fixture() {
    const now = new Date();
    const session = Object.assign(new CheckoutSession(), {
      sessionId: 'session',
      userId: 'buyer',
      orderId: 'order',
      kind: 'orders',
      status: 'AWAITING_AUTH',
      attempts: 0,
      amount: '100',
      method: 'WALLET',
      recipient: {
        name: 'Buyer',
        email: 'buyer@example.com',
        phone: '0901234567',
      },
      instrument: { label: 'Wallet', last4: '4567' },
      item: { name: 'Ticket', quantity: 1, unitPrice: '100' },
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(session),
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      findOneBy: jest.fn().mockResolvedValue(session),
      createQueryBuilder: () => builder,
      save: jest.fn(async (value) => value),
      update: jest.fn(async (_criteria, changes) => {
        Object.assign(session, changes);
        return { affected: 1 };
      }),
    };
    const manager = {
      getRepository: () => repository,
      query: jest.fn().mockResolvedValue([{ now }]),
    };
    const order = {
      status: 'PENDING_PAYMENT',
      totalAmount: '100',
      expiresAt: session.expiresAt.toISOString(),
    };
    const orders = {
      findOne: jest.fn().mockResolvedValue(order),
      pay: jest.fn().mockResolvedValue({
        payment: { paymentId: 'paid', processedAt: now.toISOString() },
      }),
    };
    const otp = {
      verify: jest.fn().mockResolvedValue('valid'),
      issue: jest.fn().mockResolvedValue(undefined),
    };
    const service: CheckoutService = Object.assign(
      Object.create(CheckoutService.prototype),
      {
        db: {
          getRepository: () => repository,
          transaction: async (
            callback: (transactionManager: typeof manager) => Promise<unknown>,
          ) => callback(manager),
        },
        orders,
        otp,
      },
    );
    return { service, session, repository, orders, otp };
  }

  it('settles only after Redis verification succeeds', async () => {
    const { service, orders, otp } = fixture();
    await expect(
      service.confirm(actor, 'session', { otp: '654321' }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(otp.verify).toHaveBeenCalledWith('session', '654321');
    expect(orders.pay).toHaveBeenCalledWith(actor, 'order', 'WALLET');
  });

  const input = {
    recipient: {
      name: 'Buyer',
      email: 'buyer@example.com',
      phone: '0901234567',
    },
    method: 'WALLET',
    instrument: { phone: '0901234567' },
  };

  it('issues an email code before returning the new session', async () => {
    const { service, otp, orders, session } = fixture();
    const result = await service.start(actor, 'orders', 'order', input);
    expect(otp.issue).toHaveBeenCalledWith(
      'buyer',
      result.sessionId,
      'buyer@example.com',
      session.expiresAt,
    );
    expect(result.status).toBe('AWAITING_AUTH');
    expect(result).not.toHaveProperty('otpDigest');
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('rejects session creation if sending email fails', async () => {
    const { service, otp, orders } = fixture();
    otp.issue.mockRejectedValue(new Error('SMTP unavailable'));
    await expect(
      service.start(actor, 'orders', 'order', input),
    ).rejects.toThrow('SMTP unavailable');
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('does not issue another email for an unchanged active session', async () => {
    const { service, otp, repository, session } = fixture();
    session.instrument.label = 'Ví TicketVerse';
    repository.findOne.mockResolvedValue(session);
    await expect(
      service.start(actor, 'orders', 'order', input),
    ).resolves.toMatchObject({ sessionId: 'session' });
    expect(otp.issue).not.toHaveBeenCalled();
  });

  it('records incorrect attempts and never settles a wrong code', async () => {
    const { service, session, orders, otp, repository } = fixture();
    otp.verify.mockResolvedValue('invalid');
    await expect(
      service.confirm(actor, 'session', { otp: '123456' }),
    ).rejects.toThrow();
    expect(session.attempts).toBe(1);
    expect(repository.save).toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('locks the session after five wrong attempts and prevents reuse', async () => {
    const { service, session, orders, otp } = fixture();
    session.attempts = 4;
    otp.verify.mockResolvedValue('invalid');
    await expect(
      service.confirm(actor, 'session', { otp: '123456' }),
    ).rejects.toThrow();
    expect(session.status).toBe('FAILED');
    expect(session.failureCode).toBe('OTP_ATTEMPTS_EXCEEDED');
    otp.verify.mockResolvedValue('valid');
    await expect(
      service.confirm(actor, 'session', { otp: '654321' }),
    ).rejects.toThrow();
    expect(otp.verify).toHaveBeenCalledTimes(1);
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('expires a session when its Redis code has expired', async () => {
    const { service, session, orders, otp } = fixture();
    otp.verify.mockResolvedValue('expired');
    await expect(
      service.confirm(actor, 'session', { otp: '123456' }),
    ).rejects.toThrow();
    expect(session.status).toBe('EXPIRED');
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('rejects another buyer before verification', async () => {
    const { service, repository, orders, otp } = fixture();
    repository.findOneBy.mockResolvedValue(null);
    await expect(
      service.confirm(actor, 'session', { otp: '123456' }),
    ).rejects.toThrow();
    expect(repository.findOneBy).toHaveBeenCalledWith({
      sessionId: 'session',
      userId: 'buyer',
    });
    expect(otp.verify).not.toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
  });

  it('replays success without verifying or settling again', async () => {
    const { service, session, orders, otp } = fixture();
    session.status = 'SUCCEEDED';
    await expect(
      service.confirm(actor, 'session', { otp: '000000' }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(otp.verify).not.toHaveBeenCalled();
    expect(orders.pay).not.toHaveBeenCalled();
  });
});
