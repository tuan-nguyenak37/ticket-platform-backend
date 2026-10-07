import { IsEnum, IsOptional } from 'class-validator';
import { ListTicketsDto } from './list-tickets.dto';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import { CheckStatus, ReviewMethod } from '../review/check.types';

export class ManageTicketsDto extends ListTicketsDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(CheckStatus)
  checkStatus?: CheckStatus;

  @IsOptional()
  @IsEnum(ReviewMethod)
  reviewMethod?: ReviewMethod;
}
