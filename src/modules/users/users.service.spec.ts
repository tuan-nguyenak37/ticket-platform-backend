import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { hashPassword } from '../../common/utils/password.util';
import type { Principal } from '../auth/authorization/principal';

describe('UsersService', () => {
  let service: UsersService;
  let mockRegularUser: User;
  let mockAdminUser: User;

  const mockUserPrincipal: Principal = {
    user_id: 'usr_user_001',
    role: UserRole.USER,
    sessionId: 'sess_user',
    status: UserStatus.ACTIVE,
  };

  const mockAdminPrincipal: Principal = {
    user_id: 'usr_admin_001',
    role: UserRole.ADMIN,
    sessionId: 'sess_admin',
    status: UserStatus.ACTIVE,
  };

  const mockModPrincipal: Principal = {
    user_id: 'usr_mod_001',
    role: UserRole.MODERATOR,
    sessionId: 'sess_mod',
    status: UserStatus.ACTIVE,
  };

  const mockUserRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockEntityManager = {
    getRepository: jest.fn().mockReturnValue(mockUserRepository),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) =>
      cb(mockEntityManager),
    ),
  };

  const mockRefreshSessionService = {
    revokeAll: jest.fn(),
    revoke: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockEntityManager.getRepository.mockReturnValue(mockUserRepository);
    mockDataSource.transaction.mockImplementation(
      (callback: (manager: unknown) => Promise<unknown>) =>
        callback(mockEntityManager),
    );
    mockRegularUser = Object.assign(new User(), {
      user_id: 'usr_user_001',
      email: 'user@example.com',
      full_name: 'Nguyễn Văn User',
      password_hash: await hashPassword('CurrentPassword123@'),
      phone_number: '0987654321',
      avatar_url: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockAdminUser = Object.assign(new User(), {
      user_id: 'usr_admin_001',
      email: 'admin@example.com',
      full_name: 'Quản Trị Viên',
      password_hash: await hashPassword('AdminPassword123@'),
      phone_number: '0912345678',
      avatar_url: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: RefreshSessionService, useValue: mockRefreshSessionService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('USR-PRF-001: Lấy thông tin cá nhân thành công, không chứa password_hash', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockRegularUser);

      const result = await service.getProfile(mockUserPrincipal);

      expect(result.user_id).toBe(mockRegularUser.user_id);
      expect(result.email).toBe(mockRegularUser.email);
      expect(result).not.toHaveProperty('password_hash');
    });

    it('USR-PRF-003: Tài khoản không active bị ném UnauthorizedException', async () => {
      const suspendedPrincipal = {
        ...mockUserPrincipal,
        status: UserStatus.SUSPENDED,
      };

      await expect(service.getProfile(suspendedPrincipal)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('updateProfile', () => {
    it('USR-UPD-001: Cập nhật họ tên thành công', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValue({
        ...mockRegularUser,
        full_name: 'Nguyễn Văn Mới',
      });

      const result = await service.updateProfile(mockUserPrincipal, {
        full_name: 'Nguyễn Văn Mới',
      });

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { user_id: mockUserPrincipal.user_id, status: UserStatus.ACTIVE },
        { full_name: 'Nguyễn Văn Mới' },
      );
      expect(result.full_name).toBe('Nguyễn Văn Mới');
    });

    it('USR-UPD-003: Ném BadRequestException khi body rỗng', async () => {
      await expect(
        service.updateProfile(mockUserPrincipal, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('USR-UPD-006: Ném ConflictException khi update không affected hàng nào', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateProfile(mockUserPrincipal, { full_name: 'Tên Đổi' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('USR-PWD-001: Đổi mật khẩu thành công, thu hồi session cũ', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockRegularUser);
      mockUserRepository.save.mockResolvedValue(mockRegularUser);

      const result = await service.changePassword(mockUserPrincipal, {
        currentPassword: 'CurrentPassword123@',
        newPassword: 'NewSecurePassword456@',
      });

      expect(mockRefreshSessionService.revokeAll).toHaveBeenCalledWith(
        mockRegularUser.user_id,
      );
      expect(result).toEqual({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      });
    });

    it('USR-PWD-002: Ném BadRequestException khi mật khẩu hiện tại sai', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockRegularUser);

      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'WrongPassword!',
          newPassword: 'NewSecurePassword456@',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('USR-PWD-003: Ném BadRequestException khi mật khẩu mới trùng mật khẩu cũ', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockRegularUser);

      await expect(
        service.changePassword(mockUserPrincipal, {
          currentPassword: 'CurrentPassword123@',
          newPassword: 'CurrentPassword123@',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Admin Operations (findAll, findOne, createForAdmin)', () => {
    it('USR-ADM-001: Admin lấy toàn bộ danh sách users', async () => {
      mockUserRepository.find.mockResolvedValue([
        mockRegularUser,
        mockAdminUser,
      ]);

      const result = await service.findAll(mockAdminPrincipal);

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password_hash');
    });

    it('USR-ADM-002: User thường truy cập findAll bị ném ForbiddenException', async () => {
      await expect(service.findAll(mockUserPrincipal)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('USR-ADM-003: Admin xem chi tiết user thành công', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockRegularUser);

      const result = await service.findOne(
        mockAdminPrincipal,
        mockRegularUser.user_id,
      );

      expect(result.user_id).toBe(mockRegularUser.user_id);
    });

    it('USR-ADM-004: Xem user không tồn tại ném NotFoundException', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne(mockAdminPrincipal, 'usr_fake_999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('USR-ADM-005: Admin tạo tài khoản mới thành công', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockRegularUser);
      mockUserRepository.save.mockResolvedValue(mockRegularUser);

      const result = await service.createForAdmin(mockAdminPrincipal, {
        email: 'newbie@example.com',
        password: 'Password123@',
        fullName: 'Người Mới',
      });

      expect(result.email).toBe(mockRegularUser.email);
    });
  });

  describe('updateStatus', () => {
    it('USR-STS-001: Admin/Mod khóa tài khoản user thường, thu hồi session lập tức', async () => {
      const targetUser = { ...mockRegularUser, status: UserStatus.ACTIVE };
      mockUserRepository.findOne.mockImplementation(
        ({ where }: { where: { user_id: string } }) =>
          Promise.resolve(
            where.user_id === mockAdminPrincipal.user_id
              ? mockAdminUser
              : targetUser,
          ),
      );
      mockUserRepository.save.mockImplementation((user: User) =>
        Promise.resolve(user),
      );

      const result = await service.updateStatus(
        mockAdminPrincipal,
        targetUser.user_id,
        {
          status: UserStatus.SUSPENDED,
          reason: 'Nghi vấn gian lận vé',
        },
      );

      expect(mockRefreshSessionService.revokeAll).toHaveBeenCalledWith(
        targetUser.user_id,
      );
      expect(result.status).toBe(UserStatus.SUSPENDED);
    });

    it('USR-STS-002: Tự khóa tài khoản chính mình bị ném ForbiddenException', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockAdminUser);

      await expect(
        service.updateStatus(mockAdminPrincipal, mockAdminPrincipal.user_id, {
          status: UserStatus.SUSPENDED,
          reason: 'Tự khóa',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('USR-STS-003: Cố ý khóa tài khoản Admin bị ném ForbiddenException', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockAdminUser);

      await expect(
        service.updateStatus(mockModPrincipal, mockAdminUser.user_id, {
          status: UserStatus.SUSPENDED,
          reason: 'Khóa admin',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('USR-STS-005: Khóa ID user không tồn tại ném NotFoundException', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(mockAdminPrincipal, 'usr_unknown', {
          status: UserStatus.SUSPENDED,
          reason: 'Lỗi',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
