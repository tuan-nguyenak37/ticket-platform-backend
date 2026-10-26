import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderIdDto, OrderListDto } from './dto/order-query.dto';
import { OrdersService } from './orders.service';

@Controller('v1/orders')
@Authenticated()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() actor: Principal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.create(actor, key, dto);
  }

  @Get('mine')
  mine(@CurrentUser() actor: Principal, @Query() query: OrderListDto) {
    return this.orders.mine(actor, query);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: Principal, @Param() params: OrderIdDto) {
    return this.orders.findOne(actor, params.id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() actor: Principal, @Param() params: OrderIdDto) {
    return this.orders.cancel(actor, params.id);
  }
}
