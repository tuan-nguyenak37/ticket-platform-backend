import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  Public,
  Roles,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { EventImagesInterceptor } from './event-images.interceptor';
import { EventsService } from './events.service';
import type { EventImages } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('events.create')
  @UseInterceptors(EventImagesInterceptor)
  create(
    @CurrentUser() actor: Principal,
    @Body() dto: CreateEventDto,
    @UploadedFiles() files: EventImages,
  ) {
    return this.eventsService.create(actor, dto, files);
  }

  @Get(':id/images/:kind')
  @Public()
  async image(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res() response: Response,
  ) {
    const image = await this.eventsService.image(id, kind);
    response.setHeader('Content-Type', image.mimetype);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.send(image.buffer);
  }
}
