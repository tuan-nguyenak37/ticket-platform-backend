# Organizer profiles and ownership

## Scope

This commit adds organizer profiles, not event moderation, reports, staff
invitations or banking details. An organizer is not a user role. Creating a
profile does not grant ADMIN or MODERATOR privileges and does not approve
any event. Every endpoint below requires a Bearer access JWT and an ACTIVE
user, enforced by the existing authentication guard.

| Method | Endpoint                | Behavior                                               |
| ------ | ----------------------- | ------------------------------------------------------ |
| POST   | /api/v1/organizers      | Create a profile and an OWNER membership atomically    |
| GET    | /api/v1/organizers/mine | List the caller's memberships, newest membership first |
| GET    | /api/v1/organizers/:id  | Read a profile; any authenticated ACTIVE user may read |
| PATCH  | /api/v1/organizers/:id  | Update a profile; only its OWNER may edit              |

All four responses use the standard API envelope and Cache-Control: no-store.
POST returns HTTP 201; reads and PATCH return HTTP 200. Creation and update
emit operational audit actions organizers.create and organizers.update.
There is no member-management or delete endpoint in this commit.

## Request and response

Creation accepts only name, contactEmail and optional description:

```json
{
  "name": "TicketVerse Events",
  "contactEmail": "organizer@example.com",
  "description": "Live events"
}
```

Name is trimmed, required and at most 255 characters. Contact email is trimmed,
lowercased, validated as an email and at most 255 characters. Description is
an optional string; null, empty or whitespace-only text is stored as null.
Unknown body fields, including owner IDs, status, role and slug, are rejected.
JSON request bodies also have the application's existing size limit.

PATCH accepts the same three fields but requires at least one defined field.
Name and contactEmail cannot be null. Description can be null to clear it.
An update never changes the slug, OWNER membership or organizer status.
The server generates the organizer ID and a normalized slug with a random
suffix. A database uniqueness conflict returns HTTP 409.

The response allowlist is organizerId, name, slug, description, logoUrl,
coverUrl, contactEmail, contactPhone, status, createdAt and updatedAt.
The mine response additionally includes memberRole. Member records,
user credentials, session information and bank accounts are not returned.
Contact fields are intentionally readable by authenticated users; they are
not private payout information. Logo, cover and contact phone are reserved
response fields and cannot be updated through these endpoints yet.

## Ownership and consistency

Creation locks and rechecks the user inside the PostgreSQL transaction,
then inserts the organizer and OWNER membership together. Update locks and
rechecks the user and organizer, then requires OWNER membership.
An inactive or missing actor is rejected; a missing profile returns 404.
Non-owners, including ADMIN and MODERATOR without OWNER membership, receive
403 on update. MANAGER and STAFF enum values exist in the baseline, but
neither may edit through this endpoint. No role-assignment API is exposed.
A SUSPENDED organizer stays readable but cannot be edited.

The baseline migration already creates organizers and organizer_members,
including their unique and foreign-key constraints. This commit only registers
the two entities and connects the module; it adds no migration and does not
modify existing data. Migrations are never run automatically on startup.
Do not rerun or replace an applied baseline.

## Validation status

organizers.spec.ts covers DTO normalization/rejection, route authentication,
response allowlists, ownership checks, inactive users, suspended profiles,
transaction callbacks and persistence errors using mocked repositories.
Tests are authored but not executed in this commit at the user's request.
Mocks do not prove real PostgreSQL rollback, row locking or concurrent behavior;
these still require integration verification against an isolated database.
