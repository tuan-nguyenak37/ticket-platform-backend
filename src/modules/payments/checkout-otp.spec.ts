import { CheckoutOtpService } from './checkout-otp.service';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { MailService } from '../tickets/mail.service';

describe('checkout email OTP', () => {
  function fixture() {
    const values = new Map<string, string>();
    const client = {
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => values.get(key) ?? null),
    };
    const redis = {
      key: (scope: string, identity: string) => `${scope}:${identity}`,
      execute: jest.fn(async (operation) => operation(client)),
    };
    const limits = { check: jest.fn().mockResolvedValue({ allowed: true }) };
    const mail = { sendCheckoutOtp: jest.fn().mockResolvedValue(undefined) };
    const service = new CheckoutOtpService(
      redis as unknown as SecurityRedisService,
      limits as unknown as RateLimitService,
      mail as unknown as MailService,
    );
    return { service, client, limits, mail, values };
  }

  it('emails a six-digit code and stores only its digest with the session expiry', async () => {
    const { service, client, mail } = fixture();
    const expiry = new Date(Date.now() + 60_000);
    await service.issue('buyer', 'session', 'buyer@example.com', expiry);
    const code = mail.sendCheckoutOtp.mock.calls[0][1] as string;
    expect(code).toMatch(/^\d{6}$/);
    expect(mail.sendCheckoutOtp).toHaveBeenCalledWith(
      'buyer@example.com',
      code,
      expiry,
    );
    expect(client.set).toHaveBeenCalledWith(
      'checkout-otp:session',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'PXAT',
      expiry.getTime(),
    );
    expect(client.set.mock.calls[0][1]).not.toBe(code);
    await expect(service.verify('session', code)).resolves.toBe('valid');
    await expect(service.verify('other-session', code)).resolves.toBe(
      'expired',
    );
    await expect(
      service.verify('session', code === '000000' ? '000001' : '000000'),
    ).resolves.toBe('invalid');
  });

  it('does not send or store a code when rate limited', async () => {
    const { service, client, limits, mail } = fixture();
    limits.check.mockResolvedValue({ allowed: false });
    await expect(
      service.issue('buyer', 'session', 'buyer@example.com', new Date()),
    ).rejects.toThrow('Too many');
    expect(client.set).not.toHaveBeenCalled();
    expect(mail.sendCheckoutOtp).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is unavailable', async () => {
    const { service, client, mail } = fixture();
    client.set.mockRejectedValue(new Error('redis unavailable'));
    await expect(
      service.issue('buyer', 'session', 'buyer@example.com', new Date()),
    ).rejects.toThrow('redis unavailable');
    expect(mail.sendCheckoutOtp).not.toHaveBeenCalled();
    client.get.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.verify('session', '123456')).rejects.toThrow(
      'redis unavailable',
    );
  });

  it('limits the recipient even when the buyer limit allows sending', async () => {
    const { service, limits, client, mail } = fixture();
    limits.check
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await expect(
      service.issue('buyer', 'session', 'buyer@example.com', new Date()),
    ).rejects.toThrow('Too many');
    expect(client.set).not.toHaveBeenCalled();
    expect(mail.sendCheckoutOtp).not.toHaveBeenCalled();
  });

  it('propagates SMTP failure so the caller can roll back the new session', async () => {
    const { service, mail } = fixture();
    mail.sendCheckoutOtp.mockRejectedValue(new Error('smtp unavailable'));
    await expect(
      service.issue('buyer', 'session', 'buyer@example.com', new Date()),
    ).rejects.toThrow('smtp unavailable');
  });

  it('rejects missing or malformed digests without accepting a fallback code', async () => {
    const { service, values } = fixture();
    await expect(service.verify('session', '123456')).resolves.toBe('expired');
    values.set('checkout-otp:session', 'corrupt');
    await expect(service.verify('session', '123456')).resolves.toBe('invalid');
  });
});
