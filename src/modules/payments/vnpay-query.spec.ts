import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { VnpayClient, type VnpayParams } from './vnpay.client';

const secret = 'query-test-secret';
function signed(overrides: VnpayParams = {}) {
  const parameters: VnpayParams = {
    vnp_ResponseId: 'response123',
    vnp_Command: 'querydr',
    vnp_ResponseCode: '00',
    vnp_Message: 'Success',
    vnp_TmnCode: 'TESTCODE',
    vnp_TxnRef: 'vnp_test',
    vnp_Amount: '10000000',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20261020071000',
    vnp_TransactionNo: '123456',
    vnp_TransactionType: '01',
    vnp_TransactionStatus: '00',
    vnp_OrderInfo: 'Thanh toan ve',
    ...overrides,
  };
  const payload = [
    parameters.vnp_ResponseId,
    parameters.vnp_Command,
    parameters.vnp_ResponseCode,
    parameters.vnp_Message,
    parameters.vnp_TmnCode,
    parameters.vnp_TxnRef,
    parameters.vnp_Amount,
    parameters.vnp_BankCode,
    parameters.vnp_PayDate,
    parameters.vnp_TransactionNo,
    parameters.vnp_TransactionType,
    parameters.vnp_TransactionStatus,
    parameters.vnp_OrderInfo,
    parameters.vnp_PromotionCode ?? '',
    parameters.vnp_PromotionAmount ?? '',
  ].join('|');
  return {
    ...parameters,
    vnp_SecureHash: createHmac('sha512', secret).update(payload).digest('hex'),
  };
}

describe('VNPay querydr protocol', () => {
  const client = new VnpayClient(
    new ConfigService({
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_HASH_SECRET: secret,
    }),
  );
  afterEach(() => jest.restoreAllMocks());

  it('posts a signed pipe-delimited query with the original Vietnam create date and a bounded timeout', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(signed())));
    await expect(
      client.query('vnp_test', new Date('2026-10-20T00:00:00Z')),
    ).resolves.toMatchObject({ vnp_ResponseCode: '00' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    );
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeDefined();
    const request = JSON.parse(options?.body as string) as VnpayParams;
    expect(request.vnp_TransactionDate).toBe('20261020070000');
    expect(request.vnp_RequestId).toMatch(/^[a-f0-9]{32}$/);
    const expected = [
      request.vnp_RequestId,
      '2.1.0',
      'querydr',
      'TESTCODE',
      'vnp_test',
      '20261020070000',
      request.vnp_CreateDate,
      '127.0.0.1',
      'Doi soat ve vnp_test',
    ].join('|');
    expect(request.vnp_SecureHash).toBe(
      createHmac('sha512', secret).update(expected).digest('hex'),
    );
  });

  it('binds verified query proof to the local reference, amount and successful payment', () => {
    const proof = {
      reference: 'order:order',
      txnRef: 'vnp_test',
      source: 'querydr' as const,
      parameters: signed(),
    };
    expect(client.confirmed(proof, 'order:order', '100000')).toBe('vnp_123456');
    expect(() => client.confirmed(proof, 'order:other', '100000')).toThrow();
    expect(() => client.confirmed(proof, 'order:order', '1')).toThrow();
    expect(() =>
      client.confirmed({ ...proof, txnRef: 'other' }, 'order:order', '100000'),
    ).toThrow();
    expect(() =>
      client.confirmed(
        { ...proof, parameters: signed({ vnp_TransactionStatus: '01' }) },
        'order:order',
        '100000',
      ),
    ).toThrow();
    expect(() =>
      client.confirmed(
        { ...proof, source: undefined },
        'order:order',
        '100000',
      ),
    ).toThrow();
  });

  it.each<VnpayParams>([
    { vnp_TmnCode: 'OTHERCOD' },
    { vnp_Command: 'refund' },
    { vnp_TransactionType: '02' },
    { vnp_TransactionNo: '0' },
    { vnp_Amount: '1.5' },
    { vnp_TransactionStatus: '' },
  ])('rejects signed but invalid payment response %j', (overrides) => {
    expect(() => client.verifyQuery(signed(overrides))).toThrow(
      BadRequestException,
    );
  });

  it('rejects tampered signatures, wrong references, arrays, network and HTTP failures', async () => {
    expect(() =>
      client.verifyQuery({ ...signed(), vnp_Amount: '100' }),
    ).toThrow();
    expect(() =>
      client.verifyQuery({ ...signed(), vnp_Amount: ['100'] }),
    ).toThrow();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(signed({ vnp_TxnRef: 'other' }))),
      );
    await expect(client.query('vnp_test', new Date())).rejects.toThrow(
      'reference mismatch',
    );
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(client.query('vnp_test', new Date())).rejects.toThrow(
      'unavailable',
    );
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(client.query('vnp_test', new Date())).rejects.toThrow(
      'timeout',
    );
  });

  it('accepts optional promotion fields and treats API success separately from payment status', () => {
    expect(
      client.verifyQuery(
        signed({ vnp_PromotionCode: '123', vnp_PromotionAmount: '100' }),
      ).vnp_ResponseCode,
    ).toBe('00');
    expect(
      client.verifyQuery(
        signed({ vnp_TransactionStatus: '02', vnp_TransactionNo: '0' }),
      ).vnp_TransactionStatus,
    ).toBe('02');
    expect(
      client.verifyQuery(
        signed({
          vnp_ResponseCode: '91',
          vnp_TransactionStatus: '',
          vnp_Amount: '',
          vnp_TransactionNo: '',
        }),
      ).vnp_ResponseCode,
    ).toBe('91');
  });

  it('reports unsigned duplicate-query rejection as a retryable error, never payment proof', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        vnp_ResponseCode: '94',
        vnp_Message: 'Request is duplicated',
      }),
    );
    await expect(client.query('vnp_test', new Date())).rejects.toMatchObject({
      status: 429,
    });
    expect(() => client.verifyQuery({ vnp_ResponseCode: '94' })).toThrow(
      BadRequestException,
    );
  });
});
