import type { Redis } from 'ioredis';

export async function checkRedisConnection(
  client: Pick<Redis, 'ping'>,
  ready: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      ready.then(async () => {
        if ((await client.ping()) !== 'PONG') {
          throw new Error('redis_ping_failed');
        }
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('redis_connection_timeout')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
