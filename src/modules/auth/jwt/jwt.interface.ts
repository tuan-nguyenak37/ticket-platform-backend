import { UserRole } from '../../users/enums/user-role.enum';

export interface JwtPayload {
  user_id: string;
  email: string;
  role: UserRole;
  full_name: string;
  sessionId: string;
  sessionExpiresAt?: number;
}
