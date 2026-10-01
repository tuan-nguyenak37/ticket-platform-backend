import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { UPLOAD_TYPES, uploadLimit } from './upload.config';

export interface StoredUpload {
  filename: string;
  mimetype: string;
  size: number;
}

function detectMime(buffer: Buffer): keyof typeof UPLOAD_TYPES | undefined {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  const header = buffer.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return undefined;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  constructor(private readonly config: ConfigService) {}

  validate(
    file: Express.Multer.File | undefined,
    imagesOnly = false,
  ): keyof typeof UPLOAD_TYPES {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('A non-empty file is required');
    }
    if (file.buffer.length > uploadLimit(this.config)) {
      throw new PayloadTooLargeException('File exceeds the upload size limit');
    }
    const mimetype = detectMime(file.buffer);
    if (
      !mimetype ||
      mimetype !== file.mimetype ||
      (imagesOnly && !mimetype.startsWith('image/'))
    ) {
      throw new BadRequestException(
        'File content does not match an allowed type',
      );
    }

    return mimetype;
  }

  async save(
    file: Express.Multer.File | undefined,
    scope?: 'events',
  ): Promise<StoredUpload> {
    const mimetype = this.validate(file, scope === 'events');
    const directory = resolve(
      this.config.get<string>('UPLOAD_DIR', 'uploads'),
      scope ?? '.',
    );
    const filename = `${randomUUID()}.${UPLOAD_TYPES[mimetype]}`;
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(join(directory, filename), file!.buffer, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        await unlink(join(directory, filename)).catch(() => {
          this.logger.error(
            JSON.stringify({
              action: 'uploads.cleanup',
              filename,
              result: 'failed',
            }),
          );
        });
      }
      throw error;
    }
    return { filename, mimetype, size: file!.buffer.length };
  }

  private eventPath(filename: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp)$/.test(
        filename,
      )
    ) {
      throw new NotFoundException('Image not found');
    }
    return join(
      resolve(this.config.get<string>('UPLOAD_DIR', 'uploads'), 'events'),
      filename,
    );
  }

  async removeEventImage(filename: string): Promise<void> {
    try {
      await unlink(this.eventPath(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          JSON.stringify({
            action: 'uploads.cleanup',
            filename,
            result: 'failed',
          }),
        );
      }
    }
  }

  async readEventImage(filename: string) {
    try {
      const buffer = await readFile(this.eventPath(filename));
      const mimetype = detectMime(buffer);
      if (!mimetype?.startsWith('image/'))
        throw new NotFoundException('Image not found');
      return { buffer, mimetype };
    } catch (error) {
      if (
        ['ENOENT', 'ENOTDIR'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        throw new NotFoundException('Image not found');
      }
      throw error;
    }
  }
}
