import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './refresh-cookie';
import {
  mockAuthUserPrincipal,
  mockRegisterDto,
  mockLoginDto,
  mockAuthTokens,
} from './test/auth.mock-data';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  beforeEach(async () => {
    authService = {
      create: jest.fn().mockResolvedValue({
        user_id: mockAuthUserPrincipal.user_id,
        email: mockRegisterDto.email,
        fullName: mockRegisterDto.fullName,
      }),
      login: jest.fn().mockResolvedValue({
        accessToken: mockAuthTokens.accessToken,
        refreshToken: mockAuthTokens.refreshToken,
        user: mockAuthTokens.user,
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new.mock.access.token',
        refreshToken: 'new.mock.refresh.token',
        user: mockAuthTokens.user,
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (register)', () => {
    it('calls authService.create with register DTO', async () => {
      const result = await controller.create(mockRegisterDto);
      expect(authService.create).toHaveBeenCalledWith(mockRegisterDto);
      expect(result.email).toBe(mockRegisterDto.email);
    });
  });

  describe('login', () => {
    it('logs in user, sets refresh cookie, and returns payload without refreshToken in body', async () => {
      let cookieName = '';
      let cookieVal = '';
      let cookieOpts: any = null;

      const mockRes = {
        cookie: jest.fn((name, val, opts) => {
          cookieName = name;
          cookieVal = val;
          cookieOpts = opts;
        }),
      } as unknown as Response;

      const result = await controller.login(mockLoginDto, mockRes);

      expect(authService.login).toHaveBeenCalledWith(mockLoginDto);
      expect(cookieName).toBe(REFRESH_COOKIE);
      expect(cookieVal).toBe(mockAuthTokens.refreshToken);
      expect(cookieOpts.httpOnly).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('refresh', () => {
    it('extracts token from cookie, sets updated cookie, and returns new tokens', async () => {
      let cookieVal = '';
      const mockReq = {
        cookies: {
          [REFRESH_COOKIE]: 'existing.refresh.cookie.token',
        },
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn((name, val) => {
          cookieVal = val;
        }),
      } as unknown as Response;

      const result = await controller.refresh(mockReq, mockRes);

      expect(authService.refresh).toHaveBeenCalledWith(
        'existing.refresh.cookie.token',
      );
      expect(cookieVal).toBe('new.mock.refresh.token');
      expect(result.accessToken).toBe('new.mock.access.token');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('handles missing cookie gracefully by passing empty string', async () => {
      const mockReq = { cookies: {} } as unknown as Request;
      const mockRes = { cookie: jest.fn() } as unknown as Response;

      await controller.refresh(mockReq, mockRes);

      expect(authService.refresh).toHaveBeenCalledWith('');
    });
  });

  describe('logout', () => {
    it('revokes session and clears refresh cookie', async () => {
      let clearedCookieName = '';
      const mockRes = {
        clearCookie: jest.fn((name) => {
          clearedCookieName = name;
        }),
      } as unknown as Response;

      const result = await controller.logout(mockAuthUserPrincipal, mockRes);

      expect(authService.logout).toHaveBeenCalledWith(mockAuthUserPrincipal);
      expect(clearedCookieName).toBe(REFRESH_COOKIE);
      expect(result).toEqual({ success: true });
    });
  });
});
