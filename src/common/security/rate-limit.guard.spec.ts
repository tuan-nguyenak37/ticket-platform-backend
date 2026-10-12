import {
  Controller,
  Get,
  INestApplication,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RateLimit } from './rate-limit.decorator';
import { clientNetwork, RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Controller()
class TestController {
  @Get('public') read() {
    return { ok: true };
  }
  @Post('login')
  @RateLimit({ scope: 'login', limit: 10, seconds: 60, account: true })
  login() {
    return { ok: true };
  }
}

describe('Redis rate limit HTTP guard', () => {
  let app: INestApplication<App>;
  const limits = { check: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        { provide: RateLimitService, useValue: limits },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: APP_GUARD, useClass: RateLimitGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    limits.check
      .mockReset()
      .mockResolvedValue({ allowed: true, retryAfter: 60 });
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 429 with Retry-After before the handler runs', async () => {
    limits.check.mockResolvedValue({ allowed: false, retryAfter: 42 });
    await request(app.getHttpServer())
      .get('/public')
      .expect(429)
      .expect('Retry-After', '42');
  });
  it('returns 503 when security storage is unavailable', async () => {
    limits.check.mockRejectedValue(
      new ServiceUnavailableException('Security service unavailable'),
    );
    await request(app.getHttpServer()).get('/public').expect(503);
  });
  it('normalizes login identity and ignores spoofed forwarded addresses', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .set('X-Forwarded-For', '8.8.8.8')
      .send({ email: ' User@Example.com ' })
      .expect(201);
    expect(limits.check).toHaveBeenCalledWith(
      'login-account',
      'user@example.com',
      20,
      900,
    );
    expect(limits.check).toHaveBeenCalledWith('login', '127.0.0.1', 10, 60);
  });
  it('leaves malformed email handling to validation, without crashing', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: 123 })
      .expect(201);
    expect(limits.check).toHaveBeenCalledTimes(3);
  });
  it('groups IPv6 clients by /64 and normalizes IPv4-mapped addresses', () => {
    expect(clientNetwork('2001:db8:1:2::1')).toBe(
      clientNetwork('2001:db8:1:2::ffff'),
    );
    expect(clientNetwork('2001:db8:1:3::1')).not.toBe(
      clientNetwork('2001:db8:1:2::1'),
    );
    expect(clientNetwork('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });
});
