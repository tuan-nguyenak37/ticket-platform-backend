import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Not, QueryFailedError } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserStatus } from './entities/enums/user-status.enum';
import { UserRole } from './entities/enums/user-role.enum';
import { comparePassword, hashPassword } from '../../common/utils/password.util';
import {
  createMockUser,
  mockAdminPrincipal,
  mockAdminUser,
  mockRegularUser,
  mockSuspendedPrincipal,
  mockUserPrincipal,
} from './test/users.mock-data';

describe('UsersService', () => {
  let service: UsersService;
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    repo.create.mockImplementation((data: Partial<User>) =>
      createMockUser(data),
    );
    repo.save.mockImplementation((user: User) => Promise.resolve(user));
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('create', () => {
    it('normalizes email and hashes passwords before saving without fullName', async () => {
      repo.findOne.mockResolvedValue(null);
      const user = await service.create({
        email: ' Person@Example.com ',
        password: 'Password123@',
      });
      expect(user.email).toBe('person@example.com');
      expect(user.password).not.toBe('Password123@');
      expect(await comparePassword('Password123@', user.password)).toBe(true);
      expect(user.role).toBe(UserRole.USER);
      expect(user.fullName).toBeNull();
    });

    it('creates user with fullName when provided', async () => {
      repo.findOne.mockResolvedValue(null);
      const user = await service.create({
        email: 'person2@example.com',
        password: 'Password123@',
        fullName: 'Nguyễn Văn Người Dùng',
      });
      expect(user.fullName).toBe('Nguyễn Văn Người Dùng');
    });

    it('throws ConflictException if email already exists', async () => {
      repo.findOne.mockResolvedValue(mockRegularUser);
      await expect(
        service.create({
          email: mockRegularUser.email,
          password: 'Password123@',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps a concurrent unique constraint failure (code 23505) to 409', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate'), { code: '23505' }),
        ),
      );
      await expect(
        service.create({
          email: 'person@example.com',
          password: 'Password123@',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unexpected database errors', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockRejectedValue(new Error('Database disk full'));
      await expect(
        service.create({
          email: 'person@example.com',
          password: 'Password123@',
        }),
      ).rejects.toThrow('Database disk full');
    });
  });

  describe('findByEmail and findById', () => {
    it('finds user by email with trimming and lowercasing', async () => {
      repo.findOne.mockResolvedValue(mockRegularUser);
      const result = await service.findByEmail(' USER.BUYER@ticketplatform.test ');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'user.buyer@ticketplatform.test' },
      });
      expect(result).toBe(mockRegularUser);
    });

    it('finds user by id', async () => {
      repo.findOne.mockResolvedValue(mockRegularUser);
      const result = await service.findById(mockRegularUser.user_id);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { user_id: mockRegularUser.user_id },
      });
      expect(result).toBe(mockRegularUser);
    });
  });

  describe('getProfile', () => {
    it('returns public profile when user is active and found', async () => {
      repo.findOne.mockResolvedValue(mockRegularUser);
      const result = await service.getProfile(mockUserPrincipal);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          user_id: mockUserPrincipal.user_id,
          status: UserStatus.ACTIVE,
          tokenVersion: mockUserPrincipal.tokenVersion,
        },
      });
      expect(result.user_id).toBe(mockRegularUser.user_id);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('tokenVersion');
    });

    it('throws UnauthorizedException when user status is not active', async () => {
      await expect(
        service.getProfile(mockSuspendedPrincipal),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws NotFoundException when profile is not found in database', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getProfile(mockUserPrincipal)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates fullName and returns updated profile', async () => {
      repo.update.mockResolvedValue({ affected: 1 });
      const updatedUser = createMockUser({ fullName: 'Tên Đã Cập Nhật' });
      repo.findOne.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(mockUserPrincipal, {
        fullName: 'Tên Đã Cập Nhật',
      });

      expect(repo.update).toHaveBeenCalledWith(
        {
          user_id: mockUserPrincipal.user_id,
          status: UserStatus.ACTIVE,
          tokenVersion: mockUserPrincipal.tokenVersion,
        },
        { fullName: 'Tên Đã Cập Nhật' },
      );
      expect(result.fullName).toBe('Tên Đã Cập Nhật');
    });

    it('throws ConflictException if concurrent update happened (affected === 0)', async () => {
      repo.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.updateProfile(mockUserPrincipal, {
          fullName: 'Tên Đã Cập Nhật',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('changes password, hashes new password and updates tokenVersion', async () => {
      const currentHashed = await hashPassword('CurrentPassword123@');
      const user = createMockUser({ password: currentHashed });
      repo.findOne.mockResolvedValue(user);
      repo.update.mockImplementation(
        (_conditions: unknown, values: { tokenVersion?: unknown }) => {
          if (typeof values?.tokenVersion === 'function') {
            values.tokenVersion();
          }
          return Promise.resolve({ affected: 1 });
        },
      );

      const result = await service.changePassword(mockUserPrincipal, {
        currentPassword: 'CurrentPassword123@',
        newPassword: 'NewSecurePassword456@',
      });

      expect(result).toEqual({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      });
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserPrincipal.user_id,
          password: currentHashed,
        }),
        expect.objectContaining({
          password: expect.any(String),
        }),
      );
    });

    it('throws ConflictException when user is not found during password change', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'CurrentPassword123@',
          newPassword: 'NewSecurePassword456@',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when current password is wrong', async () => {
      const currentHashed = await hashPassword('CurrentPassword123@');
      const user = createMockUser({ password: currentHashed });
      repo.findOne.mockResolvedValue(user);

      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'WrongPassword999@',
          newPassword: 'NewSecurePassword456@',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when new password matches current password', async () => {
      const currentHashed = await hashPassword('CurrentPassword123@');
      const user = createMockUser({ password: currentHashed });
      repo.findOne.mockResolvedValue(user);

      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'CurrentPassword123@',
          newPassword: 'CurrentPassword123@',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when concurrent change occurs (affected === 0)', async () => {
      const currentHashed = await hashPassword('CurrentPassword123@');
      const user = createMockUser({ password: currentHashed });
      repo.findOne.mockResolvedValue(user);
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'CurrentPassword123@',
          newPassword: 'NewSecurePassword456@',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createForAdmin', () => {
    it('creates a user when actor is admin', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.createForAdmin(mockAdminPrincipal, {
        email: 'newadminuser@ticketplatform.test',
        password: 'Password123@',
        fullName: 'Người Mới',
      });
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('newadminuser@ticketplatform.test');
    });

    it('throws ForbiddenException when actor is not admin', async () => {
      await expect(
        service.createForAdmin(mockUserPrincipal, {
          email: 'newadminuser@ticketplatform.test',
          password: 'Password123@',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('returns list of non-deleted public users for admin', async () => {
      repo.find.mockResolvedValue([mockRegularUser, mockAdminUser]);
      const result = await service.findAll(mockAdminPrincipal);
      expect(repo.find).toHaveBeenCalledWith({
        where: { status: Not(UserStatus.DELETED) },
        order: { createdAt: 'DESC', user_id: 'ASC' },
        take: 100,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password');
    });

    it('throws ForbiddenException when non-admin accesses user list', async () => {
      await expect(service.findAll(mockUserPrincipal)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOne', () => {
    it('returns public user by id for admin', async () => {
      repo.findOne.mockResolvedValue(mockRegularUser);
      const result = await service.findOne(
        mockAdminPrincipal,
        mockRegularUser.user_id,
      );
      expect(result.user_id).toBe(mockRegularUser.user_id);
      expect(result).not.toHaveProperty('password');
    });

    it('throws NotFoundException for non-existent user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne(mockAdminPrincipal, 'non_existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for deleted user', async () => {
      const deletedUser = createMockUser({ status: UserStatus.DELETED });
      repo.findOne.mockResolvedValue(deletedUser);
      await expect(
        service.findOne(mockAdminPrincipal, deletedUser.user_id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates user fullName by admin', async () => {
      const user = createMockUser();
      repo.findOne.mockResolvedValue(user);
      repo.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(mockAdminPrincipal, user.user_id, {
        fullName: 'Admin Sửa Tên',
      });
      expect(repo.update).toHaveBeenCalledWith(
        { user_id: user.user_id, status: Not(UserStatus.DELETED) },
        { fullName: 'Admin Sửa Tên' },
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when update affects 0 rows', async () => {
      const user = createMockUser();
      repo.findOne.mockResolvedValue(user);
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.update(mockAdminPrincipal, user.user_id, {
          fullName: 'Admin Sửa Tên',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rotateTokenVersion', () => {
    it('rotates token version successfully without login timestamp', async () => {
      repo.update.mockResolvedValue({ affected: 1 });
      const newVersion = await service.rotateTokenVersion({
        user_id: 'usr_abc',
        tokenVersion: 2,
      });
      expect(newVersion).toBe(3);
      expect(repo.update).toHaveBeenCalledWith(
        { user_id: 'usr_abc', tokenVersion: 2, status: UserStatus.ACTIVE },
        { tokenVersion: 3 },
      );
    });

    it('rotates token version with lastLoginAt when login is true', async () => {
      repo.update.mockResolvedValue({ affected: 1 });
      const newVersion = await service.rotateTokenVersion(
        { user_id: 'usr_abc', tokenVersion: 2 },
        true,
      );
      expect(newVersion).toBe(3);
      expect(repo.update).toHaveBeenCalledWith(
        { user_id: 'usr_abc', tokenVersion: 2, status: UserStatus.ACTIVE },
        expect.objectContaining({
          tokenVersion: 3,
          lastLoginAt: expect.any(Date),
        }),
      );
    });

    it('rejects token rotation when update affects 0 rows', async () => {
      repo.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.rotateTokenVersion({ user_id: 'usr_abc', tokenVersion: 4 }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
