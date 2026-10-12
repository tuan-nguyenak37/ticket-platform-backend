import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { OrderStore } from './order-store.service';
import { OrderDispute, OrderStatus } from './order.entity';
import {
  StoredUpload,
  UploadsService,
} from '../../common/uploads/uploads.service';
import type { Principal } from '../auth/authorization/principal';
import { generateId } from '../../common/utils/generateId';

export const EVIDENCE_MAX_SIZE = 5 * 1024 * 1024;
export const EVIDENCE_MAX_FILES_PER_PARTY = 5;

@Injectable()
export class DisputeEvidenceService {
  constructor(
    private readonly store: OrderStore,
    private readonly uploads: UploadsService,
  ) {}

  async upload(
    actor: Principal,
    id: string,
    file: Express.Multer.File | undefined,
  ) {
    let stored: StoredUpload | undefined;
    try {
      return await this.store.locked(
        id,
        async (c) => {
          const dispute = await c.manager.findOneBy(OrderDispute, {
            orderId: id,
          });
          if (
            !dispute ||
            dispute.status !== 'open' ||
            c.order.status !== OrderStatus.DISPUTED
          )
            throw new ConflictException('No open dispute');
          const attachments = dispute.attachments ?? [];
          if (
            attachments.filter((a) => a.uploadedBy === actor.user_id).length >=
            EVIDENCE_MAX_FILES_PER_PARTY
          )
            throw new ConflictException('Maximum 5 evidence files per party');
          this.uploads.validate(file);
          if (file!.buffer.length > EVIDENCE_MAX_SIZE)
            throw new PayloadTooLargeException('Evidence file exceeds 5 MB');
          stored = await this.uploads.save(file, 'disputes');
          dispute.attachments = [
            ...attachments,
            {
              id: generateId('evidence'),
              uploadedBy: actor.user_id,
              side: c.order.buyerId === actor.user_id ? 'buyer' : 'seller',
              ...stored,
              createdAt: c.now.toISOString(),
            },
          ];
          await c.manager.save(dispute);
          return this.store.response(c.manager, c.order);
        },
        actor,
      );
    } catch (error) {
      // Also covers transaction commit failure after the file has been written.
      if (stored) await this.uploads.removeDisputeFile(stored.filename);
      throw error;
    }
  }

  async download(actor: Principal, id: string, attachmentId: string) {
    return this.store.locked(id, async (c) => {
      if (![c.order.buyerId, c.order.sellerId].includes(actor.user_id))
        this.store.manager(actor, c.order);
      const dispute = await c.manager.findOneBy(OrderDispute, { orderId: id });
      const attachment = dispute?.attachments?.find(
        (a) => a.id === attachmentId,
      );
      if (!attachment) throw new NotFoundException('Evidence file not found');
      return this.uploads.readDisputeFile(attachment.filename);
    });
  }
}
