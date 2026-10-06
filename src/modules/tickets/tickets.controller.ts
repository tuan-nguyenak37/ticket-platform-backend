import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
  Public,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketFileInterceptor } from './ticket-file.interceptor';
import { TicketsService } from './tickets.service';
import type { TicketUploadFiles } from './tickets.service';
import { ListTicketsDto } from './dto/list-tickets.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Public()
  list(@Query() query: ListTicketsDto) {
    return this.ticketsService.list(query);
  }

  @Delete(':id')
  @Authenticated()
  @Audit('tickets.cancel')
  cancel(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.ticketsService.cancel(actor, id);
  }

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
