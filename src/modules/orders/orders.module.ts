import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderDispute, OrderPayment } from './order.entity';
import { OrderStore } from './order-store.service';
import { OrdersService } from './orders.service';
import { OrderPaymentsService } from './order-payments.service';
import { OrdersController } from './orders.controller';
import { OrdersWorker } from './orders.worker';
import { UploadsModule } from '../../common/uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderPayment, OrderDispute]),
    UploadsModule,
  ],
  controllers: [OrdersController],
  providers: [OrderStore, OrdersService, OrderPaymentsService, OrdersWorker],
})
export class OrdersModule {}
