# Email notifications: Gmail, BullMQ and Redis

Email is disabled by default. The API writes notification records in the same
PostgreSQL transaction as the business change. A separate worker transfers IDs
to BullMQ/Redis and sends Vietnamese HTML/text messages through Gmail SMTP.

Redis connection settings live in `src/config/redis/redis.config.ts`: URL parsing,
TLS/auth/database selection, producer/worker retry options, queue prefix and
startup timeout. `src/config/env.validation.ts` validates environment variables
and supplies defaults. `EmailRunner` consumes this configuration and owns the
connection lifecycle. Deployment-specific values belong in `.env`; the Docker
service and persistent volume are defined in `compose.email.yml`.

## Events

| Event | Recipient |
| --- | --- |
| Ticket approved, manually or automatically | Seller |
| Ticket rejected | Seller, with rejection reason |
| Payment accepted and ticket allocated | Buyer and seller |
| Refund pending (lost payment race, cancelled event, accepted dispute) | Buyer |
| Refund completed | Buyer |
| Dispute opened | Seller |
| Seller first replies to dispute | Buyer |
| Dispute accepted or rejected | Buyer and seller |

Only committed state transitions produce messages. Reads that reconcile a
cancelled event can also produce the refund notification. Existing events are
not backfilled when enabling email. Payment mock mode is snapshotted when the
event is created; these messages are labelled DEMO and state that no real money
was transferred. No ticket PDF, QR, evidence or authentication token is attached.

## Local setup

1. Install dependencies with `npm ci`.
2. Apply `docs/email-schema.sql` to the application's PostgreSQL database before
   enabling email. Use your database client, or `psql -v ON_ERROR_STOP=1 -f
   docs/email-schema.sql` with your usual connection environment. The additive
   SQL can be applied again and does not send messages. Keep `DB_SYNCHRONIZE=false`
   when managing schema with SQL.
3. Run `docker compose -f compose.email.yml up -d`. Redis binds to loopback port
   6380, separate from the existing cache on 6379, with AOF, a persistent volume
   and `noeviction`. If overriding `EMAIL_REDIS_PORT`, also update EMAIL_REDIS_URL.
4. Enable two-step verification on a dedicated Gmail sender and create an App
   Password. Store it only in local `.env` or your deployment secret store, never
   Git or Postman. Use the 16-character value without display spaces.
5. Configure the same values for API, ticket worker and email worker:

```dotenv
EMAIL_ENABLED=true
EMAIL_GMAIL_USER=your-sender@gmail.com
EMAIL_GMAIL_APP_PASSWORD=your-app-password
```

Email contains notification text and the ticket/order reference, without website
links. No frontend configuration is required. Redis defaults to
`EMAIL_REDIS_URL=redis://127.0.0.1:6380/0`, `EMAIL_QUEUE_PREFIX=ticketverse` and
`EMAIL_RATE_PER_MINUTE=10`; override these only when needed.
For containers, use the Redis service hostname and port 6379 inside the network.

6. Restart the API and relevant business workers, then start a separate process:

For local development, start the API (watch mode) and email worker together:

```sh
npm run start:all
```

Logs have `API`/`EMAIL` prefixes. Ctrl+C stops both; either process exiting also
stops the other. PostgreSQL and Redis must already be running and email must be
enabled/configured. Stop any existing API/email processes first to avoid port
conflicts or duplicate workers. This command does not start the OCR worker or
Docker services. Restart it after email worker code changes (only API watches).

To run the email worker separately:

```sh
npm run worker:email
# Compiled deployment:
npm run build
npm run worker:email:prod
```

