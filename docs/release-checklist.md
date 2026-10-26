# Release checklist

No commands in this checklist were executed during the commit batch.

1. Review the intended database, backups and pending migrations. DB_SYNCHRONIZE
   stays false; startup does not apply migrations. Use the managed migration
   entrypoint, not local manual SQL/demo scripts. Forward-only compatibility
   migrations preserve existing schema and refuse destructive rollback.
2. Configure PostgreSQL, Redis, allowed frontend origins, trusted proxies and
   independent strong JWT/QR secrets. Use private environment/secrets storage.
   Rotate any credentials previously exposed in chat, logs or exports.
3. Configure Redis persistence/ACL/TLS appropriate to deployment. Lost refresh
   state revokes sessions. Verify access expiry, single-use rotation, conflicts,
   F5, logout/account changes and multi-tab behavior with the frontend.
4. Validate SMTP outside the payment transaction. Local compose.email.yml is
   an optional localhost-only Mailpit catcher, not an extra Redis queue. It
   must not be exposed or used as production delivery.
5. Register the public HTTPS IPN and exact return URL with VNPay. The current
   client targets the test gateway. Verify signed success/failure, cancellation,
   duplicate and concurrent IPN, delayed callbacks, amount mismatch and owner
   recovery. Browser returns never establish payment success.
6. Verify order/resale ownership, inventory, cancellation/expiry, credential
   revocation, current PDF export, account masking and database rollback.
   SMTP failure must not lose tickets or paid orders.
7. Verify payout/email worker restart, leases, duplicate protection and retries.
   MOCK payout processing is development/test only and moves no money.
   Production needs a real transfer provider and confirmed bank outcomes.
8. Verify Admin/Organizer reports against known rows: counts, discounted gross
   amounts, Vietnam date boundaries and no profit/bank-payout assumptions.
9. Run appropriate unit, real Redis/PostgreSQL, browser and provider acceptance
   checks in isolated environments. Do not reuse a production DB or arbitrary
   application credentials for destructive test harnesses.
10. Review the exact Git diff for secrets, personal data, runtime uploads,
    generated output and legacy functionality before any push or deployment.

Old opaque-cookie sessions require one new login after migrating to JWT refresh.
Existing users, orders and tickets must be preserved. No real-payment production
readiness is claimed by a TypeScript or formatting check.
