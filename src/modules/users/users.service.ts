import {
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
import { hashPassword } from '../../common/utils/password.util';
import { publicUser } from '../../common/utils/public-user';

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

  async findAll() {
    const users = await this.userRepository.find({
      where: { status: Not(UserStatus.DELETED) },
      order: { createdAt: 'DESC', user_id: 'ASC' },
      take: 100,
    });
    return users.map(publicUser);
  }

  async findOne(id: string) {
    return publicUser(await this.requireUser(id));
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.requireUser(id);
    const changes: Partial<User> = {};
    if (dto.email !== undefined) changes.email = dto.email.trim().toLowerCase();
    if (dto.fullName !== undefined) changes.fullName = dto.fullName;
    if (dto.password !== undefined)
      changes.password = await hashPassword(dto.password);
    if (Object.keys(changes).length === 0) return this.findOne(id);
    try {
      // Invalidate existing tokens when account information changes.
      await this.userRepository.update(
        { user_id: id, status: Not(UserStatus.DELETED) },
        { ...changes, tokenVersion: () => '"tokenVersion" + 1' },
      );
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.userRepository.update(
      { user_id: id, status: Not(UserStatus.DELETED) },
      { status: UserStatus.DELETED, tokenVersion: () => '"tokenVersion" + 1' },
    );
    if (!result.affected)
      throw new NotFoundException('Không tìm thấy người dùng');
    return { user_id: id, deleted: true };
  }

  async rotateTokenVersion(user: User, login = false): Promise<number> {
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
