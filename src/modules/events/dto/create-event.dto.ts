import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { EventStatus } from '../entities/enums/event-status.enum';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startTime!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  endTime!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 255)
  venueName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  address!: string;

  @IsString()
  @Length(1, 40)
  categoryId!: string;

  @IsIn([EventStatus.DRAFT, EventStatus.PUBLISHED])
  status: EventStatus = EventStatus.DRAFT;
}
