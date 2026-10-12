# Account moderation and dispute evidence

Implemented 2026-10-12. Base path: `/api`. Authentication: Bearer access token.

## Database and startup

When `DB_SYNCHRONIZE=false`, apply `orders-schema.sql` first (if Orders is not
installed), then `account-moderation-dispute-evidence.sql` before starting the
updated API/workers. The additive SQL can be reapplied. It adds three nullable
moderation fields to `Users` and an empty `attachments` JSONB array to existing
disputes. Back up the database before deployment. Development synchronize can
create these columns automatically. No new environment variables are required.

## Lock and unlock accounts

`PATCH /api/users/:id/status`, ADMIN only:

```json
{ "status": "suspended", "reason": "Fraud report under review" }
```

- `suspended`: locked pending manual review; no automatic expiration.
- `banned`: locked for a confirmed violation; an ADMIN can still unlock it.
- `active`: unlock. A non-blank reason is required for all changes (1-1000 chars).
- Only USER and MODERATOR targets can be changed. ADMIN targets, including self,
  return 403. Deleted/missing users return 404. This is not a role-management API.
- A successful change atomically increments `tokenVersion` and records
  `statusReason`, `statusChangedBy`, `statusChangedAt`. Login, access and refresh
  reject locked users. Unlock does not revive old tokens; sign in again.
- Redis hashes from earlier sessions can remain until TTL expiry, but cannot
  authorize a refresh because PostgreSQL status/version checks run first.
- Repeating the current status returns 200 without rewriting the reason/time or
  incrementing the version. Concurrent account changes can return 409; reload
  before retrying. Invalid input returns 400; missing authentication returns 401.
- Response: standard success envelope containing public user fields and
  `moderation: { reason, changedBy, changedAt }`. The same metadata appears in
  ADMIN user detail/list, never in self-profile or login responses.
- The metadata stores the latest transition, not a full database history.
  Application audit action: `users.status.update`.

Locking prevents subsequent authenticated requests; an already authorized
in-flight request may finish. Existing orders, disputes, payments and files are
preserved for review. New orders reject inactive sellers; payment settlement
already checks that both parties are active. Existing public ticket listings
are not automatically hidden. Locking is not an automatic refund or payout hold.

## Upload dispute evidence

1. Buyer opens a dispute using the existing JSON API. `reason` and textual
   `evidence` remain required; existing clients do not need to change.
2. Buyer and seller can each add files while the dispute is open:
   `POST /api/orders/me/:id/dispute/evidence`.
3. Send `multipart/form-data` with exactly one file field named `file` and no
   text fields. Do not manually set the multipart Content-Type boundary.
4. Get attachments from the upload response or existing order detail:
   `GET /api/orders/me/:id`; managers use `GET /api/orders/manage/:id`.
5. Download using each attachment's authenticated `downloadUrl`:
   `GET /api/orders/:id/dispute/evidence/:attachmentId`.

Limits and permissions:

- JPEG, PNG, GIF, WebP, PDF. MIME is checked against the file signature; renaming
  an unsupported file is insufficient. Video, SVG and HTML are not supported.
- Maximum 5 MB/file, or `UPLOAD_MAX_FILE_SIZE_MB` if configured lower.
- Maximum 5 files per party (10 per dispute), including simultaneous uploads.
- Upload rate limit: 10 requests/minute/IP, in addition to global Redis limits.
- Only the buyer/seller may upload. An ADMIN/MODERATOR outside the transaction
  can read evidence but cannot submit files on behalf of either party.
- Download requires an active buyer, seller, ADMIN or MODERATOR account.
  Other users cannot read the file. Closed disputes retain readable evidence,
  but cannot accept new files. Files cannot be edited or deleted through the API.
- Upload returns 201 with the updated order; 400 for missing/invalid file or
  multipart fields, 413 for size, 404 for an inaccessible order, 409 for a closed
  dispute or full quota. Downloads return 404 for unknown files, 403 for outsiders,
  401 for missing/invalid authentication. Rate limits return 429 with Retry-After.

Attachment representation inside `data.dispute.attachments`:

```json
{
  "id": "evidence_example",
  "uploadedBy": "user_example",
  "side": "buyer",
  "mimetype": "application/pdf",
  "size": 1024,
  "createdAt": "2026-10-12T00:00:00.000Z",
  "downloadUrl": "/api/orders/order_example/dispute/evidence/evidence_example"
}
```

Files are stored under `UPLOAD_DIR/disputes` with generated filenames, outside
public image/ticket routes. Do not serve UPLOAD_DIR as a static directory at the
reverse proxy. The download endpoint returns bytes with `no-store`, `nosniff`
and `Content-Disposition: attachment`; disk paths and original names are omitted.

The shared order transaction lock serializes upload, reply and dispute resolution.
Failed database writes/commits trigger file cleanup. A process crash between disk
write and database commit may leave an orphan file; filesystem and PostgreSQL do
not share a transaction. Back up both. Signature validation is not antivirus
scanning. Upload retries can create another attachment, subject to the quota.
No new email is sent solely for file uploads.

## Postman and verification

- Import `postman/users-moderation.postman_collection.json` for admin actions.
- Orders collection: manual evidence folder, run after opening a dispute and
  before resolving it. Set separate buyer/seller/manager tokens and choose a
  local file. Do not run all alternative workflow branches sequentially.
- Unit suite: `npm test -- --runInBand`.
- HTTP account tests: `npm run test:e2e -- --runInBand`.
- PostgreSQL tests: set `ORDERS_PG_TEST=1`, then run
  `npm test -- --runInBand src/modules/orders/orders.postgres.spec.ts`.
  Uses a random disposable local database schema and `.tmp` directory; no real
  emails are sent. See `verification-status.md` for actual results.
