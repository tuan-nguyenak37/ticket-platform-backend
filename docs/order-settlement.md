# Order settlement

OrdersService.pay is an internal payment orchestration method, not an arbitrary
success API. The legacy direct checkout route rejects payment attempts.
Nonzero VNPay orders require signed provider proof checked by PaymentProcessing.

Within a database transaction the service locks the stock/order/reservation,
validates owner, hold deadline, Organizer status and the stored discounted
amount, consumes stock, persists payment, issues tickets and records a durable
ORDER_PAID notice. Existing consistent payment records return without repeating
stock consumption or issuance. Failed/inconsistent outcomes do not issue tickets.
Ticket email is attempted after commit and does not undo the paid order.

Idempotency for order creation remains scoped to user and Idempotency-Key.
Callback retries use the stored payment record. No browser return URL determines
success. Integration of the hosted checkout and IPN routes follows separately.

Mock orchestration specifications are included. No tests, migrations, payments
or email were executed in this commit. DB concurrency still requires acceptance.
