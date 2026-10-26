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
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import {
  TicketTypeParamsDto,
  TicketTypeShowingParamsDto,
} from './dto/ticket-type-params.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { TicketTypesService } from './ticket-types.service';

@Controller('v1/showings/:showingId/ticket-types')
export class ShowingTicketTypesController {
  constructor(private readonly ticketTypes: TicketTypesService) {}

  @Post()
  @Authenticated()
  create(
    @Param() params: TicketTypeShowingParamsDto,
    @CurrentUser() actor: Principal,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.ticketTypes.create(params.showingId, actor, dto);
  }

  @Get()
  @OptionalAuth()
  findByShowing(
    @Param() params: TicketTypeShowingParamsDto,
    @Req() request: AuthorizedRequest,
  ) {
    return this.ticketTypes.findByShowing(params.showingId, request.user);
  }
}

@Controller('v1/ticket-types')
export class TicketTypesController {
  constructor(private readonly ticketTypes: TicketTypesService) {}

  @Get(':id')
  @OptionalAuth()
  findOne(
    @Param() params: TicketTypeParamsDto,
    @Req() request: AuthorizedRequest,
  ) {
    return this.ticketTypes.findOne(params.id, request.user);
  }

  @Patch(':id')
  @Authenticated()
  update(
    @Param() params: TicketTypeParamsDto,
    @CurrentUser() actor: Principal,
    @Body() dto: UpdateTicketTypeDto,
  ) {
    return this.ticketTypes.update(params.id, actor, dto);
  }

  @Delete(':id')
  @Authenticated()
  @HttpCode(200)
  remove(
    @Param() params: TicketTypeParamsDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.ticketTypes.remove(params.id, actor);
  }
}
