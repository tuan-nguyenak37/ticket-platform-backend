import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event } from './entities/event.entity';
import { EventCategory } from './entities/event-category.entity';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { EventImagesInterceptor } from './event-images.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventCategory]), UploadsModule],
  controllers: [EventsController],
  providers: [EventsService, EventImagesInterceptor],
  exports: [TypeOrmModule, EventsService],
})
export class EventsModule {}
