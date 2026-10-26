import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { lastValueFrom, of } from 'rxjs';
import { DataSource } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { resolvePolicy } from '../auth/authorization/access-policy';
import { AuditInterceptor } from '../auth/authorization/audit.interceptor';
import { AuditService } from '../auth/authorization/audit.service';
import { Principal } from '../auth/authorization/principal';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import {
  CreateEventDto,
  EventListQueryDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventCategory } from './entities/event-category.entity';
import { Event } from './entities/event.entity';
import { EventStatus } from './enums/event-status.enum';
import {
  EventsController,
  OrganizerEventsController,
} from './events.controller';
import { EventsService } from './events.service';

describe('Event profile management', () => {
  const actor: Principal = {
    user_id: 'user_owner',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    sessionId: 'session_owner',
  };
  const members = { findOneBy: jest.fn(), existsBy: jest.fn() };
  const categories = { existsBy: jest.fn(), find: jest.fn() };
  const organizers = { findOne: jest.fn() };
  const events = { findOne: jest.fn(), findOneBy: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const database = { transaction: jest.fn(), manager };
  let service: EventsService;
  let event: Event;

  beforeEach(async () => {
    jest.resetAllMocks();
    event = Object.assign(new Event(), {
      eventId: 'event_example',
      organizerId: 'org_owner',
      categoryId: 'category_music',
      title: 'Music',
      slug: 'music-fixed',
      description: null,
      posterUrl: null,
      status: EventStatus.DRAFT,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      organizer: { status: OrganizerStatus.ACTIVE },
    });
    events.findOne.mockResolvedValue(event);
    events.findOneBy.mockResolvedValue(event);
    organizers.findOne.mockResolvedValue({
      organizerId: 'org_owner',
      status: OrganizerStatus.ACTIVE,
    });
    members.findOneBy.mockResolvedValue({ role: 'OWNER' });
    members.existsBy.mockResolvedValue(false);
    categories.existsBy.mockResolvedValue(true);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Event) return events;
      if (entity === Organizer) return organizers;
      if (entity === OrganizerMember) return members;
      if (entity === EventCategory) return categories;
      throw new Error('Unexpected repository');
    });
    manager.create.mockImplementation(
      (_entity: unknown, values: object) => values,
    );
    manager.save.mockImplementation((_entity: unknown, values: object) =>
      Promise.resolve(values),
    );
    database.transaction.mockImplementation(
      async (operation: (transaction: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: events },
        { provide: getRepositoryToken(EventCategory), useValue: categories },
        { provide: getRepositoryToken(OrganizerMember), useValue: members },
        { provide: DataSource, useValue: database },
        { provide: UploadsService, useValue: {} },
      ],
    }).compile();
    service = module.get(EventsService);
  });

  it('creates a DRAFT owned by the requested organizer, not a supplied role', async () => {
    const result = await service.create('org_owner', actor, {
      title: 'Live music',
      categoryId: 'category_music',
    });
    expect(result.status).toBe(EventStatus.DRAFT);
    expect(manager.save).toHaveBeenCalledWith(
      Event,
      expect.objectContaining({
        organizerId: 'org_owner',
        status: EventStatus.DRAFT,
      }),
    );
    expect(result.slug).toMatch(/^live-music-[a-f0-9]{12}$/);
  });

  it('rejects creation by a non-owner', async () => {
    members.findOneBy.mockResolvedValue(null);
    await expect(
      service.create('org_owner', actor, {
        title: 'Music',
        categoryId: 'category_music',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects suspended organizers and invalid categories', async () => {
    organizers.findOne.mockResolvedValue({ status: OrganizerStatus.SUSPENDED });
    await expect(
      service.create('org_owner', actor, {
        title: 'Music',
        categoryId: 'category_music',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    organizers.findOne.mockResolvedValue({ status: OrganizerStatus.ACTIVE });
    categories.existsBy.mockResolvedValue(false);
    await expect(
      service.create('org_owner', actor, {
        title: 'Music',
        categoryId: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('hides unpublished events from strangers', async () => {
    await expect(service.findOne(event.eventId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findOne(event.eventId, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses an allowlist for publicly published events', async () => {
    event.status = EventStatus.PUBLISHED;
    const result = await service.findOne(event.eventId);
    expect(result.eventId).toBe(event.eventId);
    expect(result).not.toHaveProperty('reviewedBy');
    expect(result).not.toHaveProperty('organizer');
  });

  it('blocks edits during review and resets changed published content to DRAFT', async () => {
    event.status = EventStatus.PENDING_REVIEW;
    await expect(
      service.update(event.eventId, actor, { title: 'New title' }),
    ).rejects.toBeInstanceOf(ConflictException);
    event.status = EventStatus.PUBLISHED;
    const result = await service.update(event.eventId, actor, {
      title: 'New title',
    });
    expect(result.status).toBe(EventStatus.DRAFT);
    expect(result.slug).toBe('music-fixed');
  });

  it('rejects empty edits', async () => {
    await expect(
      service.update(event.eventId, actor, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records the new eventId shape in the operational audit', async () => {
    const record = jest.fn();
    const interceptor = new AuditInterceptor(new Reflector(), {
      record,
    } as unknown as AuditService);
    const context = {
      getHandler: () => OrganizerEventsController.prototype.create,
      switchToHttp: () => ({
        getRequest: () => ({
          params: { id: 'org_owner' },
          user: actor,
          requestId: 'request_example',
        }),
      }),
    } as unknown as ExecutionContext;
    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ eventId: 'event_created' }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'events.create',
        targetId: 'event_created',
      }),
    );
  });
});

describe('Event DTO and access policies', () => {
  it('normalizes names and rejects forged ownership/status fields', async () => {
    const dto = plainToInstance(CreateEventDto, {
      title: ' Music ',
      categoryId: 'category_music',
      status: 'PUBLISHED',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(dto.title).toBe('Music');
    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it('rejects null titles on update and excessive pagination', async () => {
    expect(
      await validate(plainToInstance(UpdateEventDto, { title: null })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(EventListQueryDto, { limit: 101 })),
    ).not.toHaveLength(0);
  });

  it('keeps discovery public, detail optional and writes authenticated', () => {
    const reflector = new Reflector();
    expect(
      resolvePolicy(
        reflector,
        EventsController.prototype.discover,
        EventsController,
      ),
    ).toEqual({ kind: 'public' });
    expect(
      resolvePolicy(
        reflector,
        EventsController.prototype.findOne,
        EventsController,
      ),
    ).toEqual({ kind: 'optional' });
    expect(
      resolvePolicy(
        reflector,
        OrganizerEventsController.prototype.create,
        OrganizerEventsController,
      ),
    ).toEqual({ kind: 'authenticated' });
  });
});
