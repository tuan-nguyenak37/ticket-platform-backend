import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../users/enums/user-role.enum';
import { TokenService } from './token.service';

describe('JWT token lifecycle', () => {
  const jwt = new JwtService();
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'unit-access-secret-not-for-real-deployment',
    JWT_REFRESH_SECRET: 'unit-refresh-secret-not-for-real-deployment',
    JWT_ACCESS_EXPIRES: '15m',
    JWT_REFRESH_EXPIRES: '7d',
  });
  const tokens = new TokenService(jwt, config);

  function payload() {
    return {
      user_id: 'user_example',
      email: 'user@example.com',
      full_name: 'Example User',
      role: UserRole.USER,
      sessionId: '3d15fda9-f367-40c5-a9a3-ac1adce7f3e6',
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 120,
    };
  }

  it('caps both token expirations at the absolute session deadline', async () => {
    const owner = payload();
    const pair = await tokens.generateTokens(owner);
    expect(jwt.decode<{ exp: number }>(pair.accessToken).exp).toBe(
      owner.sessionExpiresAt,
    );
    expect(jwt.decode<{ exp: number }>(pair.refreshToken).exp).toBe(
      owner.sessionExpiresAt,
    );
  });

  it('generates distinct refresh tokens even within the same second', async () => {
    const owner = payload();
    const first = await tokens.generateRefreshToken(owner);
    const second = await tokens.generateRefreshToken(owner);
    expect(first).not.toBe(second);
  });

  it('does not accept a refresh token as an access token', async () => {
    const refresh = await tokens.generateRefreshToken(payload());
    await expect(tokens.verifyAccessToken(refresh)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('returns a distinct error code for an expired access token', async () => {
    const expired = await jwt.signAsync(
      { ...payload(), tokenType: 'access' },
      { secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: -1 },
    );
    await expect(tokens.verifyAccessToken(expired)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTH_ACCESS_EXPIRED',
      }) as unknown,
    });
  });
});
