import { Ticket } from '../entities/ticket.entity';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import { Event } from '../../events/entities/event.entity';
import { EventStatus } from '../../events/entities/enums/event-status.enum';
import type { Principal } from '../../auth/authorization/principal';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import { CreateTicketDto } from '../dto/create-ticket.dto';

export function createMockEvent(overrides: Partial<Event> = {}): Event {
  const event = new Event();
  event.event_id = 'evt_mock_001';
  event.name = 'Concert Âm Nhạc Mùa Hè 2026';
  event.categoryId = 'event_cat_music';
  event.status = EventStatus.PUBLISHED;
  event.venueName = 'Sân vận động Mỹ Đình';
  event.address = 'Lê Đức Thọ, Hà Nội';
  event.startTime = new Date(Date.now() + 86400000 * 2); // 2 days in future
  event.endTime = new Date(Date.now() + 86400000 * 3); // 3 days in future
  event.bannerUrl = 'https://example.com/events/concert-banner.jpg';
  event.createdAt = new Date('2026-01-01T00:00:00Z');
  event.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(event, overrides);
}

export const mockPublishedEvent = createMockEvent();

export const mockEndedEvent = createMockEvent({
  event_id: 'evt_ended_002',
  name: 'Đêm Nhạc Đã Kết Thúc',
  startTime: new Date(Date.now() - 86400000 * 5),
  endTime: new Date(Date.now() - 86400000 * 2),
});

export const mockDraftEvent = createMockEvent({
  event_id: 'evt_draft_003',
  name: 'Sự Kiện Chưa Công Bố',
  status: EventStatus.DRAFT,
});

export function createMockTicket(overrides: Partial<Ticket> = {}): Ticket {
  const ticket = new Ticket();
  ticket.ticket_id = 'tkt_mock_001';
  ticket.eventId = 'evt_mock_001';
  ticket.event = mockPublishedEvent;
  ticket.sellerId = 'usr_seller_001';
  ticket.ticketTier = 'VIP 1';
  ticket.seatInfo = 'Hàng A, Ghế 12';
  ticket.originalPrice = 1500000;
  ticket.price = 1200000;
  ticket.ticketFileUrl = '/api/tickets/tkt_mock_001/file?file=tkt_mock_001_secret.pdf';
  ticket.fileHash = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
  ticket.approvedCodeFingerprint = null;
  ticket.reviewMethod = null;
  ticket.status = TicketStatus.AVAILABLE;
  ticket.verifiedBy = null;
  ticket.verifiedAt = null;
  ticket.rejectionReason = null;
  ticket.buyerId = null;
  ticket.description = 'Vé chính hãng, sang tên tại cửa check-in';
  ticket.createdAt = new Date('2026-03-01T10:00:00Z');
  ticket.updatedAt = new Date('2026-03-01T10:00:00Z');
  return Object.assign(ticket, overrides);
}

export const mockAvailableTicket = createMockTicket();

export const mockPendingTicket = createMockTicket({
  ticket_id: 'tkt_pending_002',
  status: TicketStatus.PENDING_REVIEW,
});

export const mockSoldTicket = createMockTicket({
  ticket_id: 'tkt_sold_003',
  status: TicketStatus.SOLD,
  buyerId: 'usr_buyer_002',
});

export const mockCancelledTicket = createMockTicket({
  ticket_id: 'tkt_cancelled_004',
  status: TicketStatus.CANCELLED,
});

export const mockSellerPrincipal: Principal = {
  user_id: 'usr_seller_001',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 1,
};

export const mockOtherUserPrincipal: Principal = {
  user_id: 'usr_other_999',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 1,
};

export const mockValidTicketFile: Express.Multer.File = {
  fieldname: 'ticketFile',
  originalname: 'ticket-concert.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 Mock PDF Content with QRCode'),
  size: 1024,
  stream: null as any,
  destination: '',
  filename: 'mock-saved-file.pdf',
  path: '',
};

export const mockCreateTicketDto: CreateTicketDto = {
  eventId: 'evt_mock_001',
  ticketTier: 'VIP 1',
  seatInfo: 'Hàng A, Ghế 12',
  originalPrice: 1500000,
  price: 1200000,
  description: 'Vé chính hãng khu VIP',
};
