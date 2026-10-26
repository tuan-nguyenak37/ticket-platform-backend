# Ticket tiers and inventory

Each tier belongs to exactly one showing, never just to the event. Its benefits
are stored in description. There is no second benefits form or separate API.

- POST /api/v1/showings/:showingId/ticket-types creates a tier and inventory.
- GET on that route lists visible tiers for the selected showing.
- GET /api/v1/ticket-types/:id returns a visible tier.
- PATCH on that route updates allowed fields; DELETE removes an unused tier.

Mutation requires OWNER membership, an ACTIVE organizer and an authenticated
ACTIVE account. Pending-review events are locked against configuration changes.
Public buyers see ACTIVE tiers on PUBLISHED events of ACTIVE organizers.
Owners and moderators can inspect management state; elevated roles do not bypass
ownership for mutation.

## Money, availability and safeguards

price is an integer VND number in the request, between zero and the maximum safe
JavaScript integer. Responses and PostgreSQL bigint prices use strings.
Formatting such as 200.000 belongs to the interface, not the stored amount.
Available quantity equals total minus reserved minus sold.

Creation persists the tier and inventory in one transaction. Active tiers need
both sale timestamps; end must follow start and cannot follow the showing start.
Input times use explicit +07:00 and validated calendar dates. Quantity and
per-order limits are validated before writes.

After reservations or sales exist, only total-quantity increases are allowed.
Configuration edits, reductions and deletion are rejected. A non-DRAFT tier
cannot return to DRAFT. Removing an unused tier first removes its inventory in
the same transaction; foreign-key failures return 409 without cascade deletion.
Changing a showing start cannot move it before an existing tier's sale end.

The existing TicketTypesInventory migration is preserved. It enforces per-showing
case-insensitive name uniqueness, parent references and nonnegative stock/price
constraints. Discovery now includes minPrice as an integer string (or null)
across ACTIVE tiers attached to future showings. This is a display minimum,
not a guarantee of current availability or an open sale window.

No orders, payments, event approval actions or notification APIs are added in
this commit. Specs cover configuration, DTOs and mocked lifecycle protections.
Tests and migrations are not executed; mock callbacks do not prove DB rollback
or concurrent reservation behavior.
