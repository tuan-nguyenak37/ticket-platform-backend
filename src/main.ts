import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
