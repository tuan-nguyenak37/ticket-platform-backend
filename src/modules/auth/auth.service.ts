import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/create-auth.dto';
import { comparePassword } from '../../common/utils/password.util';
import { publicUser } from '../../common/utils/public-user';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import { LoginDto } from './dto/login-auth.dto';
import { TokenService } from './jwt/token.service';
import { JwtPayload } from './jwt/jwt.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async create(dto: RegisterDto) {
    return publicUser(await this.users.create(dto));
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (
      !user ||
      !(await comparePassword(dto.password, user.password)) ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Sai tài khoản, mật khẩu hoặc tài khoản đã bị khóa',
      );
    }
    return this.issueTokens(user, true);
  }

  async refresh(refreshToken: string) {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.users.findById(payload.user_id);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    return this.issueTokens(user);
  }

  async logout(user: User) {
    await this.users.rotateTokenVersion(user);
    return { message: 'Đăng xuất thành công' };
  }

  private async issueTokens(user: User, login = false) {
    const payload: JwtPayload = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      tokenVersion: user.tokenVersion + 1,
    };
    // Sign first; a signing failure must not invalidate the current session.
    const tokens = await this.tokens.generateTokens(payload);
    await this.users.rotateTokenVersion(user, login);
    return { ...tokens, user: publicUser(user) };
  }
}
