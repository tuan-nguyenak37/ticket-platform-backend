import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import type { Principal } from '../../auth/authorization/principal';
import { OrganizerMember } from '../../organizers/entities/organizer-member.entity';
import { Organizer } from '../../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../../organizers/enums/organizer-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { Event } from '../entities/event.entity';
import { EventStatus } from '../enums/event-status.enum';
import { CreateShowingDto } from './dto/create-showing.dto';
import { UpdateShowingDto } from './dto/update-showing.dto';
import { Showing } from './entities/showing.entity';
import { parseVietnamTime } from './showing-time';
import { ShowingsService } from './showings.service';

describe('Showing time and DTO contracts', () => {
  it('interprets explicit Vietnam time without depending on the server timezone', () => {
    expect(parseVietnamTime('2035-02-01T19:30:00+07:00').toISOString()).toBe(
      '2035-02-01T12:30:00.000Z',
    );
  });

  it.each([
    '2035-02-30T19:30:00+07:00',
    '2035-02-01T19:30:00Z',
    '2035-02-01T19:30:00',
    '2035-02-01T24:30:00+07:00',
  ])('rejects an invalid calendar value or offset: %s', (value) => {
    expect(() => parseVietnamTime(value)).toThrow(BadRequestException);
  });

  it('rejects null update fields and forged parent event IDs', async () => {
    expect(
      await validate(plainToInstance(UpdateShowingDto, { startTime: null })),
    ).not.toHaveLength(0);
    const errors = await validate(
      plainToInstance(CreateShowingDto, {
        name: 'Evening',
        startTime: '2035-02-01T19:30:00+07:00',
        endTime: '2035-02-01T21:30:00+07:00',
        venueName: 'Theatre',
        address: '123 Street',
        city: 'HCM',
        eventId: 'foreign',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.some((error) => error.property === 'eventId')).toBe(true);
  });
});

describe('Showing ownership and mutation', () => {
  const actor: Principal = {
    user_id: 'user_owner',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    sessionId: 'session_owner',
  };
  const events = { findOneBy: jest.fn(), findOne: jest.fn() };
  const organizers = { findOne: jest.fn() };
  const members = { existsBy: jest.fn() };
  const showings = { findOneBy: jest.fn(), findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  const dto: CreateShowingDto = {
    name: 'Evening',
    startTime: '2035-02-01T19:30:00+07:00',
    endTime: '2035-02-01T21:30:00+07:00',
    venueName: 'Theatre',
    address: '123 Street',
    city: 'HCM',
  };
  let service: ShowingsService;
  let event: Event;

  beforeEach(async () => {
    jest.resetAllMocks();
    event = Object.assign(new Event(), {
      eventId: 'event_owned',
      organizerId: 'org_owned',
      status: EventStatus.DRAFT,
    });
    events.findOneBy.mockResolvedValue(event);
    events.findOne.mockResolvedValue(event);
    organizers.findOne.mockResolvedValue({
      organizerId: 'org_owned',
      status: OrganizerStatus.ACTIVE,
    });
    members.existsBy.mockResolvedValue(true);
    const showing = Object.assign(new Showing(), {
      showingId: 'show_owned',
      eventId: event.eventId,
      name: dto.name,
      startTime: parseVietnamTime(dto.startTime),
      endTime: parseVietnamTime(dto.endTime),
      venueName: dto.venueName,
      address: dto.address,
      city: dto.city,
    });
    showings.findOneBy.mockResolvedValue(showing);
    showings.findOne.mockResolvedValue(showing);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Event) return events;
      if (entity === Organizer) return organizers;
      if (entity === OrganizerMember) return members;
      if (entity === Showing) return showings;
      throw new Error('Unexpected repository');
    });
    manager.create.mockImplementation(
      (_entity: unknown, record: object) => record,
    );
    manager.save.mockImplementation((_entity: unknown, record: object) =>
      Promise.resolve(record),
    );
    manager.remove.mockResolvedValue(undefined);
    database.transaction.mockImplementation(
      async (operation: (transaction: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );
    const module = await Test.createTestingModule({
      providers: [
        ShowingsService,
        { provide: getRepositoryToken(Showing), useValue: showings },
        { provide: DataSource, useValue: database },
      ],
    }).compile();
    service = module.get(ShowingsService);
  });

  it('creates a showing linked to its event and serializes UTC timestamps', async () => {
    const result = await service.create(event.eventId, actor, dto);
    expect(result.eventId).toBe(event.eventId);
    expect(result.startTime).toBe('2035-02-01T12:30:00.000Z');
    expect(events.findOne).toHaveBeenCalledWith({
      where: { eventId: event.eventId },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('rejects reverse time ranges and past creation', async () => {
    await expect(
      service.create(event.eventId, actor, { ...dto, endTime: dto.startTime }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(event.eventId, actor, {
        ...dto,
        startTime: '2000-02-01T19:30:00+07:00',
        endTime: '2000-02-01T21:30:00+07:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('blocks non-owners and pending-review changes', async () => {
    members.existsBy.mockResolvedValue(false);
    await expect(
      service.create(event.eventId, actor, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    members.existsBy.mockResolvedValue(true);
    event.status = EventStatus.PENDING_REVIEW;
    await expect(service.remove('show_owned', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it('resets a published event after removing a showing', async () => {
    event.status = EventStatus.PUBLISHED;
    await expect(service.remove('show_owned', actor)).resolves.toEqual({
      showingId: 'show_owned',
    });
    expect(event.status).toBe(EventStatus.DRAFT);
    expect(manager.remove).toHaveBeenCalledWith(
      Showing,
      expect.objectContaining({
        eventId: event.eventId,
      }),
    );
  });

  it('rejects attempts to mutate a showing moved to another event', async () => {
    showings.findOne.mockResolvedValue({ eventId: 'event_foreign' });
    await expect(service.remove('show_owned', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.remove).not.toHaveBeenCalled();
  });
});
