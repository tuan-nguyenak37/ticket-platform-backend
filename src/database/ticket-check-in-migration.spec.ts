import type { QueryRunner } from 'typeorm';
import { TicketCheckIns1792972800000 } from './migrations/1792972800000-TicketCheckIns';

describe('Additive ticket check-in migration', () => {
  it('preserves legacy columns and constrains one durable first-admission pair', async () => {
    const runner = { query: jest.fn().mockResolvedValue(undefined) };
    await new TicketCheckIns1792972800000().up(
      runner as unknown as QueryRunner,
    );
    const statements = runner.query.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join('\n');
    expect(statements).toContain('ADD COLUMN IF NOT EXISTS checked_in_at');
    expect(statements).toContain('ADD COLUMN IF NOT EXISTS checked_in_by');
    expect(statements).toContain("conname = 'tickets_check_in_pair'");
    expect(statements).toContain(
      '(checked_in_at IS NULL) = (checked_in_by IS NULL)',
    );
    expect(statements).toContain(
      'REFERENCES users(user_id) ON DELETE RESTRICT',
    );
    expect(statements).toContain('CREATE INDEX IF NOT EXISTS');
    expect(statements).not.toMatch(
      /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+tickets\b/i,
    );
  });

  it('refuses rollback that could erase admission history', async () => {
    await expect(new TicketCheckIns1792972800000().down()).rejects.toThrow(
      'Forward-only',
    );
  });
});
