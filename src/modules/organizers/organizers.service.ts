import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { CreateOrganizerDto } from './dto/create-organizer.dto';
import { UpdateOrganizerDto } from './dto/update-organizer.dto';
import { OrganizerMember } from './entities/organizer-member.entity';
import { Organizer } from './entities/organizer.entity';
import { OrganizerMemberRole } from './enums/organizer-member-role.enum';
import { OrganizerStatus } from './enums/organizer-status.enum';
import { OrganizerPayoutAccount } from './entities/organizer-payout-account.entity';
import { PayoutAccountDto } from './dto/payout-account.dto';

@Injectable()
export class OrganizersService {
  constructor(
    @InjectRepository(Organizer)
    private readonly organizers: Repository<Organizer>,
    @InjectRepository(OrganizerMember)
    private readonly members: Repository<OrganizerMember>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateOrganizerDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { user_id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user || user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('Account is not active');
        }
        const organizer = manager.create(Organizer, {
          organizerId: generateId('org'),
          name: dto.name.trim(),
          slug: this.slug(dto.name),
          description: dto.description?.trim() || null,
          logoUrl: null,
          coverUrl: null,
          contactEmail: dto.contactEmail.trim().toLowerCase(),
          contactPhone: null,
          status: OrganizerStatus.ACTIVE,
        });
        await manager.save(Organizer, organizer);
        const member = manager.create(OrganizerMember, {
          memberId: generateId('member'),
          organizerId: organizer.organizerId,
          userId,
          role: OrganizerMemberRole.OWNER,
        });
        await manager.save(OrganizerMember, member);
        return this.response(organizer);
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async findMine(userId: string) {
    const memberships = await this.members.find({
      where: { userId },
      relations: { organizer: true },
      order: { createdAt: 'DESC' },
    });
    return memberships.map((member) => ({
      ...this.response(member.organizer),
      memberRole: member.role,
    }));
  }

  async findOne(organizerId: string) {
    const organizer = await this.organizers.findOneBy({ organizerId });
    if (!organizer) throw new NotFoundException('Organizer not found');
    return this.response(organizer);
  }

  async update(organizerId: string, userId: string, dto: UpdateOrganizerDto) {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.contactEmail === undefined
    ) {
      throw new BadRequestException('At least one field is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }
      const repository = manager.getRepository(Organizer);
      const organizer = await repository.findOne({
        where: { organizerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!organizer) throw new NotFoundException('Organizer not found');
      const membership = await manager
        .getRepository(OrganizerMember)
        .findOneBy({
          organizerId,
          userId,
          role: OrganizerMemberRole.OWNER,
        });
      if (!membership)
        throw new ForbiddenException('Only the owner can edit this organizer');
      if (organizer.status === OrganizerStatus.SUSPENDED) {
        throw new ForbiddenException('Suspended organizers cannot be edited');
      }
      if (dto.name !== undefined) organizer.name = dto.name.trim();
      if (dto.description !== undefined)
        organizer.description = dto.description?.trim() || null;
      if (dto.contactEmail !== undefined)
        organizer.contactEmail = dto.contactEmail.trim().toLowerCase();
      return this.response(await repository.save(organizer));
    });
  }

  async report(organizerId: string, userId: string, eventId?: string) {
    await this.requirePayoutOwner(organizerId, userId);
    if (eventId) {
      const owned: unknown[] = await this.dataSource.query(
        'SELECT event_id FROM events WHERE event_id = $1 AND organizer_id = $2',
        [eventId, organizerId],
      );
      if (!owned.length) throw new NotFoundException('Event not found');
    }
    const rows: Array<{
      eventId: string;
      eventTitle: string;
      showingId: string;
      showingName: string;
      showingStartTime: Date;
      ticketTypeId: string;
      ticketTypeName: string;
      orderCount: string;
      ticketCount: string;
      amount: string;
    }> = await this.dataSource.query(
      `
      SELECT e.event_id AS "eventId", e.title AS "eventTitle", s.showing_id AS "showingId", s.name AS "showingName", s.start_time AS "showingStartTime",
        t.ticket_type_id AS "ticketTypeId", t.name AS "ticketTypeName",
        COUNT(o.order_id)::text AS "orderCount", COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN i.quantity ELSE 0 END),0)::text AS "ticketCount",
        COALESCE(SUM(o.total_amount),0)::text AS amount
      FROM events e JOIN showings s ON s.event_id = e.event_id JOIN ticket_types t ON t.showing_id = s.showing_id
      LEFT JOIN order_items i ON i.ticket_type_id = t.ticket_type_id LEFT JOIN orders o ON o.order_id = i.order_id AND o.status = 'PAID'
      WHERE e.organizer_id = $1 AND ($2::varchar IS NULL OR e.event_id = $2)
      GROUP BY e.event_id, e.title, s.showing_id, s.name, s.start_time, t.ticket_type_id, t.name
      ORDER BY e.title, s.start_time, s.showing_id, t.name, t.ticket_type_id
    `,
      [organizerId, eventId ?? null],
    );
    return {
      rows,
      totals: rows.reduce(
        (sum, row) => ({
          orderCount: (
            BigInt(sum.orderCount) + BigInt(row.orderCount)
          ).toString(),
          ticketCount: (
            BigInt(sum.ticketCount) + BigInt(row.ticketCount)
          ).toString(),
          amount: (BigInt(sum.amount) + BigInt(row.amount)).toString(),
        }),
        { orderCount: '0', ticketCount: '0', amount: '0' },
      ),
    };
  }

  async payoutAccount(organizerId: string, userId: string) {
    await this.requirePayoutOwner(organizerId, userId);
    return this.dataSource
      .getRepository(OrganizerPayoutAccount)
      .findOneBy({ organizerId });
  }

  async putPayoutAccount(
    organizerId: string,
    userId: string,
    dto: PayoutAccountDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const organizer = await manager.getRepository(Organizer).findOne({
        where: { organizerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!organizer) throw new NotFoundException('Organizer not found');
      await this.requirePayoutOwner(organizerId, userId, manager);
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ForbiddenException('Suspended organizers cannot be edited');
      const repository = manager.getRepository(OrganizerPayoutAccount);
      const account =
        (await repository.findOneBy({ organizerId })) ??
        repository.create({ organizerId });
      account.bankName = dto.bankName.trim();
      account.accountHolder = dto.accountHolder.trim();
      account.accountNumber = dto.accountNumber;
      if (account.bankName.length < 2 || account.accountHolder.length < 2)
        throw new BadRequestException('Bank and account holder are required');
      return repository.save(account);
    });
  }

  private async requirePayoutOwner(
    organizerId: string,
    userId: string,
    manager = this.dataSource.manager,
  ) {
    const organizer = await manager
      .getRepository(Organizer)
      .findOneBy({ organizerId });
    if (!organizer) throw new NotFoundException('Organizer not found');
    const member = await manager
      .getRepository(OrganizerMember)
      .existsBy({ organizerId, userId, role: OrganizerMemberRole.OWNER });
    if (!member)
      throw new ForbiddenException('Only the owner can access payout account');
    const user = await manager
      .getRepository(User)
      .findOneBy({ user_id: userId });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException('Account is not active');
  }

  private slug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return `${base || 'organizer'}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  }

  private response(organizer: Organizer) {
    return {
      organizerId: organizer.organizerId,
      name: organizer.name,
      slug: organizer.slug,
      description: organizer.description,
      logoUrl: organizer.logoUrl,
      coverUrl: organizer.coverUrl,
      contactEmail: organizer.contactEmail,
      contactPhone: organizer.contactPhone,
      status: organizer.status,
      createdAt: organizer.createdAt,
      updatedAt: organizer.updatedAt,
    };
  }

  private rethrowConflict(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    ) {
      throw new ConflictException(
        'Organizer identifier or slug already exists',
      );
    }
    throw error;
  }
}
