import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaselineUsersOrganizers1791888000000 } from '../../database/migrations/1791888000000-BaselineUsersOrganizers';
import { AdminRoleChanges1792454403000 } from '../../database/migrations/1792454403000-AdminRoleChanges';
import { User } from '../../modules/users/entities/user.entity';
import { envValidationSchema } from '../env.validation';
import { validateEnvironment } from '../validate-environment';
import { databaseConnectionOptions } from './database.options';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = new ConfigService(
  validateEnvironment(envValidationSchema, process.env),
);

export const dataSource = new DataSource({
  ...databaseConnectionOptions(config),
  entities: [User],
  migrations: [
    BaselineUsersOrganizers1791888000000,
    AdminRoleChanges1792454403000,
  ],
  migrationsTransactionMode: 'all',
});
