# Event review workflow

OWNER prepares a DRAFT, checks GET /api/v1/events/:id/readiness and submits it
through POST /api/v1/events/:id/submit. Readiness requires description, future
valid showings, venue details and an ACTIVE ticket tier with valid sale windows
and inventory for every showing. Failed checks return structured issues.

ADMIN/MODERATOR list pending items at GET /api/v1/moderation/events, inspect
/:id and POST /:id/approve or /:id/reject. Rejection accepts a reason of 1-2000
characters after trimming. GET /history paginates the durable review journal.
Owners cannot review their own events even if their global role is elevated.

State changes and review-log insertion share a locked PostgreSQL transaction.
Only PENDING_REVIEW can be decided; repeated decisions return 409. Approval
rechecks readiness and the organizer's active status. Rejection permits
correction; content changes return the event to DRAFT before resubmission.
Organizer identity is not separately approved by this workflow.

The baseline event migration already owns the journal schema, so no new
migration is required. Notifications are intentionally deferred to their module.
Specs and readiness cases are included but not run. Mock transactions do not
establish real rollback or concurrent moderation behavior.
