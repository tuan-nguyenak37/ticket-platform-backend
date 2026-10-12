import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { DisputeAttachmentIdDto, OrderIdDto } from './orders.dto';
import {
  DisputeEvidenceService,
  EVIDENCE_MAX_SIZE,
} from './dispute-evidence.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';

@Controller('orders')
@Authenticated()
export class DisputeEvidenceController {
  constructor(private readonly evidence: DisputeEvidenceService) {}

  @Post('me/:id/dispute/evidence')
  @Audit('orders.dispute.evidence.upload')
  @RateLimit({ scope: 'dispute-evidence', limit: 10, seconds: 60 })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: EVIDENCE_MAX_SIZE, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(
    @CurrentUser() actor: Principal,
    @Param() p: OrderIdDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.evidence.upload(actor, p.id, file);
  }

  @Get(':id/dispute/evidence/:attachmentId')
  @Audit('orders.dispute.evidence.read')
  async download(
    @CurrentUser() actor: Principal,
    @Param() p: DisputeAttachmentIdDto,
    @Res() response: Response,
  ) {
    const file = await this.evidence.download(actor, p.id, p.attachmentId);
    response.setHeader('Content-Type', file.mimetype);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'attachment');
    response.send(file.buffer);
  }
}
