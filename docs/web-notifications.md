# Web notifications

Authenticated ACTIVE users can list their own inbox, mark one notification read
or mark all read. Responses use no-store; foreign IDs return 404.
GET /api/v1/notifications?page=1 returns 20 items per page and unread counts.
PATCH /api/v1/notifications/:id/read and /read-all are idempotent.

The PostgreSQL helper inserts notices inside the business transaction. A unique
(user_id, kind, source_id) constraint prevents duplicate delivery records.
Event decisions notify Organizer OWNER memberships using the review-log ID.
Payment producers will use ORDER_PAID, RESALE_BOUGHT and RESALE_SOLD only after
verified settlement. A notice does not confirm bank receipt.

No account numbers, QR credentials or buyer identity belong in notification
content. Clients render content as text. No historical notices are backfilled.
Apply the WebNotifications migration before deploying any notification writer.
Rollback drops inbox history and requires stopping all writers first.

Mock specs are included. No tests or migrations were run during this commit.
