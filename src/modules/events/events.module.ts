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
import { Showing } from './showings/entities/showing.entity';
import {
  EventShowingsController,
  ShowingsController,
} from './showings/showings.controller';
import { ShowingsService } from './showings/showings.service';

@Module({
  imports: [
    UploadsModule,
    TypeOrmModule.forFeature([EventCategory, Event, OrganizerMember, Showing]),
  ],
  controllers: [
    EventsController,
    OrganizerEventsController,
    EventShowingsController,
    ShowingsController,
  ],
  providers: [EventsService, ShowingsService],
})
export class EventsModule {}
