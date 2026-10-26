import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EventToolsService } from './event-tools.service';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import type { Principal } from '../auth/authorization/principal';
import { DiscountDto } from './event-tools.dto';
import { EventRegistrationDiscounts1792454402100 } from '../../database/migrations/1792454402100-EventRegistrationDiscounts';
import type { QueryRunner } from 'typeorm';

describe('Owner-managed event discounts', () => {
  const actor: Principal = {
    user_id: 'user_owner',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    sessionId: 'session_owner',
  };
  const manager = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    existsBy: jest.fn(),
    query: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  const dto: DiscountDto = {
    code: 'SAVE10',
    kind: 'PERCENT',
    value: 10,
    usageLimit: 5,
    startsAt: '2035-01-01T00:00:00Z',
    endsAt: '2035-02-01T00:00:00Z',
  };
  let service: EventToolsService;

  beforeEach(() => {
    jest.resetAllMocks();
    manager.findOneBy.mockResolvedValue({ organizerId: 'org_owned' });
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === Organizer
          ? { status: OrganizerStatus.ACTIVE }
          : {
              eventId: 'event_owned',
              organizerId: 'org_owned',
            },
      ),
    );
    manager.existsBy.mockResolvedValue(true);
    manager.query.mockResolvedValue([{ code: 'SAVE10' }]);
    database.transaction.mockImplementation(
      async (operation: (transaction: EntityManager) => Promise<unknown>) =>
        operation(manager as unknown as EntityManager),
    );
    service = Reflect.construct(EventToolsService, [
      database as unknown as DataSource,
      undefined,
    ]);
  });

  it('rejects an excessive percentage before writing', () => {
    expect(() =>
      service.createDiscount('event_owned', actor, { ...dto, value: 101 }),
    ).toThrow(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects non-owner writes and suspended organizers', async () => {
    manager.existsBy.mockResolvedValue(false);
    await expect(
      service.createDiscount('event_owned', actor, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    manager.existsBy.mockResolvedValue(true);
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === Organizer
          ? { status: OrganizerStatus.SUSPENDED }
          : {
              eventId: 'event_owned',
              organizerId: 'org_owned',
            },
      ),
    );
    await expect(
      service.createDiscount('event_owned', actor, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('parameterizes codes and maps duplicate insertion to a conflict', async () => {
    manager.query.mockResolvedValue([]);
    await expect(
      service.createDiscount('event_owned', actor, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(event_id,code) DO NOTHING'),
      expect.arrayContaining(['event_owned', 'SAVE10']),
    );
  });
});

describe('Legacy-compatible registration/discount migration', () => {
  it('does not recreate schema already owned by an applied legacy migration', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(true),
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn(),
    };
    await new EventRegistrationDiscounts1792454402100().up(
      runner as unknown as QueryRunner,
    );
    expect(runner.query).not.toHaveBeenCalled();
  });

  it('refuses a destructive automatic rollback', async () => {
    await expect(
      new EventRegistrationDiscounts1792454402100().down(),
    ).rejects.toThrow('Forward-only');
  });
});
