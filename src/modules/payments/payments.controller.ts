import {
  Body,
  Controller,
  ConflictException,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { OrderIdDto } from '../orders/dto/order-query.dto';
import { OrdersService } from '../orders/orders.service';
import { parsePaymentMethod } from './payment-method';

@Controller('v1/payments')
@Authenticated()
export class PaymentsController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id')
  @HttpCode(200)
  pay(
    @CurrentUser() actor: Principal,
    @Param() params: OrderIdDto,
    @Body() body: unknown,
  ) {
    parsePaymentMethod(body);
    throw new ConflictException(
      'Vui lòng tạo phiên thanh toán và hoàn tất xác thực tại /v1/checkout.',
    );
  }
}
