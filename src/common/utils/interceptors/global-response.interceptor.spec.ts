import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { GlobalResponseInterceptor } from './global-response.interceptor';

describe('GlobalResponseInterceptor', () => {
  it('wraps a successful response with the HTTP status and original data', async () => {
    const response = { statusCode: 201 };
    const context = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as ExecutionContext;
    const data = { id: 'user_123' };
    const interceptor = new GlobalResponseInterceptor();

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(data) }),
    );

    expect(result).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'Request successful',
      data,
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
