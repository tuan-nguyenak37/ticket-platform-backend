import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './refresh-cookie';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import type { Principal } from './authorization/principal';
import type { AuthenticatedRequest } from './jwt/access-token.guard';

describe('AuthController', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  const request = {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  } as AuthenticatedRequest;
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockPrincipal: Principal & { email: string; full_name: string } = {
    user_id: 'usr_mock_001',
    email: 'user@example.com',
    role: UserRole.USER,
    full_name: 'Nguyễn Văn A',
    sessionId: 'session_abc',
    status: UserStatus.ACTIVE,
  };

  beforeEach(async () => {
    authService = {
      create: jest.fn().mockResolvedValue({
        user_id: mockPrincipal.user_id,
        email: mockPrincipal.email,
        full_name: mockPrincipal.full_name,
        role: mockPrincipal.role,
        status: mockPrincipal.status,
      }),
      login: jest.fn().mockResolvedValue({
        accessToken: 'mock_jwt_access',
        refreshToken: 'mock_jwt_refresh',
        refreshTokenExpiresAt: new Date(Date.now() + 604800_000).toISOString(),
        accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        user: {
          user_id: mockPrincipal.user_id,
          email: mockPrincipal.email,
          full_name: mockPrincipal.full_name,
        },
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new_jwt_access',
        refreshToken: 'new_jwt_refresh',
        refreshTokenExpiresAt: new Date(Date.now() + 604800_000).toISOString(),
        accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        user: {
          user_id: mockPrincipal.user_id,
          email: mockPrincipal.email,
        },
      }),
      logout: jest.fn().mockResolvedValue({ message: 'Đăng xuất thành công' }),
      browserLogout: jest
        .fn()
        .mockResolvedValue({ message: 'Đăng xuất thành công' }),
      browserProfile: jest.fn().mockResolvedValue({ user: mockPrincipal }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_REFRESH_EXPIRES: '7d' }),
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('controller should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rejects a legacy refresh request without an allowed Origin', async () => {
    const response = { cookie: jest.fn() } as unknown as Response;
    const invalidRequest = {
      method: 'POST',
      headers: {},
      cookies: { [REFRESH_COOKIE]: 'current' },
    } as unknown as AuthenticatedRequest;
    await expect(
      controller.refresh(invalidRequest, response),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('does not set or clear cookies after a browser refresh conflict', async () => {
    authService.refresh!.mockRejectedValue(
      new ConflictException({
        code: 'AUTH_REFRESH_CONFLICT',
      }),
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const currentRequest = {
      ...request,
      cookies: { ticketverse_refresh: 'used-token' },
    } as unknown as AuthenticatedRequest;
    await expect(
      controller.browserRefresh(currentRequest, response),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('browser login and refresh hide refresh credentials and set root HttpOnly cookies', async () => {
    const cookie = jest.fn();
    const response = { cookie, clearCookie: jest.fn() } as unknown as Response;
    const request = {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      cookies: { ticketverse_refresh: 'old' },
    } as unknown as AuthenticatedRequest;
    const login = await controller.browserLogin(
      { email: mockPrincipal.email, password: 'password' },
      request,
      response,
    );
    expect(login).not.toHaveProperty('refreshToken');
    expect(login).not.toHaveProperty('refreshTokenExpiresAt');
    expect(cookie).toHaveBeenCalledWith(
      'ticketverse_refresh',
      'mock_jwt_refresh',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' }),
    );
    await controller.browserRefresh(request, response);
    expect(authService.refresh).toHaveBeenCalledWith('old');
    await controller.browserLogout(request, response);
    expect(authService.browserLogout).toHaveBeenCalledWith('old');
  });

  describe('create (register)', () => {
    it('AUTH-REG-001: Gọi authService.create và trả về user mới', async () => {
      const dto = {
        email: 'user@example.com',
        password: 'Password123@',
        fullName: 'Nguyễn Văn A',
      };
      const result = await controller.create(dto);

      expect(authService.create).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('user_id', mockPrincipal.user_id);
      expect(result).toHaveProperty('email', dto.email);
    });
  });

  describe('login', () => {
    it('AUTH-LOG-001: Đăng nhập thành công, set cookie refresh_token, trả về accessToken và user', async () => {
      let setCookieName = '';
      let setCookieVal = '';
      let setCookieOpts: CookieOptions = {};

      const mockRes = {
        cookie: jest.fn((name: string, val: string, opts: CookieOptions) => {
          setCookieName = name;
          setCookieVal = val;
          setCookieOpts = opts;
        }),
      } as unknown as Response;

      const dto = { email: 'user@example.com', password: 'Password123@' };
      const result = await controller.login(dto, mockRes, request);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(setCookieName).toBe(REFRESH_COOKIE);
      expect(setCookieVal).toBe('mock_jwt_refresh');
      expect(setCookieOpts.httpOnly).toBe(true);
      expect(result).toHaveProperty('accessToken', 'mock_jwt_access');
      expect(result).toHaveProperty('user');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('refresh', () => {
    it('AUTH-REF-001: Đọc refresh_token từ cookie, set cookie mới, trả về accessToken mới', async () => {
      let setCookieVal = '';
      const mockReq = {
        ...request,
        cookies: {
          [REFRESH_COOKIE]: 'current_cookie_token',
        },
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        cookie: jest.fn((_name: string, val: string) => {
          setCookieVal = val;
        }),
      } as unknown as Response;

      const result = await controller.refresh(mockReq, mockRes);

      expect(authService.refresh).toHaveBeenCalledWith('current_cookie_token');
      expect(setCookieVal).toBe('new_jwt_refresh');
      expect(result).toHaveProperty('accessToken', 'new_jwt_access');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('AUTH-REF-002: Khi request không có cookie thì truyền chuỗi rỗng', async () => {
      const mockReq = {
        ...request,
        cookies: {},
      } as unknown as AuthenticatedRequest;
      const mockRes = { cookie: jest.fn() } as unknown as Response;

      await controller.refresh(mockReq, mockRes);

      expect(authService.refresh).toHaveBeenCalledWith('');
    });
  });

  describe('logout', () => {
    it('AUTH-OUT-001: Gọi authService.logout và xóa cookie refresh_token', async () => {
      let clearedCookieName = '';
      const mockRes = {
        clearCookie: jest.fn((name: string) => {
          clearedCookieName = name;
        }),
      } as unknown as Response;

      const result = await controller.logout(mockPrincipal, mockRes, request);

      expect(authService.logout).toHaveBeenCalledWith(mockPrincipal);
      expect(clearedCookieName).toBe(REFRESH_COOKIE);
      expect(result).toEqual({ message: 'Đăng xuất thành công' });
    });
  });
});
