# Organizer sales reports

GET /api/v1/organizers/:id/report and /:id/events/:eventId/report require an
ACTIVE user who owns the Organizer. The event-specific route also checks that
the event belongs to that Organizer. Route IDs are validated; responses are
no-store. Suspended Organizers may read history but cannot update payout data.

Rows group original paid orders by event, showing and ticket tier. They contain
order count, ticket quantity and gross amount after the order's stored discount.
Pending, cancelled and failed orders do not count as sales. Resale proceeds,
seller payouts and profit are not included. The report does not claim an actual
Organizer bank payout.

Monetary values and totals are decimal integer strings combined with BigInt.
The client can filter/group the supplied showing rows and export them as CSV;
the API does not return a bank statement or a profit calculation.
No attendee, check-in or staff-invitation feature is introduced.

Included mock specs cover owner scoping, foreign-event rejection, PAID filtering
and bigint precision. Tests and database operations were not executed.
