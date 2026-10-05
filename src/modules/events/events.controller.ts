import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto, ManageEventsDto } from './dto/list-events.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Public()
  list(@Query() query: ListEventsDto) {
    return this.eventsService.list(query);
  }

  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manageList(@CurrentUser() actor: Principal, @Query() query: ManageEventsDto) {
    return this.eventsService.manageList(actor, query);
  }

  @Get('manage/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manageDetail(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.eventsService.manageDetail(actor, id);
  }

  @Get('manage/:id/images/:kind')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async manageImage(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res() response: Response,
  ) {
    const image = await this.eventsService.manageImage(actor, id, kind);
    response.setHeader('Content-Type', image.mimetype);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.send(image.buffer);
  }

  @Get(':id')
  @Public()
  detail(@Param('id') id: string) {
    return this.eventsService.detail(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('events.update')
  @UseInterceptors(EventImagesInterceptor)
  update(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @UploadedFiles() files: EventImages,
  ) {
    return this.eventsService.update(actor, id, dto, files);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('events.delete')
  remove(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.eventsService.remove(actor, id);
  }

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
