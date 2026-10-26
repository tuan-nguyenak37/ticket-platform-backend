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
import { Showing } from '../showings/entities/showing.entity';
import { parseVietnamTime } from '../showings/showing-time';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { TicketInventory } from './entities/ticket-inventory.entity';
import { TicketType } from './entities/ticket-type.entity';
import { TicketTypeStatus } from './enums/ticket-type-status.enum';
import { validateTicketConfiguration } from './ticket-configuration';

@Injectable()
export class TicketTypesService {
  constructor(
    @InjectRepository(TicketType)
    private readonly ticketTypes: Repository<TicketType>,
    @InjectRepository(Showing) private readonly showings: Repository<Showing>,
    private readonly dataSource: DataSource,
  ) {}

  async create(showingId: string, actor: Principal, dto: CreateTicketTypeDto) {
    return this.handleUniqueName(async () =>
      this.withLockedShowing(showingId, actor, async (manager, showing) => {
        const saleStartAt = dto.saleStartAt
          ? parseVietnamTime(dto.saleStartAt)
          : null;
        const saleEndAt = dto.saleEndAt
          ? parseVietnamTime(dto.saleEndAt)
          : null;
        const maxPerOrder = dto.maxPerOrder ?? 4;
        const status = dto.status ?? TicketTypeStatus.DRAFT;
        validateTicketConfiguration({
          saleStartAt,
          saleEndAt,
          showingStart: showing.startTime,
          maxPerOrder,
          totalQuantity: dto.totalQuantity,
          status,
          checkMaximum:
            dto.maxPerOrder !== undefined || status === TicketTypeStatus.ACTIVE,
          checkFuture: true,
        });
        const ticketType = manager.create(TicketType, {
          ticketTypeId: generateId('ttype'),
          showingId,
          name: dto.name,
          description: dto.description ?? null,
          price: String(dto.price),
          saleStartAt,
          saleEndAt,
          maxPerOrder,
          resaleAllowed: dto.resaleAllowed ?? false,
          status,
        });
        const saved = await manager.save(TicketType, ticketType);
        const inventory = await manager.save(
          TicketInventory,
          manager.create(TicketInventory, {
            ticketTypeId: saved.ticketTypeId,
            totalQuantity: dto.totalQuantity,
            reservedQuantity: 0,
            soldQuantity: 0,
          }),
        );
        return this.managementResponse(saved, inventory);
      }),
    );
  }

  async findByShowing(showingId: string, actor?: Principal) {
    const showing = await this.showings
      .createQueryBuilder('showing')
      .innerJoin('showing.event', 'event')
      .innerJoin('event.organizer', 'organizer')
      .where('showing.showingId = :showingId', { showingId })
      .andWhere(this.viewCondition(actor, false))
      .setParameters(this.viewParams(actor))
      .getOne();
    if (!showing) throw new NotFoundException('Showing not found');
    const internal = await this.canViewInternally(showing.eventId, actor);
    const builder = this.ticketTypes
      .createQueryBuilder('ticketType')
      .innerJoinAndSelect('ticketType.inventory', 'inventory')
      .innerJoin('ticketType.showing', 'showing')
      .innerJoin('showing.event', 'event')
      .innerJoin('event.organizer', 'organizer')
      .where('ticketType.showingId = :showingId', { showingId });
    if (!internal)
      builder.andWhere(
        'event.status = :published AND organizer.status = :active',
        {
          published: EventStatus.PUBLISHED,
          active: OrganizerStatus.ACTIVE,
        },
      );
    if (!internal)
      builder.andWhere('ticketType.status = :ticketStatus', {
        ticketStatus: TicketTypeStatus.ACTIVE,
      });
    const tickets = await builder
      .orderBy('ticketType.createdAt', 'ASC')
      .addOrderBy('ticketType.ticketTypeId', 'ASC')
      .getMany();
    return tickets.map((ticketType) =>
      internal
        ? this.managementResponse(ticketType, ticketType.inventory)
        : this.publicResponse(ticketType, ticketType.inventory),
    );
  }

  async findOne(ticketTypeId: string, actor?: Principal) {
    const builder = this.ticketTypes
      .createQueryBuilder('ticketType')
      .innerJoinAndSelect('ticketType.inventory', 'inventory')
      .innerJoin('ticketType.showing', 'showing')
      .innerJoin('showing.event', 'event')
      .innerJoin('event.organizer', 'organizer')
      .where('ticketType.ticketTypeId = :ticketTypeId', { ticketTypeId })
      .andWhere(this.viewCondition(actor, true))
      .setParameters(this.viewParams(actor));
    const ticketType = await builder.getOne();
    if (!ticketType) throw new NotFoundException('Ticket type not found');
    const internal = await this.canViewInternallyByShowing(
      ticketType.showingId,
      actor,
    );
    return internal
      ? this.managementResponse(ticketType, ticketType.inventory)
      : this.publicResponse(ticketType, ticketType.inventory);
  }

