-- Seed dữ liệu mẫu cho các bảng "orders", "order_payments", "order_disputes"
-- Yêu cầu: Đã nạp users, events và tickets trước

-- 1. Orders
INSERT INTO orders (
  "order_id",
  "ticketId",
  "buyerId",
  "sellerId",
  "idempotencyKey",
  "amount",
  "currency",
  "status",
  "allocated",
  "snapshot",
  "expiresAt",
  "paidAt",
  "deliveredAt",
  "disputeUntil",
  "reason",
  "payoutStatus",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'ord_seed_pending_001',
    'tkt_seed_avail_001',
    'usr_mock_user_buyer_003',
    'usr_mock_user_seller_004',
    'idem_seed_key_001',
    '1800000.00',
    'VND',
    'pending_payment',
    false,
    '{"eventName": "Concert Âm Nhạc Mùa Hè 2026", "ticketTier": "VIP Diamond", "seatInfo": "Dãy 1, Ghế 08", "eventEndTime": "2026-08-01T23:59:59.000Z"}'::jsonb,
    NOW() + INTERVAL '15 minutes',
    NULL,
    NULL,
    NULL,
    NULL,
    'none',
    NOW() - INTERVAL '5 minutes',
    NOW() - INTERVAL '5 minutes'
  ),
  (
    'ord_seed_paid_002',
    'tkt_seed_sold_003',
    'usr_mock_user_buyer_003',
    'usr_mock_user_seller_004',
    'idem_seed_key_002',
    '1300000.00',
    'VND',
    'delivered',
    true,
    '{"eventName": "Concert Âm Nhạc Mùa Hè 2026", "ticketTier": "VIP Gold", "seatInfo": "Dãy 3, Ghế 15", "eventEndTime": "2026-08-01T23:59:59.000Z"}'::jsonb,
    NOW() + INTERVAL '10 days',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '3 days',
    NULL,
    'pending',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'ord_seed_dispute_003',
    'tkt_seed_cancelled_004',
    'usr_mock_user_buyer_003',
    'usr_mock_user_seller_004',
    'idem_seed_key_003',
    '600000.00',
    'VND',
    'disputed',
    true,
    '{"eventName": "Concert Âm Nhạc Mùa Hè 2026", "ticketTier": "Standard GA", "seatInfo": "Khu vực Khán Đài B", "eventEndTime": "2026-08-01T23:59:59.000Z"}'::jsonb,
    NOW() + INTERVAL '10 days',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '1 days',
    NULL,
    'blocked',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '1 days'
  )
ON CONFLICT ("order_id") DO NOTHING;

-- 2. Order Payments
INSERT INTO order_payments (
  "payment_id",
  "orderId",
  "provider",
  "amount",
  "currency",
  "status",
  "receivedResult",
  "settledAt",
  "createdAt"
)
VALUES
  (
    'pay_seed_001',
    'ord_seed_pending_001',
    'mock',
    '1800000.00',
    'VND',
    'pending',
    NULL,
    NULL,
    NOW() - INTERVAL '4 minutes'
  ),
  (
    'pay_seed_002',
    'ord_seed_paid_002',
    'mock',
    '1300000.00',
    'VND',
    'succeeded',
    'success',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'pay_seed_003',
    'ord_seed_dispute_003',
    'mock',
    '600000.00',
    'VND',
    'succeeded',
    'success',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT ("payment_id") DO NOTHING;

-- 3. Order Disputes
INSERT INTO order_disputes (
  "dispute_id",
  "orderId",
  "reason",
  "evidence",
  "sellerResponse",
  "status",
  "resolvedBy",
  "resolution",
  "resolvedAt",
  "createdAt"
)
VALUES
  (
    'dsp_seed_001',
    'ord_seed_dispute_003',
    'Mã vé quét tại cổng báo lỗi đã được sử dụng trước đó.',
    'Hình chụp màn hình thông báo Invalid Ticket từ máy quét cổng B.',
    'Tôi mua vé chính hãng và chưa từng chia sẻ mã vé cho ai.',
    'open',
    NULL,
    NULL,
    NULL,
    NOW() - INTERVAL '1 days'
  )
ON CONFLICT ("dispute_id") DO NOTHING;
