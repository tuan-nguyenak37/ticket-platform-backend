import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './create-auth.dto';
import { LoginDto } from './login-auth.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';

describe('Auth input validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each([123, {}, []])('rejects non-string email with 400', async (email) => {
    await expect(
      pipe.transform(
        { email, password: 'abcdef' },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([RegisterDto, LoginDto])(
    'normalizes email for %p',
    async (metatype) => {
      const result = (await pipe.transform(
        { email: ' Person@Example.com ', password: 'abcdef' },
        { type: 'body', metatype },
      )) as { email: string };
      expect(result.email).toBe('person@example.com');
    },
  );

  it.each(['email', 'password'])(
    'does not allow null %s in updates',
    async (field) => {
      await expect(
        pipe.transform(
          { [field]: null },
          { type: 'body', metatype: UpdateUserDto },
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('rejects role injection during registration', async () => {
    await expect(
      pipe.transform(
        { email: 'person@example.com', password: 'abcdef', role: 'admin' },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
