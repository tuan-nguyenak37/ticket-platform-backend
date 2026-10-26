import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
