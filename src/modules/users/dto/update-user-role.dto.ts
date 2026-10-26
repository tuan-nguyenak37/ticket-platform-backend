import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class UpdateUserRoleDto {
  @IsIn([UserRole.USER, UserRole.MODERATOR])
  role!: UserRole.USER | UserRole.MODERATOR;

  @IsIn([UserRole.USER, UserRole.MODERATOR])
  expectedRole!: UserRole.USER | UserRole.MODERATOR;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
