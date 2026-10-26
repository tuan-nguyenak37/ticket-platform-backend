import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { JwtPayload } from './jwt.interface';
import { UserRole } from '../../users/enums/user-role.enum';
import { tokenLifetimeSeconds } from '../../../config/token-lifetime';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.sign(payload, 'access');
  }

  refreshLifetimeSeconds() {
    return tokenLifetimeSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES', '7d'),
    );
  }

  accessLifetimeSeconds() {
    return tokenLifetimeSeconds(
      this.configService.get<string>('JWT_ACCESS_EXPIRES', '15m'),
    );
  }

  generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.sign(payload, 'refresh');
  }

  async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(
        this.jwtService.decode<{ exp: number }>(accessToken).exp * 1000,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        this.jwtService.decode<{ exp: number }>(refreshToken).exp * 1000,
      ).toISOString(),
    };
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.verify(token, 'access');
  }

  verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.verify(token, 'refresh');
  }

  private sign(payload: JwtPayload, kind: 'access' | 'refresh') {
    const prefix = `JWT_${kind.toUpperCase()}`;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Math.min(
      now +
        (kind === 'access'
          ? this.accessLifetimeSeconds()
          : this.refreshLifetimeSeconds()),
      payload.sessionExpiresAt ?? now + this.refreshLifetimeSeconds(),
    );
    if (expiresAt <= now)
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    return this.jwtService.signAsync(
      { ...payload, tokenType: kind, exp: expiresAt },
      {
        secret: this.configService.getOrThrow<string>(`${prefix}_SECRET`),
        algorithm: 'HS256',
        jwtid: randomUUID(),
      },
    );
  }

  private async verify(token: string, kind: 'access' | 'refresh') {
    const secret = this.configService.getOrThrow<string>(
      `JWT_${kind.toUpperCase()}_SECRET`,
    );
    try {
      const payload = await this.jwtService.verifyAsync<
        JwtPayload & { tokenType: string; exp: number }
      >(token, { secret, algorithms: ['HS256'] });
      if (
        payload.tokenType !== kind ||
        typeof payload.user_id !== 'string' ||
        !payload.user_id ||
        typeof payload.email !== 'string' ||
        !payload.email ||
        typeof payload.full_name !== 'string' ||
        !Object.values(UserRole).includes(payload.role) ||
        typeof payload.sessionId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.sessionId,
        ) ||
        !Number.isFinite(payload.exp) ||
        (payload.sessionExpiresAt !== undefined &&
          (!Number.isInteger(payload.sessionExpiresAt) ||
            payload.exp > payload.sessionExpiresAt))
      ) {
        throw new Error('Invalid token payload');
      }
      return payload;
    } catch (error) {
      if (
        kind === 'access' &&
        error instanceof Error &&
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException({
          message: 'Access token đã hết hạn',
          code: 'AUTH_ACCESS_EXPIRED',
        });
      }
      throw new UnauthorizedException(`Invalid ${kind} token`);
    }
  }
}
