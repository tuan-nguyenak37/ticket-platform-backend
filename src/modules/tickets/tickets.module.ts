import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { UploadsModule } from '../../common/uploads/uploads.module';

import { TicketFileInterceptor } from './ticket-file.interceptor';
import { TicketCheck } from './entities/ticket-check.entity';
import { TicketReview } from './entities/ticket-review.entity';
import { TicketReportService } from './review/ticket-report.service';
import { TicketReviewService } from './review/ticket-review.service';
import { TicketManagementService } from './review/ticket-management.service';
import { LocalTicketScanner } from './review/local-ticket-scanner.service';
import { TicketCheckWorker } from './review/ticket-check-worker.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketCheck, TicketReview]),
    UploadsModule,
    EmailModule,
  ],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketFileInterceptor,
    TicketReportService,
    TicketReviewService,
    TicketManagementService,
    LocalTicketScanner,
    TicketCheckWorker,
  ],
  exports: [TypeOrmModule, TicketsService, TicketCheckWorker],
})
export class TicketsModule {}
