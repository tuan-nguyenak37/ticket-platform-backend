# Organizer payout account

GET and PUT /api/v1/organizers/:id/payout-account require an authenticated ACTIVE
user with OWNER membership. Elevated global roles do not bypass ownership.
Responses are no-store. Banking details are not included in organizer profile
responses, event discovery or buyer APIs.

PUT accepts bankName and accountHolder (trimmed, 2-100 characters), plus
accountNumber (6-30 digits as a string, preserving initial zeroes). It never
asks for CVV, PIN, OTP or a payment card number. An ACTIVE organizer is required
for edits; the organizer row is locked and owner/account status rechecked.
This only stores settlement instructions; it does not verify account ownership
or transfer money to a bank.

The original OrganizerPayoutAccount migration is registered unchanged and is not
executed here. Focused specs are provided and type-checked, not run. No account
numbers are added to logs or public responses by these endpoints.
