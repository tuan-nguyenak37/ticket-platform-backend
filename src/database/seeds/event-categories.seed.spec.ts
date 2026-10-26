import type { DataSource } from 'typeorm';
import {
  EVENT_CATEGORIES_SEED,
  seedEventCategories,
} from './event-categories.seed';

describe('Event category catalog seed', () => {
  it('uses a transaction and preserves existing primary keys on code conflicts', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const database = {
      transaction: jest.fn(
        async (
          callback: (transactionManager: typeof manager) => Promise<void>,
        ) => callback(manager),
      ),
    };
    await seedEventCategories(database as unknown as DataSource);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(EVENT_CATEGORIES_SEED.length);
    for (const [statement, parameters] of manager.query.mock.calls) {
      expect(statement).toContain(
        'ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name',
      );
      expect(statement.split('DO UPDATE')[1]).not.toContain('category_id');
      expect(parameters).toHaveLength(3);
    }
    expect(
      new Set(EVENT_CATEGORIES_SEED.map((category) => category.code)).size,
    ).toBe(EVENT_CATEGORIES_SEED.length);
  });
});
