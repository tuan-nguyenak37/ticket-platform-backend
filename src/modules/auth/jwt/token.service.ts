import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { JwtPayload } from './jwt.interface';
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

  generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.sign(payload, 'refresh');
  }

  async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);
    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.verify(token, 'access');
  }

  verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.verify(token, 'refresh');
  }

  private sign(payload: JwtPayload, kind: 'access' | 'refresh') {
    const prefix = `JWT_${kind.toUpperCase()}`;
    return this.jwtService.signAsync(
      { ...payload, tokenType: kind },
      {
        secret: this.configService.getOrThrow<string>(`${prefix}_SECRET`),
        expiresIn: tokenLifetimeSeconds(
          this.configService.get<string>(`${prefix}_EXPIRES`) ??
            (kind === 'access' ? '15m' : '7d'),
        ),
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
        !Number.isInteger(payload.tokenVersion) ||
        payload.tokenVersion < 0 ||
        !Number.isFinite(payload.exp)
      ) {
        throw new Error('Invalid token payload');
      }
      return payload;
    } catch {
      throw new UnauthorizedException(`Invalid ${kind} token`);
    }
  }
}
