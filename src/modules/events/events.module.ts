import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event } from './entities/event.entity';
import { EventCategory } from './entities/event-category.entity';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { EventImagesInterceptor } from './event-images.interceptor';
import { EventCategoriesController } from './event-categories.controller';
import { EventCategoriesService } from './event-categories.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventCategory]), UploadsModule],
  controllers: [EventsController, EventCategoriesController],
  providers: [EventsService, EventImagesInterceptor, EventCategoriesService],
  exports: [TypeOrmModule, EventsService],
})
export class EventsModule {}
