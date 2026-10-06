import { Ticket } from '../entities/ticket.entity';

export class TicketResponseDto {
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
