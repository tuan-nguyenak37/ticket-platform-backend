import { HttpException, Injectable } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { MailService } from '../tickets/mail.service';

@Injectable()
export class CheckoutOtpService {
  constructor(
    private readonly redis: SecurityRedisService,
    private readonly limits: RateLimitService,
    private readonly mail: MailService,
  ) {}

  private key(sessionId: string) {
    return this.redis.key('checkout-otp', sessionId);
  }

  private digest(sessionId: string, code: string) {
    return createHash('sha256').update(`${sessionId}:${code}`).digest('hex');
  }

  async issue(
    userId: string,
    sessionId: string,
    email: string,
    expiresAt: Date,
  ) {
    const limit = await this.limits.check('checkout-email', userId, 5, 300);
    if (!limit.allowed)
      throw new HttpException(
        'Too many verification emails. Try again later.',
        429,
      );
    const recipientLimit = await this.limits.check(
      'checkout-email-recipient',
      email.toLowerCase(),
      5,
      300,
    );
    if (!recipientLimit.allowed)
      throw new HttpException(
        'Too many verification emails. Try again later.',
        429,
      );
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.execute((client) =>
      client.set(
        this.key(sessionId),
        this.digest(sessionId, code),
        'PXAT',
        expiresAt.getTime(),
      ),
    );
    await this.mail.sendCheckoutOtp(email, code, expiresAt);
  }

  async verify(
    sessionId: string,
    code: string,
  ): Promise<'valid' | 'invalid' | 'expired'> {
    const stored = await this.redis.execute((client) =>
      client.get(this.key(sessionId)),
    );
    if (!stored) return 'expired';
    const expected = Buffer.from(stored, 'hex');
    const actual = Buffer.from(this.digest(sessionId, code), 'hex');
    return expected.length === actual.length &&
      timingSafeEqual(expected, actual)
      ? 'valid'
      : 'invalid';
  }
}
