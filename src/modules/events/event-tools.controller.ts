import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { Audit } from '../auth/authorization/audit.interceptor';
import { EventIdDto } from './dto/event.dto';
import {
  DiscountDto,
  DiscountParamsDto,
  DiscountStatusDto,
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
}
