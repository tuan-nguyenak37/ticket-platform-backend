# Ticket delivery

ACTIVE authenticated owners can list/view tickets, download one ticket or an
owned order's current tickets as PDF, read a ticket QR and resend email.
Routes are under /api/v1/tickets and /api/v1/orders/:id/tickets/pdf.
Access checks run before rendering. Transferred tickets and revoked credentials
are not exported as the previous owner's current tickets. Downloads and QR
responses are private, no-store. Resending is rate-limited via Redis.

Each PDF page is an A4 ticket with TicketVerse's purple identity, event image,
Vietnamese text, showing/venue, price and current signed QR. The bundled Noto
Sans font includes its OFL license. Nest copies assets into the build. Posters
are local supported images or a branded fallback; no arbitrary remote fetches.

Configure a distinct TICKET_QR_SECRET (32+ characters). Enable SMTP with
TICKET_EMAIL_ENABLED and SMTP_* values in the local environment, never Git.
compose.email.yml provides a local mail catcher. Emails share the HTML/text
template and attach the same current PDF. Email failure does not undo payment;
tickets remain accessible and can be resent. Signed QR verification is reused
by the owner-only check-in API described in ticket-check-in.md; it is not a
public ticket-verification endpoint.

Seller-notice types live separately from persistence to avoid a mail dependency
on the future resale schema. Resale transfer helpers are internal and are not
reachable until the resale module is added. No payment or email was initiated;
tests are included but not run. PostgreSQL/SMTP/browser acceptance remains open.
