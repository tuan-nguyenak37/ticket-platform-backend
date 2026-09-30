// Test-only configuration. No connection to the application's database is made.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'unused_test_database',
  JWT_ACCESS_SECRET: 'test-only-access-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
});

