import { ConfigService } from '@nestjs/config';
import { databaseOptions } from './database.options';

describe('PostgreSQL configuration', () => {
  const environment = {
    DB_HOST: '127.0.0.1',
    DB_PORT: 5432,
    DB_USERNAME: 'ticketverse',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'ticketverse_test',
  };

  it('uses the configured connection values', () => {
    expect(databaseOptions(new ConfigService(environment))).toMatchObject({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      username: 'ticketverse',
      password: 'test-password',
      database: 'ticketverse_test',
      autoLoadEntities: true,
    });
  });

  it('never enables schema synchronization, automatic migrations or deletion', () => {
    const config = new ConfigService({
      ...environment,
      DB_SYNCHRONIZE: true,
    });
    expect(databaseOptions(config)).toMatchObject({
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
    });
  });

  it.each(Object.keys(environment))('fails if %s is absent', (key) => {
    const values: Record<string, unknown> = {
      ...environment,
      [key]: undefined,
    };
    const originalValue = process.env[key];
    delete process.env[key];
    try {
      expect(() => databaseOptions(new ConfigService(values))).toThrow(key);
    } finally {
      if (originalValue !== undefined) process.env[key] = originalValue;
    }
  });
});
