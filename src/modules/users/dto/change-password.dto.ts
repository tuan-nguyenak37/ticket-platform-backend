import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @Length(6, 32)
  newPassword!: string;
}
