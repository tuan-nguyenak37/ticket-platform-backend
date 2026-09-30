import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/jwt/access-token.guard';
import { UserRole } from './entities/enums/user-role.enum';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên được quản lý người dùng');
    }
    return true;
  }
}
