import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketFileInterceptor } from './ticket-file.interceptor';
import { TicketsService } from './tickets.service';
import type { TicketUploadFiles } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Authenticated()
  @Audit('tickets.create')
  @UseInterceptors(TicketFileInterceptor)
  create(
    @CurrentUser() actor: Principal,
    @Body() dto: CreateTicketDto,
    @UploadedFiles() files: TicketUploadFiles,
  ) {
    return this.ticketsService.create(actor, dto, files);
  }
}
