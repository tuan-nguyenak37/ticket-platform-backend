import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const UPLOAD_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;

export function uploadLimit(config: ConfigService): number {
  return config.get<number>('UPLOAD_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;
}

export function createUploadOptions(config: ConfigService): MulterOptions {
  return {
    // Validate content before persisting to local disk.
    storage: memoryStorage(),
    limits: { fileSize: uploadLimit(config), files: 1, fields: 20, parts: 21 },
    fileFilter: (_request, file, callback) => {
      if (!Object.hasOwn(UPLOAD_TYPES, file.mimetype)) {
        return callback(
          new BadRequestException('Only JPEG, PNG, GIF, WebP and PDF are allowed'),
          false,
        );
      }
      callback(null, true);
    },
  };
}
