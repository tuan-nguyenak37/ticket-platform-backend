import { Ticket } from '../entities/ticket.entity';
import type { TicketCheck } from '../entities/ticket-check.entity';

export class TicketResponseDto {
  static mine(ticket: Ticket & { check?: TicketCheck }) {
    return {
      ...this.listItem(ticket),
      updatedAt: ticket.updatedAt,
      reviewMethod: ticket.reviewMethod ?? null,
      verifiedAt: ticket.verifiedAt ?? null,
      rejectionReason: ticket.rejectionReason ?? null,
      check: ticket.check
        ? {
            status: ticket.check.status,
            outcome: ticket.check.outcome,
            version: ticket.check.version,
            completedAt: ticket.check.completedAt,
          }
        : null,
    };
  }

  static listItem(ticket: Ticket) {
    return {
      ...this.public(ticket),
      event: {
        event_id: ticket.event.event_id,
        name: ticket.event.name,
        bannerUrl: ticket.event.bannerUrl,
        startTime: ticket.event.startTime,
        endTime: ticket.event.endTime,
        venueName: ticket.event.venueName,
        address: ticket.event.address,
        categoryId: ticket.event.categoryId,
      },
    };
  }

  static from(ticket: Ticket) {
    return {
      ticket_id: ticket.ticket_id,
      eventId: ticket.eventId,
      sellerId: ticket.sellerId,
      ticketTier: ticket.ticketTier,
      seatInfo: ticket.seatInfo,
      originalPrice: Number(ticket.originalPrice),
      price: Number(ticket.price),
      status: ticket.status,
      verifiedBy: ticket.verifiedBy ?? undefined,
      verifiedAt: ticket.verifiedAt ?? undefined,
      rejectionReason: ticket.rejectionReason ?? undefined,
      buyerId: ticket.buyerId ?? undefined,
      soldAt: ticket.soldAt ?? undefined,
      description: ticket.description,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      reviewMethod: ticket.reviewMethod ?? null,
    };
  }

  static public(ticket: Ticket) {
    return {
      ticket_id: ticket.ticket_id,
      eventId: ticket.eventId,
      ticketTier: ticket.ticketTier,
      seatInfo: ticket.seatInfo,
      originalPrice: Number(ticket.originalPrice),
      price: Number(ticket.price),
      status: ticket.status,
      description: ticket.description,
      createdAt: ticket.createdAt,
    };
  }
}
