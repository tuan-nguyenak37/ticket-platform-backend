import { Module } from '@nestjs/common';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RateLimitService } from './rate-limit.service';
import { RefreshSessionService } from './refresh-session.service';

@Module({
  providers: [SecurityRedisService, RateLimitService, RefreshSessionService],
  exports: [SecurityRedisService, RateLimitService, RefreshSessionService],
})
export class SecurityModule {}
