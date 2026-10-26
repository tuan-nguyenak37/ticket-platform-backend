import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database/database.module';
import { CoreModule } from './common/core.module';
import { UsersModule } from './modules/users/users.module';
import { SecurityModule } from './common/security/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizersModule } from './modules/organizers/organizers.module';
import { EventsModule } from './modules/events/events.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ResaleModule } from './modules/resale/resale.module';
import { TicketsModule } from './modules/tickets/tickets.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CoreModule,
    UsersModule,
    SecurityModule,
    AuthModule,
    OrganizersModule,
    EventsModule,
    OrdersModule,
    PaymentsModule,
    TicketsModule,
    ResaleModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
