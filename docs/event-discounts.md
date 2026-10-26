# Registration validation and event discounts

POST /api/v1/events/:id/discounts creates an organizer-owned code.
GET on that route lists codes; PATCH /discounts/:code changes active status.
These authenticated routes require OWNER membership and an ACTIVE organizer.
Codes are normalized uppercase, scoped to one event and inserted with parameters.
Percentage values cannot exceed 100; windows must have an explicit timezone
and an end after the start. Duplicate event/code pairs return 409.

RegistrationQuestionDto and registrationAnswers validate TEXT/SELECT answers,
required values, unknown question IDs and maximum lengths. These are validation
utilities, not a newly restored custom-form editor or configuration API.
The current order flow uses an empty question list and rejects unsolicited
answers. No staff invitation, check-in or attendee export endpoints are included.

Discount amounts use bigint VND, percentage rounding down and a subtotal cap.
Usage is enforced by the order transaction in the following commit; until then
the list does not query non-existent order tables or claim usage statistics.

EventRegistrationDiscounts is a new, forward-only compatibility migration:
it adds only missing registration/discount schema. It leaves existing legacy
EventOperations data untouched and refuses destructive automatic rollback.
The rebuilt history does not register the all-in-one legacy EventOperations
migration: that migration also depends on tickets and adds excluded operations.
Do not add it blindly to the rebuilt migration list. Its already-applied
record in an existing database remains intact. Migrations are not run here.

Specs cover validators, owner checks and compatibility guards using mocks.
They are authored and type-checked but not executed at the user's request.
