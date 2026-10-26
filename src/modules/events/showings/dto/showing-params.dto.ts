import { IsString, Matches } from 'class-validator';

export class ShowingEventParamsDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  eventId!: string;
}

export class ShowingParamsDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;
}
