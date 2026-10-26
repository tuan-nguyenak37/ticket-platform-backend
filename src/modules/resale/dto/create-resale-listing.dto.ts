import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class CreateResaleListingDto {
  @IsString()
  @Matches(/^ticket_[a-zA-Z0-9_-]{1,33}$/)
  ticketId!: string;

  @IsString()
  @Matches(/^[1-9][0-9]{0,18}$/)
  price!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  @Matches(/^\P{Cc}+$/u)
  bankName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  @Matches(/^\P{Cc}+$/u)
  accountHolder!: string;

  @IsString()
  @Matches(/^[0-9]{6,30}$/)
  accountNumber!: string;
}
