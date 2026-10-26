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
  Roles,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type {
  AuthorizedRequest,
  Principal,
} from '../auth/authorization/principal';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateEventDto,
  EventIdDto,
  EventListQueryDto,
  EventReviewHistoryQueryDto,
  RejectEventDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventReviewAction } from './enums/event-review-action.enum';
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

  @Get(':id/readiness')
  @Authenticated()
  readiness(@Param() params: EventIdDto, @CurrentUser() actor: Principal) {
    return this.events.readiness(params.id, actor);
  }

  @Post(':id/submit')
  @Authenticated()
  @Audit('events.submit')
  submit(@Param() params: EventIdDto, @CurrentUser() actor: Principal) {
    return this.events.submit(params.id, actor);
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

@Controller('v1/moderation/events')
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
export class EventModerationController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query() query: EventListQueryDto) {
    return this.events.listForModeration(query);
  }

  @Get('history')
  history(@Query() query: EventReviewHistoryQueryDto) {
    return this.events.reviewHistory(query);
  }

  @Get(':id')
  detail(@Param() params: EventIdDto, @CurrentUser() actor: Principal) {
    return this.events.findForModeration(params.id, actor);
  }

  @Post(':id/approve')
  @Audit('events.approve')
  approve(@Param() params: EventIdDto, @CurrentUser() actor: Principal) {
    return this.events.review(
      params.id,
      actor,
      EventReviewAction.APPROVED,
      null,
    );
  }

  @Post(':id/reject')
  @Audit('events.reject')
  reject(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.review(
      params.id,
      actor,
      EventReviewAction.REJECTED,
      dto.reason,
    );
  }
}
