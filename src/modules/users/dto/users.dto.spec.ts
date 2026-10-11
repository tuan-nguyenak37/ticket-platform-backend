import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';
import { ChangePasswordDto } from './change-password.dto';
import { CreateUserDto } from './create-user.dto';

describe('Users DTO Validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('UpdateUserDto', () => {
    it('trims whitespace from fullName and accepts valid input', async () => {
      const result = (await pipe.transform(
        { fullName: '   Nguyễn Văn An   ' },
        { type: 'body', metatype: UpdateUserDto },
      )) as UpdateUserDto;
      expect(result.fullName).toBe('Nguyễn Văn An');
    });

    it('rejects empty string or whitespace-only fullName', async () => {
      await expect(
        pipe.transform(
          { fullName: '     ' },
          { type: 'body', metatype: UpdateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects fullName exceeding 100 characters', async () => {
      await expect(
        pipe.transform(
          { fullName: 'a'.repeat(101) },
          { type: 'body', metatype: UpdateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects forbidden non-whitelisted fields (role, email, password, tokenVersion)', async () => {
      await expect(
        pipe.transform(
          { fullName: 'Valid Name', role: 'admin' },
          { type: 'body', metatype: UpdateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { fullName: 'Valid Name', email: 'hacker@test.com' },
          { type: 'body', metatype: UpdateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ChangePasswordDto', () => {
    it('accepts valid current and new password', async () => {
      const result = (await pipe.transform(
        {
          currentPassword: 'OldPassword123@',
          newPassword: 'NewPassword456@',
        },
        { type: 'body', metatype: ChangePasswordDto },
      )) as ChangePasswordDto;
      expect(result.currentPassword).toBe('OldPassword123@');
      expect(result.newPassword).toBe('NewPassword456@');
    });

    it('rejects empty currentPassword', async () => {
      await expect(
        pipe.transform(
          {
            currentPassword: '',
            newPassword: 'NewPassword456@',
          },
          { type: 'body', metatype: ChangePasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects newPassword shorter than 6 characters', async () => {
      await expect(
        pipe.transform(
          {
            currentPassword: 'OldPassword123@',
            newPassword: '12345',
          },
          { type: 'body', metatype: ChangePasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects newPassword longer than 32 characters', async () => {
      await expect(
        pipe.transform(
          {
            currentPassword: 'OldPassword123@',
            newPassword: 'a'.repeat(33),
          },
          { type: 'body', metatype: ChangePasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted injection properties', async () => {
      await expect(
        pipe.transform(
          {
            currentPassword: 'OldPassword123@',
            newPassword: 'NewPassword456@',
            role: 'admin',
          },
          { type: 'body', metatype: ChangePasswordDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CreateUserDto', () => {
    it('normalizes email and accepts valid payload', async () => {
      const result = (await pipe.transform(
        {
          email: ' NewUser@TicketPlatform.Test ',
          password: 'Password123@',
          fullName: 'Người Mới',
        },
        { type: 'body', metatype: CreateUserDto },
      )) as CreateUserDto;
      expect(result.email).toBe('newuser@ticketplatform.test');
      expect(result.password).toBe('Password123@');
      expect(result.fullName).toBe('Người Mới');
    });

    it('rejects invalid email format', async () => {
      await expect(
        pipe.transform(
          {
            email: 'not-an-email',
            password: 'Password123@',
          },
          { type: 'body', metatype: CreateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects password shorter than 6 characters', async () => {
      await expect(
        pipe.transform(
          {
            email: 'valid@ticketplatform.test',
            password: '12345',
          },
          { type: 'body', metatype: CreateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
