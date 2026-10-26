import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { TokenService } from './token.service';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { resolvePolicy } from '../authorization/access-policy';
import { AuditService } from '../authorization/audit.service';
import { RefreshSessionService } from '../../../common/security/refresh-session.service';
import type { AuthorizedRequest } from '../authorization/principal';

export type AuthenticatedRequest = AuthorizedRequest;
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly sessions: RefreshSessionService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    try {
      const policy = resolvePolicy(
        this.reflector,
        context.getHandler(),
        context.getClass(),
      );
      if (!policy || policy.kind === 'invalid')
        throw new ForbiddenException(
          'Route chưa có chính sách truy cập hợp lệ',
        );
      if (policy.kind === 'public') return true;
      if (
        policy.kind === 'optional' &&
        request.headers.authorization === undefined
      )
        return true;
      const match = /^Bearer\s+(\S+)$/i.exec(
        request.headers.authorization ?? '',
      );
      if (!match) throw new UnauthorizedException('Thiếu phiên đăng nhập');
      const payload = await this.tokens.verifyAccessToken(match[1]);
      const sessionValid = await this.sessions.exists(payload);
      if (!sessionValid) {
        throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
      }
      const user = await this.users.findById(payload.user_id);
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
      }
      request.user = {
        user_id: user.user_id,
        role: user.role,
        status: user.status,
        sessionId: payload.sessionId,
      };
      return true;
    } catch (error) {
      if (error instanceof HttpException)
        this.audit.record({
          requestId: request.requestId ?? randomUUID(),
          actorId: request.user?.user_id,
          action: 'authentication.denied',
          result: 'denied',
          statusCode: error.getStatus(),
        });
      throw error;
    }
  }
}
