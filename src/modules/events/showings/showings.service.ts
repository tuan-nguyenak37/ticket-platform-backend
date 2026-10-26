import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { generateId } from '../../../common/utils/generateId';
import type { Principal } from '../../auth/authorization/principal';
import { OrganizerMember } from '../../organizers/entities/organizer-member.entity';
import { Organizer } from '../../organizers/entities/organizer.entity';
import { OrganizerMemberRole } from '../../organizers/enums/organizer-member-role.enum';
import { OrganizerStatus } from '../../organizers/enums/organizer-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { Event } from '../entities/event.entity';
import { EventStatus } from '../enums/event-status.enum';
import { CreateShowingDto } from './dto/create-showing.dto';
import { UpdateShowingDto } from './dto/update-showing.dto';
import { Showing } from './entities/showing.entity';
import { parseVietnamTime } from './showing-time';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';

@Injectable()
export class ShowingsService {
  constructor(
    @InjectRepository(Showing) private readonly showings: Repository<Showing>,
    private readonly dataSource: DataSource,
  ) {}

  async create(eventId: string, actor: Principal, dto: CreateShowingDto) {
    const startTime = parseVietnamTime(dto.startTime);
    const endTime = parseVietnamTime(dto.endTime);
    return this.withLockedEvent(eventId, actor, async (manager, event) => {
      this.requireTimeRange(startTime, endTime, true);
      const showing = manager.create(Showing, {
        showingId: generateId('show'),
        eventId,
        name: dto.name,
        startTime,
        endTime,
        venueName: dto.venueName,
        address: dto.address,
        city: dto.city,
      });
      const saved = await manager.save(Showing, showing);
      await this.markEventDraft(manager, event);
      return this.response(saved);
    });
  }

  async findByEvent(eventId: string, actor?: Principal) {
    const builder = this.dataSource
      .getRepository(Event)
      .createQueryBuilder('event')
      .innerJoin('event.organizer', 'organizer')
      .leftJoinAndSelect('event.showings', 'showing')
      .where('event.eventId = :eventId', { eventId });
    const policy = this.viewCondition(actor);
    builder.andWhere(policy.sql, policy.params);
    const event = await builder
      .orderBy('showing.startTime', 'ASC')
      .addOrderBy('showing.showingId', 'ASC')
      .getOne();
    if (!event) throw new NotFoundException('Event not found');
    return event.showings.map((showing) => this.response(showing));
  }

  async findOne(showingId: string, actor?: Principal) {
    const builder = this.showings
      .createQueryBuilder('showing')
      .innerJoin('showing.event', 'event')
      .innerJoin('event.organizer', 'organizer')
      .where('showing.showingId = :showingId', { showingId });
    const policy = this.viewCondition(actor);
    builder.andWhere(policy.sql, policy.params);
    const showing = await builder.getOne();
    if (!showing) throw new NotFoundException('Showing not found');
    return this.response(showing);
  }

  private viewCondition(actor?: Principal) {
    if (actor && [UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role))
      return { sql: '1 = 1', params: {} };
    const publicEvent =
      '(event.status = :published AND organizer.status = :active)';
    const params = {
      published: EventStatus.PUBLISHED,
      active: OrganizerStatus.ACTIVE,
    };
    if (!actor) return { sql: publicEvent, params };
    return {
      sql: `(${publicEvent} OR EXISTS (
        SELECT 1 FROM organizer_members member
        WHERE member.organizer_id = event.organizer_id
          AND member.user_id = :userId AND member.role = :ownerRole
      ))`,
      params: {
        ...params,
        userId: actor.user_id,
        ownerRole: OrganizerMemberRole.OWNER,
      },
    };
  }

