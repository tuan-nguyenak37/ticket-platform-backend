import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../../configure-app';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { AuthController } from '../../modules/auth/auth.controller';
import { AuthService } from '../../modules/auth/auth.service';
import { TokenService } from '../../modules/auth/jwt/token.service';
import { AccessTokenGuard } from '../../modules/auth/jwt/access-token.guard';
import { AuditService } from '../../modules/auth/authorization/audit.service';
import { UsersService } from '../../modules/users/users.service';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/entities/enums/user-role.enum';
import { UserStatus } from '../../modules/users/entities/enums/user-status.enum';
import { hashPassword } from '../utils/password.util';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RefreshSessionService } from './refresh-session.service';

const suite =
  process.env.SECURITY_REDIS_TEST === '1' ? describe : describe.skip;
suite('Auth HTTP with real JWT and Redis (in-memory user repository)', () => {
  jest.setTimeout(30000);
  let app: INestApplication<App>;
  let redis: SecurityRedisService;
  let tokens: TokenService;
  let user: User;
  const prefix = `auth_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    const url =
      process.env.SECURITY_TEST_REDIS_URL || 'redis://127.0.0.1:6380/1';
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
      throw new Error('Local Redis required');
    user = Object.assign(new User(), {
      user_id: 'user_http_test',
      email: 'person@example.test',
      password: await hashPassword('abcdef'),
      fullName: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      tokenVersion: 0,
    });
    const users = {
      findByEmail: () => Promise.resolve({ ...user }),
      findById: () => Promise.resolve({ ...user }),
      rotateTokenVersion: (previous: { tokenVersion: number }) => {
        if (previous.tokenVersion !== user.tokenVersion)
          throw new UnauthorizedException();
        return Promise.resolve(++user.tokenVersion);
      },
    };
    const config = new ConfigService({
      SECURITY_REDIS_URL: url,
      SECURITY_REDIS_PREFIX: prefix,
      JWT_ACCESS_SECRET: 'http-test-access',
      JWT_REFRESH_SECRET: 'http-test-refresh',
      JWT_REFRESH_EXPIRES: '2h',
      RATE_LIMIT_MAX: 120,
    });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenService,
        JwtService,
        SecurityRedisService,
        RefreshSessionService,
        RateLimitService,
        AuditService,
        { provide: ConfigService, useValue: config },
        { provide: UsersService, useValue: users },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    redis = module.get(SecurityRedisService);
    tokens = module.get(TokenService);
  });
  async function cleanup() {
    await redis.execute(async (client) => {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(
          cursor,
          'MATCH',
          `${prefix}:*`,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length) await client.unlink(...keys);
      } while (cursor !== '0');
    });
  }
  beforeEach(async () => {
    user.tokenVersion = 0;
    await cleanup();
  });
  afterAll(async () => {
    try {
      if (redis) await cleanup();
    } finally {
      await app?.close();
    }
  });
  function cookie(response: request.Response) {
    const values = response.headers['set-cookie'] as unknown as string[];
    return values
      .find((value) => value.startsWith('refresh_token='))!
      .split(';')[0];
  }
  async function login() {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'abcdef' })
      .expect(200);
  }
  it('rotates only once under concurrent refresh and keeps the winning session usable', async () => {
    const first = await login();
    expect(first.headers['cache-control']).toBe('no-store');
    expect(String(first.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(first.headers['set-cookie'])).toContain('Max-Age=7200');
    expect(first.body).not.toHaveProperty('refreshToken');
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', cookie(first)),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const winner = results.find((r) => r.status === 200)!;
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie(first))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie(winner))
      .expect(200);
  });
  it('rejects a signed token which has never been registered in Redis', async () => {
    const token = await tokens.generateRefreshToken({ ...user });
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${token}`)
      .expect(401);
    expect(user.tokenVersion).toBe(0);
  });
  it('logout revokes access and refresh and removes the Redis version record', async () => {
    const response = await login();
    const access = (response.body as { accessToken: string }).accessToken;
    const key = redis.key('refresh', `${user.user_id}:${user.tokenVersion}`);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(access, { type: 'bearer' })
      .expect(200);
    expect(await redis.execute((client) => client.exists(key))).toBe(0);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie(response))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(access, { type: 'bearer' })
      .expect(401);
  });
  it('invalidates both tokens after the password-change version is advanced', async () => {
    const response = await login();
    user.tokenVersion++;
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie(response))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth((response.body as { accessToken: string }).accessToken, {
        type: 'bearer',
      })
      .expect(401);
  });
  it('rejects repeated login attempts with 429 and Retry-After', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong' })
        .expect(401);
    const result = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'abcdef' })
      .expect(429);
    expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
  });
});
