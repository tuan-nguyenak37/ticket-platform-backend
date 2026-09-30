import type { Request } from 'express';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';

export interface Principal {
  user_id: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion: number;
}
export type AuthorizedRequest = Request & {
  user?: Principal;
  requestId?: string;
};
