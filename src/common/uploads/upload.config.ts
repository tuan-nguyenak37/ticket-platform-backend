import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const UPLOAD_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export function uploadLimit(config: ConfigService): number {
  return config.get<number>('UPLOAD_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;
}

export function createUploadOptions(config: ConfigService): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: uploadLimit(config), files: 1, fields: 20, parts: 21 },
    fileFilter: (_request, file, callback) => {
      if (!Object.hasOwn(UPLOAD_TYPES, file.mimetype)) {
        return callback(
          new BadRequestException('Only JPEG, PNG and WebP are allowed'),
          false,
        );
      }
      callback(null, true);
    },
  };
}
