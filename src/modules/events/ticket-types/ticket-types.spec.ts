import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, QueryFailedError } from 'typeorm';
import type { Principal } from '../../auth/authorization/principal';
import { OrganizerMember } from '../../organizers/entities/organizer-member.entity';
import { Organizer } from '../../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../../organizers/enums/organizer-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { Event } from '../entities/event.entity';
import { EventStatus } from '../enums/event-status.enum';
import { Showing } from '../showings/entities/showing.entity';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { TicketInventory } from './entities/ticket-inventory.entity';
import { TicketType } from './entities/ticket-type.entity';
import { TicketTypeStatus } from './enums/ticket-type-status.enum';
import { TicketTypesService } from './ticket-types.service';

describe('Ticket tiers linked to showings', () => {
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
  const ticketTypes = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const inventories = { findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const database = { transaction: jest.fn() };
  let service: TicketTypesService;
  let ticket: TicketType;
  let inventory: TicketInventory;
  let event: Event;

  beforeEach(async () => {
    jest.resetAllMocks();
    event = Object.assign(new Event(), {
      eventId: 'event_owned',
      organizerId: 'org_owned',
      status: EventStatus.DRAFT,
    });
    const showing = Object.assign(new Showing(), {
      showingId: 'show_owned',
      eventId: event.eventId,
      startTime: new Date('2035-02-03T12:00:00Z'),
    });
    ticket = Object.assign(new TicketType(), {
      ticketTypeId: 'ttype_owned',
      showingId: showing.showingId,
      name: 'Standard',
      description: null,
      price: '200000',
      saleStartAt: new Date('2035-01-01T00:00:00Z'),
      saleEndAt: new Date('2035-02-02T00:00:00Z'),
      maxPerOrder: 4,
      resaleAllowed: true,
      status: TicketTypeStatus.ACTIVE,
    });
    inventory = Object.assign(new TicketInventory(), {
      ticketTypeId: ticket.ticketTypeId,
      totalQuantity: 10,
      reservedQuantity: 0,
      soldQuantity: 0,
    });
    ticket.inventory = inventory;
    events.findOneBy.mockResolvedValue(event);
    events.findOne.mockResolvedValue(event);
    organizers.findOne.mockResolvedValue({
      organizerId: 'org_owned',
      status: OrganizerStatus.ACTIVE,
    });
    members.existsBy.mockResolvedValue(true);
    showings.findOneBy.mockResolvedValue(showing);
    showings.findOne.mockResolvedValue(showing);
    ticketTypes.findOneBy.mockResolvedValue(ticket);
    ticketTypes.findOne.mockResolvedValue(ticket);
    inventories.findOne.mockResolvedValue(inventory);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Event) return events;
      if (entity === Organizer) return organizers;
      if (entity === OrganizerMember) return members;
      if (entity === Showing) return showings;
      if (entity === TicketType) return ticketTypes;
      if (entity === TicketInventory) return inventories;
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
        TicketTypesService,
        { provide: getRepositoryToken(TicketType), useValue: ticketTypes },
        { provide: getRepositoryToken(Showing), useValue: showings },
        { provide: DataSource, useValue: database },
      ],
    }).compile();
    service = module.get(TicketTypesService);
  });

  it('creates a tier for the selected showing and initializes inventory together', async () => {
    const result = await service.create('show_owned', actor, {
      name: 'VIP',
      price: 200000,
      totalQuantity: 10,
    });
    expect(result.showingId).toBe('show_owned');
    expect(result.price).toBe('200000');
    expect(result.availableQuantity).toBe(10);
    expect(manager.save).toHaveBeenNthCalledWith(2, TicketInventory, {
      ticketTypeId: result.ticketTypeId,
      totalQuantity: 10,
      reservedQuantity: 0,
      soldQuantity: 0,
    });
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it('blocks non-owners and pending-review configuration changes', async () => {
    members.existsBy.mockResolvedValue(false);
    await expect(
      service.create('show_owned', actor, {
        name: 'VIP',
        price: 0,
        totalQuantity: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    members.existsBy.mockResolvedValue(true);
    event.status = EventStatus.PENDING_REVIEW;
    await expect(
      service.remove(ticket.ticketTypeId, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it('rejects configuration changes and reductions after a sale or reservation', async () => {
    inventory.soldQuantity = 1;
    await expect(
      service.update(ticket.ticketTypeId, actor, { price: 100000 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(ticket.ticketTypeId, actor, { totalQuantity: 9 }),
    ).rejects.toBeInstanceOf(ConflictException);
    inventory.soldQuantity = 0;
    inventory.reservedQuantity = 1;
    await expect(
      service.remove(ticket.ticketTypeId, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it('allows only inventory increases after sales', async () => {
    inventory.soldQuantity = 1;
    const result = await service.update(ticket.ticketTypeId, actor, {
      totalQuantity: 12,
    });
    expect(result.availableQuantity).toBe(11);
    expect(manager.save).toHaveBeenCalledWith(TicketInventory, inventory);
  });

  it('removes empty inventory before the ticket type', async () => {
    await expect(service.remove(ticket.ticketTypeId, actor)).resolves.toEqual({
      ticketTypeId: ticket.ticketTypeId,
    });
    expect(manager.remove).toHaveBeenNthCalledWith(
      1,
      TicketInventory,
      inventory,
    );
    expect(manager.remove).toHaveBeenNthCalledWith(2, TicketType, ticket);
  });

  it('maps foreign-key protection to 409 instead of forcing deletion', async () => {
    manager.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new QueryFailedError(
          'DELETE',
          [],
          Object.assign(new Error('Referenced'), { code: '23503' }),
        ),
      );
    await expect(
      service.remove(ticket.ticketTypeId, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a duplicate showing-local tier name to 409', async () => {
    manager.save.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('Duplicate'), { code: '23505' }),
      ),
    );
    await expect(
      service.create('show_owned', actor, {
        name: 'Standard',
        price: 0,
        totalQuantity: 10,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns availability but no internal counters to public buyers', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(ticket),
    };
    ticketTypes.createQueryBuilder.mockReturnValue(builder);
    inventory.reservedQuantity = 2;
    inventory.soldQuantity = 3;
    const result = await service.findOne(ticket.ticketTypeId);
    expect(result.availableQuantity).toBe(5);
    expect(result).not.toHaveProperty('soldQuantity');
    expect(result).not.toHaveProperty('reservedQuantity');
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ticketType.status = :ticketStatus'),
    );
  });
});

describe('Ticket tier numeric input', () => {
  it.each([-1, 1.5, '200.000', Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid VND values: %p',
    async (price) => {
      const dto = plainToInstance(CreateTicketTypeDto, {
        name: 'Standard',
        price,
        totalQuantity: 10,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('accepts integer VND and rejects a body-supplied showing ID', async () => {
    const dto = plainToInstance(CreateTicketTypeDto, {
      name: ' Standard ',
      price: 200000,
      totalQuantity: 10,
      showingId: 'foreign',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(dto.name).toBe('Standard');
    expect(errors.some((error) => error.property === 'showingId')).toBe(true);
  });
});
