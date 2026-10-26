import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class PayoutAccountDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  bankName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  accountHolder!: string;

  @IsString()
  @Matches(/^[0-9]{6,30}$/)
  accountNumber!: string;
}
