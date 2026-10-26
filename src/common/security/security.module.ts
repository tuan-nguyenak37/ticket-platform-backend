import { Module } from '@nestjs/common';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RefreshSessionService } from './refresh-session.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  providers: [SecurityRedisService, RefreshSessionService, RateLimitService],
  exports: [SecurityRedisService, RefreshSessionService, RateLimitService],
})
export class SecurityModule {}
