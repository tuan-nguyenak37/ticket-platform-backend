import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { configureHttp } from './common/http/configure-http';

export function configureApp(app: INestApplication) {
  if (process.env.TRUST_PROXY) {
    const server = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: string[]) => void;
    };
    server.set(
      'trust proxy',
      process.env.TRUST_PROXY.split(',').map((value) => value.trim()),
    );
  }
  app.use(cookieParser());
  configureHttp(app);
}
