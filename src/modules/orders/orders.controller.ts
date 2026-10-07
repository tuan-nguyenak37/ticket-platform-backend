import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Authenticated,
  CurrentUser,
  Roles,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/entities/enums/user-role.enum';
import {
  CreateOrderDto,
  DisputeReplyDto,
  ListOrdersDto,
  MockResultDto,
  OpenDisputeDto,
  OrderIdDto,
  ResolveDisputeDto,
} from './orders.dto';
import { OrdersService } from './orders.service';
import { OrderPaymentsService } from './order-payments.service';

@Controller('orders')
@Authenticated()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: OrderPaymentsService,
  ) {}

  @Post()
  @Audit('orders.create')
  create(
    @CurrentUser() actor: Principal,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.orders.create(actor, dto, key);
  }
  @Get('me')
  mine(@CurrentUser() actor: Principal, @Query() query: ListOrdersDto) {
    return this.orders.list(actor, query);
  }
  @Get('me/:id')
  detail(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.orders.detail(actor, p.id);
  }
  @Post('me/:id/cancel')
  @HttpCode(200)
  @Audit('orders.cancel')
  cancel(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.orders.cancel(actor, p.id);
  }
  @Post('me/:id/payment')
  @HttpCode(200)
  @Audit('orders.payment.start')
  start(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.payments.start(actor, p.id);
  }
  @Post('me/:id/payment/mock-result')
  @HttpCode(200)
  @Audit('orders.payment.mock')
  result(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @Body() dto: MockResultDto,
  ) {
    return this.payments.result(actor, p.id, dto.result);
  }
  @Get('me/:id/file')
  @Audit('orders.file.read')
  async file(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @Res() response: Response,
  ) {
    const file = await this.orders.file(actor, p.id);
    response.setHeader('Content-Type', file.mimetype);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'attachment');
    response.send(file.buffer);
  }
  @Post('me/:id/dispute')
  @Audit('orders.dispute.open')
  dispute(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @Body() dto: OpenDisputeDto,
  ) {
    return this.orders.dispute(actor, p.id, dto);
  }
  @Post('me/:id/dispute/reply')
  @HttpCode(200)
  @Audit('orders.dispute.reply')
  reply(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @Body() dto: DisputeReplyDto,
  ) {
    return this.orders.reply(actor, p.id, dto.response);
  }
  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manage(@CurrentUser() actor: Principal, @Query() query: ListOrdersDto) {
    return this.orders.list(actor, query, true);
  }
  @Get('manage/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manageDetail(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.orders.detail(actor, p.id, true);
  }
  @Post('manage/:id/dispute/resolve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('orders.dispute.resolve')
  resolve(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.orders.resolve(actor, p.id, dto);
  }
  @Post('manage/:id/refund/mock')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('orders.refund.mock')
  refund(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.payments.refund(actor, p.id);
  }
  @Post('manage/:id/payout/mock')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('orders.payout.mock')
  payout(@CurrentUser() actor: Principal, @Param() p: OrderIdDto) {
    return this.payments.payout(actor, p.id);
  }
}
