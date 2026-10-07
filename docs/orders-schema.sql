-- Apply to the application's schema before enabling Orders when synchronize=false.
-- Additive schema only. No application data is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS orders (
  order_id varchar(40) PRIMARY KEY,
  "ticketId" varchar(40) NOT NULL REFERENCES tickets(ticket_id) ON DELETE RESTRICT,
  "buyerId" varchar(40) NOT NULL REFERENCES "Users"(user_id) ON DELETE RESTRICT,
  "sellerId" varchar(40) NOT NULL REFERENCES "Users"(user_id) ON DELETE RESTRICT,
  "idempotencyKey" varchar(80) NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL DEFAULT 'VND',
  status varchar(24) NOT NULL DEFAULT 'pending_payment',
  allocated boolean NOT NULL DEFAULT false,
  snapshot jsonb NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "paidAt" timestamptz,
  "deliveredAt" timestamptz,
  "disputeUntil" timestamptz,
  reason varchar(80),
  "payoutStatus" varchar(16) NOT NULL DEFAULT 'none',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("buyerId" <> "sellerId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_buyer_key" ON orders ("buyerId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_ticket_winner" ON orders ("ticketId") WHERE allocated = true;
CREATE INDEX IF NOT EXISTS "IDX_orders_buyer_created" ON orders ("buyerId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_orders_seller_created" ON orders ("sellerId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_orders_status_expires" ON orders (status, "expiresAt");
CREATE TABLE IF NOT EXISTS order_payments (
  payment_id varchar(40) PRIMARY KEY,
  "orderId" varchar(40) NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
  provider varchar(16) NOT NULL DEFAULT 'mock',
  amount numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'VND',
  status varchar(24) NOT NULL DEFAULT 'pending',
  "receivedResult" varchar(16),
  "settledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_order_payments_order" ON order_payments ("orderId");
CREATE TABLE IF NOT EXISTS order_disputes (
  dispute_id varchar(40) PRIMARY KEY,
  "orderId" varchar(40) NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
  reason text NOT NULL,
  evidence text NOT NULL,
  "sellerResponse" text,
  status varchar(16) NOT NULL DEFAULT 'open',
  "resolvedBy" varchar(40),
  resolution text,
  "resolvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_order_disputes_order" ON order_disputes ("orderId");
COMMIT;
