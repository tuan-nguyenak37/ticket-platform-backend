import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { comparePassword } from '../../common/utils/password.util';
import { resolvePolicy } from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto, UserIdDto } from './dto/update-user-status.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('User administration', () => {
  const admin: Principal = {
    user_id: 'user_admin',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    sessionId: 'admin-session',
  };
  const moderator: Principal = {
    ...admin,
    user_id: 'user_moderator',
    role: UserRole.MODERATOR,
  };
  const buyer: Principal = {
    ...admin,
    user_id: 'user_buyer',
    role: UserRole.USER,
  };
  const statusChange = {
    status: UserStatus.SUSPENDED,
    reason: 'Vi phạm quy định',
  };
  const records = new Map<string, User>();
  let service: UsersService;
  const repository = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const sessions = { revokeAll: jest.fn() };
  const manager = { getRepository: jest.fn(() => repository) };
  const database = {
    transaction: jest.fn(
      async (callback: (transaction: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    records.clear();
    for (const owner of [
      admin,
      moderator,
      buyer,
      { ...admin, user_id: 'user_other_admin' },
      { ...moderator, user_id: 'user_other_moderator' },
    ]) {
      records.set(
        owner.user_id,
        Object.assign(new User(), {
          ...owner,
          email: `${owner.user_id}@example.com`,
          full_name: owner.user_id,
          password_hash: 'private-password-hash',
        }),
      );
    }
    repository.find.mockResolvedValue([...records.values()]);
    repository.findOne.mockImplementation(
      ({ where }: { where: { user_id?: string; email?: string } }) =>
        Promise.resolve(
          where.user_id ? (records.get(where.user_id) ?? null) : null,
        ),
    );
    repository.create.mockImplementation((input: Partial<User>) =>
      Object.assign(
        new User(),
        { user_id: 'user_created', status: UserStatus.ACTIVE },
        input,
      ),
    );
    repository.save.mockImplementation((user: User) => Promise.resolve(user));
    repository.update.mockResolvedValue({ affected: 1 });
    sessions.revokeAll.mockResolvedValue(undefined);
    manager.getRepository.mockReturnValue(repository);
    database.transaction.mockImplementation(
      async (callback: (transaction: typeof manager) => Promise<unknown>) =>
        callback(manager),
    );
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

  it.each([buyer, moderator, { ...admin, status: UserStatus.SUSPENDED }])(
    'rejects unauthorized administrative operations before accessing data',
    async (actor) => {
      await expect(service.findAll(actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.findOne(actor, buyer.user_id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.createForAdmin(actor, {
          email: 'new@example.com',
          fullName: 'Name',
          password: 'Password123',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.update(actor, buyer.user_id, { full_name: 'Name' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.find).not.toHaveBeenCalled();
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('creates only regular users and hashes passwords without exposing them', async () => {
    const result = await service.createForAdmin(admin, {
      email: 'new@example.com',
      fullName: 'New User',
      password: 'Password123',
      role: UserRole.ADMIN,
    } as CreateUserDto);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.USER }),
    );
    const saved = repository.save.mock.calls[0][0] as User;
    expect(await comparePassword('Password123', saved.password_hash)).toBe(
      true,
    );
    expect(result.role).toBe(UserRole.USER);
    expect(result).not.toHaveProperty('password_hash');
  });

  it('lists and reads users without exposing password hashes', async () => {
    const users = await service.findAll(admin);
    expect(repository.find).toHaveBeenCalledWith({
      order: { created_at: 'DESC' },
    });
    expect(users.every((user) => !('password_hash' in user))).toBe(true);
    expect(await service.findOne(admin, buyer.user_id)).not.toHaveProperty(
      'password_hash',
    );
    await expect(service.findOne(admin, 'missing_user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows only name and phone changes, not privilege or credential updates', async () => {
    await service.update(admin, buyer.user_id, {
      full_name: 'Updated',
      phone_number: null,
      role: UserRole.ADMIN,
      password_hash: 'injected',
    } as UpdateUserDto);
    expect(repository.update).toHaveBeenCalledWith(
      { user_id: buyer.user_id },
      { full_name: 'Updated', phone_number: null },
    );
    await expect(
      service.update(admin, buyer.user_id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each<[Principal, string]>([
    [admin, buyer.user_id],
    [admin, 'user_other_moderator'],
    [moderator, buyer.user_id],
  ])(
    'suspends an allowed account and revokes its sessions',
    async (actor, targetId) => {
      const result = await service.updateStatus(actor, targetId, statusChange);
      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(result).not.toHaveProperty('password_hash');
      expect(sessions.revokeAll).toHaveBeenCalledWith(targetId);
      expect(
        repository.findOne.mock.calls.map(
          (call) => (call[0] as { where: { user_id: string } }).where.user_id,
        ),
      ).toEqual([actor.user_id, targetId].sort());
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    },
  );

  it.each<[Principal, string]>([
    [admin, admin.user_id],
    [admin, 'user_other_admin'],
    [moderator, 'user_other_admin'],
    [moderator, 'user_other_moderator'],
    [buyer, moderator.user_id],
  ])(
    'rejects self-suspension and protected targets',
    async (actor, targetId) => {
      await expect(
        service.updateStatus(actor, targetId, statusChange),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    { role: UserRole.USER, status: UserStatus.ACTIVE },
    { role: UserRole.ADMIN, status: UserStatus.SUSPENDED },
  ])(
    'rechecks operator permissions after acquiring database locks',
    async (current) => {
      Object.assign(records.get(admin.user_id)!, current);
      await expect(
        service.updateStatus(admin, buyer.user_id, statusChange),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('does not save the suspension when session revocation fails', async () => {
    sessions.revokeAll.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(
      service.updateStatus(admin, buyer.user_id, statusChange),
    ).rejects.toThrow('Redis unavailable');
    expect(records.get(buyer.user_id)!.status).toBe(UserStatus.ACTIVE);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('unblocks an account without restoring revoked sessions', async () => {
    records.get(buyer.user_id)!.status = UserStatus.SUSPENDED;
    const result = await service.updateStatus(admin, buyer.user_id, {
      ...statusChange,
      status: UserStatus.ACTIVE,
    });
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('treats repeated status changes as a no-op', async () => {
    records.get(buyer.user_id)!.status = UserStatus.SUSPENDED;
    await service.updateStatus(admin, buyer.user_id, statusChange);
    expect(repository.save).not.toHaveBeenCalled();
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('reports nonexistent targets without writing', async () => {
    await expect(
      service.updateStatus(admin, 'missing_user', statusChange),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('keeps duplicate email conflicts explicit', async () => {
    repository.findOne.mockResolvedValue(records.get(buyer.user_id));
    await expect(
      service.createForAdmin(admin, {
        email: 'duplicate@example.com',
        fullName: 'Name',
        password: 'Password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Administrative route policies and validation', () => {
  const reflector = new Reflector();

  it.each(['create', 'findAll', 'findOne', 'update'] as const)(
    'requires ADMIN for %s',
    (method) => {
      expect(
        resolvePolicy(
          reflector,
          UsersController.prototype[method],
          UsersController,
        ),
      ).toEqual({ kind: 'roles', roles: [UserRole.ADMIN] });
    },
  );

  it('allows the status endpoint to ADMIN and MODERATOR but keeps self-service authenticated', () => {
    expect(
      resolvePolicy(
        reflector,
        UsersController.prototype.updateStatus,
        UsersController,
      ),
    ).toEqual({ kind: 'roles', roles: [UserRole.ADMIN, UserRole.MODERATOR] });
    expect(
      resolvePolicy(
        reflector,
        UsersController.prototype.updateMe,
        UsersController,
      ),
    ).toEqual({ kind: 'authenticated' });
  });

  it('rejects role, status and credential fields in administrative profile updates', async () => {
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
          status: 'SUSPENDED',
          password: 'Password123',
        },
        { type: 'body', metatype: UpdateUserDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { status: 'INVALID', reason: 'Reason' },
    { status: UserStatus.SUSPENDED, reason: '   ' },
  ])('rejects invalid status input', async (input) => {
    expect(
      (await validate(plainToInstance(UpdateUserStatusDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it('rejects oversized phone numbers and malformed status target IDs', async () => {
    expect(
      (
        await validate(
          plainToInstance(UpdateUserDto, {
            phone_number: '+12345678901234567890',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(UserIdDto, { id: '../user' }))).length,
    ).toBeGreaterThan(0);
  });
});
