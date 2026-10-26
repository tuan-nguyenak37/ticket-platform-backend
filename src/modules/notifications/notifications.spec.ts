import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { resolvePolicy } from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { OrderIdDto } from '../orders/dto/order-query.dto';
import {
  NotificationListDto,
  NotificationsController,
} from './notifications.controller';
import {
  NotificationsService,
  recordNotification,
} from './notifications.service';

describe('web notifications', () => {
  const input = {
    userId: 'buyer',
    kind: 'ORDER_PAID' as const,
    sourceId: 'ord_1',
    title: 'Mua vé thành công',
    body: 'Đơn đã thanh toán.',
    href: '/checkout/orders/ord_1',
  };

  it('records a bound, deduplicated notification on the caller transaction', async () => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]]>()
      .mockResolvedValue([]);
    await recordNotification({ query } as unknown as EntityManager, input);
    expect(query.mock.calls[0][0]).toContain(
      'ON CONFLICT(user_id,kind,source_id) DO NOTHING',
    );
    expect(query.mock.calls[0][1]).toEqual([
      expect.stringMatching(/^notice_/),
      'buyer',
      'ORDER_PAID',
      'ord_1',
      input.title,
      input.body,
      input.href,
    ]);
    query.mockRejectedValue(new Error('DB unavailable'));
    await expect(
      recordNotification({ query } as unknown as EntityManager, input),
    ).rejects.toThrow('DB unavailable');
  });

  it('lists one user with bounded pagination and global unread count in one snapshot', async () => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]]>()
      .mockResolvedValue([{ items: [], total: 21, unreadCount: 3 }]);
    const service = new NotificationsService({
      query,
    } as unknown as DataSource);
    expect(await service.list('buyer', 2)).toEqual({
      items: [],
      total: 21,
      unreadCount: 3,
      page: 2,
      limit: 20,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 20 OFFSET $2'),
      ['buyer', 20],
    );
    expect(query.mock.calls[0][0]).toContain('read_at IS NULL');
  });

  it('marks only an owned notification and keeps its original read timestamp', async () => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]]>()
      .mockResolvedValue([[{ id: 'notice_1', readAt: 'now' }], 1]);
    const service = new NotificationsService({
      query,
    } as unknown as DataSource);
    expect(await service.read('buyer', 'notice_1')).toEqual({
      id: 'notice_1',
      readAt: 'now',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(read_at,now())'),
      ['buyer', 'notice_1'],
    );
    expect(query.mock.calls[0][0]).toContain(
      'WHERE user_id=$1 AND notification_id=$2',
    );
    query.mockResolvedValue([[], 0]);
    await expect(service.read('stranger', 'notice_1')).rejects.toThrow(
      'Notification not found',
    );
  });

  it('marks all unread notifications only for the authenticated user', async () => {
    const query = jest.fn().mockResolvedValue([[], 0]);
    const service = new NotificationsService({
      query,
    } as unknown as DataSource);
    await service.readAll('buyer');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id=$1 AND read_at IS NULL'),
      ['buyer'],
    );
  });

  it('requires authentication and derives every user ID from the principal', async () => {
    const service = { list: jest.fn(), read: jest.fn(), readAll: jest.fn() };
    const controller = new NotificationsController(
      service as unknown as NotificationsService,
    );
    const actor = { user_id: 'buyer' } as Principal;
    for (const name of ['list', 'read', 'readAll'] as const) {
      expect(
        resolvePolicy(
          new Reflector(),
          Object.getOwnPropertyDescriptor(
            NotificationsController.prototype,
            name,
          )!.value as (this: void) => void,
          NotificationsController,
        ),
      ).toEqual({ kind: 'authenticated' });
    }
    await controller.list(actor, { page: 2 });
    await controller.read(actor, { id: 'notice_1' });
    await controller.readAll(actor);
    expect(service.list).toHaveBeenCalledWith('buyer', 2);
    expect(service.read).toHaveBeenCalledWith('buyer', 'notice_1');
    expect(service.readAll).toHaveBeenCalledWith('buyer');
  });

  it('validates page and notification IDs at the boundary', () => {
    for (const page of ['0', '-1', '1.5', '1000001', '1e2', 'NaN']) {
      expect(
        validateSync(plainToInstance(NotificationListDto, { page })).length,
      ).toBeGreaterThan(0);
    }
    expect(validateSync(plainToInstance(NotificationListDto, {}))).toHaveLength(
      0,
    );
    expect(plainToInstance(NotificationListDto, { page: '2' }).page).toBe(2);
    expect(
      validateSync(plainToInstance(OrderIdDto, { id: '../user' })).length,
    ).toBeGreaterThan(0);
  });
});
