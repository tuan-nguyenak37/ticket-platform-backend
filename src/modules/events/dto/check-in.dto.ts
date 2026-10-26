import { IsString, Matches, MaxLength } from 'class-validator';

export class CheckInDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  showingId!: string;

  @IsString()
  @MaxLength(512)
  @Matches(/^pv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
  payload!: string;
}
