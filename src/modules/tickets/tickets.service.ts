import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import { RateLimitService } from '../../common/security/rate-limit.service';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketOwnership } from './entities/ticket-ownership.entity';
import { TicketListDto } from './dto/ticket-query.dto';
import { TicketIssuanceService } from './ticket-issuance.service';
import { TicketQrService } from './ticket-qr.service';
import { PrintableTicket, TicketPdfService } from './ticket-pdf.service';
import { MailService } from './mail.service';

const ticketRelations = {
  orderItem: true,
  ticketType: { showing: { event: { organizer: true } } },
  credentials: true,
} as const;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly issuance: TicketIssuanceService,
    private readonly qr: TicketQrService,
    private readonly pdf: TicketPdfService,
    private readonly mail: MailService,
    private readonly limits: RateLimitService,
  ) {}

  async mine(userId: string, query: TicketListDto) {
    const [tickets, total] = await this.dataSource.manager.findAndCount(
      Ticket,
      {
        where: { ownerUserId: userId },
        relations: ticketRelations,
        order: { issuedAt: 'DESC', ticketId: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      },
    );
    return {
      items: tickets.map((ticket) => this.metadata(ticket)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(userId: string, ticketId: string) {
    return this.metadata(
      await this.ownedTicket(this.dataSource.manager, userId, ticketId),
    );
  }

  async qrForTicket(userId: string, ticketId: string) {
    const bundle = await this.bundle(userId, ticketId, 'ticket');
    return {
      ticketId,
      qrDataUrl: await this.qr.dataUrl(
        ticketId,
        bundle.tickets[0].credentialId,
      ),
    };
  }

  async pdfFor(userId: string, resourceId: string, scope: 'ticket' | 'order') {
    const bundle = await this.bundle(userId, resourceId, scope);
    return this.pdf.render(bundle.tickets);
  }

  async resend(
    userId: string,
    resourceId: string,
    scope: 'ticket' | 'order',
    setRetryAfter: (seconds: number) => void,
  ) {
    const bundle = await this.bundle(userId, resourceId, scope);
    const user = await this.requireUser(userId);
    if (!this.mail.enabled())
      throw new ServiceUnavailableException('Ticket email is disabled');
    const policies: [string, string, number, number][] = [
      ['tickets-resend-order', `${userId}:${bundle.orderId}`, 1, 60],
      ['tickets-resend-user', userId, 5, 3600],
    ];
    for (const [policy, identity, limit, seconds] of policies) {
      const result = await this.limits.check(policy, identity, limit, seconds);
      if (!result.allowed) {
        setRetryAfter(result.retryAfter);
        throw new HttpException(
          'Too many ticket email requests; try again later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    await this.deliver(user.email, resourceId, bundle.orderId, bundle.tickets);
    return {
      ...(scope === 'ticket'
        ? { ticketId: resourceId }
        : { orderId: resourceId }),
      ticketCount: bundle.tickets.length,
      sent: true,
    };
  }

  async sendOrderAfterPayment(userId: string, orderId: string): Promise<void> {
    if (!this.mail.enabled()) return;
    try {
      const bundle = await this.bundle(userId, orderId, 'order');
      const user = await this.requireUser(userId);
      await this.deliver(user.email, orderId, orderId, bundle.tickets);
    } catch {
      this.logger.warn(
        `ticket_delivery_after_payment_failed orderId=${orderId}`,
      );
    }
  }

  async transferOwnership(
    manager: EntityManager,
    ticket: Ticket,
    sellerId: string,
    buyerId: string,
    transferredAt: Date,
  ) {
    if (
      ticket.status !== TicketStatus.ACTIVE ||
      ticket.ownerUserId !== sellerId
    )
      throw new ConflictException('Ticket ownership changed');
    await this.issuance.inspect(manager, ticket.orderItem.orderId);
    const credentials = await manager.find(TicketCredential, {
      where: { ticketId: ticket.ticketId, revokedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (credentials.length !== 1)
      throw new ConflictException('Ticket has no unique current credential');
    const updated = await manager.update(
      Ticket,
      {
        ticketId: ticket.ticketId,
        ownerUserId: sellerId,
        status: TicketStatus.ACTIVE,
      },
      { ownerUserId: buyerId },
    );
    if (updated.affected !== 1)
      throw new ConflictException('Ticket ownership changed');
    const revoked = await manager.update(
      TicketCredential,
      { credentialId: credentials[0].credentialId, revokedAt: IsNull() },
      { revokedAt: transferredAt },
    );
    if (revoked.affected !== 1)
      throw new ConflictException('Ticket credential changed');
    await manager.insert(TicketCredential, {
      credentialId: generateId('cred'),
      ticketId: ticket.ticketId,
      revokedAt: null,
    });
    await manager.insert(TicketOwnership, {
      ownershipId: generateId('own'),
      ticketId: ticket.ticketId,
      fromUserId: sellerId,
      toUserId: buyerId,
    });
  }

  async notifyTransferAfterPayment(
    buyerId: string,
    sellerId: string,
    ticketId: string,
    resaleOrderId: string,
    notifySeller = true,
  ): Promise<void> {
    if (!this.mail.enabled()) return;
    try {
      const bundle = await this.bundle(buyerId, ticketId, 'ticket');
      const buyer = await this.requireUser(buyerId);
      await this.deliver(buyer.email, ticketId, resaleOrderId, bundle.tickets);
    } catch {
      this.logger.warn(
        `resale_buyer_delivery_failed resaleOrderId=${resaleOrderId} ticketId=${ticketId}`,
      );
    }
    if (!notifySeller) return;
    try {
      const seller = await this.requireUser(sellerId);
      await this.mail.sendTransferNotice(seller.email, resaleOrderId);
    } catch {
      this.logger.warn(
        `resale_seller_notification_failed resaleOrderId=${resaleOrderId} ticketId=${ticketId}`,
      );
    }
  }

  private async bundle(
    userId: string,
    resourceId: string,
    scope: 'ticket' | 'order',
  ) {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      let orderId: string;
      let selected: Ticket[];
      if (scope === 'ticket') {
        const ticket = await this.ownedTicket(manager, userId, resourceId);
        orderId = ticket.orderItem.orderId;
        await this.issuance.inspect(manager, orderId);
        if (ticket.status !== TicketStatus.ACTIVE)
          throw new ConflictException('Ticket is not active');
        selected = [ticket];
      } else {
        const order = await manager.findOneBy(Order, {
          orderId: resourceId,
          userId,
        });
        if (!order) throw new NotFoundException('Order not found');
        const state = await this.issuance.inspect(manager, order.orderId);
        orderId = order.orderId;
        selected = await manager.find(Ticket, {
          where: {
            orderItemId: state.item.orderItemId,
            ownerUserId: userId,
            status: TicketStatus.ACTIVE,
          },
          relations: ticketRelations,
          order: { ticketNumber: 'ASC' },
        });
      }
      if (!selected.length)
        throw new ConflictException(
          'No active tickets still owned by you in this order',
        );
      const tickets: PrintableTicket[] = selected.map((ticket) => {
        const credentials = ticket.credentials.filter(
          (credential) => credential.revokedAt === null,
        );
        if (credentials.length !== 1)
          throw new ConflictException(
            'Ticket has no unique current credential',
          );
        return { ticket, credentialId: credentials[0].credentialId };
      });
      return { orderId, tickets };
    });
  }

  private async ownedTicket(
    manager: EntityManager,
    userId: string,
    ticketId: string,
  ) {
    const ticket = await manager.findOne(Ticket, {
      where: { ticketId, ownerUserId: userId },
      relations: ticketRelations,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async requireUser(userId: string) {
    const user = await this.dataSource.manager.findOneBy(User, {
      user_id: userId,
    });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  private async deliver(
    email: string,
    resourceId: string,
    orderId: string,
    tickets: PrintableTicket[],
  ) {
    try {
      const pdf = await this.pdf.render(tickets);
      await this.mail.sendTickets(
        email,
        `${resourceId}.pdf`,
        pdf,
        tickets.length,
      );
    } catch {
      this.logger.warn(
        `ticket_email_failed orderId=${orderId} resourceId=${resourceId}`,
      );
      throw new ServiceUnavailableException(
        'Ticket email could not be sent; tickets remain available',
      );
    }
  }

  private metadata(ticket: Ticket) {
    const showing = ticket.ticketType.showing;
    const event = showing.event;
    return {
      ticketId: ticket.ticketId,
      ticketNumber: ticket.ticketNumber,
      orderId: ticket.orderItem.orderId,
      status: ticket.status,
      issuedAt: ticket.issuedAt,
      event: { eventId: event.eventId, title: event.title },
      organizer: {
        organizerId: event.organizer.organizerId,
        name: event.organizer.name,
      },
      showing: {
        showingId: showing.showingId,
        name: showing.name,
        startTime: showing.startTime,
        endTime: showing.endTime,
        venueName: showing.venueName,
        address: showing.address,
        city: showing.city,
      },
      ticketType: {
        ticketTypeId: ticket.ticketTypeId,
        name: ticket.ticketType.name,
      },
    };
  }
}
