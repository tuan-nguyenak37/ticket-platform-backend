import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EventStatus } from '../entities/enums/event-status.enum';

export enum EventPhase {
  UPCOMING = 'upcoming',
  ONGOING = 'ongoing',
  ENDED = 'ended',
}

const integerQuery = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ListEventsDto {
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  categoryId?: string;

  @IsOptional()
  @IsEnum(EventPhase)
  phase?: EventPhase;
}

export class ManageEventsDto extends ListEventsDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
