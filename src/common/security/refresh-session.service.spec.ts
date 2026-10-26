import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RefreshSessionService } from './refresh-session.service';

describe('Refresh session storage', () => {
  const owner = { user_id: 'user_example', sessionId: 'session_example' };
  const redis = {
    key: jest.fn().mockReturnValue('test:sessions:hashed-user'),
    execute: jest.fn(),
  };
  const sessions = new RefreshSessionService(
    redis as unknown as SecurityRedisService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts successful atomic rotation', async () => {
    redis.execute.mockResolvedValue(1);
    await expect(
      sessions.rotateRefresh(owner, 'old-token', 'new-token', 300),
    ).resolves.toBeUndefined();
  });

  it('returns a conflict for a replaced refresh token', async () => {
    redis.execute.mockResolvedValue(2);
    await expect(
      sessions.rotateRefresh(owner, 'old-token', 'new-token', 300),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects expired or revoked sessions', async () => {
    redis.execute.mockResolvedValue(0);
    await expect(
      sessions.validateRefresh(owner, 'old-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never turns a Redis outage into a successful refresh', async () => {
    redis.execute.mockRejectedValue(new ServiceUnavailableException());
    await expect(
      sessions.rotateRefresh(owner, 'old-token', 'new-token', 300),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a rotation that reuses the same token', async () => {
    await expect(
      sessions.rotateRefresh(owner, 'same-token', 'same-token', 300),
    ).rejects.toBeInstanceOf(TypeError);
    expect(redis.execute).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects an invalid lifetime of %s before calling Redis',
    async (ttl) => {
      await expect(
        sessions.register(owner, 'token', ttl),
      ).rejects.toBeInstanceOf(RangeError);
      expect(redis.execute).not.toHaveBeenCalled();
    },
  );
});
