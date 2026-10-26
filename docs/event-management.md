# Event categories and organizer events

Historical scope: event profiles and image routes, before showing and ticket
configuration. Event approval APIs are deliberately added in a later commit.
The original EventCategoriesEvents migration is preserved byte-for-byte,
including its review-log table reserved for that workflow.

## Routes

- GET /api/v1/events/categories: public category list.
- GET /api/v1/events: public PUBLISHED events from ACTIVE organizers, with
  page, limit (maximum 100), literal title search q and categoryId.
- GET /api/v1/events/:id: public published details, or management details for
  its OWNER or ADMIN/MODERATOR. Hidden events return 404 to strangers.
- POST /api/v1/organizers/:id/events: OWNER creates a DRAFT event.
- GET /api/v1/organizers/:id/events: OWNER lists their events.
- PATCH /api/v1/events/:id: OWNER edits title, categoryId, description or posterUrl.
- POST /api/v1/events/:id/poster: OWNER uploads JPEG, PNG or WebP in field file.
- GET /api/v1/events/:id/poster/:filename: follows event visibility and only
  serves the currently attached image, with private, no-store caching.

Creation and edits require an ACTIVE user through the authentication guard,
OWNER membership and an ACTIVE organizer. The service locks the organizer and
event before mutation. Unknown DTO fields are rejected by the global pipe.
A PENDING_REVIEW event cannot be edited. Changed PUBLISHED/REJECTED content
returns to DRAFT; unchanged content does not. Slugs remain stable on update.
Creation generates a random suffix and retries only slug uniqueness collisions.

Public responses exclude review metadata. Operational audit uses the created
eventId, never serializing the entire request/response. Poster writes attempt
file cleanup if persistence fails and remove the replaced local image after
commit. Filesystem and PostgreSQL do not share an atomic transaction.

Run migrations separately on a deliberately selected database; this commit does
not execute them or insert external event data. Categories must be seeded through
reviewed tooling. Showing dates, minimum ticket prices, custom registration and
review actions belong to subsequent commits, not placeholder SQL here.

The event-management spec supplies mock-based ownership, visibility, validation
and audit cases. Type checking is separate from executing tests. Tests are not
run at the user's request; real DB locks and rollback remain unverified.
