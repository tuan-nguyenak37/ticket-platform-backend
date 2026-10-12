import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export function emailRedisConfig(config: ConfigService) {
  const url = new URL(config.getOrThrow<string>('EMAIL_REDIS_URL'));
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Invalid Redis protocol');

  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 5000,
  } satisfies RedisOptions;

  return {
    prefix: config.get<string>('EMAIL_QUEUE_PREFIX', 'ticketverse'),
    startupTimeoutMs: 10000,
    producer: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: 5000,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
    } satisfies RedisOptions,
    // BullMQ's blocking worker must keep reconnecting after Redis outages.
    worker: { ...connection, maxRetriesPerRequest: null },
  };
}
