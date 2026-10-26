# Internal ticket resale

Sellers list only their own active issued tickets, bounded by the original
per-ticket paid amount. New listings require receiving bank, digit-string
account number and account-holder name. Accounts may differ from the original
payment account; no card, CVV, PIN or OTP is collected. The backend fixes a 5%
fee rounded down in integer VND and stores the net amount and account snapshot.

Public listing discovery supports search, event/date/price filters and sorting.
Responses are allowlisted; bank details are private to the seller. Checkout
preview does not reserve the ticket. The payment-initiation transaction creates
the short exclusive hold; competing buyers receive current availability rather
than creating duplicate paid transfers. Cancellation/expiry releases the hold.

Verified settlement locks the related records, rechecks availability, transfers
ownership, revokes the seller credential, issues a new credential, persists the
payment, records buyer/seller notices and enqueues settlement/email atomically.
No browser redirect finalizes a sale. A repeated settled callback does not
transfer or queue the same sale again.

Legacy listings without bank snapshots remain manageable but cannot accept
new holds; cancel and relist. Already-held legacy orders preserve old pricing.
Past paid orders are not automatically charged a new fee or given a payout.

## Automatic settlement and email

The DB worker polls every five seconds after commit. Payout rows and unique
sale/kind emails survive restart. Pessimistic locking, skip-locked selection and
email leases coordinate workers. Simulated payouts run only in development/test,
record provider MOCK and transfer no real money. Production does not process
MOCK payouts. Do not use VNPay Refund as a seller-transfer API.

SOLD and PAYOUT_PROCESSED emails use masked accounts and contain no old QR or
buyer identity. SMTP runs outside payment transactions. Retry delays are one,
five, fifteen and sixty minutes, then failure is stored for operations. SMTP
cannot promise exactly-once delivery after a process crash. A processed payout
means processed in the system, not confirmation that a bank received funds.

No wallet or withdrawal request is added. No database migration, tests, money
transfer or email was executed in this commit. Included mocks do not replace
PostgreSQL concurrency, restart and real-provider acceptance.
