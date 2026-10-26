# Backend documentation

These documents describe the curated backend Git snapshot. They supersede local
legacy API exports, hand-written SQL patches and old verification reports.

## Identity and governance

- [Profile API](profile-api.md)
- [User administration](user-administration.md)
- [User role changes](user-role-changes.md)
- [Organizer profiles](organizer-profiles.md)
- [Organizer receiving account](organizer-payout-account.md)
- [Administrative statistics](admin-statistics.md)

JWT/browser-cookie behavior is documented in the root README. Refresh tokens
are HttpOnly, one-use and rotated atomically through Redis; access JWTs use Bearer.

## Events and commerce

- [Events](event-management.md), [showings](showing-management.md),
  [ticket tiers/inventory](ticket-tier-management.md), [images](event-image-uploads.md)
- [Review workflow](event-review-workflow.md), [discounts](event-discounts.md)
- [Reservations](order-reservations.md), [verified settlement](order-settlement.md)
- [Payment primitives](payment-processing.md), [VNPay integration](vnpay-integration.md)
- [Ticket issuance](ticket-issuance.md), [PDF/QR/email delivery](ticket-delivery.md)
- [Resale](resale-v2.md), [storage compatibility](resale-storage.md),
  [seller payouts](automatic-payouts.md)
- [Organizer sales reports](organizer-sales-reports.md)
- [Web notifications](web-notifications.md)

## Development and release

- [Category catalog](category-catalog.md)
- [Release checklist](release-checklist.md)
- [Source scope and excluded local artifacts](source-scope.md)
- [Verification status](verification-status.md)

The payment-foundation document is an earlier implementation scope, not an
assertion that the final snapshot lacks provider integration. No historical
test result should be treated as acceptance of the current tree.
