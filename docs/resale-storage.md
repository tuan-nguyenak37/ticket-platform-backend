# Resale storage

InternalResale creates listings, buyer orders and payment outcomes. Ticket and
buyer/seller references are durable foreign keys. A partial unique index limits
a ticket to one active listing. Stored amounts are integer VND, not floating
point values.

ResaleSellerSettlement adds an optional receiving-account snapshot for legacy
compatibility, fixed fee/net values, one payout per sale and one email record
per sale/kind. New listing validation will require bank information. Existing
paid orders are not rewritten, repriced or automatically queued for payout.
Legacy listings without account snapshots must be cancelled and relisted before
accepting a new reservation. Already-held legacy orders keep their original flow.

Email contracts are shared with ticket mail without importing persistence into
the mail service. Bank details must never enter public listing/buyer responses
or logs. Storage alone does not enable resale, transfer money or send email.

Original migration files are retained unchanged. They are not applied at startup
or during this commit. Do not run legacy manual SQL schema patches beside the
managed migration workflow.
