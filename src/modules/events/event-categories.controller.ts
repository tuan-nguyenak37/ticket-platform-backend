import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/authorization/access-policy';
import { EventCategoriesService } from './event-categories.service';

@Controller('event-categories')
export class EventCategoriesController {
  constructor(private readonly eventCategoriesService: EventCategoriesService) {}

  @Get()
  @Public()
  list() {
    return this.eventCategoriesService.list();
  }
}