Gmail uses `smtp.gmail.com:465` with TLS. No SMTP runs inside the HTTP request.
Redis or Gmail failures do not roll back purchases. Failure to write the outbox
in PostgreSQL does roll back its business transaction, preserving atomicity.
The worker refuses to start when email is disabled or required config is missing.
Use a process supervisor to restart it if initial Redis connection fails.
At startup, `src/config/redis/redis-connection.ts` waits for queue readiness and
issues `PING`, requiring `PONG` within the 10-second startup deadline. The worker
logs `Redis connection successful (PING -> PONG)` on success. On failure it logs
`Redis connection check failed; email worker not started`, closes the connection
and exits before dispatching emails. This is a startup check, not continuous
health monitoring; runtime Redis errors are logged separately.
To stop delivery, stop all email workers; setting EMAIL_ENABLED=false and
restarting producers stops new notifications but does not delete existing rows.

## Retries, recovery and operations

- The dispatcher polls every 5 seconds and claims up to 25 due rows with
  `FOR UPDATE SKIP LOCKED`. Redis jobs contain only an outbox ID.
- Each notification has a deterministic ID from event kind, reference ID and
  recipient ID. Replayed business requests cannot insert a second copy.
- Two concurrent jobs lock the same outbox row; sent or failed rows are skipped.
  SMTP is performed while holding this outbox lock, never a business row lock.
- Up to 5 persisted send attempts, with BullMQ exponential backoff starting at
  10 seconds (10/20/40/80 seconds between attempts). Rate limiting defaults to
  10 jobs per minute across workers sharing the queue. Configure below your
  Gmail quota; the setting is not a guarantee of Gmail acceptance.
- Pending rows are reconciled every 120 seconds after dispatch. Lost Redis jobs
  are recreated from PostgreSQL. Completed/failed Redis jobs with pending outbox
  rows can be retried; the database attempt counter still caps sends at 5.
- Terminal failures remain in PostgreSQL and failed Redis jobs are retained.
  Error codes and worker logs omit SMTP responses and message contents.
- `sent` means SMTP accepted the message, not proof of inbox delivery. SMTP is
  at-least-once: a crash after Gmail accepts but before the database commits can
  resend a message. A stable Message-ID helps correlation, but cannot guarantee
  exactly-once delivery. Attempts interrupted by transaction rollback may also
  be repeated without a persisted counter increment.

Inspect operational state with a restricted database account:

```sql
SELECT id, kind, status, attempts, "lastErrorCode", "createdAt", "sentAt"
FROM email_outbox
ORDER BY "createdAt" DESC
LIMIT 50;
```

After fixing credentials/quota or another failure, explicitly retry one failed ID:

```sh
npm run worker:email -- retry <64-character-outbox-id>
```

This resets the failed row's counter and makes it due for the running worker.
It does not send synchronously. A running Redis job must finish before retry.
The command requires the same environment/prefix as the worker. There is no
public send-email or retry endpoint.

Keep sent outbox IDs for deduplication; deleting them permits historical events
to be inserted again. No automatic database retention is implemented. Redis
retains up to 1,000 completed jobs; failed-job retention needs operator monitoring.
Protect PostgreSQL backups (recipient snapshots/rejection reasons) and Redis
access. The Compose file is for local development; use private authenticated
Redis/TLS and persistent storage for deployment.

## Verification and Postman

```sh
npm test -- --runInBand
npm run test:email:integration
npm run test:purchase-flow
```

Email integration tests use the local DB settings from `.env`, an isolated random
PostgreSQL schema/Redis prefix and an ephemeral SMTP server on loopback. They
never connect to Gmail. Redis must be running on 6380 (override with
EMAIL_TEST_REDIS_PORT). They cover rollback, unavailable Redis, recovery, SMTP
retry, concurrent delivery, exhausted attempts and explicit retry. Purchase-flow
tests verify notification recipients and idempotency alongside real PostgreSQL
payment/dispute transactions and PDF/OCR approval.

Existing Postman review/payment/dispute requests trigger these notifications when
enabled. Request and response contracts are unchanged. Use only email addresses
you control for a manual Gmail smoke test; inspect the outbox and recipient inbox.
No new Postman endpoint is required. Real Gmail delivery still requires validation
with your configured account.
