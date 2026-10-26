import { User } from '../entities/user.entity';

export class UserResponseDto {
  user_id: User['user_id'];
  email: User['email'];
  full_name: User['full_name'];
  phone_number: User['phone_number'];
  avatar_url: User['avatar_url'];
  role: User['role'];
  status: User['status'];
  email_verified_at: User['email_verified_at'];
  created_at: User['created_at'];
  updated_at: User['updated_at'];

  constructor(user: User) {
    this.user_id = user.user_id;
    this.email = user.email;
    this.full_name = user.full_name;
    this.phone_number = user.phone_number;
    this.avatar_url = user.avatar_url;
    this.role = user.role;
    this.status = user.status;
    this.email_verified_at = user.email_verified_at;
    this.created_at = user.created_at;
    this.updated_at = user.updated_at;
  }
}
