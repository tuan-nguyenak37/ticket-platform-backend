import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { createUploadOptions } from '../../common/uploads/upload.config';

@Injectable()
export class EventImagesInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(config: ConfigService) {
    const options = createUploadOptions(config);
    const Interceptor = FileFieldsInterceptor(
      [
        { name: 'thumbnail', maxCount: 1 },
        { name: 'banner', maxCount: 1 },
      ],
      {
        ...options,
        limits: { ...options.limits, files: 2, parts: 22 },
        fileFilter: (request, file, callback) => {
          if (!file.mimetype.startsWith('image/')) {
            return callback(
              new BadRequestException('Event files must be images'),
              false,
            );
          }
          options.fileFilter!(request, file, callback);
        },
      },
    );
    this.delegate = new Interceptor();
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    return this.delegate.intercept(context, next);
  }
}
