import { IsEnum, IsOptional } from 'class-validator';
import { ListTicketsDto } from './list-tickets.dto';
import { TicketStatus } from '../entities/enums/ticket-status.enum';

export class MyTicketsDto extends ListTicketsDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
