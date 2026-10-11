import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import {
  mockAdminPrincipal,
  mockUserPrincipal,
  mockValidCreateUserDto,
  mockValidUpdateUserDto,
  mockValidChangePasswordDto,
} from './test/users.mock-data';
import { publicUser } from '../../common/utils/public-user';
import { createMockUser } from './test/users.mock-data';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<Partial<UsersService>>;

  const mockPublicProfile = publicUser(createMockUser());

  beforeEach(async () => {
    service = {
      getProfile: jest.fn().mockResolvedValue(mockPublicProfile),
      updateProfile: jest.fn().mockResolvedValue(mockPublicProfile),
      changePassword: jest.fn().mockResolvedValue({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      }),
      createForAdmin: jest.fn().mockResolvedValue(mockPublicProfile),
      findAll: jest.fn().mockResolvedValue([mockPublicProfile]),
      findOne: jest.fn().mockResolvedValue(mockPublicProfile),
      update: jest.fn().mockResolvedValue(mockPublicProfile),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('me (GET /api/users/me)', () => {
    it('returns the profile of the authenticated user', async () => {
      const result = await controller.me(mockUserPrincipal);
      expect(service.getProfile).toHaveBeenCalledWith(mockUserPrincipal);
      expect(result).toBe(mockPublicProfile);
    });
  });

  describe('updateMe (PATCH /api/users/me)', () => {
    it('updates own profile and returns updated user', async () => {
      const result = await controller.updateMe(
        mockUserPrincipal,
        mockValidUpdateUserDto,
      );
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUserPrincipal,
        mockValidUpdateUserDto,
      );
      expect(result).toBe(mockPublicProfile);
    });
  });

  describe('changePassword (PATCH /api/users/me/password)', () => {
    it('changes password, clears refresh cookie, and returns success message', async () => {
      const mockResponse = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.changePassword(
        mockUserPrincipal,
        mockValidChangePasswordDto,
        mockResponse,
      );

      expect(service.changePassword).toHaveBeenCalledWith(
        mockUserPrincipal,
        mockValidChangePasswordDto,
      );
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        expect.objectContaining({ path: '/api/auth' }),
      );
      expect(result).toEqual({
        message: 'Đổi mật khẩu thành công, hãy đăng nhập lại',
      });
    });
  });

  describe('create (POST /api/users)', () => {
    it('calls usersService.createForAdmin with admin principal and dto', async () => {
      const result = await controller.create(
        mockAdminPrincipal,
        mockValidCreateUserDto,
      );
      expect(service.createForAdmin).toHaveBeenCalledWith(
        mockAdminPrincipal,
        mockValidCreateUserDto,
      );
      expect(result).toBe(mockPublicProfile);
    });
  });

  describe('findAll (GET /api/users)', () => {
    it('returns list of users for admin', async () => {
      const result = await controller.findAll(mockAdminPrincipal);
      expect(service.findAll).toHaveBeenCalledWith(mockAdminPrincipal);
      expect(result).toEqual([mockPublicProfile]);
    });
  });

  describe('findOne (GET /api/users/:id)', () => {
    it('returns detail of a user by id for admin', async () => {
      const result = await controller.findOne(mockAdminPrincipal, 'usr_123');
      expect(service.findOne).toHaveBeenCalledWith(mockAdminPrincipal, 'usr_123');
      expect(result).toBe(mockPublicProfile);
    });
  });

  describe('update (PATCH /api/users/:id)', () => {
    it('updates user fullName by id for admin', async () => {
      const result = await controller.update(
        mockAdminPrincipal,
        'usr_123',
        mockValidUpdateUserDto,
      );
      expect(service.update).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'usr_123',
        mockValidUpdateUserDto,
      );
      expect(result).toBe(mockPublicProfile);
    });
  });
});
