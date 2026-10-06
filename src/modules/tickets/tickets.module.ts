import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { UploadsModule } from '../../common/uploads/uploads.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket]), UploadsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TypeOrmModule, TicketsService],
})
export class TicketsModule {}
