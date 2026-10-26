import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface GlobalResponse {
  success: true;
  statusCode: number;
  message: string;
  data: unknown;
  timestamp: string;
}

@Injectable()
export class GlobalResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<GlobalResponse | StreamableFile | undefined> {
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number; headersSent?: boolean }>();

    return next.handle().pipe(
      map((data: unknown): GlobalResponse | StreamableFile | undefined => {
        if (
          response.headersSent ||
          response.statusCode === 204 ||
          response.statusCode === 304
        ) {
          return undefined;
        }
        if (data instanceof StreamableFile) return data;
        return {
          success: true,
          statusCode: response.statusCode,
          message: 'Request successful',
          data: data ?? null,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