  async update(
    ticketTypeId: string,
    actor: Principal,
    dto: UpdateTicketTypeDto,
  ) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('At least one field is required');
    const reference = await this.findTicketType(ticketTypeId);
    return this.handleUniqueName(async () =>
      this.withLockedShowing(
        reference.showingId,
        actor,
        async (manager, showing) => {
          const ticketType = await manager.getRepository(TicketType).findOne({
            where: { ticketTypeId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!ticketType) throw new NotFoundException('Ticket type not found');
          if (ticketType.showingId !== showing.showingId)
            throw new ConflictException('Ticket type was moved');
          const inventory = await manager
            .getRepository(TicketInventory)
            .findOne({
              where: { ticketTypeId },
              lock: { mode: 'pessimistic_write' },
            });
          if (!inventory)
            throw new ConflictException('Ticket inventory not found');

          const name = dto.name ?? ticketType.name;
          const description =
            dto.description === undefined
              ? ticketType.description
              : dto.description;
          const price =
            dto.price === undefined ? ticketType.price : String(dto.price);
          const saleStartAt =
            dto.saleStartAt === undefined
              ? ticketType.saleStartAt
              : parseVietnamTime(dto.saleStartAt);
          const saleEndAt =
            dto.saleEndAt === undefined
              ? ticketType.saleEndAt
              : parseVietnamTime(dto.saleEndAt);
          const maxPerOrder = dto.maxPerOrder ?? ticketType.maxPerOrder;
          const resaleAllowed = dto.resaleAllowed ?? ticketType.resaleAllowed;
          const status = dto.status ?? ticketType.status;
          const totalQuantity = dto.totalQuantity ?? inventory.totalQuantity;
          const timeChanged =
            saleStartAt?.getTime() !== ticketType.saleStartAt?.getTime() ||
            saleEndAt?.getTime() !== ticketType.saleEndAt?.getTime();
          const configChanged =
            name !== ticketType.name ||
            description !== ticketType.description ||
            price !== ticketType.price ||
            timeChanged ||
            maxPerOrder !== ticketType.maxPerOrder ||
            resaleAllowed !== ticketType.resaleAllowed ||
            status !== ticketType.status;
          const quantityChanged = totalQuantity !== inventory.totalQuantity;
          if (!configChanged && !quantityChanged)
            return this.managementResponse(ticketType, inventory);

          if (
            inventory.reservedQuantity + inventory.soldQuantity > 0 &&
            (configChanged || totalQuantity < inventory.totalQuantity)
          ) {
            throw new ConflictException(
              'Only increasing totalQuantity is allowed after reservations or sales',
            );
          }
          if (
            ticketType.status !== TicketTypeStatus.DRAFT &&
            status === TicketTypeStatus.DRAFT
          )
            throw new ConflictException('Ticket type cannot return to DRAFT');
          validateTicketConfiguration({
            saleStartAt,
            saleEndAt,
            showingStart: showing.startTime,
            maxPerOrder,
            totalQuantity,
            status,
            checkMaximum:
              status === TicketTypeStatus.ACTIVE ||
              dto.maxPerOrder !== undefined ||
              quantityChanged,
            checkFuture:
              timeChanged ||
              (status === TicketTypeStatus.ACTIVE &&
                ticketType.status !== status),
          });

          ticketType.name = name;
          ticketType.description = description;
          ticketType.price = price;
          ticketType.saleStartAt = saleStartAt;
          ticketType.saleEndAt = saleEndAt;
          ticketType.maxPerOrder = maxPerOrder;
          ticketType.resaleAllowed = resaleAllowed;
          ticketType.status = status;
          if (configChanged) await manager.save(TicketType, ticketType);
          if (quantityChanged) {
            inventory.totalQuantity = totalQuantity;
            await manager.save(TicketInventory, inventory);
          }
          return this.managementResponse(ticketType, inventory);
        },
      ),
    );
  }

  async remove(ticketTypeId: string, actor: Principal) {
    const reference = await this.findTicketType(ticketTypeId);
    return this.withLockedShowing(
      reference.showingId,
      actor,
      async (manager, showing) => {
        const ticketType = await manager.getRepository(TicketType).findOne({
          where: { ticketTypeId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!ticketType) throw new NotFoundException('Ticket type not found');
        if (ticketType.showingId !== showing.showingId)
          throw new ConflictException('Ticket type was moved');
        const inventory = await manager.getRepository(TicketInventory).findOne({
          where: { ticketTypeId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!inventory)
          throw new ConflictException('Ticket inventory not found');
        if (inventory.reservedQuantity + inventory.soldQuantity > 0)
          throw new ConflictException('Ticket type has reservations or sales');
        try {
          await manager.remove(TicketInventory, inventory);
          await manager.remove(TicketType, ticketType);
        } catch (error) {
          if (
            error instanceof QueryFailedError &&
            (error.driverError as { code?: string }).code === '23503'
          )
            throw new ConflictException(
              'Ticket type is referenced by another record',
            );
          throw error;
        }
        return { ticketTypeId };
      },
    );
  }

  private async withLockedShowing<T>(
    showingId: string,
    actor: Principal,
    operation: (manager: EntityManager, showing: Showing) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const reference = await manager
        .getRepository(Showing)
        .findOneBy({ showingId });
      if (!reference) throw new NotFoundException('Showing not found');
      const eventReference = await manager
        .getRepository(Event)
        .findOneBy({ eventId: reference.eventId });
      if (!eventReference) throw new NotFoundException('Event not found');
      const organizer = await manager.getRepository(Organizer).findOne({
        where: { organizerId: eventReference.organizerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!organizer) throw new NotFoundException('Organizer not found');
      const event = await manager.getRepository(Event).findOne({
        where: { eventId: reference.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('Event not found');
      const showing = await manager.getRepository(Showing).findOne({
        where: { showingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!showing) throw new NotFoundException('Showing not found');
      const owner = await manager.getRepository(OrganizerMember).existsBy({
        organizerId: organizer.organizerId,
        userId: actor.user_id,
        role: OrganizerMemberRole.OWNER,
      });
      if (!owner)
        throw new ForbiddenException('Only the owner can manage ticket types');
      if (event.status === EventStatus.PENDING_REVIEW)
        throw new ConflictException('Event is pending review');
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ForbiddenException(
          'Suspended organizers cannot manage ticket types',
        );
      return operation(manager, showing);
    });
  }

  private async findTicketType(ticketTypeId: string) {
    const ticketType = await this.ticketTypes.findOneBy({ ticketTypeId });
    if (!ticketType) throw new NotFoundException('Ticket type not found');
    return ticketType;
  }

  private viewParams(actor?: Principal) {
    return {
      published: EventStatus.PUBLISHED,
      active: OrganizerStatus.ACTIVE,
      ticketStatus: TicketTypeStatus.ACTIVE,
      userId: actor?.user_id ?? '',
      ownerRole: OrganizerMemberRole.OWNER,
    };
  }

  private viewCondition(
    actor: Principal | undefined,
    includeTicketStatus: boolean,
  ) {
    const publicCondition = `(event.status = :published AND organizer.status = :active${includeTicketStatus ? ' AND ticketType.status = :ticketStatus' : ''})`;
    if (actor && [UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role))
      return '1 = 1';
    if (!actor) return publicCondition;
    return `(${publicCondition} OR EXISTS (
      SELECT 1 FROM organizer_members member WHERE member.organizer_id = event.organizer_id
      AND member.user_id = :userId AND member.role = :ownerRole
    ))`;
  }

  private async canViewInternally(eventId: string, actor?: Principal) {
    if (!actor) return false;
    if ([UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role)) return true;
    const event = await this.dataSource
      .getRepository(Event)
      .findOneBy({ eventId });
    return event
      ? this.dataSource.getRepository(OrganizerMember).existsBy({
          organizerId: event.organizerId,
          userId: actor.user_id,
          role: OrganizerMemberRole.OWNER,
        })
      : false;
  }
  private async canViewInternallyByShowing(
    showingId: string,
    actor?: Principal,
  ) {
    if (!actor) return false;
    if ([UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role)) return true;
    const showing = await this.showings.findOneBy({ showingId });
    return showing ? this.canViewInternally(showing.eventId, actor) : false;
  }

  private async handleUniqueName<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'Ticket type name already exists for this showing',
        );
      throw error;
    }
  }

  private publicResponse(ticketType: TicketType, inventory: TicketInventory) {
    return {
      ticketTypeId: ticketType.ticketTypeId,
      showingId: ticketType.showingId,
      name: ticketType.name,
      description: ticketType.description,
      price: ticketType.price,
      saleStartAt: ticketType.saleStartAt?.toISOString() ?? null,
      saleEndAt: ticketType.saleEndAt?.toISOString() ?? null,
      maxPerOrder: ticketType.maxPerOrder,
      resaleAllowed: ticketType.resaleAllowed,
      availableQuantity:
        inventory.totalQuantity -
        inventory.reservedQuantity -
        inventory.soldQuantity,
      createdAt: ticketType.createdAt,
      updatedAt: ticketType.updatedAt,
    };
  }

  private managementResponse(
    ticketType: TicketType,
    inventory: TicketInventory,
  ) {
    return {
      ...this.publicResponse(ticketType, inventory),
      status: ticketType.status,
      totalQuantity: inventory.totalQuantity,
      reservedQuantity: inventory.reservedQuantity,
      soldQuantity: inventory.soldQuantity,
    };
  }
}
