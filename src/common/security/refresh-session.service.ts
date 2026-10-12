import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SecurityRedisService } from '../../config/redis/security-redis.service';

interface SessionOwner {
  user_id: string;
  tokenVersion: number;
}

@Injectable()
export class RefreshSessionService {
  constructor(private readonly redis: SecurityRedisService) {}

  private key(owner: SessionOwner) {
    return this.redis.key('refresh', `${owner.user_id}:${owner.tokenVersion}`);
  }

  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(owner: SessionOwner, token: string, ttlSeconds: number) {
    // A hash field per candidate avoids overwriting concurrent login candidates.
    await this.redis.execute((client) =>
      client.eval(
        `
      redis.call('HSET', KEYS[1], ARGV[1], '1')
      local ttl = redis.call('TTL', KEYS[1])
      if ttl < tonumber(ARGV[2]) then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
      return 1
    `,
        1,
        this.key(owner),
        this.digest(token),
        ttlSeconds,
      ),
    );
  }

  async consume(owner: SessionOwner, token: string) {
    const removed = await this.redis.execute((client) =>
      client.hdel(this.key(owner), this.digest(token)),
    );
    if (removed !== 1)
      throw new UnauthorizedException('Refresh token expired or already used');
  }

  async discard(owner: SessionOwner, token: string) {
    await this.redis.execute((client) =>
      client.hdel(this.key(owner), this.digest(token)),
    );
  }

  async revoke(owner: SessionOwner) {
    await this.redis.execute((client) => client.del(this.key(owner)));
  }
}
