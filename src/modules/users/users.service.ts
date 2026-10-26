import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  comparePassword,
  hashPassword,
} from '../../common/utils/password.util';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { publicUser } from '../../common/utils/public-user';
import type { Principal } from '../auth/authorization/principal';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  assertAccountStatusManager,
  assertUserAdministrator,
} from '../auth/authorization/users.policy';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly sessions: RefreshSessionService,
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
    this.selfScope(actor);
    const user = await this.findById(actor.user_id);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    return publicUser(user);
  }

  async updateProfile(actor: Principal, dto: UpdateProfileDto) {
    if (
      dto.full_name === undefined &&
      dto.phone_number === undefined &&
      dto.avatar_url === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật',
      );
    }
    const result = await this.userRepository.update(this.selfScope(actor), {
      ...(dto.full_name !== undefined ? { full_name: dto.full_name } : {}),
      ...(dto.phone_number !== undefined
        ? { phone_number: dto.phone_number }
        : {}),
      ...(dto.avatar_url !== undefined ? { avatar_url: dto.avatar_url } : {}),
    });
    if (result.affected !== 1)
      throw new ConflictException('Tài khoản đã thay đổi, hãy đăng nhập lại');
    return this.getProfile(actor);
  }

  async changePassword(actor: Principal, dto: ChangePasswordDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const user = await repository.findOne({
        where: this.selfScope(actor),
        lock: { mode: 'pessimistic_write' },
      });
      if (!user)
        throw new ConflictException('Tài khoản đã thay đổi, hãy đăng nhập lại');
      if (!(await comparePassword(dto.currentPassword, user.password_hash))) {
        throw new BadRequestException('Mật khẩu hiện tại không đúng');
      }
      if (await comparePassword(dto.newPassword, user.password_hash)) {
        throw new BadRequestException(
          'Mật khẩu mới phải khác mật khẩu hiện tại',
        );
      }
      const passwordHash = await hashPassword(dto.newPassword);
      await this.sessions.revokeAll(user.user_id);
      user.password_hash = passwordHash;
      await repository.save(user);
      return { message: 'Đổi mật khẩu thành công, hãy đăng nhập lại' };
    });
  }

  async createForAdmin(actor: Principal, dto: CreateUserDto) {
    assertUserAdministrator(actor);
    return publicUser(await this.create(dto));
  }

  async findAll(actor: Principal) {
    assertUserAdministrator(actor);
    const users = await this.userRepository.find({
      order: { created_at: 'DESC' },
    });
    return users.map((user) => publicUser(user));
  }

  async findOne(actor: Principal, id: string) {
    assertUserAdministrator(actor);
    return publicUser(await this.requireUser(id));
  }

  async update(actor: Principal, id: string, dto: UpdateUserDto) {
    assertUserAdministrator(actor);
    await this.requireUser(id);
    if (dto.full_name === undefined && dto.phone_number === undefined) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật',
      );
    }
    const result = await this.userRepository.update(
      { user_id: id },
      {
        ...(dto.full_name !== undefined ? { full_name: dto.full_name } : {}),
        ...(dto.phone_number !== undefined
          ? { phone_number: dto.phone_number }
          : {}),
      },
    );
    if (result.affected !== 1)
      throw new NotFoundException('Không tìm thấy người dùng để cập nhật');
    return publicUser(await this.requireUser(id));
  }

  async updateStatus(actor: Principal, id: string, dto: UpdateUserStatusDto) {
    assertAccountStatusManager(actor);
    if (id === actor.user_id)
      throw new ForbiddenException('Không được tự đổi trạng thái tài khoản');
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const locked = new Map<string, User>();
      for (const userId of [actor.user_id, id].sort()) {
        const user = await repository.findOne({
          where: { user_id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Không tìm thấy người dùng');
        locked.set(userId, user);
      }
      const operator = locked.get(actor.user_id)!;
      assertAccountStatusManager({
        ...actor,
        role: operator.role,
        status: operator.status,
      });
      const user = locked.get(id)!;
      if (
        user.role === UserRole.ADMIN ||
        (operator.role === UserRole.MODERATOR && user.role !== UserRole.USER)
      ) {
        throw new ForbiddenException('Không được đổi trạng thái tài khoản này');
      }
      if (user.status === dto.status) return publicUser(user);
      if (dto.status === UserStatus.SUSPENDED)
        await this.sessions.revokeAll(id);
      user.status = dto.status;
      return publicUser(await repository.save(user));
    });
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  private selfScope(actor: Principal) {
    if (actor.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    return { user_id: actor.user_id, status: UserStatus.ACTIVE };
  }
}
