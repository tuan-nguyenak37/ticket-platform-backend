import { User } from '../../modules/users/entities/user.entity';
import { UserResponseDto } from '../../modules/users/dto/user-response.dto';

export function publicUser(user: User): UserResponseDto {
  return new UserResponseDto(user);
}
