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
import { EventRegistrationDiscounts1792454402100 } from '../../database/migrations/1792454402100-EventRegistrationDiscounts';
import { OrganizerPayoutAccount } from '../../modules/organizers/entities/organizer-payout-account.entity';
import { OrganizerPayoutAccount1791888008000 } from '../../database/migrations/1791888008000-OrganizerPayoutAccount';
import { Order } from '../../modules/orders/entities/order.entity';
import { OrderItem } from '../../modules/orders/entities/order-item.entity';
import { TicketReservation } from '../../modules/orders/entities/ticket-reservation.entity';
import { OrdersReservations1791888004000 } from '../../database/migrations/1791888004000-OrdersReservations';
import { OrderRegistrationDiscounts1792454402200 } from '../../database/migrations/1792454402200-OrderRegistrationDiscounts';
import { Payment } from '../../modules/payments/entities/payment.entity';
import { MockPayments1791888005000 } from '../../database/migrations/1791888005000-MockPayments';
import { Ticket } from '../../modules/tickets/entities/ticket.entity';
import { TicketCredential } from '../../modules/tickets/entities/ticket-credential.entity';
import { TicketOwnership } from '../../modules/tickets/entities/ticket-ownership.entity';
import { IssuedTickets1791888006000 } from '../../database/migrations/1791888006000-IssuedTickets';
import { WebNotifications1792540800000 } from '../../database/migrations/1792540800000-WebNotifications';
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
    OrganizerPayoutAccount,
    Order,
    OrderItem,
    TicketReservation,
    Payment,
    Ticket,
    TicketCredential,
    TicketOwnership,
  ],
  migrations: [
    BaselineUsersOrganizers1791888000000,
    EventCategoriesEvents1791888001000,
    Showings1791888002000,
    TicketTypesInventory1791888003000,
    AdminRoleChanges1792454403000,
    EventRegistrationDiscounts1792454402100,
    OrganizerPayoutAccount1791888008000,
    OrdersReservations1791888004000,
    OrderRegistrationDiscounts1792454402200,
    MockPayments1791888005000,
    IssuedTickets1791888006000,
    WebNotifications1792540800000,
  ],
  migrationsTransactionMode: 'all',
});
