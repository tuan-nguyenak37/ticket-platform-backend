import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { hashPassword } from '../../common/utils/password.util';
import { publicUser } from '../../common/utils/public-user';
import type { Principal } from '../auth/authorization/principal';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException('Email đã tồn tại');
    }
    const user = this.userRepository.create({
      email,
      full_name: dto.fullName.trim(),
      password_hash: await hashPassword(dto.password),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });
    try {
      return await this.userRepository.save(user);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Email đã tồn tại');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { user_id: id } });
  }

  async getProfile(actor: Principal) {
    const user = await this.findById(actor.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    return publicUser(user);
  }
}
