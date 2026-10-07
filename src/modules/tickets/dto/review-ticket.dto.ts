import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class ReviewTicketDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ValidateIf(
    (dto: ReviewTicketDto) =>
      dto.decision === 'approve' || dto.checkVersion !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  checkVersion?: number;

  @ValidateIf(
    (dto: ReviewTicketDto) =>
      dto.decision === 'approve' || dto.selectedCodeId !== undefined,
  )
  @IsUUID()
  selectedCodeId?: string;

  @ValidateIf(
    (dto: ReviewTicketDto) =>
      dto.decision === 'reject' || dto.reason !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  reason?: string;

  @ValidateIf((dto: ReviewTicketDto) => dto.note !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  note?: string;
}
