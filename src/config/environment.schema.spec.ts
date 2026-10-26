import { environmentSchema } from './environment.schema';
import { validateEnvironment } from './validate-environment';

describe('Environment validation', () => {
  const databaseEnvironment = {
    DB_HOST: '127.0.0.1',
    DB_USERNAME: 'ticketverse',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'ticketverse_test',
    JWT_ACCESS_SECRET: 'unit-test-key-not-a-real-deployment-secret',
    JWT_REFRESH_SECRET: 'different-unit-test-key-not-a-deployment-secret',
  };

  it('provides application and database defaults', () => {
    const result = environmentSchema.validate(databaseEnvironment);
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 7000,
      DB_PORT: 5432,
      DB_SYNCHRONIZE: false,
    });
  });

  it('converts numeric ports and the false string', () => {
    const result = environmentSchema.validate({
      ...databaseEnvironment,
      NODE_ENV: 'test',
      PORT: '7100',
      DB_PORT: '5433',
      DB_SYNCHRONIZE: 'false',
    });
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      PORT: 7100,
      DB_PORT: 5433,
      DB_SYNCHRONIZE: false,
    });
  });

  it.each([
    'DB_HOST',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ])('rejects missing %s', (key) => {
    const environment: Record<string, unknown> = { ...databaseEnvironment };
    delete environment[key];
    expect(environmentSchema.validate(environment).error?.message).toContain(
      key,
    );
  });

  it.each([
    ['PORT', 'not-a-number'],
    ['PORT', 0],
    ['PORT', 65536],
    ['PORT', 7000.5],
    ['DB_PORT', 0],
    ['DB_PORT', 65536],
    ['DB_PORT', 5432.5],
    ['DB_HOST', '   '],
    ['DB_USERNAME', ''],
    ['DB_PASSWORD', ''],
    ['DB_NAME', ''],
    ['NODE_ENV', 'invalid'],
    ['JWT_ACCESS_EXPIRES', '0'],
    ['JWT_REFRESH_EXPIRES', 'invalid'],
    ['JWT_REFRESH_SECRET', databaseEnvironment.JWT_ACCESS_SECRET],
    ['SECURITY_REDIS_URL', 'https://redis.example'],
    ['SECURITY_REDIS_URL', 'redis://localhost:6379/not-a-database'],
    ['SECURITY_REDIS_URL', 'redis://localhost:6379/1?password=private'],
    ['SECURITY_REDIS_PREFIX', 'invalid:prefix'],
    ['FRONTEND_URL', '*'],
    ['FRONTEND_URL', 'https://example.com/path'],
    ['FRONTEND_URL', 'https://user:password@example.com'],
    ['FRONTEND_URL', 'http://localhost:3000,'],
    ['DB_SYNCHRONIZE', true],
    ['DB_SYNCHRONIZE', 'true'],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(
      environmentSchema.validate({ ...databaseEnvironment, [key]: value }).error
        ?.message,
    ).toContain(key);
  });

  it('allows unrelated process environment variables when configured', () => {
    const result = environmentSchema.validate(
      { ...databaseEnvironment, PATH: '/usr/bin' },
      { allowUnknown: true },
    );
    expect(result.error).toBeUndefined();
  });

  it('validates configuration through the Nest validation function', () => {
    expect(
      validateEnvironment(environmentSchema, databaseEnvironment),
    ).toMatchObject({
      PORT: 7000,
      DB_PORT: 5432,
      DB_SYNCHRONIZE: false,
    });
  });

  it('reports all invalid field names without echoing supplied values', () => {
    expect(() =>
      validateEnvironment(environmentSchema, {
        ...databaseEnvironment,
        DB_PORT: 'sensitive-invalid-value',
        DB_SYNCHRONIZE: true,
      }),
    ).toThrow('Invalid environment configuration: DB_PORT, DB_SYNCHRONIZE');
  });
});
