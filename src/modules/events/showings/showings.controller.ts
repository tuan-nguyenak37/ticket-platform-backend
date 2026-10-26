import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
  OptionalAuth,
} from '../../auth/authorization/access-policy';
import type {
  AuthorizedRequest,
  Principal,
} from '../../auth/authorization/principal';
import { CreateShowingDto } from './dto/create-showing.dto';
import {
  ShowingEventParamsDto,
  ShowingParamsDto,
} from './dto/showing-params.dto';
import { UpdateShowingDto } from './dto/update-showing.dto';
import { ShowingsService } from './showings.service';

@Controller('v1/events/:eventId/showings')
export class EventShowingsController {
  constructor(private readonly showings: ShowingsService) {}

  @Post()
  @Authenticated()
  create(
    @Param() params: ShowingEventParamsDto,
    @CurrentUser() actor: Principal,
    @Body() dto: CreateShowingDto,
  ) {
    return this.showings.create(params.eventId, actor, dto);
  }

  @Get()
  @OptionalAuth()
  findByEvent(
    @Param() params: ShowingEventParamsDto,
    @Req() request: AuthorizedRequest,
  ) {
    return this.showings.findByEvent(params.eventId, request.user);
  }
}

@Controller('v1/showings')
export class ShowingsController {
  constructor(private readonly showings: ShowingsService) {}

  @Get(':id')
  @OptionalAuth()
  findOne(
    @Param() params: ShowingParamsDto,
    @Req() request: AuthorizedRequest,
  ) {
    return this.showings.findOne(params.id, request.user);
  }

  @Patch(':id')
  @Authenticated()
  update(
    @Param() params: ShowingParamsDto,
    @CurrentUser() actor: Principal,
    @Body() dto: UpdateShowingDto,
  ) {
    return this.showings.update(params.id, actor, dto);
  }

  @Delete(':id')
  @Authenticated()
  @HttpCode(200)
  remove(@Param() params: ShowingParamsDto, @CurrentUser() actor: Principal) {
    return this.showings.remove(params.id, actor);
  }
}
