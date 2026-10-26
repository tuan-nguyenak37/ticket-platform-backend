import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
  OptionalAuth,
} from '../auth/authorization/access-policy';
import type {
  AuthorizedRequest,
  Principal,
} from '../auth/authorization/principal';
import { CreateResaleListingDto } from './dto/create-resale-listing.dto';
import {
  ResaleDiscoveryDto,
  ResaleIdDto,
  ResaleListDto,
} from './dto/resale-query.dto';
import { ResaleService } from './resale.service';
import { parsePaymentMethod } from '../payments/payment-method';

@Controller('v1/resale')
@Authenticated()
export class ResaleController {
  constructor(private readonly resale: ResaleService) {}

  @Post('listings')
  create(@CurrentUser() actor: Principal, @Body() dto: CreateResaleListingDto) {
    return this.resale.createListing(actor, dto);
  }

  @Get('listings')
  @OptionalAuth()
  discover(@Query() query: ResaleDiscoveryDto) {
    return this.resale.discover(query);
  }

  @Get('events')
  @OptionalAuth()
  events() {
    return this.resale.discoveryEvents();
  }

  @Get('listings/mine')
  myListings(@CurrentUser() actor: Principal, @Query() query: ResaleListDto) {
    return this.resale.myListings(actor, query);
  }

  @Get('listings/:id')
  @OptionalAuth()
  detail(@Param() params: ResaleIdDto, @Req() request: AuthorizedRequest) {
    return this.resale.listingDetail(params.id, request.user);
  }

  @Post('listings/:id/cancel')
  @HttpCode(200)
  cancelListing(
    @CurrentUser() actor: Principal,
    @Param() params: ResaleIdDto,
    @Body() body: unknown,
  ) {
    this.emptyBody(body);
    return this.resale.cancelListing(actor, params.id);
  }

  @Post('listings/:id/orders')
  reserve(
    @CurrentUser() _actor: Principal,
    @Param() _params: ResaleIdDto,
    @Body() body: unknown,
  ) {
    this.emptyBody(body);
    throw new ConflictException(
      'Vé chỉ được giữ khi bắt đầu thanh toán VNPay.',
    );
  }

  @Post('listings/:id/checkout')
  @HttpCode(200)
  checkout(
    @CurrentUser() actor: Principal,
    @Param() params: ResaleIdDto,
    @Body() body: unknown,
  ) {
    this.emptyBody(body);
    throw new ConflictException(
      'Vui lòng giữ vé rồi xác thực thanh toán tại /v1/checkout.',
    );
  }

  @Get('orders/mine')
  myOrders(@CurrentUser() actor: Principal, @Query() query: ResaleListDto) {
    return this.resale.myOrders(actor, query);
  }

  @Get('orders/:id')
  orderDetail(@CurrentUser() actor: Principal, @Param() params: ResaleIdDto) {
    return this.resale.orderDetail(actor, params.id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancelOrder(
    @CurrentUser() actor: Principal,
    @Param() params: ResaleIdDto,
    @Body() body: unknown,
  ) {
    this.emptyBody(body);
    return this.resale.cancelOrder(actor, params.id);
  }

  @Post('payments/:id')
  @HttpCode(200)
  pay(
    @CurrentUser() actor: Principal,
    @Param() params: ResaleIdDto,
    @Body() body: unknown,
  ) {
    parsePaymentMethod(body);
    throw new ConflictException(
      'Vui lòng tạo phiên thanh toán và hoàn tất xác thực tại /v1/checkout.',
    );
  }

  private emptyBody(body: unknown) {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      throw new BadRequestException(
        'This endpoint accepts only an empty body or {}',
      );
  }
}