  async update(showingId: string, actor: Principal, dto: UpdateShowingDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('At least one field is required');
    const reference = await this.findShowing(showingId);
    const suppliedStart =
      dto.startTime === undefined ? undefined : parseVietnamTime(dto.startTime);
    const suppliedEnd =
      dto.endTime === undefined ? undefined : parseVietnamTime(dto.endTime);
    return this.withLockedEvent(
      reference.eventId,
      actor,
      async (manager, event) => {
        const showing = await this.lockShowing(
          manager,
          showingId,
          event.eventId,
        );
        const startTime = suppliedStart ?? showing.startTime;
        const endTime = suppliedEnd ?? showing.endTime;
        const timeChanged =
          startTime.getTime() !== showing.startTime.getTime() ||
          endTime.getTime() !== showing.endTime.getTime();
        this.requireTimeRange(startTime, endTime, timeChanged);
        if (startTime.getTime() !== showing.startTime.getTime()) {
          const conflictingSales = await manager
            .getRepository(TicketType)
            .createQueryBuilder('ticketType')
            .where('ticketType.showingId = :showingId', { showingId })
            .andWhere('ticketType.saleEndAt > :startTime', { startTime })
            .getExists();
          if (conflictingSales)
            throw new ConflictException(
              'Showing starts before a ticket type sale ends',
            );
        }
        const name = dto.name ?? showing.name;
        const venueName = dto.venueName ?? showing.venueName;
        const address = dto.address ?? showing.address;
        const city = dto.city ?? showing.city;
        if (
          !timeChanged &&
          name === showing.name &&
          venueName === showing.venueName &&
          address === showing.address &&
          city === showing.city
        ) {
          return this.response(showing);
        }
        showing.name = name;
        showing.startTime = startTime;
        showing.endTime = endTime;
        showing.venueName = venueName;
        showing.address = address;
        showing.city = city;
        const saved = await manager.save(Showing, showing);
        await this.markEventDraft(manager, event);
        return this.response(saved);
      },
    );
  }

  async remove(showingId: string, actor: Principal) {
    const reference = await this.findShowing(showingId);
    return this.withLockedEvent(
      reference.eventId,
      actor,
      async (manager, event) => {
        const showing = await this.lockShowing(
          manager,
          showingId,
          event.eventId,
        );
        try {
          await manager.remove(Showing, showing);
        } catch (error) {
          if (
            error instanceof QueryFailedError &&
            (error.driverError as { code?: string }).code === '23503'
          ) {
            throw new ConflictException(
              'Showing is referenced by another record',
            );
          }
          throw error;
        }
        await this.markEventDraft(manager, event);
        return { showingId };
      },
    );
  }

  private async withLockedEvent<T>(
    eventId: string,
    actor: Principal,
    operation: (manager: EntityManager, event: Event) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const reference = await manager
        .getRepository(Event)
        .findOneBy({ eventId });
      if (!reference) throw new NotFoundException('Event not found');
      const organizer = await manager.getRepository(Organizer).findOne({
        where: { organizerId: reference.organizerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!organizer) throw new NotFoundException('Organizer not found');
      const event = await manager.getRepository(Event).findOne({
        where: { eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('Event not found');
      const owner = await manager.getRepository(OrganizerMember).existsBy({
        organizerId: organizer.organizerId,
        userId: actor.user_id,
        role: OrganizerMemberRole.OWNER,
      });
      if (!owner)
        throw new ForbiddenException('Only the owner can manage showings');
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ForbiddenException(
          'Suspended organizers cannot manage showings',
        );
      if (event.status === EventStatus.PENDING_REVIEW)
        throw new ConflictException('Event is pending review');
      return operation(manager, event);
    });
  }

  private async lockShowing(
    manager: EntityManager,
    showingId: string,
    eventId: string,
  ) {
    const showing = await manager.getRepository(Showing).findOne({
      where: { showingId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!showing) throw new NotFoundException('Showing not found');
    if (showing.eventId !== eventId)
      throw new ConflictException('Showing belongs to a different event');
    return showing;
  }

  private async findShowing(showingId: string) {
    const showing = await this.showings.findOneBy({ showingId });
    if (!showing) throw new NotFoundException('Showing not found');
    return showing;
  }

  private requireTimeRange(
    startTime: Date,
    endTime: Date,
    requireFuture: boolean,
  ) {
    if (endTime.getTime() <= startTime.getTime())
      throw new BadRequestException('endTime must be after startTime');
    if (requireFuture && startTime.getTime() <= Date.now())
      throw new BadRequestException('startTime must be in the future');
  }

  private async markEventDraft(manager: EntityManager, event: Event) {
    if (
      event.status === EventStatus.PUBLISHED ||
      event.status === EventStatus.REJECTED
    ) {
      event.status = EventStatus.DRAFT;
      await manager.save(Event, event);
    }
  }

  private response(showing: Showing) {
    return {
      showingId: showing.showingId,
      eventId: showing.eventId,
      name: showing.name,
      startTime: showing.startTime.toISOString(),
      endTime: showing.endTime.toISOString(),
      venueName: showing.venueName,
      address: showing.address,
      city: showing.city,
      createdAt: showing.createdAt,
      updatedAt: showing.updatedAt,
    };
  }
}
