# Showing management

- POST /api/v1/events/:eventId/showings creates a showing for its event.
- GET /api/v1/events/:eventId/showings lists visible showings chronologically.
- GET /api/v1/showings/:id reads a visible showing.
- PATCH /api/v1/showings/:id updates it; DELETE on the same route removes it.

All writes require an authenticated ACTIVE user, OWNER membership and an ACTIVE
organizer. ADMIN/MODERATOR may inspect hidden event data but do not bypass
ownership for writes. Pending-review events cannot be changed. Public reads
only expose PUBLISHED events from ACTIVE organizers; owners may see their drafts.

Input timestamps require ISO 8601 with an explicit +07:00 offset. Calendar
rollover and invalid times are rejected. End must follow start. Creation and
changed time ranges require a future start; unchanged historical times can be
retained while editing another field. API responses serialize dates as UTC ISO.

Mutations lock organizer, event and (when applicable) showing. Changed showings
reset PUBLISHED/REJECTED events to DRAFT; deletion does the same. Foreign-key
references block deletion with 409, rather than cascading into business records.
Discovery now includes nextShowingAt, the earliest future showing or null.
Ticket-tier relations and sale-window protection are added in the next commit.

The existing Showings migration adds the parent foreign key, time-range check
and chronological index. Its content is unchanged. No migration is executed.
The new specs cover parsing, DTOs and mocked ownership/mutation paths. They are
not executed in this batch and do not establish real DB concurrency guarantees.
