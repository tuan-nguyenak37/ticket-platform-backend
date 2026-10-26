import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export function redisConnectionOptions(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid Redis connection configuration');
  }
  const database = url.pathname.slice(1) || '0';
  const port = Number(url.port || 6379);
  if (
    !['redis:', 'rediss:'].includes(url.protocol) ||
    !url.hostname ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    url.search ||
    url.hash ||
    !/^\d+$/.test(database) ||
    !Number.isSafeInteger(Number(database))
  ) {
    throw new Error('Invalid Redis connection configuration');
  }

  let username: string | undefined;
  let password: string | undefined;
  try {
    username = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } catch {
    throw new Error('Invalid Redis connection configuration');
  }

  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port,
    username,
    password,
    db: Number(database),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 5000,
  } satisfies RedisOptions;
}

export function securityRedisConfig(config: ConfigService): RedisOptions {
  return {
    ...redisConnectionOptions(
      config.get<string>('SECURITY_REDIS_URL', 'redis://127.0.0.1:6379/1'),
    ),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 3000,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
  };
}
