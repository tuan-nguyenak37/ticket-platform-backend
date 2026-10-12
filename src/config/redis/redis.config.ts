import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export function emailRedisConfig(config: ConfigService) {
  const connection = redisConnectionOptions(
    config.getOrThrow<string>('EMAIL_REDIS_URL'),
  );
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

function redisConnectionOptions(value: string) {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Invalid Redis protocol');

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 5000,
  } satisfies RedisOptions;
}

export function securityRedisConfig(config: ConfigService): RedisOptions {
  return {
    ...redisConnectionOptions(
      config.get<string>('SECURITY_REDIS_URL', 'redis://127.0.0.1:6380/1'),
    ),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 3000,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
  };
}
