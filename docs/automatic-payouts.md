# Seller payouts

The current resale implementation is documented in resale-v2.md and
resale-storage.md. Receiving details are captured at listing time. Successful
verified sales queue a DB-backed payout and sale email in the same transaction.
A development/test processor marks MOCK payouts processed; it moves no money.
There is no wallet, withdrawal API or automatic VNPay Refund transfer.

Production needs a real payout-provider integration, bank outcome verification,
operational recovery and reconciliation before enabling real seller payments.
Do not infer bank receipt from the existing SUCCEEDED mock state.
