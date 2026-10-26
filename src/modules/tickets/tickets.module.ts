import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { TicketReservation } from '../orders/entities/ticket-reservation.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketOwnership } from './entities/ticket-ownership.entity';
import { TicketIssuanceService } from './ticket-issuance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      TicketReservation,
      Payment,
      Ticket,
      TicketCredential,
      TicketOwnership,
    ]),
  ],
  providers: [TicketIssuanceService],
  exports: [TicketIssuanceService],
})
export class TicketsModule {}
