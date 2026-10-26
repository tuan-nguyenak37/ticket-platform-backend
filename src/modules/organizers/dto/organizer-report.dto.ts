import { IsString, Matches } from 'class-validator';
import { OrganizerIdDto } from './update-organizer.dto';

export class OrganizerEventReportDto extends OrganizerIdDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  eventId!: string;
}
