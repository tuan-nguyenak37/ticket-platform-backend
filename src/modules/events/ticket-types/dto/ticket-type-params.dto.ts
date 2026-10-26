import { IsString, Matches } from 'class-validator';

export class TicketTypeShowingParamsDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  showingId!: string;
}

export class TicketTypeParamsDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;
}
