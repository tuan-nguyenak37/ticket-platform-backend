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
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminStatisticsDto } from './dto/admin-statistics.dto';
import { generateId } from '../../common/utils/generateId';
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

  async adminSummary(actor: Principal) {
    assertUserAdministrator(actor);
    const [summary] = await this.dataSource.query<
      {
        users: string;
        moderators: string;
        organizers: string;
        pendingEvents: string;
        publishedEvents: string;
        paidOrders: string;
        paidResaleOrders: string;
        reviewPayments: string;
      }[]
    >(`SELECT
      (SELECT count(*)::text FROM users) AS users,
      (SELECT count(*)::text FROM users WHERE role='MODERATOR') AS moderators,
      (SELECT count(*)::text FROM organizers) AS organizers,
      (SELECT count(*)::text FROM events WHERE status='PENDING_REVIEW') AS "pendingEvents",
      (SELECT count(*)::text FROM events WHERE status='PUBLISHED') AS "publishedEvents",
      (SELECT count(*)::text FROM orders WHERE status='PAID') AS "paidOrders",
      (SELECT count(*)::text FROM resale_orders WHERE status='PAID') AS "paidResaleOrders",
      (SELECT count(*)::text FROM vnpay_transactions WHERE status='REVIEW') AS "reviewPayments"`);
    return summary;
  }

  async adminStatistics(actor: Principal, query: AdminStatisticsDto) {
    assertUserAdministrator(actor);
    const dateTo =
      query.dateTo ??
      new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const end = Date.parse(`${dateTo}T00:00:00Z`);
    const dateFrom =
      query.dateFrom ??
      new Date(end - 29 * 86400000).toISOString().slice(0, 10);
    const start = Date.parse(`${dateFrom}T00:00:00Z`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      end - start > 365 * 86400000
    ) {
      throw new BadRequestException('Khoảng thống kê phải từ 1 đến 366 ngày');
    }
    const groupBy = query.groupBy ?? 'day';
    if (!['day', 'month'].includes(groupBy))
      throw new BadRequestException('Nhóm thống kê không hợp lệ');
    const parameters = [dateFrom, dateTo, groupBy];
    const sales = `WITH sales AS (
      SELECT 'orders' AS kind, p.processed_at, p.amount, i.quantity,
        s.event_id
      FROM payments p JOIN orders o ON o.order_id=p.order_id
        JOIN order_items i ON i.order_id=o.order_id
        JOIN ticket_types t ON t.ticket_type_id=i.ticket_type_id
        JOIN showings s ON s.showing_id=t.showing_id
      WHERE p.status='SUCCEEDED' AND o.status='PAID'
        AND p.processed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND p.processed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      UNION ALL
      SELECT 'resale', p.processed_at, p.amount, 1, s.event_id
      FROM resale_payments p JOIN resale_orders o ON o.resale_order_id=p.resale_order_id
        JOIN resale_listings l ON l.listing_id=o.listing_id
        JOIN tickets k ON k.ticket_id=l.ticket_id
        JOIN ticket_types t ON t.ticket_type_id=k.ticket_type_id
        JOIN showings s ON s.showing_id=t.showing_id
      WHERE p.status='SUCCEEDED' AND o.status='PAID'
        AND p.processed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND p.processed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )`;
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const series = await manager.query<
        {
          period: string;
          originalOrders: string;
          resaleOrders: string;
          originalAmount: string;
          resaleAmount: string;
        }[]
      >(
        `${sales}, periods AS (
        SELECT generate_series(date_trunc($3, $1::date::timestamp), date_trunc($3, $2::date::timestamp),
          CASE WHEN $3='month' THEN interval '1 month' ELSE interval '1 day' END)::date AS period
      )
      SELECT to_char(periods.period, 'YYYY-MM-DD') AS period,
        count(s.kind) FILTER (WHERE s.kind='orders')::text AS "originalOrders",
        count(s.kind) FILTER (WHERE s.kind='resale')::text AS "resaleOrders",
        coalesce(sum(s.amount) FILTER (WHERE s.kind='orders'),0)::text AS "originalAmount",
        coalesce(sum(s.amount) FILTER (WHERE s.kind='resale'),0)::text AS "resaleAmount"
      FROM periods LEFT JOIN sales s ON date_trunc($3, s.processed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=periods.period
      GROUP BY periods.period ORDER BY periods.period`,
        parameters,
      );
      const topEvents = await manager.query<
        {
          eventId: string;
          title: string;
          originalTickets: string;
          resaleTickets: string;
        }[]
      >(
        `${sales}
      SELECT e.event_id AS "eventId", e.title,
        coalesce(sum(s.quantity) FILTER (WHERE s.kind='orders'),0)::text AS "originalTickets",
        coalesce(sum(s.quantity) FILTER (WHERE s.kind='resale'),0)::text AS "resaleTickets"
      FROM sales s JOIN events e ON e.event_id=s.event_id
      GROUP BY e.event_id, e.title
      ORDER BY sum(s.quantity) DESC, e.event_id ASC LIMIT 10`,
        parameters.slice(0, 2),
      );
      const payments = await manager.query<
        {
          kind: 'orders' | 'resale';
          status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REVIEW';
          count: string;
        }[]
      >(
        `SELECT kinds.kind, statuses.status, count(v.txn_ref)::text AS count
      FROM (VALUES ('orders'),('resale')) AS kinds(kind)
      CROSS JOIN (VALUES ('SUCCEEDED'),('FAILED'),('PENDING'),('REVIEW')) AS statuses(status)
      LEFT JOIN vnpay_transactions v ON v.kind=kinds.kind AND v.status=statuses.status
        AND v.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND v.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      GROUP BY kinds.kind, statuses.status ORDER BY kinds.kind, statuses.status`,
        parameters.slice(0, 2),
      );
      return {
        dateFrom,
        dateTo,
        groupBy,
        timeZone: 'Asia/Ho_Chi_Minh',
        series,
        topEvents,
        payments,
      };
    });
  }

  async updateRole(actor: Principal, id: string, dto: UpdateUserRoleDto) {
    assertUserAdministrator(actor);
    if (actor.user_id === id)
      throw new ForbiddenException('Không được tự đổi vai trò');
    const editableRoles = [UserRole.USER, UserRole.MODERATOR];
    if (
      !editableRoles.includes(dto.role) ||
      !editableRoles.includes(dto.expectedRole)
    ) {
      throw new BadRequestException('Chỉ được đổi vai trò USER và MODERATOR');
    }
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (!reason || Array.from(reason).length > 1000) {
      throw new BadRequestException(
        'Lý do thay đổi vai trò phải dài 1–1000 ký tự',
      );
    }
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
      const administrator = locked.get(actor.user_id)!;
      assertUserAdministrator({
        ...actor,
        role: administrator.role,
        status: administrator.status,
      });
      const user = locked.get(id)!;
      if (user.role === UserRole.ADMIN)
        throw new ForbiddenException('Không được thay đổi vai trò ADMIN');
      if (user.status !== UserStatus.ACTIVE)
        throw new ConflictException('Chỉ đổi vai trò tài khoản đang hoạt động');
      if (user.role !== dto.expectedRole)
        throw new ConflictException(
          'Vai trò đã thay đổi, hãy tải lại danh sách',
        );
      if (user.role === dto.role)
        throw new BadRequestException('Vai trò mới phải khác vai trò hiện tại');
      await this.sessions.revokeAll(id);
      await manager.query(
        `INSERT INTO user_role_changes(change_id,actor_id,target_id,previous_role,new_role,reason) VALUES($1,$2,$3,$4,$5,$6)`,
        [generateId('rolechg'), actor.user_id, id, user.role, dto.role, reason],
      );
      user.role = dto.role;
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
