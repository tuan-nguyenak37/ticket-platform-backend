import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function databaseConnectionOptions(config: ConfigService) {
  return {
    type: 'postgres' as const,
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    username: config.getOrThrow<string>('DB_USERNAME'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    database: config.getOrThrow<string>('DB_NAME'),
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
  };
}

export function databaseOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    ...databaseConnectionOptions(config),
    autoLoadEntities: true,
    retryAttempts: 3,
    retryDelay: 1000,
  };
}
