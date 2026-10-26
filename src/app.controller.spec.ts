import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './common/core.module';
import { configureApp } from './configure-app';

describe('Application foundation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [CoreModule],
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the service greeting', () => {
    expect(new AppService().getHello()).toBe('Hello World!');
  });

  it('serves the API root without database, Redis or authentication', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          statusCode: 200,
          data: 'Hello World!',
        });
      });
  });

  it('returns 404 for endpoints not yet implemented', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/missing')
      .expect(404);
  });
});
