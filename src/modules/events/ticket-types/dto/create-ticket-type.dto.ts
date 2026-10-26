import { Transform } from 'class-transformer';
import { VIETNAM_TIME_PATTERN } from '../../showings/showing-time';
import { TicketTypeStatus } from '../enums/ticket-type-status.enum';
import {
  IsInt,
  IsBoolean,
  IsEnum,
  Matches,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTicketTypeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_dto, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string | null;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  price!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  totalQuantity!: number;

  @IsString()
  @Matches(VIETNAM_TIME_PATTERN)
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  saleStartAt?: string;
  @IsString()
  @Matches(VIETNAM_TIME_PATTERN)
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  saleEndAt?: string;
  @IsInt()
  @Min(1)
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  maxPerOrder?: number;
  @IsBoolean()
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  resaleAllowed?: boolean;
  @IsEnum(TicketTypeStatus)
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  status?: TicketTypeStatus;
}
