import { redisConnectionOptions } from './redis.config';

describe('Redis connection configuration', () => {
  it('parses credentials, database and TLS for rediss', () => {
    expect(
      redisConnectionOptions('rediss://user:p%40ss@redis.example:6380/2'),
    ).toMatchObject({
      host: 'redis.example',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      tls: {},
    });
  });

  it('parses default port and database', () => {
    expect(redisConnectionOptions('redis://127.0.0.1')).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      db: 0,
    });
  });

  it.each([
    'private-invalid-value',
    'http://redis.example',
    'redis://localhost:0/1',
    'redis://localhost/-1',
    'redis://localhost/1.5',
    'redis://localhost/1?password=private-value',
    'redis://localhost/1#private-value',
    'redis://user:%ZZ@localhost/1',
  ])('rejects invalid configuration without echoing it', (url) => {
    expect(() => redisConnectionOptions(url)).toThrow(
      'Invalid Redis connection configuration',
    );
  });
});
