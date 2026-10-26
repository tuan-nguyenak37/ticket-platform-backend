import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GlobalResponseInterceptor } from '../../common/interceptors/global-response.interceptor';
import { VnpayClient } from './vnpay.client';
import { VnpayController } from './vnpay.controller';
import { VnpayService } from './vnpay.service';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PaymentsModule } from './payments.module';

describe('VNPay callback HTTP protocol', () => {
  let app: INestApplication;
  const client = new VnpayClient(
    new ConfigService({
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_HASH_SECRET: 'http-test-secret',
    }),
  );
  const service = {
    ipn: jest.fn(async (query: unknown) => {
      try {
        client.verify(query);
        return { RspCode: '00', Message: 'Confirm success' };
      } catch {
        return { RspCode: '97', Message: 'Invalid signature or parameters' };
      }
    }),
    returnUrl: jest
      .fn()
      .mockResolvedValue(
        'http://localhost:3000/checkout/orders/order?vnpay=returned',
      ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VnpayController],
      providers: [{ provide: VnpayService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new GlobalResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('removes administrator payment routes without unregistering VNPay callbacks', async () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PaymentsModule,
    ) as object[];
    expect(controllers).toContain(VnpayController);
    expect(
      controllers.map((controller) =>
        Reflect.getMetadata(PATH_METADATA, controller),
      ),
    ).not.toContain('admin/payments/vnpay');
    await request(app.getHttpServer())
      .get('/api/admin/payments/vnpay')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/admin/payments/vnpay/vnp_test')
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/admin/payments/vnpay/vnp_test/reconcile')
      .send({ reason: 'Test' })
      .expect(404);
  });

  function signed() {
    const parameters = {
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'vnptest',
      vnp_Amount: '1000000',
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: 'Thanh toan ve 10000 VND',
      vnp_TransactionNo: '123456',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    return { ...parameters, vnp_SecureHash: client.sign(parameters) };
  }

  it('handles actual GET query decoding and sends bare JSON despite the global interceptor', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(signed())
      .expect(200);
    expect(response.body).toEqual({
      RspCode: '00',
      Message: 'Confirm success',
    });
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.ipn).toHaveBeenLastCalledWith(
      expect.objectContaining({ vnp_OrderInfo: 'Thanh toan ve 10000 VND' }),
    );
  });

  it('rejects duplicated callback parameters after Express parses them as arrays', async () => {
    const query = new URLSearchParams(signed());
    query.append('vnp_Amount', '1');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/payments/vnpay/ipn?${query}`)
      .expect(200);
    expect(response.body.RspCode).toBe('97');
    expect(response.body).not.toHaveProperty('data');
  });

  it('returns a real 303 redirect and does not execute IPN for browser return', async () => {
    service.ipn.mockClear();
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/return')
      .query(signed())
      .expect(303);
    expect(response.headers.location).toBe(
      'http://localhost:3000/checkout/orders/order?vnpay=returned',
    );
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(service.ipn).not.toHaveBeenCalled();
  });
});
