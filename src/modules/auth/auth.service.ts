import { Injectable, ConflictException } from '@nestjs/common';
import { RegisterDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { hashPassword, comparePassword } from '../../common/utils/password.util';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
  ) {}

  async create(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;

    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại trên hệ thống');
    }

    const hashedPassword = await hashPassword(password);
    const user = await this.userService.create({
      email,
      password: hashedPassword,
      fullName,
    });

    const { password: _, ...result } = user;
    return result;
  }

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
