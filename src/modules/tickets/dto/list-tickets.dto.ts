import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum TicketSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  EVENT_SOONEST = 'event_soonest',
}

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const price = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value)
    ? Number(value)
    : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListTicketsDto {
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  eventId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  categoryId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  ticketTier?: string;

  @IsOptional()
  @Transform(price)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  minPrice?: number;

  @IsOptional()
  @Transform(price)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  maxPrice?: number;

  @IsEnum(TicketSort)
  sort: TicketSort = TicketSort.NEWEST;
}
