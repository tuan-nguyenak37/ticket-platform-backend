import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có tối thiểu 6 ký tự' })
  @MaxLength(32, { message: 'Mật khẩu tối đa 32 ký tự' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Họ và tên không quá 100 ký tự' })
  fullName?: string;
}
