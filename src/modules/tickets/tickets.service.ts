import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketStatus } from './entities/enums/ticket-status.enum';
import { ListTicketsDto, TicketSort } from './dto/list-tickets.dto';

export interface TicketUploadFiles {
  ticketFile?: Express.Multer.File[];
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async cancel(actor: Principal, id: string) {
    const repository = this.dataSource.getRepository(Ticket);
    // Ownership and state are checked by the same UPDATE that cancels the ticket.
    const result = await repository.update(
      {
        ticket_id: id,
        sellerId: actor.user_id,
        status: In([
          TicketStatus.PENDING_REVIEW,
          TicketStatus.REJECTED,
          TicketStatus.AVAILABLE,
        ]),
      },
      { status: TicketStatus.CANCELLED },
    );
    if (result.affected === 1) {
      return { ticket_id: id, status: TicketStatus.CANCELLED };
    }

    const ownedTicket = await repository.findOne({
      where: { ticket_id: id, sellerId: actor.user_id },
      select: { ticket_id: true },
    });
    if (!ownedTicket) throw new NotFoundException('Ticket not found');
    throw new ConflictException('Ticket cannot be cancelled in its current state');
  }

  async list(query: ListTicketsDto) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice must not exceed maxPrice');
    }

    const builder = this.dataSource
      .getRepository(Ticket)
      .createQueryBuilder('ticket')
      .innerJoin('ticket.event', 'event')
      .select([
        'ticket.ticket_id',
        'ticket.eventId',
        'ticket.ticketTier',
        'ticket.seatInfo',
        'ticket.originalPrice',
        'ticket.price',
        'ticket.status',
        'ticket.description',
        'ticket.createdAt',
        'event.event_id',
        'event.name',
        'event.bannerUrl',
        'event.startTime',
        'event.endTime',
        'event.venueName',
        'event.address',
        'event.categoryId',
      ])
      .where('ticket.status = :ticketStatus', {
        ticketStatus: TicketStatus.AVAILABLE,
      })
      .andWhere('event.status = :eventStatus', {
        eventStatus: EventStatus.PUBLISHED,
      })
      .andWhere('event.endTime > :now', { now: new Date() });

    if (query.eventId)
      builder.andWhere('ticket.eventId = :eventId', { eventId: query.eventId });
    if (query.categoryId)
      builder.andWhere('event.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.ticketTier)
      builder.andWhere('lower(ticket.ticketTier) = lower(:ticketTier)', {
        ticketTier: query.ticketTier,
      });
    if (query.minPrice !== undefined)
      builder.andWhere('ticket.price >= :minPrice', { minPrice: query.minPrice });
    if (query.maxPrice !== undefined)
      builder.andWhere('ticket.price <= :maxPrice', { maxPrice: query.maxPrice });
    if (query.q) {
      // Literal substring search: user-supplied % and _ are not SQL wildcards.
      builder.andWhere(
        '(strpos(lower(event.name), lower(:q)) > 0 OR strpos(lower(ticket.ticketTier), lower(:q)) > 0)',
        { q: query.q },
      );
    }

    const sortColumns: Record<TicketSort, [string, 'ASC' | 'DESC']> = {
      [TicketSort.NEWEST]: ['ticket.createdAt', 'DESC'],
      [TicketSort.PRICE_ASC]: ['ticket.price', 'ASC'],
      [TicketSort.PRICE_DESC]: ['ticket.price', 'DESC'],
      [TicketSort.EVENT_SOONEST]: ['event.startTime', 'ASC'],
    };
    const [column, direction] = sortColumns[query.sort];
    const [tickets, total] = await builder
      .orderBy(column, direction)
      .addOrderBy('ticket.ticket_id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items: tickets.map((ticket) => TicketResponseDto.listItem(ticket)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private filename(url: string | null): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url, 'http://local').searchParams.get('file') ?? undefined;
    } catch {
      return undefined;
    }
  }

  private ticketFileUrl(id: string, filename: string) {
    return `/api/tickets/${id}/file?file=${filename}`;
  }

  async create(
    actor: Principal,
    dto: CreateTicketDto,
    files: TicketUploadFiles = {},
  ) {
    if (files.ticketFile?.length !== 1) {
      throw new BadRequestException('One ticket file (PDF or image) is required');
    }
    const uploadedFile = files.ticketFile[0];
    this.uploads.validate(uploadedFile, false);

    const savedFiles: string[] = [];
    try {
      return await this.dataSource.transaction('READ COMMITTED', async (manager) => {
        // Keep event updates/deletion blocked until ticket creation commits.
        const event = await manager.findOne(Event, {
          where: { event_id: dto.eventId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!event) {
          throw new NotFoundException('Event not found');
        }
        if (event.status !== EventStatus.PUBLISHED) {
          throw new BadRequestException(
            'Tickets can only be listed for published events',
          );
        }
        if (event.endTime.getTime() <= Date.now()) {
          throw new BadRequestException('Cannot list tickets for ended events');
        }

        const ticketId = generateId('ticket');
        const saved = await this.uploads.save(uploadedFile, 'tickets');
        savedFiles.push(saved.filename);

        const ticket = manager.create(Ticket, {
          ticket_id: ticketId,
          eventId: event.event_id,
          sellerId: actor.user_id,
          ticketTier: dto.ticketTier,
          seatInfo: dto.seatInfo ?? null,
          originalPrice: dto.originalPrice,
          price: dto.price,
          ticketFileUrl: this.ticketFileUrl(ticketId, saved.filename),
          status: TicketStatus.PENDING_REVIEW,
          description: dto.description ?? null,
        });

        // File I/O may have crossed the event's end time while the lock was held.
        if (event.endTime.getTime() <= Date.now()) {
          throw new BadRequestException('Cannot list tickets for ended events');
        }
        const createdTicket = await manager.save(ticket);
        return TicketResponseDto.from(createdTicket);
      });
    } catch (error) {
      await Promise.all(
        savedFiles.map((filename) => this.uploads.removeTicketFile(filename)),
      );
      throw error;
    }
  }
}
