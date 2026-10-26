import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { generateId } from '../../common/utils/generateId';

type NotificationInput = {
  userId: string;
  kind:
    | 'ORDER_PAID'
    | 'RESALE_BOUGHT'
    | 'RESALE_SOLD'
    | 'EVENT_APPROVED'
    | 'EVENT_REJECTED';
  sourceId: string;
  title: string;
  body: string;
  href: string;
};

export async function recordNotification(
  manager: EntityManager,
  input: NotificationInput,
) {
  await manager.query(
    `INSERT INTO web_notifications(notification_id,user_id,kind,source_id,title,body,href)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,kind,source_id) DO NOTHING`,
    [
      generateId('notice'),
      input.userId,
      input.kind,
      input.sourceId,
      input.title,
      input.body,
      input.href,
    ],
  );
}

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DataSource) {}

  async list(userId: string, page: number) {
    const [result] = await this.db.query<
      Array<{ total: number; unreadCount: number; items: unknown[] }>
    >(
      `SELECT
      (SELECT count(*)::int FROM web_notifications WHERE user_id=$1) AS total,
      (SELECT count(*)::int FROM web_notifications WHERE user_id=$1 AND read_at IS NULL) AS "unreadCount",
      COALESCE((SELECT json_agg(items) FROM (
        SELECT notification_id AS id, kind, title, body, href, read_at AS "readAt", created_at AS "createdAt"
        FROM web_notifications WHERE user_id=$1
        ORDER BY created_at DESC, notification_id DESC LIMIT 20 OFFSET $2
      ) items),'[]'::json) AS items`,
      [userId, (page - 1) * 20],
    );
    return { ...result, page, limit: 20 };
  }

  async read(userId: string, id: string) {
    const [rows] = await this.db.query<
      [{ id: string; readAt: Date }[], number]
    >(
      `UPDATE web_notifications SET read_at=COALESCE(read_at,now())
       WHERE user_id=$1 AND notification_id=$2 RETURNING notification_id AS id, read_at AS "readAt"`,
      [userId, id],
    );
    if (!rows.length) throw new NotFoundException('Notification not found');
    return rows[0];
  }

  async readAll(userId: string) {
    await this.db.query(
      'UPDATE web_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',
      [userId],
    );
    return { success: true };
  }
}
