import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { EventCategory } from './entities/event-category.entity';
import { Event } from './entities/event.entity';
import {
  EventsController,
  OrganizerEventsController,
} from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    UploadsModule,
    TypeOrmModule.forFeature([EventCategory, Event, OrganizerMember]),
  ],
  controllers: [EventsController, OrganizerEventsController],
  providers: [EventsService],
})
export class EventsModule {}
