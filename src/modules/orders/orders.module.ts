import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketInventory } from '../events/ticket-types/entities/ticket-inventory.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentProcessingModule } from '../payments/payment-processing.module';
import { TicketsModule } from '../tickets/tickets.module';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { TicketReservation } from './entities/ticket-reservation.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PaymentProcessingModule,
    TicketsModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      TicketReservation,
      TicketInventory,
      TicketType,
      Showing,
      Event,
      Organizer,
      Payment,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
