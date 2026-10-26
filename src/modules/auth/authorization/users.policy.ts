import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import type { Principal } from './principal';

export function assertUserAdministrator(actor: Principal): void {
  if (actor.status !== UserStatus.ACTIVE || actor.role !== UserRole.ADMIN) {
    throw new ForbiddenException('Chỉ quản trị viên được quản lý người dùng');
  }
}

export function assertAccountStatusManager(actor: Principal): void {
  if (
    actor.status !== UserStatus.ACTIVE ||
    ![UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role)
  ) {
    throw new ForbiddenException(
      'Chỉ quản trị viên và kiểm duyệt viên được đổi trạng thái tài khoản',
    );
  }
}
