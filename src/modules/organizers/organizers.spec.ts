import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, QueryFailedError } from 'typeorm';
import { resolvePolicy } from '../auth/authorization/access-policy';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { CreateOrganizerDto } from './dto/create-organizer.dto';
import { OrganizerIdDto, UpdateOrganizerDto } from './dto/update-organizer.dto';
import { OrganizerMember } from './entities/organizer-member.entity';
import { Organizer } from './entities/organizer.entity';
import { OrganizerMemberRole } from './enums/organizer-member-role.enum';
import { OrganizerStatus } from './enums/organizer-status.enum';
import { OrganizersController } from './organizers.controller';
import { OrganizersService } from './organizers.service';

describe('Organizer profiles and ownership', () => {
  const actorId = 'user_owner';
  const input = {
    name: ' Sự kiện âm nhạc ',
    contactEmail: ' Organizer@Example.com ',
    description: ' Live music ',
  };
  const users = { findOne: jest.fn() };
  const organizers = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const members = { find: jest.fn(), findOneBy: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  let service: OrganizersService;
  let profile: Organizer;

  beforeEach(async () => {
    jest.resetAllMocks();
    profile = Object.assign(new Organizer(), {
      organizerId: 'org_profile',
      name: 'Original name',
      slug: 'original-name-fixed',
      description: 'Description',
      logoUrl: null,
      coverUrl: null,
      contactEmail: 'contact@example.com',
      contactPhone: null,
      status: OrganizerStatus.ACTIVE,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    });
    users.findOne.mockResolvedValue({
      user_id: actorId,
      status: UserStatus.ACTIVE,
    });
    organizers.findOne.mockResolvedValue(profile);
    organizers.findOneBy.mockResolvedValue(profile);
    organizers.save.mockImplementation((record: Organizer) =>
      Promise.resolve(record),
    );
    members.findOneBy.mockResolvedValue({ role: OrganizerMemberRole.OWNER });
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === User) return users;
      if (entity === Organizer) return organizers;
      if (entity === OrganizerMember) return members;
      throw new Error('Unexpected repository');
    });
    manager.create.mockImplementation(
      (_entity: unknown, record: Record<string, unknown>) => ({ ...record }),
    );
    manager.save.mockImplementation((_entity: unknown, record: unknown) =>
      Promise.resolve(record),
    );
    database.transaction.mockImplementation(
      async (callback: (transaction: typeof manager) => Promise<unknown>) =>
        callback(manager),
    );
    const module = await Test.createTestingModule({
      providers: [
        OrganizersService,
        { provide: getRepositoryToken(Organizer), useValue: organizers },
        { provide: getRepositoryToken(OrganizerMember), useValue: members },
        { provide: DataSource, useValue: database },
      ],
    }).compile();
    service = module.get(OrganizersService);
  });

  it('creates the organizer and OWNER membership in one transaction callback', async () => {
    const result = await service.create(actorId, input);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(users.findOne).toHaveBeenCalledWith({
      where: { user_id: actorId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.save).toHaveBeenNthCalledWith(
      1,
      Organizer,
      expect.objectContaining({
        name: 'Sự kiện âm nhạc',
        contactEmail: 'organizer@example.com',
        description: 'Live music',
        status: OrganizerStatus.ACTIVE,
      }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      OrganizerMember,
      expect.objectContaining({
        userId: actorId,
        organizerId: result.organizerId,
        role: OrganizerMemberRole.OWNER,
      }),
    );
    expect(result.slug).toMatch(/^su-kien-am-nhac-[a-f0-9]{12}$/);
    expect(result.organizerId).toMatch(/^org_[a-zA-Z0-9_-]+$/);
    expect(result).not.toHaveProperty('members');
    expect(result).not.toHaveProperty('userId');
  });

  it.each([null, { status: UserStatus.SUSPENDED }])(
    'rejects creation by an unavailable actor: %p',
    async (actor) => {
      users.findOne.mockResolvedValue(actor);
      await expect(service.create(actorId, input)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('propagates a membership failure from the transaction', async () => {
    const failure = new Error('Membership persistence failed');
    manager.save.mockResolvedValueOnce(profile).mockRejectedValueOnce(failure);
    await expect(service.create(actorId, input)).rejects.toBe(failure);
  });

  it('maps a unique database violation to 409', async () => {
    const failure = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('Duplicate'), { code: '23505' }),
    );
    manager.save.mockRejectedValueOnce(failure);
    await expect(service.create(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lists only the caller memberships and uses a response allowlist', async () => {
    Object.assign(profile, { privateField: 'not returned' });
    members.find.mockResolvedValue([
      { organizer: profile, role: OrganizerMemberRole.OWNER },
    ]);
    const result = await service.findMine(actorId);
    expect(members.find).toHaveBeenCalledWith({
      where: { userId: actorId },
      relations: { organizer: true },
      order: { createdAt: 'DESC' },
    });
    expect(result[0].memberRole).toBe(OrganizerMemberRole.OWNER);
    expect(result[0]).not.toHaveProperty('privateField');
    expect(result[0]).not.toHaveProperty('members');
  });

  it('returns an empty list when the caller has no memberships', async () => {
    members.find.mockResolvedValue([]);
    await expect(service.findMine(actorId)).resolves.toEqual([]);
  });

  it('reads suspended profiles without exposing member records', async () => {
    profile.status = OrganizerStatus.SUSPENDED;
    const result = await service.findOne(profile.organizerId);
    expect(result.status).toBe(OrganizerStatus.SUSPENDED);
    expect(result).not.toHaveProperty('members');
  });

  it('returns 404 for an unknown profile', async () => {
    organizers.findOneBy.mockResolvedValue(null);
    await expect(service.findOne('org_missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates only editable fields and keeps the slug', async () => {
    const result = await service.update(profile.organizerId, actorId, {
      name: ' New name ',
      contactEmail: ' NEW@EXAMPLE.COM ',
      description: null,
    });
    expect(organizers.findOne).toHaveBeenCalledWith({
      where: { organizerId: profile.organizerId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(members.findOneBy).toHaveBeenCalledWith({
      organizerId: profile.organizerId,
      userId: actorId,
      role: OrganizerMemberRole.OWNER,
    });
    expect(result).toMatchObject({
      name: 'New name',
      contactEmail: 'new@example.com',
      description: null,
      slug: 'original-name-fixed',
    });
  });

  it('rejects an empty update before any database work', async () => {
    await expect(
      service.update(profile.organizerId, actorId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-owner even when the account is active', async () => {
    members.findOneBy.mockResolvedValue(null);
    await expect(
      service.update(profile.organizerId, actorId, { name: 'New' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(organizers.save).not.toHaveBeenCalled();
  });

  it('rejects updates to suspended organizers', async () => {
    profile.status = OrganizerStatus.SUSPENDED;
    await expect(
      service.update(profile.organizerId, actorId, { name: 'New' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(organizers.save).not.toHaveBeenCalled();
  });

  it.each([null, { status: UserStatus.SUSPENDED }])(
    'rechecks the actor before updating: %p',
    async (actor) => {
      users.findOne.mockResolvedValue(actor);
      await expect(
        service.update(profile.organizerId, actorId, { name: 'New' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(organizers.save).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when an updated organizer does not exist', async () => {
    organizers.findOne.mockResolvedValue(null);
    await expect(
      service.update('org_missing', actorId, { name: 'New' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(organizers.save).not.toHaveBeenCalled();
  });

  it('propagates update persistence failures', async () => {
    const failure = new Error('Database unavailable');
    organizers.save.mockRejectedValue(failure);
    await expect(
      service.update(profile.organizerId, actorId, { name: 'New' }),
    ).rejects.toBe(failure);
  });
});

describe('Organizer DTO and route contracts', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };

  it('normalizes the create name and email', async () => {
    const dto = plainToInstance(CreateOrganizerDto, {
      name: ' Music ',
      contactEmail: ' CONTACT@EXAMPLE.COM ',
    });
    expect(await validate(dto, options)).toEqual([]);
    expect(dto.name).toBe('Music');
    expect(dto.contactEmail).toBe('contact@example.com');
  });

  it.each([
    { name: ' ', contactEmail: 'contact@example.com' },
    { name: null, contactEmail: 'contact@example.com' },
    { name: 'Event', contactEmail: 'invalid' },
    { name: 'Event', contactEmail: null },
    { name: 'Event', contactEmail: 'contact@example.com', userId: 'other' },
    { name: 'Event', contactEmail: 'contact@example.com', status: 'ACTIVE' },
    { name: 'Event', contactEmail: 'contact@example.com', role: 'OWNER' },
    { name: 'Event', contactEmail: 'contact@example.com', description: 5 },
    { name: 'a'.repeat(256), contactEmail: 'contact@example.com' },
  ])('rejects invalid create input: %p', async (body) => {
    expect(
      await validate(plainToInstance(CreateOrganizerDto, body), options),
    ).not.toHaveLength(0);
  });

  it.each([{ name: null }, { contactEmail: null }, { slug: 'replacement' }])(
    'rejects invalid update input: %p',
    async (body) => {
      expect(
        await validate(plainToInstance(UpdateOrganizerDto, body), options),
      ).not.toHaveLength(0);
    },
  );

  it('accepts null description to clear it', async () => {
    expect(
      await validate(
        plainToInstance(UpdateOrganizerDto, { description: null }),
        options,
      ),
    ).toEqual([]);
  });

  it.each(['../other', 'org/other', 'x'.repeat(41), ''])(
    'rejects an invalid organizer ID: %s',
    async (id) => {
      expect(
        await validate(plainToInstance(OrganizerIdDto, { id }), options),
      ).not.toHaveLength(0);
    },
  );

  it.each(['create', 'findMine', 'findOne', 'update'] as const)(
    'requires authentication and disables response caching on %s',
    (method) => {
      const handler = OrganizersController.prototype[method];
      expect(
        resolvePolicy(new Reflector(), handler, OrganizersController),
      ).toEqual({ kind: 'authenticated' });
      expect(Reflect.getMetadata('__headers__', handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
    },
  );
});
