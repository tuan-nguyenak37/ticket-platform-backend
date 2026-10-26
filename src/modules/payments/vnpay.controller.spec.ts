import type { Request, Response } from 'express';
import { VnpayController } from './vnpay.controller';
import { VnpayService } from './vnpay.service';
import { IS_PUBLIC } from '../auth/authorization/access-policy';
import { ConfigService } from '@nestjs/config';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import type { Principal } from '../auth/authorization/principal';
import { ResaleController } from '../resale/resale.controller';
import { ResaleService } from '../resale/resale.service';

describe('VNPay callback transport', () => {
  it('rejects standalone public holds and routes purchase start through VNPay', () => {
    const reserve = jest.fn();
    const resale = new ResaleController({
      reserve,
    } as unknown as ResaleService);
    const actor = { user_id: 'buyer' } as Principal;
    expect(() => resale.reserve(actor, { id: 'listing' }, {})).toThrow(
      'Vé chỉ được giữ',
    );
    expect(reserve).not.toHaveBeenCalled();
    const startResale = jest.fn();
    const controller = new VnpayController({
      startResale,
    } as unknown as VnpayService);
    const body = { recipient: {} };
    void controller.startResale(actor, 'listing', body, {
      ip: '127.0.0.1',
    } as Request);
    expect(startResale).toHaveBeenCalledWith(
      actor,
      'listing',
      body,
      '127.0.0.1',
    );
    expect(() =>
      controller.startResale(actor, '../listing', body, {
        ip: '127.0.0.1',
      } as Request),
    ).toThrow();
  });
  it('disables legacy email OTP issuance and confirmation in VNPay mode', () => {
    const service = { start: jest.fn(), confirm: jest.fn() };
    const controller = new CheckoutController(
      service as unknown as CheckoutService,
      new ConfigService({ PAYMENT_PROVIDER: 'VNPAY' }),
    );
    const actor = { user_id: 'buyer' } as Principal;
    expect(() => controller.start(actor, 'orders', 'order', {})).toThrow(
      'Use /v1/payments/vnpay',
    );
    expect(() =>
      controller.confirm(actor, 'session', { otp: '123456' }),
    ).toThrow('Use /v1/payments/vnpay');
    expect(service.start).not.toHaveBeenCalled();
    expect(service.confirm).not.toHaveBeenCalled();
  });

  it('returns the exact IPN protocol body through the native response', async () => {
    const service = {
      ipn: jest
        .fn()
        .mockResolvedValue({ RspCode: '00', Message: 'Confirm success' }),
    };
    const controller = new VnpayController(service as unknown as VnpayService);
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    await controller.ipn(
      { vnp_TxnRef: 'ref' },
      response as unknown as Response,
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      RspCode: '00',
      Message: 'Confirm success',
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(Reflect.getMetadata(IS_PUBLIC, VnpayController.prototype.ipn)).toBe(
      true,
    );
  });

  it('redirects browser return without invoking IPN settlement', async () => {
    const service = {
      returnUrl: jest
        .fn()
        .mockResolvedValue('http://localhost:3000/checkout/orders/order'),
      ipn: jest.fn(),
    };
    const controller = new VnpayController(service as unknown as VnpayService);
    const response = { setHeader: jest.fn(), redirect: jest.fn() };
    await controller.returned({}, response as unknown as Response);
    expect(response.redirect).toHaveBeenCalledWith(
      303,
      'http://localhost:3000/checkout/orders/order',
    );
    expect(service.ipn).not.toHaveBeenCalled();
    expect(
      Reflect.getMetadata(IS_PUBLIC, VnpayController.prototype.returned),
    ).toBe(true);
  });
});
