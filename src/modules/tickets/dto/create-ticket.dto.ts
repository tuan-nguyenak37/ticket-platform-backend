import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const parsePositiveNumber = ({ value }: { value: unknown }) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return value;
};

export class CreateTicketDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  eventId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  ticketTier!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  seatInfo?: string;

  @Transform(parsePositiveNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  originalPrice!: number;

  @Transform(parsePositiveNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000_000)
  price!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}
