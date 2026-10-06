import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, MoreThan, QueryFailedError } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { Event } from './entities/event.entity';
import { EventCategory } from './entities/event-category.entity';
import { EventStatus } from './entities/enums/event-status.enum';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventPinDto } from './dto/update-event-pin.dto';
import {
  EventPhase,
  ListEventsDto,
  ManageEventsDto,
} from './dto/list-events.dto';

export interface EventImages {
  banner?: Express.Multer.File[];
}

const MAX_PINNED_EVENTS = 4;
// Shared transaction lock for event pin capacity across all application instances.
const EVENT_PIN_LOCK_NAMESPACE = 0x45564e54;
const EVENT_PIN_LOCK_KEY = 1;

@Injectable()
export class EventsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  private requireManager(actor: Principal) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role)) {
      throw new ForbiddenException();
    }
  }

  async list(query: ListEventsDto) {
    return this.listRecords(query, false);
  }

  async listPinned() {
    const now = new Date();
    const events = await this.dataSource.getRepository(Event).find({
      where: {
        isPinned: true,
        status: EventStatus.PUBLISHED,
        endTime: MoreThan(now),
      },
      order: { pinnedAt: 'DESC', event_id: 'ASC' },
      take: MAX_PINNED_EVENTS,
    });
    return events.map((event) => EventResponseDto.public(event, now));
  }

  async updatePin(actor: Principal, id: string, dto: UpdateEventPinDto) {
    this.requireManager(actor);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Always acquire the shared lock before the event row lock. READ COMMITTED
      // lets the count see pins committed by the previous lock holder.
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        EVENT_PIN_LOCK_NAMESPACE,
        EVENT_PIN_LOCK_KEY,
      ]);
      const event = await manager.findOne(Event, {
        where: { event_id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('Event not found');

      const now = new Date();
      if (
        dto.isPinned &&
        (event.status !== EventStatus.PUBLISHED || event.endTime <= now)
      ) {
        throw new ConflictException(
          'Only published events that have not ended can be pinned',
        );
      }
      if (event.isPinned === dto.isPinned) {
        return EventResponseDto.from(event, now);
      }
      if (dto.isPinned) {
        const count = await manager.count(Event, {
          where: {
            isPinned: true,
            status: EventStatus.PUBLISHED,
            endTime: MoreThan(now),
          },
        });
        if (count >= MAX_PINNED_EVENTS) {
          throw new ConflictException('At most four active events can be pinned');
        }
      }

      event.isPinned = dto.isPinned;
      event.pinnedAt = dto.isPinned ? now : null;
      return EventResponseDto.from(await manager.save(event), now);
    });
  }

  async manageList(actor: Principal, query: ManageEventsDto) {
    this.requireManager(actor);
    return this.listRecords(query, true);
  }

  private async listRecords(query: ManageEventsDto, managed: boolean) {
    const now = new Date();
    const builder = this.dataSource
      .getRepository(Event)
      .createQueryBuilder('event');
    if (!managed)
      builder.andWhere('event.status = :status', {
        status: EventStatus.PUBLISHED,
      });
    else if (query.status)
      builder.andWhere('event.status = :status', { status: query.status });
    if (query.categoryId)
      builder.andWhere('event.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.q)
      builder.andWhere('strpos(lower(event.name), lower(:q)) > 0', {
        q: query.q,
      });
    if (query.phase === EventPhase.UPCOMING)
      builder.andWhere('event.startTime > :now', { now });
    if (query.phase === EventPhase.ONGOING)
      builder.andWhere('event.startTime <= :now AND event.endTime > :now', {
        now,
      });
    if (query.phase === EventPhase.ENDED)
      builder.andWhere('event.endTime <= :now', { now });
    const [events, total] = await builder
      .orderBy('event.startTime', 'ASC')
      .addOrderBy('event.event_id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: events.map((event) =>
        managed
          ? EventResponseDto.from(event, now)
          : EventResponseDto.public(event, now),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async detail(id: string) {
    const event = await this.dataSource.getRepository(Event).findOne({
      where: {
        event_id: id,
        status: In([EventStatus.PUBLISHED, EventStatus.CANCELLED]),
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return EventResponseDto.public(event);
  }

  async manageDetail(actor: Principal, id: string) {
    this.requireManager(actor);
    const event = await this.dataSource
      .getRepository(Event)
      .findOneBy({ event_id: id });
    if (!event) throw new NotFoundException('Event not found');
    return EventResponseDto.from(event);
  }

  private filename(url: string | null): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url, 'http://local').searchParams.get('file') ?? undefined;
    } catch {
      return undefined;
    }
  }

  private imageUrl(id: string, filename: string) {
    return `/api/events/${id}/images/banner?file=${filename}`;
  }

  async update(
    actor: Principal,
    id: string,
    dto: UpdateEventDto,
    files: EventImages = {},
  ) {
    this.requireManager(actor);
    const changes = Object.keys(dto).filter((key) => dto[key] !== undefined);
    if (!changes.length && !files.banner?.length) {
      throw new BadRequestException('At least one field or image is required');
    }
    if (files.banner && files.banner.length !== 1) {
      throw new BadRequestException('Only one banner is allowed');
    }
    if (files.banner?.[0]) this.uploads.validate(files.banner[0], true);
    const newFiles: string[] = [];
    const oldFiles: string[] = [];
    let result: ReturnType<typeof EventResponseDto.from>;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const event = await manager.findOne(Event, {
          where: { event_id: id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!event) throw new NotFoundException('Event not found');
        const now = new Date();
        if (event.status === EventStatus.CANCELLED)
          throw new ConflictException('Cancelled events cannot be edited');
        const nextStatus = dto.status ?? event.status;
        if (
          nextStatus !== event.status &&
          !(
            (event.status === EventStatus.DRAFT &&
              nextStatus === EventStatus.PUBLISHED) ||
            (event.status === EventStatus.PUBLISHED &&
              nextStatus === EventStatus.CANCELLED)
          )
        )
          throw new ConflictException('Invalid event status transition');
        const cancellationOnly =
          nextStatus === EventStatus.CANCELLED &&
          changes.every((key) => key === 'status') &&
          !files.banner;
        if (
          event.status === EventStatus.PUBLISHED &&
          event.startTime <= now &&
          !cancellationOnly
        ) {
          throw new ConflictException(
            'An event that has started cannot be edited',
          );
        }
        if (nextStatus === EventStatus.CANCELLED && event.endTime <= now)
          throw new ConflictException('An ended event cannot be cancelled');
        const startTime =
          dto.startTime === undefined
            ? event.startTime
            : new Date(dto.startTime);
        const endTime =
          dto.endTime === undefined ? event.endTime : new Date(dto.endTime);
        if (
          !Number.isFinite(startTime.getTime()) ||
          !Number.isFinite(endTime.getTime()) ||
          endTime <= startTime
        ) {
          throw new BadRequestException('endTime must be later than startTime');
        }
        if (nextStatus === EventStatus.PUBLISHED && startTime <= now)
          throw new BadRequestException(
            'Published events must start in the future',
          );
        if (
          dto.categoryId !== undefined ||
          (event.status === EventStatus.DRAFT &&
            nextStatus === EventStatus.PUBLISHED)
        ) {
          const category = await manager.findOne(EventCategory, {
            where: {
              category_id: dto.categoryId ?? event.categoryId,
              isActive: true,
            },
            lock: { mode: 'pessimistic_read' },
          });
          if (!category)
            throw new BadRequestException('Category must exist and be active');
          event.categoryId = category.category_id;
        }
        for (const key of [
          'name',
          'description',
          'venueName',
          'address',
        ] as const) {
          if (dto[key] !== undefined) event[key] = dto[key]!;
        }
        event.startTime = startTime;
        event.endTime = endTime;
        event.status = nextStatus;
        if (nextStatus === EventStatus.CANCELLED) {
          event.isPinned = false;
          event.pinnedAt = null;
        }
        if (files.banner?.[0]) {
          const saved = await this.uploads.save(files.banner[0], 'events');
          newFiles.push(saved.filename);
          const oldFile = this.filename(event.bannerUrl);
          if (oldFile) oldFiles.push(oldFile);
          event.bannerUrl = this.imageUrl(id, saved.filename);
        }
        if (
          event.status === EventStatus.PUBLISHED &&
          event.startTime.getTime() <= Date.now()
        ) {
          throw new ConflictException('Event start time passed during update');
        }
        return EventResponseDto.from(await manager.save(event));
      });
    } catch (error) {
      await Promise.all(
        newFiles.map((filename) => this.uploads.removeEventImage(filename)),
      );
      throw error;
    }
    await Promise.all(
      oldFiles.map((filename) => this.uploads.removeEventImage(filename)),
    );
    return result;
  }

  async remove(actor: Principal, id: string) {
    this.requireManager(actor);
    let filenames: string[];
    try {
      filenames = await this.dataSource.transaction(async (manager) => {
        const event = await manager.findOne(Event, {
          where: { event_id: id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!event) throw new NotFoundException('Event not found');
        await manager.delete(Event, { event_id: id });
        return [this.filename(event.bannerUrl)].filter(
          (name): name is string => !!name,
        );
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23503'
      ) {
        throw new ConflictException('Event is referenced by other resources');
      }
      throw error;
    }
    await Promise.all(
      filenames.map((filename) => this.uploads.removeEventImage(filename)),
    );
    return { event_id: id, message: 'Event deleted' };
  }

  async manageImage(actor: Principal, id: string) {
    this.requireManager(actor);
    return this.readImage(id, true);
  }

  async create(actor: Principal, dto: CreateEventDto, files: EventImages = {}) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role))
      throw new ForbiddenException();
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    if (
      !Number.isFinite(startTime.getTime()) ||
      !Number.isFinite(endTime.getTime()) ||
      endTime <= startTime
    ) {
      throw new BadRequestException('endTime must be later than startTime');
    }
    if (
      dto.status === EventStatus.PUBLISHED &&
      startTime.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Published events must start in the future',
      );
    }
    if (files.banner?.length !== 1) {
      throw new BadRequestException('One banner is required');
    }
    const banner = files.banner[0];
    this.uploads.validate(banner, true);
    const savedFiles: string[] = [];
    try {
      return await this.dataSource.transaction(async (manager) => {
        const category = await manager.findOne(EventCategory, {
          where: { category_id: dto.categoryId, isActive: true },
          lock: { mode: 'pessimistic_read' },
        });
        if (!category)
          throw new BadRequestException('Category must exist and be active');
        const eventId = generateId('event');
        const cover = await this.uploads.save(banner, 'events');
        savedFiles.push(cover.filename);
        if (
          dto.status === EventStatus.PUBLISHED &&
          startTime.getTime() <= Date.now()
        ) {
          throw new BadRequestException(
            'Published events must start in the future',
          );
        }
        const event = manager.create(Event, {
          event_id: eventId,
          name: dto.name,
          description: dto.description ?? null,
          venueName: dto.venueName,
          address: dto.address,
          categoryId: category.category_id,
          status: dto.status,
          isPinned: false,
          pinnedAt: null,
          startTime,
          endTime,
          createdBy: actor.user_id,
          bannerUrl: this.imageUrl(eventId, cover.filename),
        });
        return EventResponseDto.from(await manager.save(event));
      });
    } catch (error) {
      await Promise.all(
        savedFiles.map((filename) => this.uploads.removeEventImage(filename)),
      );
      throw error;
    }
  }

  async image(id: string) {
    return this.readImage(id, false);
  }

  private async readImage(id: string, managed: boolean) {
    const event = await this.dataSource.getRepository(Event).findOne({
      where: {
        event_id: id,
        ...(managed
          ? {}
          : { status: In([EventStatus.PUBLISHED, EventStatus.CANCELLED]) }),
      },
      select: { event_id: true, bannerUrl: true },
    });
    const storedUrl = event?.bannerUrl;
    if (!storedUrl) throw new NotFoundException('Image not found');
    // Only the database-owned filename is used; client query parameters are ignored.
    const filename = new URL(storedUrl, 'http://local').searchParams.get(
      'file',
    );
    if (!filename) throw new NotFoundException('Image not found');
    return this.uploads.readEventImage(filename);
  }
}
