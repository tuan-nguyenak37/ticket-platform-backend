import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import type { Principal } from './principal';

export function assertUserAdministrator(actor: Principal): void {
  if (actor.status !== UserStatus.ACTIVE || actor.role !== UserRole.ADMIN) {
    throw new ForbiddenException('Chỉ quản trị viên được quản lý người dùng');
  }
}
