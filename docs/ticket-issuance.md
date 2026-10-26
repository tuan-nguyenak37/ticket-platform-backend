# Ticket issuance

This scope introduces tickets, their current credentials, ownership history and
the internal TicketIssuanceService. It does not add a payment endpoint, mark an
order paid, send email or expose PDF, QR, check-in or staff APIs.

## Payment prerequisites

The caller supplies the EntityManager from its active payment transaction.
issue() acquires a write lock on the order before inspecting and inserting.
inspect() requires a PAID order, a SUCCEEDED payment, a CONSUMED reservation,
matching ticket type and quantity, and matching integer-VND totals after the
stored discount. These checks validate stored consistency, not provider proof.
Future settlement code must verify the provider before updating those records.

Each ticket belongs to an order item and has a unique number within that item.
It starts ACTIVE, owned by the buyer, with one current credential and an initial
ownership record. The database enforces unique item/number pairs and at most one
unrevoked credential per ticket. Ticket, credential and ownership inserts must
commit or roll back with the caller's transaction.

## Repeated calls and historical data

Normal issuance rejects existing tickets; it does not silently issue duplicates.
Provider callback idempotency belongs to payment settlement, which is not wired
in this commit. Reads through inspect() reject incomplete or inconsistent ticket
sets, invalid numbering, credential state or initial ownership history.

The explicit internal backfill flag fills only missing ticket numbers after
checking payment consistency. It is not an API or an automatic startup repair.
Existing paid orders are not backfilled by this change. Any future operational
backfill must be controlled, transaction-scoped and separately authorized.

The original IssuedTickets migration is retained without rewriting its schema.
Only the corresponding three entities are registered. Check-in fields from the
legacy monolithic EventOperations migration are deliberately not included in
this scoped history. Do not blindly register that legacy migration later.
No migration or backfill has been run.

## Verification limits

Mock specifications cover payment prerequisites, the order lock request,
ticket/credential/ownership creation, repeated issuance, corrupt ticket sets and
explicit missing-number backfill. They do not establish real PostgreSQL locking,
concurrency or rollback behavior. Tests are added but not executed at the user's
request. TypeScript checks do not verify database or provider integration.
