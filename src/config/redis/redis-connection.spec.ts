import { checkRedisConnection } from './redis-connection';

describe('Redis connection check', () => {
  afterEach(() => jest.useRealTimers());

  it('waits for readiness before checking PONG', async () => {
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const ping = jest.fn().mockResolvedValue('PONG');
    const check = checkRedisConnection({ ping }, ready, 1000);
    expect(ping).not.toHaveBeenCalled();
    markReady();
    await expect(check).resolves.toBeUndefined();
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('rejects an unexpected PING response', async () => {
    await expect(
      checkRedisConnection(
        { ping: jest.fn().mockResolvedValue('unexpected') },
        Promise.resolve(),
        1000,
      ),
    ).rejects.toThrow('redis_ping_failed');
  });

  it('propagates connection failure without issuing PING', async () => {
    const ping = jest.fn();
    await expect(
      checkRedisConnection(
        { ping },
        Promise.reject(new Error('connection_failed')),
        1000,
      ),
    ).rejects.toThrow('connection_failed');
    expect(ping).not.toHaveBeenCalled();
  });

  it('bounds a stalled PING with the startup timeout', async () => {
    jest.useFakeTimers();
    const ping = jest.fn().mockReturnValue(new Promise(() => {}));
    const assertion = expect(
      checkRedisConnection({ ping }, Promise.resolve(), 1000),
    ).rejects.toThrow('redis_connection_timeout');
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
