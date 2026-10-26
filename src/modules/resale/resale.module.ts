import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResaleListing } from './entities/resale-listing.entity';
import { ResaleOrder } from './entities/resale-order.entity';
import { ResalePayment } from './entities/resale-payment.entity';
import { TicketsModule } from '../tickets/tickets.module';
import { PaymentProcessingModule } from '../payments/payment-processing.module';
import { ResaleController } from './resale.controller';
import { ResaleService } from './resale.service';
import { ResaleEmail } from './entities/resale-email.entity';
import { ResalePayout } from './entities/resale-payout.entity';
import { ResaleSettlementService } from './resale-settlement.service';

@Module({
  imports: [
    PaymentProcessingModule,
    TicketsModule,
    TypeOrmModule.forFeature([
      ResaleListing,
      ResaleOrder,
      ResalePayment,
      ResalePayout,
      ResaleEmail,
    ]),
  ],
  controllers: [ResaleController],
  providers: [ResaleService, ResaleSettlementService],
  exports: [ResaleService],
})
export class ResaleModule {}
