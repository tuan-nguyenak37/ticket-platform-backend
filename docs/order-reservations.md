# Orders and ticket reservations

POST /api/v1/orders requires a Bearer JWT, ACTIVE user and Idempotency-Key
(1-128 letters, digits, underscores or hyphens). Input is ticketTypeId, quantity
and optional discountCode/answers. The server uses stored prices and integer VND.
An order selects one tier of one showing; body-supplied totals are rejected.

The transaction locks organizer/event/showing/tier, checks publication, sale
window and quantity limits, locks discount/stock and conditionally reserves
available stock. It persists order, item and reservation together. Holds last
at most ten minutes and never exceed the showing start. A matching idempotency
key returns the original order; changed input returns 409. Database uniqueness
and transaction advisory locks complement the application check.

GET /mine and GET /:id are scoped to the caller. POST /:id/cancel releases an
ACTIVE pending reservation; paid or already-settled holds cannot be cancelled.
Expired holds for the selected tier are reclaimed lazily during creation and
expiry is rechecked with DB time on cancellation. No background expiry worker
is added by this commit. Expiry display alone is not a DB state transition.

Discount use counts PAID orders plus live pending holds. Discount row locking
prevents concurrent usage-limit updates from being evaluated independently.
The discount management list now exposes usedOrReserved. Custom questionnaire
configuration is not exposed: this current flow validates against no questions.
No payment success route, automatic checkout or ticket issuance is included.

OrdersReservations is preserved unchanged. OrderRegistrationDiscounts adds only
missing legacy-compatible columns and an index after discount schema is ready;
it is forward-only and does not rewrite existing order amounts or answers.
The monolithic legacy EventOperations migration is not registered in this
rebuilt history. No migration or test runs occur in this batch.

Specs cover DTOs, identity scoping, idempotent replay and mocked stock allocation.
Real PostgreSQL rollback, concurrent stock pressure and expiry release still
require integration verification; TypeScript checks are not execution tests.
