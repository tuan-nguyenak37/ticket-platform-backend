import { evaluateReadiness } from './event-readiness';
import { Event } from './entities/event.entity';
import { Showing } from './showings/entities/showing.entity';
import { TicketTypeStatus } from './ticket-types/enums/ticket-type-status.enum';

const future = new Date(Date.now() + 7 * 86400000);
const saleEnd = new Date(Date.now() + 3 * 86400000);
const saleStart = new Date(Date.now() - 86400000);
function fixture() {
  const event = { eventId: 'event_1', description: 'A concert' } as Event;
  const showing = {
    showingId: 'showing_1',
    startTime: future,
    endTime: new Date(future.getTime() + 3600000),
    venueName: 'Hall',
    address: 'Street',
    city: 'Hanoi',
    ticketTypes: [
      {
        ticketTypeId: 'ttype_1',
        status: TicketTypeStatus.ACTIVE,
        saleStartAt: saleStart,
        saleEndAt: saleEnd,
        maxPerOrder: 2,
        inventory: { totalQuantity: 10 },
      },
    ],
  } as Showing;
  return { event, showing };
}

describe('organizer readiness', () => {
  it('allows a configured future showing without requiring a bank account or poster', () => {
    const { event, showing } = fixture();
    expect(evaluateReadiness(event, [showing], new Date()).ready).toBe(true);
  });
  it('points to missing showings and event description', () => {
    const { event } = fixture();
    event.description = null;
    expect(
      evaluateReadiness(event, [], new Date()).issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(['DESCRIPTION_REQUIRED', 'SHOWING_REQUIRED']);
  });
  it('rejects inactive tickets and expired sale windows', () => {
    const { event, showing } = fixture();
    showing.ticketTypes[0].status = TicketTypeStatus.DRAFT;
    expect(evaluateReadiness(event, [showing], new Date()).issues[0].step).toBe(
      3,
    );
    showing.ticketTypes[0].status = TicketTypeStatus.ACTIVE;
    showing.ticketTypes[0].saleEndAt = new Date(Date.now() - 1000);
    expect(
      evaluateReadiness(event, [showing], new Date()).issues.map(
        (issue) => issue.code,
      ),
    ).toContain('SALE_WINDOW_INVALID');
  });
});
