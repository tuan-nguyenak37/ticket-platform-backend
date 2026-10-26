import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerMember } from '../organizers/entities/organizer-member.entity';
import { OrganizerMemberRole } from '../organizers/enums/organizer-member-role.enum';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import {
  ResaleListing,
  ResaleListingStatus,
} from '../resale/entities/resale-listing.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketQrService } from './ticket-qr.service';

const checkInEarlyWindowMs = 24 * 60 * 60 * 1000;
const identifierPattern = /^[a-zA-Z0-9_-]{1,40}$/;

@Injectable()
export class TicketCheckInService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qr: TicketQrService,
  ) {}

  checkIn(
    eventId: string,
    showingId: string,
    actor: Principal,
    payload: string,
  ) {
    if (
      typeof eventId !== 'string' ||
      typeof showingId !== 'string' ||
      !identifierPattern.test(eventId) ||
      !identifierPattern.test(showingId)
    )
      throw new BadRequestException({
        code: 'CHECK_IN_INVALID_REQUEST',
        message: 'Sự kiện hoặc suất diễn không hợp lệ.',
      });

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { user_id: actor.user_id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!user || user.status !== UserStatus.ACTIVE)
        throw new ForbiddenException('Tài khoản không còn hoạt động.');

      const reference = await manager.findOneBy(Event, { eventId });
      if (!reference) throw new NotFoundException('Không tìm thấy sự kiện.');
      const organizer = await manager.findOne(Organizer, {
        where: { organizerId: reference.organizerId },
        lock: { mode: 'pessimistic_read' },
      });
      const event = await manager.findOne(Event, {
        where: { eventId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!organizer || !event || event.organizerId !== organizer.organizerId)
        throw new NotFoundException('Không tìm thấy sự kiện.');
      const owner = await manager.findOne(OrganizerMember, {
        where: {
          organizerId: organizer.organizerId,
          userId: actor.user_id,
          role: OrganizerMemberRole.OWNER,
        },
        lock: { mode: 'pessimistic_read' },
      });
      if (!owner)
        throw new ForbiddenException('Chỉ chủ ban tổ chức được check-in vé.');
      if (organizer.status !== OrganizerStatus.ACTIVE)
        throw new ConflictException({
          code: 'CHECK_IN_ORGANIZER_SUSPENDED',
          message: 'Ban tổ chức đang bị tạm khóa.',
        });
      if (event.status !== EventStatus.PUBLISHED)
        throw new ConflictException({
          code: 'CHECK_IN_EVENT_NOT_PUBLISHED',
          message: 'Sự kiện chưa được công bố hoặc không còn mở đón khách.',
        });

      const showing = await manager.findOne(Showing, {
        where: { showingId, eventId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!showing)
        throw new NotFoundException('Không tìm thấy suất diễn của sự kiện.');

      const verified = await this.verify(payload, manager);
      const referenceTicket = await manager.findOneBy(Ticket, {
        ticketId: verified.ticketId,
      });
      if (!referenceTicket) throw new NotFoundException('Không tìm thấy vé.');
      const ticketType = await manager.findOne(TicketType, {
        where: { ticketTypeId: referenceTicket.ticketTypeId, showingId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!ticketType)
        throw new ConflictException({
          code: 'CHECK_IN_WRONG_SHOWING',
          message: 'Vé không thuộc suất diễn đang check-in.',
        });

      const ticket = await manager.findOne(Ticket, {
        where: { ticketId: verified.ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !ticket ||
        ticket.status !== TicketStatus.ACTIVE ||
        ticket.ticketTypeId !== ticketType.ticketTypeId ||
        ticket.orderItemId !== referenceTicket.orderItemId
      )
        throw new ConflictException({
          code: 'CHECK_IN_TICKET_CHANGED',
          message: 'Thông tin vé đã thay đổi. Vui lòng quét lại.',
        });
      await this.verify(payload, manager);
      if (Boolean(ticket.checkedInAt) !== Boolean(ticket.checkedInBy))
        throw new ConflictException({
          code: 'CHECK_IN_STATE_INVALID',
          message:
            'Trạng thái check-in không nhất quán. Cần kiểm tra vận hành.',
        });
      if (ticket.checkedInAt)
        return this.response(ticket, showing, ticketType, true);

      const [{ now }] = await manager.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      if (now.getTime() < showing.startTime.getTime() - checkInEarlyWindowMs)
        throw new ConflictException({
          code: 'CHECK_IN_NOT_OPEN',
          message: 'Check-in mở từ 24 giờ trước khi suất diễn bắt đầu.',
        });
      if (now.getTime() >= showing.endTime.getTime())
        throw new ConflictException({
          code: 'CHECK_IN_CLOSED',
          message: 'Suất diễn đã kết thúc check-in.',
        });
      if (
        await manager.existsBy(ResaleListing, {
          ticketId: ticket.ticketId,
          status: In([
            ResaleListingStatus.AVAILABLE,
            ResaleListingStatus.RESERVED,
          ]),
        })
      )
        throw new ConflictException({
          code: 'CHECK_IN_TICKET_LISTED',
          message:
            'Vé đang đăng bán hoặc được giữ mua lại. Cần hủy tin đăng trước.',
        });

      const updated = await manager.update(
        Ticket,
        {
          ticketId: ticket.ticketId,
          ownerUserId: ticket.ownerUserId,
          status: TicketStatus.ACTIVE,
          checkedInAt: IsNull(),
          checkedInBy: IsNull(),
        },
        { checkedInAt: now, checkedInBy: actor.user_id },
      );
      if (updated.affected !== 1)
        throw new ConflictException({
          code: 'CHECK_IN_TICKET_CHANGED',
          message: 'Trạng thái vé đã thay đổi. Vui lòng quét lại.',
        });
      ticket.checkedInAt = now;
      ticket.checkedInBy = actor.user_id;
      return this.response(ticket, showing, ticketType, false);
    });
  }

  private async verify(payload: string, manager: EntityManager) {
    try {
      return await this.qr.verify(payload, manager);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        throw new BadRequestException({
          code: 'CHECK_IN_INVALID_QR',
          message:
            'Mã QR không hợp lệ, đã bị thu hồi hoặc vé không còn hiệu lực.',
        });
      throw error;
    }
  }

  private response(
    ticket: Ticket,
    showing: Showing,
    ticketType: TicketType,
    alreadyCheckedIn: boolean,
  ) {
    return {
      result: alreadyCheckedIn ? 'ALREADY_CHECKED_IN' : 'CHECKED_IN',
      message: alreadyCheckedIn
        ? 'Vé đã check-in trước đó. Không cho vào cửa lần nữa.'
        : 'Check-in thành công.',
      alreadyCheckedIn,
      admitted: !alreadyCheckedIn,
      eventId: showing.eventId,
      showingId: showing.showingId,
      showingName: showing.name,
      ticketId: ticket.ticketId,
      ticketNumber: ticket.ticketNumber,
      ticketTypeName: ticketType.name,
      checkedInAt: ticket.checkedInAt!.toISOString(),
      checkedInBy: ticket.checkedInBy,
    };
  }
}
