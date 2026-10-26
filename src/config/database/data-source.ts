import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaselineUsersOrganizers1791888000000 } from '../../database/migrations/1791888000000-BaselineUsersOrganizers';
import { AdminRoleChanges1792454403000 } from '../../database/migrations/1792454403000-AdminRoleChanges';
import { User } from '../../modules/users/entities/user.entity';
import { Organizer } from '../../modules/organizers/entities/organizer.entity';
import { OrganizerMember } from '../../modules/organizers/entities/organizer-member.entity';
import { EventCategory } from '../../modules/events/entities/event-category.entity';
import { Event } from '../../modules/events/entities/event.entity';
import { EventCategoriesEvents1791888001000 } from '../../database/migrations/1791888001000-EventCategoriesEvents';
import { Showing } from '../../modules/events/showings/entities/showing.entity';
import { Showings1791888002000 } from '../../database/migrations/1791888002000-Showings';
import { TicketType } from '../../modules/events/ticket-types/entities/ticket-type.entity';
import { TicketInventory } from '../../modules/events/ticket-types/entities/ticket-inventory.entity';
import { TicketTypesInventory1791888003000 } from '../../database/migrations/1791888003000-TicketTypesInventory';
import { EventReviewLog } from '../../modules/events/entities/event-review-log.entity';
import { envValidationSchema } from '../env.validation';
import { validateEnvironment } from '../validate-environment';
import { databaseConnectionOptions } from './database.options';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = new ConfigService(
  validateEnvironment(envValidationSchema, process.env),
);

export const dataSource = new DataSource({
  ...databaseConnectionOptions(config),
  entities: [
    User,
    Organizer,
    OrganizerMember,
    EventCategory,
    Event,
    Showing,
    TicketType,
    TicketInventory,
    EventReviewLog,
  ],
  migrations: [
    BaselineUsersOrganizers1791888000000,
    EventCategoriesEvents1791888001000,
    Showings1791888002000,
    TicketTypesInventory1791888003000,
    AdminRoleChanges1792454403000,
  ],
  migrationsTransactionMode: 'all',
});
