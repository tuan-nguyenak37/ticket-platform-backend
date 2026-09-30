import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserStatus } from './entities/enums/user-status.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  hashPassword,
  comparePassword,
} from '../../common/utils/password.util';
import { publicUser } from '../../common/utils/public-user';
import { ChangePasswordDto } from './dto/change-password.dto';
import { assertUserAdministrator } from '../auth/authorization/users.policy';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from './entities/enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException('Email đã tồn tại trên hệ thống');
    }
    const user = this.userRepository.create({
      email,
      password: await hashPassword(dto.password),
      fullName: dto.fullName ?? null,
      role: UserRole.USER,
    });
    try {
      return await this.userRepository.save(user);
    } catch (error) {
      this.rethrowDatabaseError(error);
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

  async createForAdmin(actor: Principal, dto: CreateUserDto) {
    assertUserAdministrator(actor);
    return publicUser(await this.create(dto));
  }

  async findAll(actor: Principal) {
    assertUserAdministrator(actor);
    const users = await this.userRepository.find({
      where: { status: Not(UserStatus.DELETED) },
      order: { createdAt: 'DESC', user_id: 'ASC' },
      take: 100,
    });
    return users.map(publicUser);
  }

  async findOne(actor: Principal, id: string) {
    assertUserAdministrator(actor);
    return publicUser(await this.requireUser(id));
  }

  async update(actor: Principal, id: string, dto: UpdateUserDto) {
    assertUserAdministrator(actor);
    await this.requireUser(id);
    const result = await this.userRepository.update(
      { user_id: id, status: Not(UserStatus.DELETED) },
      { fullName: dto.fullName },
    );
    if (result.affected !== 1)
      throw new NotFoundException('Không tìm thấy người dùng');
    return this.findOne(actor, id);
  }

  async getProfile(actor: Principal) {
    const user = await this.userRepository.findOne({
      where: this.selfScope(actor),
    });
    if (!user) throw new NotFoundException('Không tìm thấy hồ sơ');
    return publicUser(user);
  }

  async updateProfile(actor: Principal, dto: UpdateUserDto) {
    const result = await this.userRepository.update(this.selfScope(actor), {
      fullName: dto.fullName,
    });
    if (result.affected !== 1)
      throw new ConflictException('Tài khoản đã thay đổi, hãy đăng nhập lại');
    return this.getProfile(actor);
  }

  async changePassword(actor: Principal, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({
      where: this.selfScope(actor),
    });
    if (!user)
      throw new ConflictException('Tài khoản đã thay đổi, hãy đăng nhập lại');
    if (!(await comparePassword(dto.currentPassword, user.password))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    const password = await hashPassword(dto.newPassword);
    const result = await this.userRepository.update(
      { ...this.selfScope(actor), password: user.password },
      { password, tokenVersion: () => '"tokenVersion" + 1' },
    );
    if (result.affected !== 1)
      throw new ConflictException('Tài khoản đã thay đổi, hãy thử lại');
    return { message: 'Đổi mật khẩu thành công, hãy đăng nhập lại' };
  }

  private selfScope(actor: Principal) {
    if (actor.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    return {
      user_id: actor.user_id,
      status: UserStatus.ACTIVE,
      tokenVersion: actor.tokenVersion,
    };
  }

  async rotateTokenVersion(
    user: Pick<User, 'user_id' | 'tokenVersion'>,
    login = false,
  ): Promise<number> {
    const tokenVersion = user.tokenVersion + 1;
    const result = await this.userRepository.update(
      {
        user_id: user.user_id,
        tokenVersion: user.tokenVersion,
        status: UserStatus.ACTIVE,
      },
      { tokenVersion, ...(login ? { lastLoginAt: new Date() } : {}) },
    );
    if (result.affected !== 1) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    return tokenVersion;
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  private rethrowDatabaseError(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    ) {
      throw new ConflictException('Email hoặc số điện thoại đã tồn tại');
    }
    throw error;
  }
}
