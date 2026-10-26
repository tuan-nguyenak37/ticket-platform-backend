# Payment processing foundation

This scope adds the payment record model, supported payment-method parser and
gateway interfaces, not a provider integration or a new success endpoint.
GET /api/v1/orders/:id may now include the stored payment result after its normal
ownership check. It returns only paymentId, orderId, status, amount and
processedAt. The client cannot assign these fields.

Payment amounts remain integer VND strings backed by bigint. The original
MockPayments migration creates a unique order reference, nonnegative amount
check and SUCCEEDED/FAILED outcome enum. Its historical filename is retained;
registering it does not enable a mock-payment route or claim a real transfer.
Database uniqueness rejects duplicate records; it is not by itself complete
callback idempotency or a multiple-attempt payment workflow.

The method parser accepts BANK_TRANSFER, CARD or WALLET and rejects extra
fields, card numbers or client totals. Gateway request/result types preserve
reference, amount, currency and provider outcome for later verification code.
No always-success development gateway is wired in this commit. VNPay checksum,
IPN, recovery and payment-to-ticket transitions are added with their own scopes.

Specs inspect schema statements, request parsing and an owner-scoped stored
result using mocks; they do not exercise a real provider or database.
No tests or migrations run, and no payment is initiated during this batch.
