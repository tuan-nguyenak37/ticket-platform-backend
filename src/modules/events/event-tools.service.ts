import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Principal } from '../auth/authorization/principal';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { OrganizerMemberRole } from '../organizers/enums/organizer-member-role.enum';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { Event } from './entities/event.entity';
import { generateId } from '../../common/utils/generateId';
import type { DiscountDto } from './event-tools.dto';

const discountColumns = `discount_id AS "discountId", code, kind, value, usage_limit AS "usageLimit", starts_at AS "startsAt", ends_at AS "endsAt", active`;
type DiscountView = Omit<DiscountDto, 'startsAt' | 'endsAt'> & {
  discountId: string;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
};

@Injectable()
export class EventToolsService {
  constructor(private readonly dataSource: DataSource) {}

  discounts(eventId: string, actor: Principal) {
    return this.authorized(eventId, actor, true, false, (manager) =>
      manager.query<DiscountView[]>(
        `SELECT ${discountColumns}
      FROM event_discounts d WHERE event_id = $1 ORDER BY created_at DESC`,
        [eventId],
      ),
    );
  }

  createDiscount(eventId: string, actor: Principal, dto: DiscountDto) {
    if (
      (dto.kind === 'PERCENT' && dto.value > 100) ||
      Date.parse(dto.endsAt) <= Date.parse(dto.startsAt)
    )
      throw new BadRequestException('Invalid discount value or time window');
    return this.authorized(eventId, actor, true, true, async (manager) => {
      const rows = await manager.query<DiscountView[]>(
        `INSERT INTO event_discounts(discount_id,event_id,code,kind,value,usage_limit,starts_at,ends_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_id,code) DO NOTHING RETURNING ${discountColumns}`,
        [
          generateId('disc'),
          eventId,
          dto.code,
          dto.kind,
          dto.value,
          dto.usageLimit,
          dto.startsAt,
          dto.endsAt,
        ],
      );
      if (!rows.length)
        throw new ConflictException(
          'Discount code already exists for this event',
        );
      return rows[0];
    });
  }

  discountStatus(
    eventId: string,
    actor: Principal,
    code: string,
    active: boolean,
  ) {
    return this.authorized(eventId, actor, true, true, async (manager) => {
      const [rows] = await manager.query<[DiscountView[], number]>(
        `UPDATE event_discounts SET active = $3 WHERE event_id = $1 AND code = $2 RETURNING ${discountColumns}`,
        [eventId, code, active],
      );
      if (!rows.length) throw new NotFoundException('Discount code not found');
      return rows[0];
    });
  }

  private async access(
    manager: EntityManager,
    event: Event,
    actor: Principal,
    _ownerOnly: boolean,
  ) {
    const owner = await manager.existsBy(OrganizerMember, {
      organizerId: event.organizerId,
      userId: actor.user_id,
      role: OrganizerMemberRole.OWNER,
    });
    if (!owner)
      throw new ForbiddenException('Only the owner can manage event settings');
  }

  private authorized<T>(
    eventId: string,
    actor: Principal,
    ownerOnly: boolean,
    write: boolean,
    action: (manager: EntityManager, event: Event) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const reference = await manager.findOneBy(Event, { eventId });
      if (!reference) throw new NotFoundException('Event not found');
      const organizer = await manager.findOne(Organizer, {
        where: { organizerId: reference.organizerId },
        lock: { mode: 'pessimistic_read' },
      });
      const event = await manager.findOne(Event, {
        where: { eventId },
        lock: { mode: write ? 'pessimistic_write' : 'pessimistic_read' },
      });
      if (!event || !organizer) throw new NotFoundException('Event not found');
      await this.access(manager, event, actor, ownerOnly);
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ConflictException('Organizer is suspended');
      return action(manager, event);
    });
  }
}
