import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  Header,
  StreamableFile,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
  OptionalAuth,
  Public,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type {
  AuthorizedRequest,
  Principal,
} from '../auth/authorization/principal';
import {
  CreateEventDto,
  EventIdDto,
  EventListQueryDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventsService } from './events.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('categories')
  @Public()
  categories() {
    return this.events.listCategories();
  }

  @Get()
  @Public()
  discover(@Query() query: EventListQueryDto) {
    return this.events.discover(query);
  }

  @Get(':id')
  @OptionalAuth()
  findOne(@Param() params: EventIdDto, @Req() request: AuthorizedRequest) {
    return this.events.findOne(params.id, request.user);
  }

  @Patch(':id')
  @Authenticated()
  @Audit('events.update')
  update(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(params.id, actor, dto);
  }

  @Post(':id/poster')
  @Authenticated()
  @UseInterceptors(FileInterceptor('file'))
  uploadPoster(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.events.uploadPoster(params.id, actor, file);
  }

  @Get(':id/poster/:filename')
  @OptionalAuth()
  @Header('Cache-Control', 'private, no-store')
  async poster(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Req() request: AuthorizedRequest,
  ) {
    const image = await this.events.readPoster(id, filename, request.user);
    return new StreamableFile(image.buffer, { type: image.mimetype });
  }
}

@Controller('v1/organizers/:id/events')
@Authenticated()
export class OrganizerEventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @Audit('events.create')
  create(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: CreateEventDto,
  ) {
    return this.events.create(params.id, actor, dto);
  }

  @Get()
  list(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Query() query: EventListQueryDto,
  ) {
    return this.events.listForOrganizer(params.id, actor, query);
  }
}
