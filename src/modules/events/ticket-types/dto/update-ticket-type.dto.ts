import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { VIETNAM_TIME_PATTERN } from '../../showings/showing-time';
import { TicketTypeStatus } from '../enums/ticket-type-status.enum';

export class UpdateTicketTypeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_dto, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string | null;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  price?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(VIETNAM_TIME_PATTERN)
  saleStartAt?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(VIETNAM_TIME_PATTERN)
  saleEndAt?: string;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxPerOrder?: number;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsBoolean()
  resaleAllowed?: boolean;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  totalQuantity?: number;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsEnum(TicketTypeStatus)
  status?: TicketTypeStatus;
}
