import { Module } from '@nestjs/common';
import { PaymentGateway, ProjectPaymentGateway } from './payment-gateway';
import { PaymentProcessingService } from './payment-processing.service';
import { VnpayClient } from './vnpay.client';

@Module({
  providers: [
    VnpayClient,
    { provide: PaymentGateway, useClass: ProjectPaymentGateway },
    PaymentProcessingService,
  ],
  exports: [PaymentProcessingService, VnpayClient],
})
export class PaymentProcessingModule {}
