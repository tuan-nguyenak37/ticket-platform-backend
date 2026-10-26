# Source scope

The rebuilt history keeps backend and frontend as separate repositories.
Commits follow Conventional Commits and are grouped by dependencies and business
purpose. No frontend changes or remote pushes are included in this batch.

## Preserved foundations

Keep the hardened environment/auth/Redis/HTTP/database setup and existing
account/profile/role safeguards. Do not replace them with older monolithic
workspace variants simply to make a large git add include everything.
Split registration/discount compatibility migrations remain registered.
Previously applied migration files are not rewritten.

## Deliberately excluded local artifacts

- Actual .env files, SMTP/Merchant secrets, exported credentials and Postman
  environments with saved values; use empty templates/private configuration.
- Third-party Ticketbox snapshots and one-off imports with hardcoded Organizer
  IDs; category seeding is synthetic and independent of those snapshots.
- Historical Postman collections, manual SQL/demo patches, old test reports,
  purchase/card/dispute/OCR fixtures and scripts targeting removed APIs.
- OCR/import tools, operator invitations/endpoints and the legacy EventOperations
  migration. Owner-only check-in was subsequently approved; it uses the separate
  TicketCheckIns migration and does not restore operator management.
- Admin VNPay reconciliation/refund routes. The historically named recovery
  audit table is retained only for owner-scoped QueryDr throttling/history.
- Unused auth scaffold entities/DTOs, MockPaymentDto, worker entrypoints that
  only exit, machine-specific skill locks, generated PDFs/QRs, uploads and dumps.
- Obsolete package/config/formatting variants that would undo committed safety
  rules or add unused dependencies.

These files may remain locally to avoid destroying pre-existing work; their
presence is not authorization to stage them later. Working-tree differences
against this curated history must be reviewed, not bulk-added or reset.
The retained Git snapshot is not a claim that every legacy local file matches
the new architecture or that acceptance testing has run.

## Approved check-in extension

Check-in verifies the current signed QR against the selected event/showing and
records admission once under a ticket row lock. Only the Organizer owner can
perform it. No public verifier, staff invitation or bank/payment API is added.
Registration/discount compatibility migrations remain registered; the old
EventOperations file is not reapplied. Existing check-in columns/data are kept.
See ticket-check-in.md for the request, duplicate result and migration rules.
