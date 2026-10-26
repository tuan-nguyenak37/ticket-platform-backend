import { validateTicketConfiguration } from './ticket-configuration';
import { TicketTypeStatus } from './enums/ticket-type-status.enum';

describe('ticket configuration', () => {
  const showingStart = new Date('2030-01-20T12:00:00Z');
  const base = {
    saleStartAt: new Date('2030-01-01T00:00:00Z'),
    saleEndAt: new Date('2030-01-10T00:00:00Z'),
    showingStart,
    maxPerOrder: 2,
    totalQuantity: 10,
    status: TicketTypeStatus.ACTIVE,
    checkMaximum: true,
    checkFuture: true,
  };
  it('accepts a complete active ticket', () =>
    expect(() =>
      validateTicketConfiguration(base, new Date('2029-01-01')),
    ).not.toThrow());
  it('requires both times to activate', () =>
    expect(() =>
      validateTicketConfiguration(
        { ...base, saleEndAt: null },
        new Date('2029-01-01'),
      ),
    ).toThrow());
  it('rejects overselling limits and a sale ending after the showing', () => {
    expect(() =>
      validateTicketConfiguration(
        { ...base, maxPerOrder: 11 },
        new Date('2029-01-01'),
      ),
    ).toThrow();
    expect(() =>
      validateTicketConfiguration(
        { ...base, saleEndAt: new Date('2030-01-21') },
        new Date('2029-01-01'),
      ),
    ).toThrow();
  });
});
