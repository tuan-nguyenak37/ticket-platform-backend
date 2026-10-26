import { BadGatewayException, BadRequestException } from '@nestjs/common';
import {
  PaymentGateway,
  ProjectPaymentGateway,
  type ChargeResult,
} from './payment-gateway';
import { PaymentProcessingService } from './payment-processing.service';
import { ConfigService } from '@nestjs/config';
import { VnpayClient } from './vnpay.client';

describe('project payment processing', () => {
  const config = new ConfigService({ PAYMENT_PROVIDER: 'PROJECT' });
  const service = new PaymentProcessingService(
    new ProjectPaymentGateway(),
    config,
    new VnpayClient(config),
  );

  it('confirms a valid VND charge with a stable transaction reference', () => {
    const first = service.process('order:ord_abc123', '100000');
    expect(first).toMatchObject({
      provider: 'PROJECT',
      reference: 'order:ord_abc123',
      amount: '100000',
      currency: 'VND',
      status: 'SUCCEEDED',
    });
    expect(first.transactionId).toBe(
      service.process('order:ord_abc123', '100000').transactionId,
    );
    expect(first.transactionId).not.toBe(
      service.process('resale:ord_abc123', '100000').transactionId,
    );
  });

  it.each([
    ['order:ord_abc123', '-1'],
    ['order:ord_abc123', '1.5'],
    ['order:ord_abc123', '9223372036854775808'],
    ['invalid:ord_abc123', '100000'],
  ])('rejects an invalid payment request', (reference, amount) => {
    expect(() => service.process(reference, amount)).toThrow(
      BadRequestException,
    );
  });

  it('blocks nonzero project payments in production', () => {
    const production = new ConfigService({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'PROJECT',
    });
    const gateway = { charge: jest.fn() } as unknown as PaymentGateway;
    const processing = new PaymentProcessingService(
      gateway,
      production,
      new VnpayClient(production),
    );
    expect(() => processing.process('order:ord_blocked', '100000')).toThrow(
      BadGatewayException,
    );
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('supports free tickets without charging money', () => {
    expect(service.process('order:ord_free', '0').status).toBe('SUCCEEDED');
  });

  it.each([
    { status: 'FAILED' },
    { reference: 'order:another' },
    { amount: '1' },
    { currency: 'USD' },
    { transactionId: 'not a valid id' },
  ])('does not finalize an inconsistent provider result', (overrides) => {
    const gateway = {
      charge: () =>
        ({
          reference: 'order:ord_abc123',
          amount: '100000',
          currency: 'VND',
          status: 'SUCCEEDED',
          provider: 'PROJECT',
          transactionId: 'prj_abc',
          ...overrides,
        }) as ChargeResult,
    } as PaymentGateway;
    expect(() =>
      new PaymentProcessingService(
        gateway,
        config,
        new VnpayClient(config),
      ).process('order:ord_abc123', '100000'),
    ).toThrow(BadGatewayException);
  });
});
