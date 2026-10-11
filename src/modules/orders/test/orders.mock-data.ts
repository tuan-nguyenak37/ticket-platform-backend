import {
  Order,
  OrderDispute,
  OrderPayment,
  OrderStatus,
  PaymentStatus,
} from '../order.entity';
import type { Principal } from '../../auth/authorization/principal';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import {
  CreateOrderDto,
  OpenDisputeDto,
  DisputeReplyDto,
  ResolveDisputeDto,
} from '../orders.dto';

export const mockBuyerPrincipal: Principal = {
  user_id: 'usr_buyer_001',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockSellerPrincipal: Principal = {
  user_id: 'usr_seller_001',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockOtherPrincipal: Principal = {
  user_id: 'usr_other_002',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockAdminPrincipal: Principal = {
  user_id: 'usr_admin_001',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockModeratorPrincipal: Principal = {
  user_id: 'usr_mod_001',
  role: UserRole.MODERATOR,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export function createMockOrder(overrides: Partial<Order> = {}): Order {
  const order = new Order();
  order.order_id = 'ord_mock_001';
  order.ticketId = 'tkt_mock_001';
  order.buyerId = mockBuyerPrincipal.user_id;
  order.sellerId = mockSellerPrincipal.user_id;
  order.idempotencyKey = 'key-test-ord-001';
  order.amount = '1200000.00';
  order.currency = 'VND';
  order.status = OrderStatus.PENDING;
  order.allocated = true;
  order.snapshot = {
    eventName: 'Concert Âm Nhạc Mùa Hè 2026',
    ticketTier: 'VIP 1',
    seatInfo: 'Hàng A, Ghế 12',
    eventEndTime: new Date(Date.now() + 86400000 * 3).toISOString(),
  };
  order.expiresAt = new Date(Date.now() + 900000); // 15 mins
  order.paidAt = null;
  order.deliveredAt = null;
  order.disputeUntil = null;
  order.reason = null;
  order.payoutStatus = 'none';
  order.createdAt = new Date('2026-03-01T10:00:00Z');
  order.updatedAt = new Date('2026-03-01T10:00:00Z');
  return Object.assign(order, overrides);
}

export const mockPendingOrder = createMockOrder();

export const mockPaidOrder = createMockOrder({
  order_id: 'ord_paid_002',
  status: OrderStatus.PAID,
  paidAt: new Date('2026-03-01T10:05:00Z'),
  deliveredAt: new Date('2026-03-01T10:05:00Z'),
  disputeUntil: new Date(Date.now() + 86400000 * 3),
  payoutStatus: 'pending',
});

export const mockDisputedOrder = createMockOrder({
  order_id: 'ord_dispute_003',
  status: OrderStatus.DISPUTED,
  paidAt: new Date('2026-03-01T10:05:00Z'),
  deliveredAt: new Date('2026-03-01T10:05:00Z'),
  disputeUntil: new Date(Date.now() + 86400000 * 2),
  payoutStatus: 'blocked',
});

export const mockCompletedOrder = createMockOrder({
  order_id: 'ord_completed_004',
  status: OrderStatus.COMPLETED,
  paidAt: new Date('2026-03-01T10:05:00Z'),
  deliveredAt: new Date('2026-03-01T10:05:00Z'),
  payoutStatus: 'ready',
});

export const mockCancelledOrder = createMockOrder({
  order_id: 'ord_cancelled_005',
  status: OrderStatus.CANCELLED,
  allocated: false,
  reason: 'buyer_cancelled',
});

export function createMockPayment(
  overrides: Partial<OrderPayment> = {},
): OrderPayment {
  const payment = new OrderPayment();
  payment.payment_id = 'pay_mock_001';
  payment.orderId = mockPendingOrder.order_id;
  payment.provider = 'mock';
  payment.amount = '1200000.00';
  payment.currency = 'VND';
  payment.status = PaymentStatus.PENDING;
  payment.receivedResult = null;
  payment.settledAt = null;
  payment.createdAt = new Date('2026-03-01T10:01:00Z');
  return Object.assign(payment, overrides);
}

export const mockPendingPayment = createMockPayment();

export const mockSucceededPayment = createMockPayment({
  payment_id: 'pay_succeeded_002',
  status: PaymentStatus.SUCCEEDED,
  receivedResult: 'success',
  settledAt: new Date('2026-03-01T10:05:00Z'),
});

export function createMockDispute(
  overrides: Partial<OrderDispute> = {},
): OrderDispute {
  const dispute = new OrderDispute();
  dispute.dispute_id = 'dsp_mock_001';
  dispute.orderId = mockDisputedOrder.order_id;
  dispute.reason = 'Vé không thể quét vào cổng, mã vé đã sử dụng';
  dispute.evidence = 'Ảnh chụp cổng soát vé báo lỗi invalid barcode lúc 19:30';
  dispute.sellerResponse = null;
  dispute.status = 'open';
  dispute.resolvedBy = null;
  dispute.resolution = null;
  dispute.resolvedAt = null;
  dispute.createdAt = new Date('2026-03-01T11:00:00Z');
  return Object.assign(dispute, overrides);
}

export const mockOpenDispute = createMockDispute();

export const mockCreateOrderDto: CreateOrderDto = {
  ticketId: 'tkt_mock_001',
};

export const mockOpenDisputeDto: OpenDisputeDto = {
  reason: 'Vé không thể quét vào cổng',
  evidence: 'Ảnh chụp máy quét tại cổng sự kiện báo lỗi vé trùng',
};

export const mockDisputeReplyDto: DisputeReplyDto = {
  response: 'Tôi đã kiểm tra mã vé với ban tổ chức, mã vẫn còn hạn',
};

export const mockResolveDisputeDto: ResolveDisputeDto = {
  decision: 'accept',
  note: 'Xác nhận vé không hợp lệ, chấp thuận hoàn tiền cho người mua',
};
