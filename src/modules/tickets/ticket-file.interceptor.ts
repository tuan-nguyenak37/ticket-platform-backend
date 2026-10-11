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
          if (file.mimetype !== 'application/pdf') {
            return callback(
              new BadRequestException('Ticket files must be PDF'),
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
