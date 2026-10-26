import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../../common/security/security.module';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { TicketReservation } from '../orders/entities/ticket-reservation.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketOwnership } from './entities/ticket-ownership.entity';
import { TicketIssuanceService } from './ticket-issuance.service';
import { TicketQrService } from './ticket-qr.service';
import { TicketPdfService } from './ticket-pdf.service';
import { MailService } from './mail.service';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [
    SecurityModule,
    UploadsModule,
    TypeOrmModule.forFeature([
      Ticket,
      TicketCredential,
      TicketOwnership,
      Order,
      OrderItem,
      TicketReservation,
      Payment,
      User,
    ]),
  ],
  controllers: [TicketsController],
  providers: [
    TicketIssuanceService,
    TicketQrService,
    TicketPdfService,
    MailService,
    TicketsService,
  ],
  exports: [
    TicketIssuanceService,
    TicketsService,
    TicketQrService,
    MailService,
  ],
})
export class TicketsModule {}
