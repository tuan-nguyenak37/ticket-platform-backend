import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { CreateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { Event } from './entities/event.entity';
import { EventCategory } from './entities/event-category.entity';
import { EventStatus } from './entities/enums/event-status.enum';

export interface EventImages {
  thumbnail?: Express.Multer.File[];
  banner?: Express.Multer.File[];
}

@Injectable()
export class EventsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

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
    if (files.thumbnail?.length !== 1 || files.banner?.length !== 1) {
      throw new BadRequestException(
        'One thumbnail and one banner are required',
      );
    }
    const thumbnail = files.thumbnail[0];
    const banner = files.banner[0];
    this.uploads.validate(thumbnail, true);
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
        const thumb = await this.uploads.save(thumbnail, 'events');
        savedFiles.push(thumb.filename);
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
          shortDescription: dto.shortDescription ?? null,
          description: dto.description ?? null,
          venueName: dto.venueName,
          address: dto.address,
          categoryId: category.category_id,
          status: dto.status,
          startTime,
          endTime,
          createdBy: actor.user_id,
          thumbnailUrl:
            '/api/events/' +
            eventId +
            '/images/thumbnail?file=' +
            thumb.filename,
          bannerUrl:
            '/api/events/' + eventId + '/images/banner?file=' + cover.filename,
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

  async image(id: string, kind: string) {
    if (kind !== 'thumbnail' && kind !== 'banner')
      throw new NotFoundException();
    const event = await this.dataSource.getRepository(Event).findOne({
      where: {
        event_id: id,
        status: In([EventStatus.PUBLISHED, EventStatus.CANCELLED]),
      },
      select: { event_id: true, thumbnailUrl: true, bannerUrl: true },
    });
    const storedUrl =
      kind === 'thumbnail' ? event?.thumbnailUrl : event?.bannerUrl;
    if (!storedUrl) throw new NotFoundException('Image not found');
    // Only the database-owned filename is used; client query parameters are ignored.
    const filename = new URL(storedUrl, 'http://local').searchParams.get(
      'file',
    );
    if (!filename) throw new NotFoundException('Image not found');
    return this.uploads.readEventImage(filename);
  }
}
