import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './jwt/token.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { hashPassword } from '../../common/utils/password.util';
import type { Principal } from './authorization/principal';

describe('AuthService', () => {
  let service: AuthService;
  let mockUser: User;

  const mockUsersService = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };

  const mockTokenService = {
    generateTokens: jest.fn(),
    verifyRefreshToken: jest.fn(),
    refreshLifetimeSeconds: jest.fn(),
  };

  const mockRefreshSessionService = {
    register: jest.fn(),
    rotateRefresh: jest.fn(),
    validateRefresh: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockEntityManager = {
    getRepository: jest.fn().mockReturnValue(mockUserRepository),
  };

  const mockDataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb(mockEntityManager),
    ),
  };

  beforeAll(async () => {
    mockUser = Object.assign(new User(), {
      user_id: 'usr_test_001',
      email: 'test@example.com',
      full_name: 'Nguyễn Văn Test',
      password_hash: await hashPassword('Password123@'),
      phone_number: '0987654321',
      avatar_url: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTokenService.refreshLifetimeSeconds.mockReturnValue(604800);
    mockTokenService.generateTokens.mockResolvedValue({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: RefreshSessionService, useValue: mockRefreshSessionService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('create (Register)', () => {
    it('AUTH-REG-001: Đăng ký thành công và trả về public user (không lộ password_hash)', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await service.create({
        email: 'new@example.com',
        password: 'Password123@',
        fullName: 'Nguyễn Văn Test',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'Password123@',
        fullName: 'Nguyễn Văn Test',
      });
      expect(result).toHaveProperty('user_id', mockUser.user_id);
      expect(result).toHaveProperty('email', mockUser.email);
      expect(result).not.toHaveProperty('password_hash');
    });
  });

  describe('login', () => {
    it('AUTH-LOG-001: Đăng nhập đúng thông tin -> cấp tokens và đăng ký session', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123@',
      });

      expect(result).toHaveProperty('accessToken', 'mock_access_token');
      expect(result).toHaveProperty('refreshToken', 'mock_refresh_token');
      expect(result.user).not.toHaveProperty('password_hash');
      expect(mockRefreshSessionService.register).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: mockUser.user_id }),
        'mock_refresh_token',
        604800,
      );
    });

    it('AUTH-LOG-002: Sai mật khẩu -> ném lỗi UnauthorizedException', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword999@',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
      expect(mockRefreshSessionService.register).not.toHaveBeenCalled();
    });

    it('AUTH-LOG-003: Email không tồn tại -> ném lỗi UnauthorizedException', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'notfound@example.com',
          password: 'Password123@',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('AUTH-LOG-004: Tài khoản bị tạm khóa (SUSPENDED) -> ném lỗi UnauthorizedException', async () => {
      const suspendedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      mockUserRepository.findOne.mockResolvedValue(suspendedUser);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Password123@',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('AUTH-REF-001: Refresh token hợp lệ -> cấp tokens mới và xoay vòng session', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue({
        user_id: mockUser.user_id,
        sessionId: 'session_123',
      });
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await service.refresh('valid_refresh_token');

      expect(result).toHaveProperty('accessToken', 'mock_access_token');
      expect(result).toHaveProperty('refreshToken', 'mock_refresh_token');
      expect(mockRefreshSessionService.rotateRefresh).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: mockUser.user_id }),
        'valid_refresh_token',
        'mock_refresh_token',
        604800,
      );
    });

    it('AUTH-REF-005: User không còn active khi refresh -> ném lỗi UnauthorizedException', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue({
        user_id: mockUser.user_id,
        sessionId: 'session_123',
      });
      mockUsersService.findById.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        service.refresh('valid_token_but_suspended'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshSessionService.rotateRefresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('AUTH-OUT-001: Đăng xuất thu hồi session của người dùng', async () => {
      const actor: Principal = {
        user_id: mockUser.user_id,
        role: mockUser.role,
        sessionId: 'sess_1',
        status: mockUser.status,
      };

      const result = await service.logout(actor);

      expect(mockRefreshSessionService.revoke).toHaveBeenCalledWith(actor);
      expect(result).toEqual({ message: 'Đăng xuất thành công' });
    });
  });

  it('refresh preserves the original absolute session deadline', async () => {
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 120;
    mockTokenService.verifyRefreshToken.mockResolvedValue({
      user_id: mockUser.user_id,
      sessionId: 'session_123',
      sessionExpiresAt,
    });
    mockUsersService.findById.mockResolvedValue(mockUser);
    await service.refresh('current');
    expect(mockTokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ sessionExpiresAt }),
    );
    expect(mockRefreshSessionService.rotateRefresh).toHaveBeenCalledWith(
      expect.anything(),
      'current',
      'mock_refresh_token',
      expect.any(Number),
    );
  });

  it('SSR validates the current refresh digest without issuing or rotating tokens', async () => {
    mockTokenService.verifyRefreshToken.mockResolvedValue({
      user_id: mockUser.user_id,
      sessionId: 'session_123',
    });
    mockUsersService.findById.mockResolvedValue(mockUser);
    const result = await service.browserProfile('current');
    expect(result.user.user_id).toBe(mockUser.user_id);
    expect(mockRefreshSessionService.validateRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: mockUser.user_id }),
      'current',
    );
    expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    expect(mockRefreshSessionService.rotateRefresh).not.toHaveBeenCalled();
  });
});
