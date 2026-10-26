import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Redis } from 'ioredis';
import { checkRedisConnection } from './redis-connection';
import { securityRedisConfig } from './redis.config';

@Injectable()
export class SecurityRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityRedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(securityRedisConfig(config));
    this.client.on('error', () =>
      this.logger.warn('security_redis_unavailable'),
    );
  }

  async onModuleInit() {
    try {
      await checkRedisConnection(this.client, this.client.connect(), 10000);
      this.logger.log('Security Redis connection successful (PING -> PONG)');
    } catch {
      this.client.disconnect();
      throw new ServiceUnavailableException('Security service unavailable');
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  key(scope: string, identity: string) {
    const hash = createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(identity)
      .digest('hex');
    return `${this.config.get<string>('SECURITY_REDIS_PREFIX', 'ticketverse-security')}:${scope}:${hash}`;
  }

  async execute<T>(operation: (client: Redis) => Promise<T>): Promise<T> {
    try {
      return await operation(this.client);
    } catch {
      throw new ServiceUnavailableException('Security service unavailable');
    }
  }
}
