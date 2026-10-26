import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import {
  comparePassword,
  hashPassword,
} from '../../common/utils/password.util';
import type { Principal } from '../auth/authorization/principal';
import {
  BROWSER_REFRESH_COOKIE,
  BROWSER_SESSION_COOKIE,
} from '../auth/browser-session';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Self-service profile', () => {
  const actor: Principal = {
    user_id: 'user_profile',
    sessionId: 'profile-session',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
  };
  const change = {
    currentPassword: 'CurrentPassword123',
    newPassword: 'NextPassword456',
  };
  let currentHash: string;
  let user: User;
  let service: UsersService;
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
  };
  const sessions = { revokeAll: jest.fn() };
  const manager = { getRepository: jest.fn(() => repository) };
  const database = {
    transaction: jest.fn(
      async (callback: (transaction: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  beforeAll(async () => {
    currentHash = await hashPassword(change.currentPassword);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    user = Object.assign(new User(), {
      user_id: actor.user_id,
      email: 'profile@example.com',
      full_name: 'Profile User',
      password_hash: currentHash,
      phone_number: null,
      avatar_url: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });
    repository.findOne.mockResolvedValue(user);
    repository.update.mockResolvedValue({ affected: 1 });
    repository.save.mockResolvedValue(user);
    sessions.revokeAll.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: DataSource, useValue: database },
        { provide: RefreshSessionService, useValue: sessions },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('updates only the active caller and never writes privileged fields', async () => {
    const result = await service.updateProfile(actor, {
      full_name: 'New Name',
      avatar_url: 'https://example.com/avatar.png',
      role: UserRole.ADMIN,
      user_id: 'another-user',
    } as UpdateProfileDto);
    expect(repository.update).toHaveBeenCalledWith(
      { user_id: actor.user_id, status: UserStatus.ACTIVE },
      { full_name: 'New Name', avatar_url: 'https://example.com/avatar.png' },
    );
    expect(result).not.toHaveProperty('password_hash');
  });

  it('allows clearing phone and avatar without clearing the name', async () => {
    await service.updateProfile(actor, {
      phone_number: null,
      avatar_url: null,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { user_id: actor.user_id, status: UserStatus.ACTIVE },
      { phone_number: null, avatar_url: null },
    );
  });

  it('rejects an empty update before writing', async () => {
    await expect(service.updateProfile(actor, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects a suspended caller and a user suspended since authentication', async () => {
    await expect(
      service.updateProfile(
        { ...actor, status: UserStatus.SUSPENDED },
        { full_name: 'Name' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    user.status = UserStatus.SUSPENDED;
    await expect(service.getProfile(actor)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('reports an account changed concurrently', async () => {
    repository.update.mockResolvedValue({ affected: 0 });
    await expect(
      service.updateProfile(actor, { full_name: 'Name' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks the user, hashes the new password and revokes all sessions', async () => {
    await expect(service.changePassword(actor, change)).resolves.toEqual({
      message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { user_id: actor.user_id, status: UserStatus.ACTIVE },
      lock: { mode: 'pessimistic_write' },
    });
    expect(sessions.revokeAll).toHaveBeenCalledWith(actor.user_id);
    expect(await comparePassword(change.newPassword, user.password_hash)).toBe(
      true,
    );
    expect(repository.save).toHaveBeenCalledWith(user);
  });

  it.each([
    { ...change, currentPassword: 'wrong-password' },
    { ...change, newPassword: change.currentPassword },
  ])(
    'does not revoke sessions or write on invalid password input',
    async (input) => {
      await expect(service.changePassword(actor, input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('does not save a new password when revocation is unavailable', async () => {
    sessions.revokeAll.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(service.changePassword(actor, change)).rejects.toThrow(
      'Redis unavailable',
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(user.password_hash).toBe(currentHash);
  });

  it('clears browser and legacy refresh cookies only after a successful password change', async () => {
    const response = { clearCookie: jest.fn() } as unknown as Response;
    const controller = new UsersController(service);
    await controller.changePassword(actor, change, response);
    expect(response.clearCookie).toHaveBeenCalledWith(
      BROWSER_REFRESH_COOKIE,
      expect.objectContaining({ path: '/', httpOnly: true }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      BROWSER_SESSION_COOKIE,
      expect.objectContaining({ path: '/' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      expect.objectContaining({ path: '/api/auth' }),
    );
    jest.mocked(response.clearCookie).mockClear();
    await expect(
      controller.changePassword(
        actor,
        { ...change, currentPassword: 'incorrect' },
        response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});

describe('Profile input validation', () => {
  it('normalizes valid editable fields', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      full_name: ' Name ',
      phone_number: ' +84901234567 ',
      avatar_url: ' https://example.com/image.png ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      full_name: 'Name',
      phone_number: '+84901234567',
      avatar_url: 'https://example.com/image.png',
    });
  });

  it.each([
    { full_name: null },
    { full_name: '   ' },
    { phone_number: '+12345678901234567890' },
    { avatar_url: 'javascript:alert(1)' },
    { avatar_url: 'data:image/png;base64,abc' },
  ])('rejects malformed profile fields', async (input) => {
    expect(
      (await validate(plainToInstance(UpdateProfileDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it('rejects privileged fields at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        {
          full_name: 'Name',
          role: 'ADMIN',
          status: 'ACTIVE',
          email: 'other@example.com',
        },
        { type: 'body', metatype: UpdateProfileDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects passwords that exceed the bcrypt byte limit', async () => {
    expect(
      (
        await validate(
          plainToInstance(ChangePasswordDto, {
            currentPassword: 'current',
            newPassword: '密'.repeat(25),
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
