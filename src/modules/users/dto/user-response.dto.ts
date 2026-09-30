import { User } from '../entities/user.entity';

export class UserResponseDto {
  user_id: User['user_id'];
  email: User['email'];
  phone: User['phone'];
  fullName: User['fullName'];
  avatarUrl: User['avatarUrl'];
  role: User['role'];
  status: User['status'];
  emailVerified: User['emailVerified'];
  phoneVerified: User['phoneVerified'];
  identityVerified: User['identityVerified'];
  reputationScore: User['reputationScore'];
  successfulSales: User['successfulSales'];
  successfulBuys: User['successfulBuys'];
  disputeCount: User['disputeCount'];
  lastLoginAt: User['lastLoginAt'];
  createdAt: User['createdAt'];
  updatedAt: User['updatedAt'];
  constructor(user: User) {
    this.user_id = user.user_id;
    this.email = user.email;
    this.phone = user.phone;
    this.fullName = user.fullName;
    this.avatarUrl = user.avatarUrl;
    this.role = user.role;
    this.status = user.status;
    this.emailVerified = user.emailVerified;
    this.phoneVerified = user.phoneVerified;
    this.identityVerified = user.identityVerified;
    this.reputationScore = user.reputationScore;
    this.successfulSales = user.successfulSales;
    this.successfulBuys = user.successfulBuys;
    this.disputeCount = user.disputeCount;
    this.lastLoginAt = user.lastLoginAt;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
