import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { resolvePolicy } from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { EventCategory } from './entities/event-category.entity';
import { EventReviewLog } from './entities/event-review-log.entity';
import { Event } from './entities/event.entity';
import { EventReviewAction } from './enums/event-review-action.enum';
import { EventStatus } from './enums/event-status.enum';
import { EventModerationController } from './events.controller';
import { EventsService } from './events.service';
import { Showing } from './showings/entities/showing.entity';

describe('Event review workflow', () => {
  const actor: Principal = {
    user_id: 'user_moderator',
    role: UserRole.MODERATOR,
    status: UserStatus.ACTIVE,
    sessionId: 'session_example',
  };
  const events = { findOneBy: jest.fn(), findOne: jest.fn() };
  const organizers = { findOne: jest.fn() };
  const members = { findOneBy: jest.fn(), existsBy: jest.fn() };
  const showings = { find: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  let event: Event;
  let service: EventsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    event = Object.assign(new Event(), {
      eventId: 'event_review',
      organizerId: 'org_review',
      title: 'Event',
      description: 'Complete description',
      status: EventStatus.PENDING_REVIEW,
      rejectionReason: null,
    });
    events.findOneBy.mockResolvedValue(event);
    events.findOne.mockResolvedValue(event);
    organizers.findOne.mockResolvedValue({
      organizerId: event.organizerId,
      status: OrganizerStatus.ACTIVE,
    });
    members.findOneBy.mockResolvedValue({ role: 'OWNER' });
    members.existsBy.mockResolvedValue(false);
    showings.find.mockResolvedValue([]);
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
    manager.query.mockResolvedValue([]);
    database.transaction.mockImplementation(
      async (operation: (transaction: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: events },
        { provide: getRepositoryToken(EventCategory), useValue: {} },
        { provide: getRepositoryToken(OrganizerMember), useValue: members },
        { provide: DataSource, useValue: database },
        { provide: UploadsService, useValue: {} },
      ],
    }).compile();
    service = module.get(EventsService);
  });

  it('rejects and writes its journal in the same transaction callback', async () => {
    const result = await service.review(
      event.eventId,
      actor,
      EventReviewAction.REJECTED,
      ' Missing information ',
    );
    expect(result.status).toBe(EventStatus.REJECTED);
    expect(result.rejectionReason).toBe('Missing information');
    expect(manager.save).toHaveBeenNthCalledWith(1, Event, event);
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      EventReviewLog,
      expect.objectContaining({
        eventId: event.eventId,
        moderatorId: actor.user_id,
        action: EventReviewAction.REJECTED,
        reason: 'Missing information',
      }),
    );
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it('blocks self-review and repeated review decisions', async () => {
    members.existsBy.mockResolvedValue(true);
    await expect(
      service.review(
        event.eventId,
        actor,
        EventReviewAction.REJECTED,
        'Reason',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    members.existsBy.mockResolvedValue(false);
    event.status = EventStatus.PUBLISHED;
    await expect(
      service.review(event.eventId, actor, EventReviewAction.APPROVED, null),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('requires readiness before approval or submission', async () => {
    await expect(
      service.review(event.eventId, actor, EventReviewAction.APPROVED, null),
    ).rejects.toBeInstanceOf(BadRequestException);
    event.status = EventStatus.DRAFT;
    await expect(service.submit(event.eventId, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('requires a rejection reason even for internal calls', async () => {
    await expect(
      service.review(event.eventId, actor, EventReviewAction.REJECTED, ' '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('allows only ADMIN/MODERATOR review routes', () => {
    expect(
      resolvePolicy(
        new Reflector(),
        EventModerationController.prototype.approve,
        EventModerationController,
      ),
    ).toEqual({ kind: 'roles', roles: [UserRole.ADMIN, UserRole.MODERATOR] });
  });
});
