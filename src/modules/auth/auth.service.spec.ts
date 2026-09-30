import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './jwt/token.service';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { hashPassword } from '../../common/utils/password.util';

describe('AuthService', () => {
  let service: AuthService;
  let user: User;
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    rotateTokenVersion: jest.fn(),
  };
  const tokens = { generateTokens: jest.fn(), verifyRefreshToken: jest.fn() };

  beforeAll(async () => {
    user = Object.assign(new User(), {
      user_id: 'user_test',
      email: 'person@example.com',
      password: await hashPassword('abcdef'),
      fullName: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      tokenVersion: 0,
    });
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    users.findByEmail.mockResolvedValue(user);
    users.findById.mockResolvedValue(user);
    users.rotateTokenVersion.mockResolvedValue(1);
    tokens.generateTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: TokenService, useValue: tokens },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('issues tokens with a nullable fullName and omits private fields', async () => {
    const result = await service.login({
      email: user.email,
      password: 'abcdef',
    });
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('tokenVersion');
    expect(tokens.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: null, tokenVersion: 1 }),
    );
    expect(users.rotateTokenVersion).toHaveBeenCalledWith(user, true);
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.DELETED])(
    'rejects %s accounts',
    async (status) => {
      users.findByEmail.mockResolvedValue({ ...user, status });
      await expect(
        service.login({ email: user.email, password: 'abcdef' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokens.generateTokens).not.toHaveBeenCalled();
    },
  );

  it('rejects an incorrect password', async () => {
    await expect(
      service.login({ email: user.email, password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokens.generateTokens).not.toHaveBeenCalled();
  });

  it('rejects a reused refresh token', async () => {
    tokens.verifyRefreshToken.mockResolvedValue({
      user_id: user.user_id,
      tokenVersion: -1,
    });
    await expect(service.refresh('old')).rejects.toThrow(UnauthorizedException);
    expect(users.rotateTokenVersion).not.toHaveBeenCalled();
  });

  it('does not invalidate a session if signing fails', async () => {
    tokens.generateTokens.mockRejectedValue(new Error('sign failed'));
    await expect(
      service.login({ email: user.email, password: 'abcdef' }),
    ).rejects.toThrow('sign failed');
    expect(users.rotateTokenVersion).not.toHaveBeenCalled();
  });
});
