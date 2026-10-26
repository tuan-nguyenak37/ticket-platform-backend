import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';
import type { Principal } from '../auth/authorization/principal';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<Partial<UsersService>>;

  const mockUserPrincipal: Principal & { email: string; full_name: string } = {
    user_id: 'usr_buyer_001',
    email: 'buyer@example.com',
    role: UserRole.USER,
    full_name: 'Nguyễn Văn Buyer',
    sessionId: 'sess_1',
    status: UserStatus.ACTIVE,
  };

  const mockAdminPrincipal: Principal & { email: string; full_name: string } = {
    user_id: 'usr_admin_001',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    full_name: 'Quản Trị Viên',
    sessionId: 'sess_2',
    status: UserStatus.ACTIVE,
  };

  beforeEach(async () => {
    usersService = {
      getProfile: jest.fn().mockResolvedValue({
        user_id: mockUserPrincipal.user_id,
        email: mockUserPrincipal.email,
        full_name: mockUserPrincipal.full_name,
        role: mockUserPrincipal.role,
        status: mockUserPrincipal.status,
      }),
      updateProfile: jest.fn().mockResolvedValue({
        user_id: mockUserPrincipal.user_id,
        email: mockUserPrincipal.email,
        full_name: 'Tên Đã Sửa',
      }),
      changePassword: jest.fn().mockResolvedValue({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      }),
      findAll: jest.fn().mockResolvedValue([
        { user_id: 'usr_1', email: 'u1@test.com' },
        { user_id: 'usr_2', email: 'u2@test.com' },
      ]),
      findOne: jest.fn().mockResolvedValue({
        user_id: 'usr_target',
        email: 'target@test.com',
      }),
      createForAdmin: jest.fn().mockResolvedValue({
        user_id: 'usr_created',
        email: 'created@test.com',
      }),
      update: jest.fn().mockResolvedValue({
        user_id: 'usr_target',
        full_name: 'Admin Update',
      }),
      updateStatus: jest.fn().mockResolvedValue({
        user_id: 'usr_target',
        status: UserStatus.SUSPENDED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('controller should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('me (getProfile)', () => {
    it('USR-PRF-001: Trả về thông tin cá nhân của người dùng hiện tại', async () => {
      const result = await controller.getProfile(mockUserPrincipal);
      expect(usersService.getProfile).toHaveBeenCalledWith(mockUserPrincipal);
      expect(result.user_id).toBe(mockUserPrincipal.user_id);
    });
  });

  describe('updateMe (updateProfile)', () => {
    it('USR-UPD-001: Cập nhật thông tin hồ sơ của chính mình', async () => {
      const dto = { full_name: 'Tên Đã Sửa' };
      const result = await controller.updateMe(mockUserPrincipal, dto);
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        mockUserPrincipal,
        dto,
      );
      expect(result.full_name).toBe('Tên Đã Sửa');
    });
  });

  describe('changePassword', () => {
    it('USR-PWD-001: Đổi mật khẩu thành công và dọn dẹp cookie refresh_token', async () => {
      let clearedCookieName = '';
      const mockRes = {
        clearCookie: jest.fn((name: string) => {
          clearedCookieName = name;
        }),
      } as unknown as Response;

      const dto = {
        currentPassword: 'Password123@',
        newPassword: 'NewPassword456@',
      };
      const result = await controller.changePassword(
        mockUserPrincipal,
        dto,
        mockRes,
      );

      expect(usersService.changePassword).toHaveBeenCalledWith(
        mockUserPrincipal,
        dto,
      );
      expect(clearedCookieName).toBe(REFRESH_COOKIE);
      expect(result).toEqual({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      });
    });
  });

  describe('Admin actions (findAll, findOne, create, update)', () => {
    it('USR-ADM-001: Admin lấy toàn bộ danh sách users', async () => {
      const result = await controller.findAll(mockAdminPrincipal);
      expect(usersService.findAll).toHaveBeenCalledWith(mockAdminPrincipal);
      expect(result).toHaveLength(2);
    });

    it('USR-ADM-003: Admin xem chi tiết một user', async () => {
      const result = await controller.findOne(mockAdminPrincipal, 'usr_target');
      expect(usersService.findOne).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'usr_target',
      );
      expect(result.user_id).toBe('usr_target');
    });

    it('USR-ADM-005: Admin tạo tài khoản mới', async () => {
      const dto = {
        email: 'created@test.com',
        password: 'Password123@',
        fullName: 'Admin Tạo',
      };
      const result = await controller.create(mockAdminPrincipal, dto);
      expect(usersService.createForAdmin).toHaveBeenCalledWith(
        mockAdminPrincipal,
        dto,
      );
      expect(result.email).toBe('created@test.com');
    });

    it('USR-ADM-007: Admin cập nhật thông tin user', async () => {
      const dto = { full_name: 'Admin Update' };
      const result = await controller.update(
        mockAdminPrincipal,
        'usr_target',
        dto,
      );
      expect(usersService.update).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'usr_target',
        dto,
      );
      expect(result.full_name).toBe('Admin Update');
    });
  });

  describe('updateStatus', () => {
    it('USR-STS-001: Khóa tài khoản user qua controller', async () => {
      const params = { id: 'usr_target' };
      const dto = { status: UserStatus.SUSPENDED, reason: 'Nghi vấn lừa đảo' };

      const result = await controller.updateStatus(
        mockAdminPrincipal,
        params,
        dto,
      );

      expect(usersService.updateStatus).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'usr_target',
        dto,
      );
      expect(result.status).toBe(UserStatus.SUSPENDED);
    });
  });
});
