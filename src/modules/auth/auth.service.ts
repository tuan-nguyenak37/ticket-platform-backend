import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { RegisterDto } from './dto/create-auth.dto';
import { comparePassword } from '../../common/utils/password.util';
import { publicUser } from '../../common/utils/public-user';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { LoginDto } from './dto/login-auth.dto';
import { TokenService } from './jwt/token.service';
import { JwtPayload } from './jwt/jwt.interface';
import type { Principal } from './authorization/principal';
import { RefreshSessionService } from '../../common/security/refresh-session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly sessions: RefreshSessionService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: RegisterDto) {
    return publicUser(await this.users.create(dto));
  }

  private async withPassword<T>(
    dto: LoginDto,
    action: (user: User) => Promise<T>,
  ) {
    const email = dto.email.trim().toLowerCase();
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { email },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user ||
        !(await comparePassword(dto.password, user.password_hash)) ||
        user.status !== UserStatus.ACTIVE
      ) {
        throw new UnauthorizedException(
          'Sai tài khoản, mật khẩu hoặc tài khoản đã bị khóa',
        );
      }
      return action(user);
    });
  }

  async login(dto: LoginDto, previousRefreshToken?: string) {
    return this.withPassword(dto, async (user) => {
      if (previousRefreshToken) await this.browserLogout(previousRefreshToken);
      const payload = this.createPayload(user, randomUUID());
      const tokens = await this.tokens.generateTokens(payload);
      await this.sessions.register(
        payload,
        tokens.refreshToken,
        payload.sessionExpiresAt! - Math.floor(Date.now() / 1000),
      );
      return { ...tokens, user: publicUser(user) };
    });
  }

  async browserProfile(refreshToken: string) {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    await this.sessions.validateRefresh(payload, refreshToken);
    const user = await this.users.findById(payload.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    return { user: publicUser(user) };
  }

  async browserLogout(refreshToken: string) {
    try {
      const payload = await this.tokens.verifyRefreshToken(refreshToken);
      await this.sessions.revoke(payload);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    return { message: 'Đăng xuất thành công' };
  }

  async refresh(refreshToken: string) {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.users.findById(payload.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    const sessionExpiresAt =
      payload.sessionExpiresAt ?? (payload as { exp?: number }).exp;
    const tokens = await this.tokens.generateTokens(
      this.createPayload(user, payload.sessionId, sessionExpiresAt),
    );
    await this.sessions.rotateRefresh(
      payload,
      refreshToken,
      tokens.refreshToken,
      (sessionExpiresAt ??
        Math.floor(Date.now() / 1000) + this.tokens.refreshLifetimeSeconds()) -
        Math.floor(Date.now() / 1000),
    );
    return { ...tokens, user: publicUser(user) };
  }

  async logout(user: Principal) {
    await this.sessions.revoke(user);
    return { message: 'Đăng xuất thành công' };
  }

  private createPayload(
    user: User,
    sessionId: string,
    sessionExpiresAt = Math.floor(Date.now() / 1000) +
      this.tokens.refreshLifetimeSeconds(),
  ): JwtPayload {
    return {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      sessionId,
      sessionExpiresAt,
    };
  }
}
