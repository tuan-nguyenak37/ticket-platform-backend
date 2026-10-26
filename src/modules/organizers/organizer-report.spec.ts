import { DataSource, Repository } from 'typeorm';
import { OrganizersService } from './organizers.service';
import { Organizer } from './entities/organizer.entity';
import { OrganizerMember } from './entities/organizer-member.entity';
import { OrganizerPayoutAccount } from './entities/organizer-payout-account.entity';
import { User } from '../users/entities/user.entity';

function fixture(owner = true, status = 'ACTIVE') {
  const account = {
    organizerId: 'org_1',
    bankName: 'Demo Bank',
    accountHolder: 'Demo Owner',
    accountNumber: '0001234567',
  };
  const repository = {
    findOneBy: jest.fn().mockResolvedValue(account),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Organizer)
        return {
          findOneBy: jest
            .fn()
            .mockResolvedValue({ organizerId: 'org_1', status }),
          findOne: jest
            .fn()
            .mockResolvedValue({ organizerId: 'org_1', status }),
        };
      if (entity === OrganizerMember)
        return { existsBy: jest.fn().mockResolvedValue(owner) };
      if (entity === User)
        return { findOneBy: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) };
      if (entity === OrganizerPayoutAccount) return repository;
      throw new Error('Unexpected entity');
    }),
  };
  const source = {
    manager,
    getRepository: manager.getRepository,
    transaction: jest.fn(
      (callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
    query: jest.fn().mockResolvedValue([]),
  };
  const service = new OrganizersService(
    {} as Repository<Organizer>,
    {} as Repository<OrganizerMember>,
    source as unknown as DataSource,
  );
  return { service, repository, source, account };
}

describe('Organizer sales reports', () => {
  it('sums report values without losing bigint precision', async () => {
    const { service, source } = fixture();
    source.query.mockResolvedValue([
      { orderCount: '2', ticketCount: '3', amount: '9007199254740993' },
      { orderCount: '1', ticketCount: '1', amount: '7' },
    ]);
    const result = await service.report('org_1', 'user_1');
    expect(result.totals).toEqual({
      orderCount: '3',
      ticketCount: '4',
      amount: '9007199254741000',
    });
    expect(source.query.mock.calls[0][0]).toContain("o.status = 'PAID'");
    expect(source.query.mock.calls[0][0]).toContain('"showingStartTime"');
    expect(source.query.mock.calls[0][0]).toContain('SUM(o.total_amount)');
    expect(source.query.mock.calls[0][1]).toEqual(['org_1', null]);
  });
  it('rejects non-owners before reading sales data', async () => {
    const { service, source } = fixture(false);
    await expect(service.report('org_1', 'stranger')).rejects.toThrow(
      'Only the owner',
    );
    expect(source.query).not.toHaveBeenCalled();
  });
  it('rejects foreign or nonexistent events before reading their sales', async () => {
    const { service, source } = fixture();
    await expect(service.report('org_1', 'user_1', 'foreign')).rejects.toThrow(
      'Event not found',
    );
    expect(source.query).toHaveBeenCalledTimes(1);
    expect(source.query.mock.calls[0][1]).toEqual(['foreign', 'org_1']);
  });
  it('scopes an event report to the owning organizer', async () => {
    const { service, source } = fixture();
    source.query
      .mockResolvedValueOnce([{ event_id: 'event_1' }])
      .mockResolvedValueOnce([]);
    expect((await service.report('org_1', 'user_1', 'event_1')).totals).toEqual(
      { orderCount: '0', ticketCount: '0', amount: '0' },
    );
    expect(source.query.mock.calls[1][1]).toEqual(['org_1', 'event_1']);
  });
});
