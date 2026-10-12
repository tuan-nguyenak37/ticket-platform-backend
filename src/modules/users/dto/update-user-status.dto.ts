import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { UserStatus } from '../entities/enums/user-status.enum';

export class UserIdDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;
}

export class UpdateUserStatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED])
  status!: UserStatus.ACTIVE | UserStatus.SUSPENDED | UserStatus.BANNED;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
