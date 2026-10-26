import { Transform } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
export class CreateOrderDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  ticketTypeId!: string;
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  discountCode?: string;
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}
