import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { createUploadOptions, UPLOAD_TYPES } from '../../common/uploads/upload.config';

@Injectable()
export class TicketFileInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(config: ConfigService) {
    const options = createUploadOptions(config);
    const Interceptor = FileFieldsInterceptor(
      [{ name: 'ticketFile', maxCount: 1 }],
      {
        ...options,
        limits: { ...options.limits, files: 1, parts: 21 },
        fileFilter: (request, file, callback) => {
          if (!Object.hasOwn(UPLOAD_TYPES, file.mimetype)) {
            return callback(
              new BadRequestException('Ticket files must be PDF or image (JPEG, PNG, WebP)'),
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
