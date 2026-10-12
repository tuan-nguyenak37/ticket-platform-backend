import { ConfigService } from '@nestjs/config';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RefreshSessionService } from './refresh-session.service';
import { RateLimitService } from './rate-limit.service';

const suite =
  process.env.SECURITY_REDIS_TEST === '1' ? describe : describe.skip;
suite('Security with real Redis', () => {
  jest.setTimeout(20000);
  const prefix = `security_test_${randomUUID().replaceAll('-', '')}`;
  let redis: SecurityRedisService;
  let sessions: RefreshSessionService;
  let rates: RateLimitService;
  const owner = { user_id: 'test_user', tokenVersion: 1 };
  beforeAll(async () => {
    const url =
      process.env.SECURITY_TEST_REDIS_URL || 'redis://127.0.0.1:6380/1';
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
      throw new Error('Local Redis required');
    redis = new SecurityRedisService(
      new ConfigService({
        SECURITY_REDIS_URL: url,
        SECURITY_REDIS_PREFIX: prefix,
        JWT_ACCESS_SECRET: 'test-only-key',
      }),
    );
    await redis.onModuleInit();
    sessions = new RefreshSessionService(redis);
    rates = new RateLimitService(redis);
  });
  afterAll(async () => {
    try {
      if (redis)
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
    } finally {
      redis?.onModuleDestroy();
    }
  });
  it('admits exactly the configured number of concurrent requests across instances', async () => {
    const other = new RateLimitService(redis);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        (i % 2 ? other : rates).check('concurrent', 'same_ip', 10, 60),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.every((r) => r.retryAfter > 0 && r.retryAfter <= 60)).toBe(
      true,
    );
  });
  it('expires counters instead of extending a block on every attempt', async () => {
    expect((await rates.check('expiry', 'ip', 1, 1)).allowed).toBe(true);
    expect((await rates.check('expiry', 'ip', 1, 1)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await rates.check('expiry', 'ip', 1, 1)).allowed).toBe(true);
  });
  it('allows only one concurrent consumption of a refresh token', async () => {
    await sessions.register(owner, 'token_single_use', 60);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        sessions.consume(owner, 'token_single_use'),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(sessions.consume(owner, 'token_single_use')).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('stores no raw token or user identity and expires the session', async () => {
    const token = 'sensitive_refresh_token';
    await sessions.register(owner, token, 1);
    const key = redis.key('refresh', `${owner.user_id}:${owner.tokenVersion}`);
    const fields = await redis.execute((client) => client.hgetall(key));
    expect(key).not.toContain(owner.user_id);
    expect(JSON.stringify(fields)).not.toContain(token);
    expect(Object.keys(fields).every((k) => /^[a-f0-9]{64}$/.test(k))).toBe(
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(sessions.consume(owner, token)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('cleans up one failed candidate without removing a concurrent login', async () => {
    await sessions.register(owner, 'candidate_a', 60);
    await sessions.register(owner, 'candidate_b', 60);
    await sessions.discard(owner, 'candidate_a');
    await expect(sessions.consume(owner, 'candidate_a')).rejects.toThrow(
      UnauthorizedException,
    );
    await sessions.consume(owner, 'candidate_b');
  });
  it('revokes the current version without revoking a newer session', async () => {
    const newer = { ...owner, tokenVersion: 2 };
    await sessions.register(owner, 'old', 60);
    await sessions.register(newer, 'new', 60);
    await sessions.revoke(owner);
    await expect(sessions.consume(owner, 'old')).rejects.toThrow(
      UnauthorizedException,
    );
    await sessions.consume(newer, 'new');
  });
  it('fails closed without exposing Redis errors', async () => {
    await expect(
      redis.execute(() => Promise.reject(new Error('secret-connection-data'))),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
