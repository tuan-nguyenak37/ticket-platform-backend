import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketStatus } from './entities/enums/ticket-status.enum';

export interface TicketUploadFiles {
  ticketFile?: Express.Multer.File[];
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

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
