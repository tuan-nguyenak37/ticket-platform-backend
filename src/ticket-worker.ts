import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database/database.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './modules/events/entities/event.entity';
import { EventCategory } from './modules/events/entities/event-category.entity';
import { User } from './modules/users/entities/user.entity';
import { TicketCheckWorker } from './modules/tickets/review/ticket-check-worker.service';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    TicketsModule,
    TypeOrmModule.forFeature([Event, EventCategory, User]),
  ],
})
class TicketWorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(TicketWorkerModule);
  app.enableShutdownHooks();
  await app.get(TicketCheckWorker).start();
}
void bootstrap();
