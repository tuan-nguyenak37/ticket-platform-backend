import type { Principal } from '../authorization/principal';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import { RegisterDto } from '../dto/create-auth.dto';
import { LoginDto } from '../dto/login-auth.dto';

export const mockAuthUserPrincipal: Principal = {
  user_id: 'usr_auth_test_001',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockAuthAdminPrincipal: Principal = {
  user_id: 'usr_auth_admin_002',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  tokenVersion: 1,
};

export const mockRegisterDto: RegisterDto = {
  email: 'test.register@ticketplatform.test',
  password: 'Password123@',
  fullName: 'Nguyễn Văn Đăng Ký',
};

export const mockLoginDto: LoginDto = {
  email: 'test.register@ticketplatform.test',
  password: 'Password123@',
};

export const mockAuthTokens = {
  accessToken: 'mock.access.token.jwt',
  refreshToken: 'mock.refresh.token.jwt',
  user: {
    user_id: 'usr_auth_test_001',
    email: 'test.register@ticketplatform.test',
    fullName: 'Nguyễn Văn Đăng Ký',
    role: UserRole.USER,
  },
};
