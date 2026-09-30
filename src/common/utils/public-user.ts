import { User } from '../../modules/users/entities/user.entity';

export function publicUser(user: User) {
  const { password, tokenVersion, ...result } = user;
  void password;
  void tokenVersion;
  return result;
}
