import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums/user-role.enum';
import { UserStatus } from '../entities/enums/user-status.enum';
import type { Principal } from '../../auth/authorization/principal';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

// Mật khẩu bcrypt mẫu cho 'Password123@'
export const MOCK_HASHED_PASSWORD =
  '$2b$10$e8wBdfg4X9Jz1qYyHqEheO8E6yN.771QkWJ0jH22g9B.0M8p8eZeq';

export function createMockUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.user_id = 'usr_regular_001';
  user.email = 'user.buyer@ticketplatform.test';
  user.phone = '+84987654321';
  user.password = MOCK_HASHED_PASSWORD;
  user.tokenVersion = 1;
  user.fullName = 'Nguyễn Văn A';
  user.avatarUrl = 'https://example.com/avatar1.jpg';
  user.role = UserRole.USER;
  user.status = UserStatus.ACTIVE;
  user.emailVerified = true;
  user.phoneVerified = true;
  user.identityVerified = false;
  user.reputationScore = 100;
  user.successfulSales = 5;
  user.successfulBuys = 12;
  user.disputeCount = 0;
  user.lastLoginAt = new Date('2026-03-01T10:00:00.000Z');
  user.createdAt = new Date('2026-01-01T00:00:00.000Z');
  user.updatedAt = new Date('2026-03-01T10:00:00.000Z');
  return Object.assign(user, overrides);
}

export const mockRegularUser = createMockUser();

export const mockAdminUser = createMockUser({
  user_id: 'usr_admin_999',
  email: 'admin@ticketplatform.test',
  fullName: 'Quản trị viên Hệ thống',
  role: UserRole.ADMIN,
  tokenVersion: 0,
});

export const mockSuspendedUser = createMockUser({
  user_id: 'usr_suspended_002',
  email: 'suspended.user@ticketplatform.test',
  fullName: 'Người dùng Bị Đình Chỉ',
  status: UserStatus.SUSPENDED,
});

export const mockBannedUser = createMockUser({
  user_id: 'usr_banned_003',
  email: 'banned.user@ticketplatform.test',
  fullName: 'Người dùng Bị Cấm',
  status: UserStatus.BANNED,
});

export const mockDeletedUser = createMockUser({
  user_id: 'usr_deleted_004',
  email: 'deleted.user@ticketplatform.test',
  fullName: 'Người dùng Đã Xóa',
  status: UserStatus.DELETED,
});

export const mockUserPrincipal: Principal = {
  user_id: mockRegularUser.user_id,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: mockRegularUser.tokenVersion,
};

export const mockAdminPrincipal: Principal = {
  user_id: mockAdminUser.user_id,
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  tokenVersion: mockAdminUser.tokenVersion,
};

export const mockSuspendedPrincipal: Principal = {
  user_id: mockSuspendedUser.user_id,
  role: UserRole.USER,
  status: UserStatus.SUSPENDED,
  tokenVersion: mockSuspendedUser.tokenVersion,
};

export const mockValidCreateUserDto: CreateUserDto = {
  email: 'newuser@ticketplatform.test',
  password: 'Password123@',
  fullName: 'Lê Thị Mới',
};

export const mockValidUpdateUserDto: UpdateUserDto = {
  fullName: 'Nguyễn Văn B Sau Cập Nhật',
};

export const mockValidChangePasswordDto: ChangePasswordDto = {
  currentPassword: 'Password123@',
  newPassword: 'NewSecurePassword456@',
};
