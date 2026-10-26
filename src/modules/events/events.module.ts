import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsModule } from '../tickets/tickets.module';
import { EventCheckInController } from './event-check-in.controller';
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
import { TicketType } from './ticket-types/entities/ticket-type.entity';
import { TicketInventory } from './ticket-types/entities/ticket-inventory.entity';
import {
  ShowingTicketTypesController,
  TicketTypesController,
} from './ticket-types/ticket-types.controller';
import { TicketTypesService } from './ticket-types/ticket-types.service';
import { EventModerationController } from './events.controller';
import { EventReviewLog } from './entities/event-review-log.entity';
import { EventToolsController } from './event-tools.controller';
import { EventToolsService } from './event-tools.service';

@Module({
  imports: [
    TicketsModule,
    UploadsModule,
    TypeOrmModule.forFeature([
      EventCategory,
      Event,
      OrganizerMember,
      Showing,
      TicketType,
      TicketInventory,
      EventReviewLog,
    ]),
  ],
  controllers: [
    EventsController,
    OrganizerEventsController,
    EventShowingsController,
    ShowingsController,
    ShowingTicketTypesController,
    TicketTypesController,
    EventModerationController,
    EventToolsController,
    EventCheckInController,
  ],
  providers: [
    EventsService,
    ShowingsService,
    TicketTypesService,
    EventToolsService,
  ],
})
export class EventsModule {}
