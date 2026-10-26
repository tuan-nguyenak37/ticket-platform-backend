import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResaleModule } from '../resale/resale.module';
import { CheckoutSession } from './entities/checkout-session.entity';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutOtpService } from './checkout-otp.service';
import { SecurityModule } from '../../common/security/security.module';
import { MailService } from '../tickets/mail.service';
import { VnpayTransaction } from './entities/vnpay-transaction.entity';
import { VnpayService } from './vnpay.service';
import { VnpayController } from './vnpay.controller';
import { PaymentProcessingModule } from './payment-processing.module';

@Module({
  imports: [
    PaymentProcessingModule,
    SecurityModule,
    OrdersModule,
    ResaleModule,
    TypeOrmModule.forFeature([CheckoutSession, VnpayTransaction]),
  ],
  controllers: [PaymentsController, CheckoutController, VnpayController],
  providers: [CheckoutService, CheckoutOtpService, MailService, VnpayService],
})
export class PaymentsModule {}
