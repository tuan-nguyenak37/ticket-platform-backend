import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SecurityRedisService } from '../../config/redis/security-redis.service';

interface SessionOwner {
  user_id: string;
  sessionId: string;
}

@Injectable()
export class RefreshSessionService {
  constructor(private readonly redis: SecurityRedisService) {}

  private key(userId: string) {
    return this.redis.key('sessions', userId);
  }

  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertLifetime(ttlSeconds: number) {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError('Session lifetime must be a positive integer');
    }
  }

  async register(owner: SessionOwner, token: string, ttlSeconds: number) {
    this.assertLifetime(ttlSeconds);
    await this.redis.execute((client) =>
      client.eval(
        `
        local now = tonumber(redis.call('TIME')[1])
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[2] .. ':' .. (now + tonumber(ARGV[3])))
        if redis.call('TTL', KEYS[1]) < tonumber(ARGV[3]) then
          redis.call('EXPIRE', KEYS[1], ARGV[3])
        end
        return 1
        `,
        1,
        this.key(owner.user_id),
        owner.sessionId,
        this.digest(token),
        ttlSeconds,
      ),
    );
  }

  async exists(owner: SessionOwner): Promise<boolean> {
    const result = await this.redis.execute((client) =>
      client.eval(
        `
        local value = redis.call('HGET', KEYS[1], ARGV[1])
        if not value then return 0 end
        local expires = tonumber(string.match(value, ':(%d+)$'))
        return expires and expires > tonumber(redis.call('TIME')[1]) and 1 or 0
        `,
        1,
        this.key(owner.user_id),
        owner.sessionId,
      ),
    );
    return result === 1;
  }

  async validateRefresh(owner: SessionOwner, token: string) {
    const result = await this.redis.execute((client) =>
      client.eval(
        `
      local value = redis.call('HGET', KEYS[1], ARGV[1])
      if not value then return 0 end
      local digest, expires = string.match(value, '^([0-9a-f]+):(%d+)$')
      if not expires or tonumber(expires) <= tonumber(redis.call('TIME')[1]) then return 0 end
      if digest ~= ARGV[2] then return 2 end
      return 1
      `,
        1,
        this.key(owner.user_id),
        owner.sessionId,
        this.digest(token),
      ),
    );
    this.assertCurrent(result);
  }

  private assertCurrent(result: unknown) {
    if (result === 2)
      throw new ConflictException({
        message:
          'Refresh token đã được sử dụng. Vui lòng thử lại với cookie hiện hành.',
        code: 'AUTH_REFRESH_CONFLICT',
      });
    if (result !== 1)
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
  }

  async rotateRefresh(
    owner: SessionOwner,
    oldToken: string,
    newToken: string,
    ttlSeconds: number,
  ) {
    this.assertLifetime(ttlSeconds);
    if (oldToken === newToken) {
      throw new TypeError('Refresh token rotation requires a different token');
    }
    const result = await this.redis.execute((client) =>
      client.eval(
        `
        local value = redis.call('HGET', KEYS[1], ARGV[1])
        if not value then return 0 end
        local digest, expires = string.match(value, '^([0-9a-f]+):(%d+)$')
        local now = tonumber(redis.call('TIME')[1])
        if not expires or tonumber(expires) <= now then return 0 end
        if digest ~= ARGV[2] then return 2 end
        local deadline = math.min(tonumber(expires), now + tonumber(ARGV[4]))
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[3] .. ':' .. deadline)
        return 1
        `,
        1,
        this.key(owner.user_id),
        owner.sessionId,
        this.digest(oldToken),
        this.digest(newToken),
        ttlSeconds,
      ),
    );
    this.assertCurrent(result);
  }

  async revoke(owner: SessionOwner) {
    await this.redis.execute((client) =>
      client.hdel(this.key(owner.user_id), owner.sessionId),
    );
  }

  async revokeAll(userId: string) {
    await this.redis.execute((client) => client.del(this.key(userId)));
  }
}
