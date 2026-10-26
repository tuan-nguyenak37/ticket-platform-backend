import { IsDateString, IsIn, ValidateIf, Matches } from 'class-validator';

export class AdminStatisticsDto {
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateFrom?: string;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateTo?: string;

  @IsIn(['day', 'month'])
  groupBy: 'day' | 'month' = 'day';
}
