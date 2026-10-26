# Verified payment processing

PaymentProcessingModule is a dependency leaf shared by Orders and Resale.
It does not import the aggregate PaymentsModule or expose a charge API.

The default VNPAY provider requires signed internal provider proof for nonzero
amounts. The client verifies checksum, merchant, transaction reference, VND
amount and successful provider status. QueryDr uses its own signed response
format. Redirects and client-supplied payment totals are not payment evidence.

PROJECT is a deterministic development/test processor and moves no real money.
Nonzero PROJECT processing is blocked in production in both configuration and
the processing service. Free orders use a separate FREE result with no charge.
Provider references, amounts, methods, currency and outcomes are validated.

Only the documented VNPay test endpoints are supported by this client. This is
not a production acquiring or payout integration. Credentials must stay in the
private environment. IPN and recovery orchestration are added separately.

Unit specifications are included, including the production guard. No tests,
provider calls or migrations were run during this commit.
