import { Module } from '@nestjs/common';
import { SecurityRedisService } from '../../config/redis/security-redis.service';
import { RefreshSessionService } from './refresh-session.service';

@Module({
  providers: [SecurityRedisService, RefreshSessionService],
  exports: [SecurityRedisService, RefreshSessionService],
})
export class SecurityModule {}
