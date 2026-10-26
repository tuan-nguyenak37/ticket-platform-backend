import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import {
  Authenticated,
  CurrentUser,
  Public,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import type { CheckoutKind } from './entities/checkout-session.entity';
import { VnpayService } from './vnpay.service';

@Controller('v1/payments/vnpay')
export class VnpayController {
  constructor(private readonly service: VnpayService) {}

  private route(kind: string, id: string): CheckoutKind {
    if (
      (kind !== 'orders' && kind !== 'resale') ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(id)
    )
      throw new BadRequestException('Invalid order');
    return kind;
  }

  @Authenticated()
  @Post('resale/listings/:id')
  @HttpCode(200)
  @RateLimit({ scope: 'resale-vnpay-start', limit: 10, seconds: 60 })
  startResale(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    this.route('resale', id);
    return this.service.startResale(
      actor,
      id,
      body,
      request.ip || request.socket.remoteAddress || '',
    );
  }

  @Authenticated()
  @Post(':kind/:id')
  @HttpCode(200)
  start(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.service.start(
      actor,
      this.route(kind, id),
      id,
      body,
      request.ip || request.socket.remoteAddress || '',
    );
  }

  @Authenticated()
  @Post(':kind/:id/sync')
  @HttpCode(200)
  @RateLimit({ scope: 'vnpay-sync', limit: 10, seconds: 60 })
  sync(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.service.sync(actor, this.route(kind, id), id);
  }

  @Authenticated()
  @Get(':kind/:id')
  latest(
    @CurrentUser() actor: Principal,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.service.latest(actor, this.route(kind, id), id);
  }

  @Public()
  @Get('ipn')
  async ipn(@Query() query: unknown, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json(await this.service.ipn(query));
  }

  @Public()
  @Get('return')
  async returned(@Query() query: unknown, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(303, await this.service.returnUrl(query));
  }
}
