import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { AdminRoleChanges1792454403000 } from '../../database/migrations/1792454403000-AdminRoleChanges';
import { resolvePolicy } from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Administrative role changes', () => {
  const administrator: Principal = {
    user_id: 'admin_operator',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    sessionId: 'admin-session',
  };
  const targetId = 'user_target';
  const change: UpdateUserRoleDto = {
    expectedRole: UserRole.USER,
    role: UserRole.MODERATOR,
    reason: ' Phân công kiểm duyệt ',
  };
  const records = new Map<string, User>();
  const repository = { findOne: jest.fn(), save: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const manager = {
    getRepository: jest.fn(() => repository),
    query: jest.fn(),
  };
  const database = {
    transaction: jest.fn(
      async (callback: (transaction: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  let service: UsersService;

  beforeEach(async () => {
    jest.resetAllMocks();
    records.clear();
    records.set(
      administrator.user_id,
      Object.assign(new User(), administrator),
    );
    records.set(
      targetId,
      Object.assign(new User(), {
        user_id: targetId,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        password_hash: 'private-hash',
      }),
    );
    repository.findOne.mockImplementation(
      ({ where }: { where: { user_id: string } }) =>
        Promise.resolve(records.get(where.user_id) ?? null),
    );
    repository.save.mockImplementation((user: User) => Promise.resolve(user));
    sessions.revokeAll.mockResolvedValue(undefined);
    manager.getRepository.mockReturnValue(repository);
    manager.query.mockResolvedValue([]);
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

  it('locks in ID order, revokes sessions and records the old/new roles before saving', async () => {
    const result = await service.updateRole(administrator, targetId, change);
    expect(
      repository.findOne.mock.calls.map(
        (call) => (call[0] as { where: { user_id: string } }).where.user_id,
      ),
    ).toEqual([administrator.user_id, targetId].sort());
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(sessions.revokeAll).toHaveBeenCalledWith(targetId);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_role_changes'),
      [
        expect.stringMatching(/^rolechg_[A-Za-z0-9_-]+$/),
        administrator.user_id,
        targetId,
        UserRole.USER,
        UserRole.MODERATOR,
        change.reason.trim(),
      ],
    );
    expect(sessions.revokeAll.mock.invocationCallOrder[0]).toBeLessThan(
      manager.query.mock.invocationCallOrder[0],
    );
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      repository.save.mock.invocationCallOrder[0],
    );
    expect(result.role).toBe(UserRole.MODERATOR);
    expect(result).not.toHaveProperty('password_hash');
  });

  it('supports demotion to USER', async () => {
    records.get(targetId)!.role = UserRole.MODERATOR;
    await expect(
      service.updateRole(administrator, targetId, {
        ...change,
        expectedRole: UserRole.MODERATOR,
        role: UserRole.USER,
      }),
    ).resolves.toMatchObject({ role: UserRole.USER });
  });

  it.each([UserRole.USER, UserRole.MODERATOR])(
    'rejects role changes by %s',
    async (role) => {
      await expect(
        service.updateRole({ ...administrator, role }, targetId, change),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects self changes and any change targeting ADMIN', async () => {
    await expect(
      service.updateRole(administrator, administrator.user_id, change),
    ).rejects.toBeInstanceOf(ForbiddenException);
    records.get(targetId)!.role = UserRole.ADMIN;
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it.each([
    { role: UserRole.USER, status: UserStatus.ACTIVE },
    { role: UserRole.ADMIN, status: UserStatus.SUSPENDED },
  ])('rejects stale operator privileges after locking', async (current) => {
    Object.assign(records.get(administrator.user_id)!, current);
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rejects suspended targets, missing targets and requests based on an old role', async () => {
    records.get(targetId)!.status = UserStatus.SUSPENDED;
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(ConflictException);
    records.get(targetId)!.status = UserStatus.ACTIVE;
    records.get(targetId)!.role = UserRole.MODERATOR;
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(ConflictException);
    records.delete(targetId);
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects unchanged roles without revoking sessions', async () => {
    await expect(
      service.updateRole(administrator, targetId, {
        ...change,
        role: UserRole.USER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  it.each([
    { ...change, role: UserRole.ADMIN },
    { ...change, expectedRole: UserRole.ADMIN },
    { ...change, reason: '   ' },
    { ...change, reason: 'a'.repeat(1001) },
  ])(
    'rejects invalid internal input before database or Redis work',
    async (input) => {
      await expect(
        service.updateRole(administrator, targetId, input as UpdateUserRoleDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(database.transaction).not.toHaveBeenCalled();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    },
  );

  it('does not write a journal or a new role when revocation fails', async () => {
    sessions.revokeAll.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toThrow('Redis unavailable');
    expect(manager.query).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(records.get(targetId)!.role).toBe(UserRole.USER);
  });

  it('does not save a role when its journal insert fails', async () => {
    manager.query.mockRejectedValueOnce(new Error('Journal unavailable'));
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toThrow('Journal unavailable');
    expect(repository.save).not.toHaveBeenCalled();
    expect(records.get(targetId)!.role).toBe(UserRole.USER);
  });

  it('propagates save failures through the transaction', async () => {
    repository.save.mockRejectedValueOnce(new Error('Write failed'));
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toThrow('Write failed');
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a repeated request after the first role change', async () => {
    await service.updateRole(administrator, targetId, change);
    await expect(
      service.updateRole(administrator, targetId, change),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(sessions.revokeAll).toHaveBeenCalledTimes(1);
  });
});

describe('Role-change HTTP contract', () => {
  it('requires ADMIN on the route', () => {
    expect(
      resolvePolicy(
        new Reflector(),
        UsersController.prototype.updateRole,
        UsersController,
      ),
    ).toEqual({ kind: 'roles', roles: [UserRole.ADMIN] });
  });

  it.each([
    { role: 'ADMIN', expectedRole: 'USER', reason: 'Reason' },
    { role: 'MODERATOR', reason: 'Reason' },
    { role: 'USER', expectedRole: 'MODERATOR', reason: '   ' },
  ])('rejects invalid role bodies', async (input) => {
    expect(
      (await validate(plainToInstance(UpdateUserRoleDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it('trims reasons and accepts a valid request', async () => {
    const input = plainToInstance(UpdateUserRoleDto, {
      role: 'MODERATOR',
      expectedRole: 'USER',
      reason: ' Reason ',
    });
    expect(await validate(input)).toHaveLength(0);
    expect(input.reason).toBe('Reason');
  });
});

describe('Role-change migration definition', () => {
  it('defines a journal with protected references and role constraints', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new AdminRoleChanges1792454403000().up({
      query,
    } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(2);
    const definition = query.mock.calls[0][0] as string;
    expect(definition).toContain('CREATE TABLE user_role_changes');
    expect(definition).toContain('ON DELETE RESTRICT');
    expect(definition).toContain('CHECK (actor_id <> target_id)');
    expect(definition).toContain('previous_role <> new_role');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('IDX_user_role_changes_target_created'),
    );
  });
});
