import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerMemberRole } from '../organizers/enums/organizer-member-role.enum';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateEventDto,
  EventListQueryDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventCategory } from './entities/event-category.entity';
import { Event } from './entities/event.entity';
import { EventStatus } from './enums/event-status.enum';
import { Showing } from './showings/entities/showing.entity';
import { UploadsService } from '../../common/uploads/uploads.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(EventCategory)
    private readonly categories: Repository<EventCategory>,
    @InjectRepository(OrganizerMember)
    private readonly members: Repository<OrganizerMember>,
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async listCategories() {
    return (await this.categories.find({ order: { categoryId: 'ASC' } })).map(
      (category) => ({
        categoryId: category.categoryId,
        code: category.code,
        name: category.name,
      }),
    );
  }

  async discover(query: EventListQueryDto) {
    const builder = this.events
      .createQueryBuilder('event')
      .innerJoin('event.organizer', 'organizer')
      .where('event.status = :status', { status: EventStatus.PUBLISHED })
      .andWhere('organizer.status = :organizerStatus', {
        organizerStatus: OrganizerStatus.ACTIVE,
      });
    if (query.categoryId)
      builder.andWhere('event.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.q)
      builder.andWhere("event.title ILIKE :title ESCAPE '\\'", {
        title: `%${query.q.replace(/[\\%_]/g, '\\$&')}%`,
      });
    const [events, total] = await builder
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.eventId', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const summaries = events.length
      ? await this.dataSource
          .getRepository(Showing)
          .createQueryBuilder('showing')
          .leftJoin(
            'showing.ticketTypes',
            'ticketType',
            'ticketType.status = :active',
            { active: 'ACTIVE' },
          )
          .select('showing.eventId', 'eventId')
          .addSelect('MIN(showing.startTime)', 'nextShowingAt')
          .addSelect('MIN(ticketType.price)::text', 'minPrice')
          .where('showing.eventId IN (:...eventIds)', {
            eventIds: events.map((event) => event.eventId),
          })
          .andWhere('showing.startTime > CURRENT_TIMESTAMP')
          .groupBy('showing.eventId')
          .getRawMany<{
            eventId: string;
            nextShowingAt: Date;
            minPrice: string | null;
          }>()
      : [];
    const byEvent = new Map(
      summaries.map((summary) => [summary.eventId, summary]),
    );
    return {
      items: events.map((event) => ({
        ...this.publicResponse(event),
        nextShowingAt: byEvent.get(event.eventId)?.nextShowingAt ?? null,
        minPrice: byEvent.get(event.eventId)?.minPrice ?? null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listForOrganizer(
    organizerId: string,
    actor: Principal,
    query: EventListQueryDto,
  ) {
    await this.requireOwner(
      this.dataSource.manager,
      organizerId,
      actor.user_id,
    );
    const builder = this.events
      .createQueryBuilder('event')
      .where('event.organizerId = :organizerId', { organizerId });
    return this.paginate(builder, query, (event) =>
      this.managementResponse(event),
    );
  }

  async findOne(eventId: string, actor?: Principal) {
    const event = await this.events.findOne({
      where: { eventId },
      relations: { organizer: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (
      event.status === EventStatus.PUBLISHED &&
      event.organizer.status === OrganizerStatus.ACTIVE
    ) {
      if (!actor) return this.publicResponse(event);
      if (
        [UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role) ||
        (await this.isOwner(event.organizerId, actor.user_id))
      ) {
        return this.managementResponse(event);
      }
      return this.publicResponse(event);
    }
    if (
      (actor && [UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role)) ||
      (actor && (await this.isOwner(event.organizerId, actor.user_id)))
    ) {
      return this.managementResponse(event);
    }
    throw new NotFoundException('Event not found');
  }

  async create(organizerId: string, actor: Principal, dto: CreateEventDto) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const organizer = await this.lockOrganizer(manager, organizerId);
          await this.requireOwner(manager, organizerId, actor.user_id);
          this.requireActive(organizer);
          await this.requireCategory(manager, dto.categoryId);
          const event = manager.create(Event, {
            eventId: generateId('event'),
            organizerId,
            categoryId: dto.categoryId,
            title: dto.title,
            slug: this.slug(dto.title),
            description: dto.description ?? null,
            posterUrl: dto.posterUrl ?? null,
            status: EventStatus.DRAFT,
            rejectionReason: null,
            reviewedBy: null,
            reviewedAt: null,
          });
          return this.managementResponse(await manager.save(Event, event));
        });
      } catch (error) {
        const driverError =
          error instanceof QueryFailedError
            ? (error.driverError as { code?: string; constraint?: string })
            : undefined;
        if (
          driverError?.code === '23505' &&
          driverError.constraint === 'UQ_events_slug'
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Could not generate a unique event slug');
  }

  async update(eventId: string, actor: Principal, dto: UpdateEventDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('At least one field is required');
    return this.withLockedEvent(eventId, async (manager, organizer, event) => {
      await this.requireOwner(manager, organizer.organizerId, actor.user_id);
      this.requireActive(organizer);
      if (event.status === EventStatus.PENDING_REVIEW) {
        throw new ConflictException('Event is pending review');
      }
      if (dto.categoryId !== undefined && dto.categoryId !== event.categoryId) {
        await this.requireCategory(manager, dto.categoryId);
      }
      const title = dto.title ?? event.title;
      const categoryId = dto.categoryId ?? event.categoryId;
      const description =
        dto.description === undefined ? event.description : dto.description;
      const posterUrl =
        dto.posterUrl === undefined ? event.posterUrl : dto.posterUrl;
      if (
        title === event.title &&
        categoryId === event.categoryId &&
        description === event.description &&
        posterUrl === event.posterUrl
      ) {
        return this.managementResponse(event);
      }
      event.title = title;
      event.categoryId = categoryId;
      event.description = description;
      event.posterUrl = posterUrl;
      if (
        event.status === EventStatus.PUBLISHED ||
        event.status === EventStatus.REJECTED
      ) {
        event.status = EventStatus.DRAFT;
      }
      return this.managementResponse(await manager.save(Event, event));
    });
  }

  async uploadPoster(
    eventId: string,
    actor: Principal,
    file: Express.Multer.File,
  ) {
    const mime = this.uploads.validate(file, true);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime))
      throw new BadRequestException('Only JPEG, PNG and WebP are allowed');
    let saved: string | undefined;
    let previous: string | undefined;
    try {
      const result = await this.withLockedEvent(
        eventId,
        async (manager, organizer, event) => {
          await this.requireOwner(
            manager,
            organizer.organizerId,
            actor.user_id,
          );
          this.requireActive(organizer);
          if (event.status === EventStatus.PENDING_REVIEW)
            throw new ConflictException('Event is pending review');
          const stored = await this.uploads.save(file, 'events');
          saved = stored.filename;
          const prefix = '/api/v1/events/' + eventId + '/poster/';
          if (event.posterUrl?.startsWith(prefix))
            previous = event.posterUrl.slice(prefix.length);
          event.posterUrl = prefix + stored.filename;
          if (event.status !== EventStatus.DRAFT)
            event.status = EventStatus.DRAFT;
          return this.managementResponse(await manager.save(Event, event));
        },
      );
      if (previous) await this.uploads.removeEventImage(previous);
      return result;
    } catch (error) {
      if (saved) await this.uploads.removeEventImage(saved);
      throw error;
    }
  }

  async readPoster(eventId: string, filename: string, actor?: Principal) {
    const event = await this.findOne(eventId, actor);
    if (event.posterUrl !== '/api/v1/events/' + eventId + '/poster/' + filename)
      throw new NotFoundException('Image not found');
    return this.uploads.readEventImage(filename);
  }

  private async withLockedEvent<T>(
    eventId: string,
    operation: (
      manager: EntityManager,
      organizer: Organizer,
      event: Event,
    ) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const reference = await manager
        .getRepository(Event)
        .findOneBy({ eventId });
      if (!reference) throw new NotFoundException('Event not found');
      const organizer = await this.lockOrganizer(
        manager,
        reference.organizerId,
      );
      const event = await manager.getRepository(Event).findOne({
        where: { eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('Event not found');
      return operation(manager, organizer, event);
    });
  }

  private async lockOrganizer(
    manager: EntityManager,
    organizerId: string,
  ): Promise<Organizer> {
    const organizer = await manager.getRepository(Organizer).findOne({
      where: { organizerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!organizer) throw new NotFoundException('Organizer not found');
    return organizer;
  }

  private async requireOwner(
    manager: EntityManager,
    organizerId: string,
    userId: string,
  ) {
    const member = await manager.getRepository(OrganizerMember).findOneBy({
      organizerId,
      userId,
      role: OrganizerMemberRole.OWNER,
    });
    if (!member)
      throw new ForbiddenException('Only the owner can manage this event');
  }

  private async isOwner(organizerId: string, userId: string) {
    return this.members.existsBy({
      organizerId,
      userId,
      role: OrganizerMemberRole.OWNER,
    });
  }

  private requireActive(organizer: Organizer) {
    if (organizer.status !== OrganizerStatus.ACTIVE) {
      throw new ConflictException('Organizer is suspended');
    }
  }

  private async requireCategory(manager: EntityManager, categoryId: string) {
    if (
      !(await manager.getRepository(EventCategory).existsBy({ categoryId }))
    ) {
      throw new BadRequestException('Invalid categoryId');
    }
  }

  private async paginate(
    builder: SelectQueryBuilder<Event>,
    query: EventListQueryDto,
    response: (event: Event) => object,
  ) {
    const [events, total] = await builder
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.eventId', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: events.map(response),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private slug(title: string) {
    const base = title
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 230);
    return `${base || 'event'}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  }

  private publicResponse(event: Event) {
    return {
      eventId: event.eventId,
      organizerId: event.organizerId,
      categoryId: event.categoryId,
      title: event.title,
      slug: event.slug,
      description: event.description,
      posterUrl: event.posterUrl,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private managementResponse(event: Event) {
    return {
      ...this.publicResponse(event),
      status: event.status,
      rejectionReason: event.rejectionReason,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt,
    };
  }
}
