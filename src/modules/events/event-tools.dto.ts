import { Transform, Type } from 'class-transformer';
import { EventIdDto } from './dto/event.dto';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RegistrationQuestionDto {
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;
  @IsIn(['TEXT', 'SELECT'])
  type!: 'TEXT' | 'SELECT';
  @IsBoolean()
  required!: boolean;
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((option: unknown) =>
          typeof option === 'string' ? option.trim() : option,
        )
      : value,
  )
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options!: string[];
}

export class RegistrationDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((question: RegistrationQuestionDto | null) => question?.id)
  @ValidateNested({ each: true })
  @Type(() => RegistrationQuestionDto)
  questions!: RegistrationQuestionDto[];
}

export class DiscountDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  code!: string;
  @IsIn(['PERCENT', 'FIXED'])
  kind!: 'PERCENT' | 'FIXED';
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  value!: number;
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  usageLimit!: number;
  @IsDateString({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsDateString({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  endsAt!: string;
}

export class DiscountStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class DiscountParamsDto extends EventIdDto {
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  code!: string;
}

export class AttendeesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  showingId?: string;
}
