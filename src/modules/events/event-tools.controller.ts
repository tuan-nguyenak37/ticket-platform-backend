import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { Audit } from '../auth/authorization/audit.interceptor';
import { EventIdDto } from './dto/event.dto';
import {
  AttendeesQueryDto,
  DiscountDto,
  DiscountStatusDto,
  DiscountParamsDto,
} from './event-tools.dto';
import { EventToolsService } from './event-tools.service';

@Controller('v1/events/:id')
@Authenticated()
export class EventToolsController {
  constructor(private readonly tools: EventToolsService) {}

  @Get('discounts')
  discounts(@Param() params: EventIdDto, @CurrentUser() actor: Principal) {
    return this.tools.discounts(params.id, actor);
  }

  @Post('discounts')
  @Audit('events.discount.create')
  createDiscount(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: DiscountDto,
  ) {
    return this.tools.createDiscount(params.id, actor, dto);
  }

  @Patch('discounts/:code')
  @Audit('events.discount.status')
  discountStatus(
    @Param() params: DiscountParamsDto,
    @CurrentUser() actor: Principal,
    @Body() dto: DiscountStatusDto,
  ) {
    return this.tools.discountStatus(params.id, actor, params.code, dto.active);
  }

  @Get('attendees')
  @Header('Cache-Control', 'private, no-store')
  attendees(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Query() query: AttendeesQueryDto,
  ) {
    return this.tools.attendees(params.id, actor, query);
  }

  @Get('attendees/export')
  @Header('Cache-Control', 'private, no-store')
  @Audit('events.attendees.export')
  export(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Query() query: AttendeesQueryDto,
  ) {
    return this.tools.exportAttendees(params.id, actor, query);
  }
}
