import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  VnpayClient,
  vnpayCanonical,
  vnpayDate,
  type VnpayParams,
} from './vnpay.client';
import { PaymentProcessingService } from './payment-processing.service';
import { ProjectPaymentGateway } from './payment-gateway';

export function vnpayFixture() {
  const config = new ConfigService({
    VNPAY_TMN_CODE: 'TESTCODE',
    VNPAY_HASH_SECRET: 'test-secret-only',
    VNPAY_RETURN_URL: 'http://localhost:7000/api/v1/payments/vnpay/return',
    PAYMENT_PROVIDER: 'VNPAY',
  });
  const client = new VnpayClient(config);
  function signed(overrides: VnpayParams = {}) {
    const parameters = {
      vnp_TxnRef: 'vnp_test',
      vnp_Amount: '10000000',
      vnp_TmnCode: 'TESTCODE',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '12345678',
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: 'Thanh toan ve',
      ...overrides,
    };
    return { ...parameters, vnp_SecureHash: client.sign(parameters) };
  }
  return { config, client, signed };
}

describe('VNPay 2.1.0 sandbox protocol', () => {
  const { client, config, signed } = vnpayFixture();

  it('sorts and encodes decoded values once with spaces as plus', () => {
    expect(
      vnpayCanonical({
        vnp_OrderInfo: 'Thanh toán & ve',
        vnp_Amount: '100',
        vnp_SecureHash: 'ignored',
      }),
    ).toBe('vnp_Amount=100&vnp_OrderInfo=Thanh+to%C3%A1n+%26+ve');
    const expected = createHmac('sha512', 'test-secret-only')
      .update('vnp_Amount=100&vnp_OrderInfo=Thanh+to%C3%A1n+%26+ve')
      .digest('hex');
    expect(
      client.sign({ vnp_OrderInfo: 'Thanh toán & ve', vnp_Amount: '100' }),
    ).toBe(expected);
  });

  it('uses UTC+7 regardless of host timezone', () => {
    expect(vnpayDate(new Date('2026-10-20T20:30:00Z'))).toBe('20261021033000');
  });

  it('builds a sandbox URL with exact integer amount and signed expiry', () => {
    const url = new URL(
      client.paymentUrl(
        'vnptest',
        '100000',
        new Date('2026-10-20T00:00:00Z'),
        new Date('2026-10-20T00:10:00Z'),
        '::ffff:127.0.0.1',
      ),
    );
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_Amount')).toBe('10000000');
    expect(url.searchParams.get('vnp_ExpireDate')).toBe('20261020071000');
    expect(url.searchParams.get('vnp_IpAddr')).toBe('127.0.0.1');
    const parameters = Object.fromEntries(url.searchParams);
    expect(parameters.vnp_SecureHash).toBe(client.sign(parameters));
  });

  it.each(['0', '-1', '1.5', '10000000000'])(
    'rejects unsupported amount %s',
    (amount) => {
      expect(() =>
        client.paymentUrl('ref', amount, new Date(), new Date(), '127.0.0.1'),
      ).toThrow();
    },
  );

  it('rejects tampered signatures, duplicate query fields and wrong merchants', () => {
    expect(() => client.verify({ ...signed(), vnp_Amount: '1' })).toThrow();
    expect(() =>
      client.verify({ ...signed(), vnp_TxnRef: ['vnp_test', 'other'] }),
    ).toThrow();
    expect(() => client.verify(signed({ vnp_TmnCode: 'OTHER' }))).toThrow();
    expect(() =>
      client.verify({ ...signed(), vnp_SecureHash: 'bad' }),
    ).toThrow();
  });

  it('fails closed without configured credentials', () => {
    const missing = new VnpayClient(new ConfigService());
    expect(() =>
      missing.paymentUrl('ref', '10000', new Date(), new Date(), '127.0.0.1'),
    ).toThrow('not configured');
  });

  it('requires both successful statuses and binds proof to reference and amount', () => {
    const proof = {
      reference: 'order:order',
      txnRef: 'vnp_test',
      parameters: signed(),
    };
    expect(client.confirmed(proof, 'order:order', '100000')).toBe(
      'vnp_12345678',
    );
    expect(() => client.confirmed(proof, 'order:other', '100000')).toThrow();
    expect(() => client.confirmed(proof, 'order:order', '1')).toThrow();
    expect(() =>
      client.confirmed({ ...proof, txnRef: 'other' }, 'order:order', '100000'),
    ).toThrow();
    expect(() =>
      client.confirmed(
        { ...proof, parameters: signed({ vnp_TransactionStatus: '02' }) },
        'order:order',
        '100000',
      ),
    ).toThrow();
    expect(() =>
      client.confirmed(
        { ...proof, parameters: signed({ vnp_ResponseCode: '24' }) },
        'order:order',
        '100000',
      ),
    ).toThrow();
    expect(() =>
      client.confirmed(
        { ...proof, parameters: signed({ vnp_TransactionNo: '0' }) },
        'order:order',
        '100000',
      ),
    ).toThrow();
  });

  it('blocks legacy mock settlement for paid orders when VNPay is enabled', () => {
    const service = new PaymentProcessingService(
      new ProjectPaymentGateway(),
      config,
      client,
    );
    expect(() => service.process('order:order', '100000')).toThrow(
      'verified VNPay IPN',
    );
    expect(service.process('order:free', '0').provider).toBe('FREE');
    expect(
      service.process('order:order', '100000', undefined, {
        reference: 'order:order',
        txnRef: 'vnp_test',
        parameters: signed(),
      }).transactionId,
    ).toBe('vnp_12345678');
  });

  it.each<VnpayParams>([
    { vnp_Amount: '1000000000000' },
    { vnp_TransactionNo: '1234567890123456' },
    { vnp_TransactionNo: '' },
    { vnp_BankCode: '' },
    { vnp_OrderInfo: '' },
    { vnp_OrderInfo: 'A'.repeat(256) },
    { vnp_PayDate: '2026-10-20' },
  ])(
    'rejects signed callback fields outside the published schema: %j',
    (fields) => {
      expect(() => client.verify(signed(fields))).toThrow(
        'Invalid VNPay result',
      );
    },
  );

  it('allows absent optional bank transaction, card type and payment date fields', () => {
    expect(client.verify(signed()).vnp_BankCode).toBe('NCB');
    expect(
      client.verify(
        signed({
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
          vnp_TransactionNo: '0',
        }),
      ).vnp_ResponseCode,
    ).toBe('24');
  });

  it('accepts callback references up to the protocol limit, even if no local order matches', () => {
    expect(
      client.verify(signed({ vnp_TxnRef: 'A'.repeat(100) })).vnp_TxnRef.length,
    ).toBe(100);
    expect(() =>
      client.verify(signed({ vnp_TxnRef: 'A'.repeat(101) })),
    ).toThrow();
  });

  it('does not depend on a return URL to verify an in-flight IPN', () => {
    const callbackClient = new VnpayClient(
      new ConfigService({
        VNPAY_TMN_CODE: 'TESTCODE',
        VNPAY_HASH_SECRET: 'test-secret-only',
      }),
    );
    expect(callbackClient.verify(signed()).vnp_ResponseCode).toBe('00');
    expect(() =>
      callbackClient.paymentUrl(
        'ref',
        '10000',
        new Date(0),
        new Date(60000),
        '127.0.0.1',
      ),
    ).toThrow('return URL');
  });

  it('signs the same sorted form encoding as the Node.js example with optional fields', () => {
    const input: Record<string, string> = {
      vnp_OrderInfo: 'Thanh toan ve 10000 VND',
      vnp_TmnCode: 'TESTCODE',
      vnp_BankCode: 'NCB',
      vnp_ReturnUrl: 'https://example.com/payment/return',
      vnp_Amount: '1000000',
    };
    const encoded: Record<string, string> = {};
    Object.keys(input)
      .sort()
      .forEach((key) => {
        encoded[encodeURIComponent(key)] = encodeURIComponent(
          input[key],
        ).replace(/%20/g, '+');
      });
    const reference = Object.entries(encoded)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHmac('sha512', 'test-secret-only')
      .update(reference, 'utf8')
      .digest('hex');
    expect(client.sign(input)).toBe(signature);
    expect(
      client.sign({
        ...input,
        vnp_SecureHash: 'excluded',
        vnp_SecureHashType: 'excluded',
      }),
    ).toBe(signature);
  });

  it('validates payment window and outbound reference independently of the server order', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    expect(() =>
      client.paymentUrl('ref', '10000', now, now, '127.0.0.1'),
    ).toThrow('payment dates');
    expect(() =>
      client.paymentUrl(
        'invalid/ref',
        '10000',
        now,
        new Date(now.getTime() + 60000),
        '127.0.0.1',
      ),
    ).toThrow('reference');
    expect(() =>
      client.paymentUrl('ref', '10000', new Date('invalid'), now, '127.0.0.1'),
    ).toThrow('payment dates');
  });
});
