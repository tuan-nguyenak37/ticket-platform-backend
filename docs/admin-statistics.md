# Administrative statistics

ACTIVE ADMIN users may read GET /api/users/admin-summary and
GET /api/users/admin-statistics. Static routes precede the user-ID route;
responses are no-store. Existing user/account/role mutation permissions and
session-revocation safeguards are unchanged.

Statistics accept dateFrom/dateTo as strict YYYY-MM-DD dates and groupBy as
day or month. Defaults cover the last 30 Vietnam calendar dates. Reversed or
over-366-day intervals are rejected. Reports share a REPEATABLE READ snapshot,
generate empty periods and retain decimal strings for counts and VND amounts.

Sales require both successful payment and paid order, using payment processing
time. Original and resale amounts stay separate; top events distinguish
original ticket quantities and resale quantities. These are gross amounts,
not profit, platform net income or proof of bank payout. VNPay attempt-status
counts use attempt creation time, which differs from sales processing time.

The summary counts users, moderators, Organizers, review/published events,
paid orders/resale orders and REVIEW payments. REVIEW is an operational count,
not restoration of a reconciliation/refund Admin API.

Mocks check authorization, dates, transaction scoping and bigint preservation.
No tests, migrations or live database reporting were executed in this batch.
