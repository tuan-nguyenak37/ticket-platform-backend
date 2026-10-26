import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { Principal } from '../auth/authorization/principal';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { OrganizerMemberRole } from '../organizers/enums/organizer-member-role.enum';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { Event } from './entities/event.entity';
import { generateId } from '../../common/utils/generateId';
import type { AttendeesQueryDto, DiscountDto } from './event-tools.dto';

const discountColumns = `discount_id AS "discountId", code, kind, value, usage_limit AS "usageLimit", starts_at AS "startsAt", ends_at AS "endsAt", active`;
const attendeeFrom = `FROM tickets t JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
  JOIN showings s ON s.showing_id = tt.showing_id JOIN users u ON u.user_id = t.owner_user_id
  JOIN order_items oi ON oi.order_item_id = t.order_item_id JOIN orders o ON o.order_id = oi.order_id
  WHERE s.event_id = $1 AND ($2::varchar IS NULL OR s.showing_id = $2) AND o.status = 'PAID'`;
const attendeeColumns = `t.ticket_id AS "ticketId", t.status, t.checked_in_at AS "checkedInAt", u.full_name AS "fullName", u.email,
  tt.name AS "ticketTypeName", s.name AS "showingName", s.showing_id AS "showingId", o.order_id AS "orderId",
  o.registration_answers AS answers`;

type DiscountView = Omit<DiscountDto, 'startsAt' | 'endsAt'> & {
  discountId: string;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  usedOrReserved?: number;
};
type AttendeeRow = {
  ticketId: string;
  status: string;
  checkedInAt: Date | null;
  fullName: string;
  email: string;
  ticketTypeName: string;
  showingName: string;
  showingId: string;
  orderId: string;
  answers: { questionId: string; label: string; value: string }[];
};

@Injectable()
export class EventToolsService {
  constructor(private readonly dataSource: DataSource) {}

  discounts(eventId: string, actor: Principal) {
    return this.authorized(eventId, actor, false, (manager) =>
      manager.query<DiscountView[]>(
        `SELECT ${discountColumns},
      (SELECT count(*)::int FROM orders o LEFT JOIN ticket_reservations r ON r.order_id = o.order_id
       WHERE o.discount_id = d.discount_id AND (o.status = 'PAID' OR (o.status = 'PENDING_PAYMENT' AND r.status = 'ACTIVE' AND r.expires_at > clock_timestamp()))) AS "usedOrReserved"
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
    return this.authorized(eventId, actor, true, async (manager) => {
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
    return this.authorized(eventId, actor, true, async (manager) => {
      const [rows] = await manager.query<[DiscountView[], number]>(
        `UPDATE event_discounts SET active = $3 WHERE event_id = $1 AND code = $2 RETURNING ${discountColumns}`,
        [eventId, code, active],
      );
      if (!rows.length) throw new NotFoundException('Discount code not found');
      return rows[0];
    });
  }

  attendees(eventId: string, actor: Principal, query: AttendeesQueryDto) {
    return this.authorized(eventId, actor, false, async (manager) => {
      const params = [eventId, query.showingId ?? null];
      const [{ total, checkedIn }] = await manager.query<
        { total: number; checkedIn: number }[]
      >(
        `SELECT count(*)::int AS total, count(t.checked_in_at)::int AS "checkedIn" ${attendeeFrom}`,
        params,
      );
      const items = await manager.query<AttendeeRow[]>(
        `SELECT ${attendeeColumns} ${attendeeFrom} ORDER BY t.ticket_id LIMIT 50 OFFSET $3`,
        [...params, (query.page - 1) * 50],
      );
      const showings = await manager.query<
        { showingId: string; name: string }[]
      >(
        'SELECT showing_id AS "showingId", name FROM showings WHERE event_id = $1 ORDER BY start_time',
        [eventId],
      );
      return { items, total, checkedIn, page: query.page, limit: 50, showings };
    });
  }

  exportAttendees(eventId: string, actor: Principal, query: AttendeesQueryDto) {
    return this.authorized(eventId, actor, false, async (manager) => {
      const rows = await manager.query<AttendeeRow[]>(
        `SELECT ${attendeeColumns} ${attendeeFrom} ORDER BY t.ticket_id LIMIT 10001`,
        [eventId, query.showingId ?? null],
      );
      if (rows.length > 10000)
        throw new ConflictException(
          'Export is limited to 10000 tickets. Filter by showing.',
        );
      const cell = (value: string) =>
        '"' + value.replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
      const csv = [
        [
          'Ticket ID',
          'Name',
          'Email',
          'Showing',
          'Ticket type',
          'Status',
          'Check-in',
          'Order',
          'Buyer registration',
        ],
        ...rows.map((row) => [
          row.ticketId,
          row.fullName,
          row.email,
          row.showingName,
          row.ticketTypeName,
          row.status,
          row.checkedInAt instanceof Date ? row.checkedInAt.toISOString() : '',
          row.orderId,
          JSON.stringify(row.answers),
        ]),
      ]
        .map((row) => row.map(cell).join(','))
        .join('\r\n');
      return new StreamableFile(Buffer.from('\uFEFF' + csv), {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="attendees.csv"',
      });
    });
  }

  private async access(manager: EntityManager, event: Event, actor: Principal) {
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
      await this.access(manager, event, actor);
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ConflictException('Organizer is suspended');
      return action(manager, event);
    });
  }
}
