import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { CheckoutService } from './checkout.service';
import type { CheckoutKind } from './entities/checkout-session.entity';

@Controller('v1/checkout')
@Authenticated()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly config: ConfigService,
  ) {}
  private legacy() {
    if (this.config.get<string>('PAYMENT_PROVIDER', 'VNPAY') !== 'PROJECT')
      throw new ConflictException(
        'Use /v1/payments/vnpay to complete payment on VNPay. Email OTP cannot authorize a VNPay payment.',
      );
  }
  private kind(value: string): CheckoutKind {
    if (value !== 'orders' && value !== 'resale')
      throw new BadRequestException('Loại đơn hàng không hợp lệ.');
    return value;
  }
  private id(value: string) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(value))
      throw new BadRequestException('Mã không hợp lệ.');
    return value;
  }

  @Get(':kind/:id/sessions')
  latest(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.checkout.latest(actor, this.kind(kind), this.id(id));
  }
  @Post(':kind/:id/sessions')
  @HttpCode(200)
  start(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.legacy();
    return this.checkout.start(actor, this.kind(kind), this.id(id), body);
  }
  @Post('sessions/:id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.legacy();
    return this.checkout.confirm(actor, this.id(id), body);
  }
  @Post('sessions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.checkout.cancel(actor, this.id(id));
  }
  @Get(':kind/:id/receipt')
  receipt(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.checkout.receipt(actor, this.kind(kind), this.id(id));
  }
}
