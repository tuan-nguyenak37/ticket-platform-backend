import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { tokenLifetimeSeconds } from '../../../config/token-lifetime';

describe('TokenService', () => {
  const jwt = new JwtService();
  const accessSecret = 'test-access-secret';
  const refreshSecret = 'test-refresh-secret';
  const service = new TokenService(
    jwt,
    new ConfigService({
      JWT_ACCESS_SECRET: accessSecret,
      JWT_REFRESH_SECRET: refreshSecret,
      JWT_ACCESS_EXPIRES: '15m',
      JWT_REFRESH_EXPIRES: '7d',
    }),
  );
  const payload = {
    user_id: 'user_test',
    email: 'test@example.com',
    role: 'user',
    fullName: null,
    tokenVersion: 1,
  };

  it('signs and verifies both tokens with the configured lifetime', async () => {
    const pair = await service.generateTokens(payload);
    const access = await jwt.verifyAsync<{ exp: number; iat: number }>(
      pair.accessToken,
      { secret: accessSecret },
    );
    const refresh = await jwt.verifyAsync<{ exp: number; iat: number }>(
      pair.refreshToken,
      { secret: refreshSecret },
    );
    expect(access.exp - access.iat).toBe(900);
    expect(refresh.exp - refresh.iat).toBe(604800);
    expect(await service.verifyAccessToken(pair.accessToken)).toMatchObject(
      payload,
    );
    expect(await service.verifyRefreshToken(pair.refreshToken)).toMatchObject(
      payload,
    );
    await expect(service.verifyAccessToken(pair.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verifyRefreshToken(pair.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns 401 for expired and malformed tokens', async () => {
    const token = await jwt.signAsync(
      { ...payload, tokenType: 'access' },
      { secret: accessSecret, expiresIn: -1 },
    );
    await expect(service.verifyAccessToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verifyRefreshToken('broken')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects signed tokens with missing session claims', async () => {
    const token = await jwt.signAsync(
      { user_id: 'user_test', tokenType: 'access' },
      { secret: accessSecret, expiresIn: 60 },
    );
    await expect(service.verifyAccessToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each(['0', '-1', '15minutes', 'abc', '1.5h'])(
    'rejects invalid lifetime %s',
    (value) => {
      expect(() => tokenLifetimeSeconds(value)).toThrow();
    },
  );
});
