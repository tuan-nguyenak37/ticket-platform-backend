import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PATH_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { AdminStatisticsDto } from './dto/admin-statistics.dto';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

describe('Administrative reporting', () => {
  const actor: Principal = {
    user_id: 'user_admin',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    sessionId: 'session_admin',
  };

  function fixture() {
    const manager = { query: jest.fn() };
    const database = {
      query: jest.fn(),
      transaction: jest.fn(
        async (
          _isolation: string,
          callback: (transactionManager: typeof manager) => Promise<unknown>,
        ) => callback(manager),
      ),
    };
    const service = Reflect.construct(UsersService, [
      {},
      database,
      {},
    ]) as UsersService;
    return { manager, database, service };
  }

  it.each([UserRole.USER, UserRole.MODERATOR])(
    'rejects %s before querying',
    async (role) => {
      const { service, database } = fixture();
      await expect(service.adminSummary({ ...actor, role })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.adminStatistics({ ...actor, role }, new AdminStatisticsDto()),
      ).rejects.toThrow(ForbiddenException);
      expect(database.query).not.toHaveBeenCalled();
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  it('uses one consistent snapshot without coercing monetary strings', async () => {
    const { service, manager, database } = fixture();
    manager.query
      .mockResolvedValueOnce([
        {
          period: '2035-01-01',
          originalOrders: '2',
          resaleOrders: '1',
          originalAmount: '9007199254740993',
          resaleAmount: '200000',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const query = Object.assign(new AdminStatisticsDto(), {
      dateFrom: '2035-01-01',
      dateTo: '2035-01-31',
    });
    const result = await service.adminStatistics(actor, query);
    expect(database.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(result.series[0].originalAmount).toBe('9007199254740993');
    expect(result.timeZone).toBe('Asia/Ho_Chi_Minh');
    expect(manager.query.mock.calls[0][0]).toContain('generate_series');
    expect(manager.query.mock.calls[0][1]).toEqual([
      '2035-01-01',
      '2035-01-31',
      'day',
    ]);
    expect(manager.query.mock.calls[0][0]).toContain(
      "p.status='SUCCEEDED' AND o.status='PAID'",
    );
    expect(manager.query.mock.calls[2][0]).toContain('v.created_at');
  });

  it.each([
    { dateFrom: '2035-02-01', dateTo: '2035-01-01' },
    { dateFrom: '2033-01-01', dateTo: '2035-01-01' },
    { dateFrom: 'invalid', dateTo: '2035-01-01' },
  ])('rejects invalid date bounds before querying', async (dates) => {
    const { service, database } = fixture();
    await expect(
      service.adminStatistics(
        actor,
        Object.assign(new AdminStatisticsDto(), dates),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { dateFrom: null },
    { dateTo: '2035-02-30' },
    { dateFrom: '2035-01-01T00:00:00Z' },
    { groupBy: 'week' },
  ])('rejects malformed reporting parameters: %p', async (input) => {
    expect(
      (await validate(plainToInstance(AdminStatisticsDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it('registers no-store static reporting routes', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, UsersController.prototype.summary),
    ).toBe('admin-summary');
    expect(
      Reflect.getMetadata(PATH_METADATA, UsersController.prototype.statistics),
    ).toBe('admin-statistics');
    for (const method of [
      UsersController.prototype.summary,
      UsersController.prototype.statistics,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toEqual(
        expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]),
      );
    }
  });
});
