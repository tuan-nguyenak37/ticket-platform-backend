import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @Length(6, 32)
  @IsByteLength(1, 72, { message: 'Mật khẩu không được vượt quá 72 byte' })
  newPassword!: string;
}
