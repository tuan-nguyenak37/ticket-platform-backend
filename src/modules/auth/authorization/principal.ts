import type { Request } from 'express';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export interface Principal {
  user_id: string;
  role: UserRole;
  status: UserStatus;
  sessionId: string;
}
export type AuthorizedRequest = Request & {
  user?: Principal;
  requestId?: string;
};
