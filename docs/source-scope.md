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
- OCR/scanner tools, check-in/operator endpoints and the legacy EventOperations
  migration. The current scoped entities do not map check-in columns.
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
