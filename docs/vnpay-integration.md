# Hosted VNPay checkout and recovery

The current client targets VNPay's external test gateway. It does not transfer
real funds. Configure VNPAY_TMN_CODE and VNPAY_HASH_SECRET privately, a registered
public HTTPS IPN endpoint and the exact VNPAY_RETURN_URL. Localhost cannot
receive server-to-server IPN from VNPay without a properly secured tunnel.

Authenticated owners start and inspect payments at
/api/v1/payments/vnpay/:kind/:id, where kind is orders or resale. Initiating
resale from /resale/listings/:id reserves it and creates the attempt in one DB
transaction. Preview alone never holds a ticket. The hosted page collects
payment details; the application accepts only recipient details, not card/CVV.

GET /api/v1/payments/vnpay/ipn is public but verifies signature, merchant,
reference and stored amount before processing. It returns VNPay protocol JSON,
not the normal API envelope. Repeated notifications use stored transaction and
payment state. Failed/expired/REVIEW results do not produce success tickets or
seller payouts. Paid-but-unfulfilled results enter REVIEW for operational help;
they are not silently retried as a second charge.

The browser return endpoint validates the response only to select a redirect.
It never marks an order paid. After JWT restoration the client can read state
and POST /:kind/:id/sync for a rate-limited owner-only signed QueryDr recovery.
No token or arbitrary destination is put into the return URL.

The historical VnpayReconciliations migration is retained because buyer recovery
uses its table for query throttling and diagnostic history. This is storage for
the existing recovery flow, not restoration of an Admin reconciliation API.
No Admin payment/reconcile/refund endpoints are registered.

Legacy /v1/checkout session initiation/OTP confirmation is gated to PROJECT.
Email OTP is not VNPay proof. PROJECT nonzero processing is blocked in production.
Legacy receipts/history remain owner-scoped. Do not collect real card data using
the legacy demonstration form or treat its result as a real bank transaction.

Apply the managed migrations before deploying this code; none were run here.
Included unit/HTTP specifications have not been executed in this commit batch.
No provider request, email or payment was initiated. Live test-gateway success,
cancellation, duplicate/late IPN and browser recovery still need acceptance.
