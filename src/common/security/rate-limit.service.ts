import { Injectable } from '@nestjs/common';
import { SecurityRedisService } from '../../config/redis/security-redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: SecurityRedisService) {}

  async check(scope: string, identity: string, limit: number, seconds: number) {
    const result = (await this.redis.execute((client) =>
      client.eval(
        `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      return {count, redis.call('PTTL', KEYS[1])}
    `,
        1,
        this.redis.key(`limit-${scope}`, identity),
        seconds * 1000,
      ),
    )) as [number, number];
    return {
      allowed: result[0] <= limit,
      retryAfter: Math.max(1, Math.ceil(result[1] / 1000)),
    };
  }
}
