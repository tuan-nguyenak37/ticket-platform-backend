import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  INestApplication,
  InternalServerErrorException,
  Post,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureHttp } from './http/configure-http';
import { CoreModule } from './core.module';

class ExampleDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

@Controller('example')
class ExampleController {
  @Post()
  create(@Body() body: ExampleDto) {
    return { name: body.name };
  }

  @Get('failure')
  failure() {
    throw new Error('private-database-password');
  }

  @Get('http-failure')
  httpFailure() {
    throw new InternalServerErrorException('private-smtp-password');
  }

  @Get('expired')
  expired() {
    throw new UnauthorizedException({
      code: 'AUTH_ACCESS_EXPIRED',
      message: 'Access token expired',
    });
  }

  @Get('bad-request')
  badRequest() {
    throw new BadRequestException('Invalid request');
  }

  @Post('empty')
  @HttpCode(204)
  empty() {
    return undefined;
  }

  @Get('file')
  file() {
    return new StreamableFile(Buffer.from('file-content'), {
      type: 'text/plain',
    });
  }

  @Get('raw')
  raw(@Res() response: Response) {
    response.json({ RspCode: '00' });
  }
}

describe('HTTP foundation', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [CoreModule],
      controllers: [ExampleController],
    }).compile();
    app = module.createNestApplication();
    configureHttp(app, 'http://localhost:3000');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates DTOs and wraps successful responses', async () => {
    await request(server)
      .post('/api/example')
      .send({ name: 'TicketVerse' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          statusCode: 201,
          message: 'Request successful',
          data: { name: 'TicketVerse' },
          timestamp: expect.any(String) as unknown,
        });
      });
  });

  it('rejects extra DTO properties without returning their values', async () => {
    await request(server)
      .post('/api/example')
      .send({ name: 'TicketVerse', password: 'private-value' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: false,
          statusCode: 400,
        });
        expect(response.text).not.toContain('private-value');
        expect(response.text).not.toContain('target');
      });
  });

  it('rejects invalid DTO values', async () => {
    await request(server).post('/api/example').send({ name: 42 }).expect(400);
  });

  it.each(['failure', 'http-failure'])(
    'hides internal exception details for %s',
    async (route) => {
      await request(server)
        .get(`/api/example/${route}?token=private-token`)
        .expect(500)
        .expect((response) => {
          expect(response.body).toMatchObject({
            success: false,
            statusCode: 500,
            message: 'Internal server error',
            path: `/api/example/${route}`,
          });
          expect(response.text).not.toContain('private');
          expect(response.body).not.toHaveProperty('stack');
        });
    },
  );

  it('preserves public error codes for clients', async () => {
    await request(server)
      .get('/api/example/expired')
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'AUTH_ACCESS_EXPIRED' });
      });
  });

  it('generates a request ID instead of trusting an incoming ID', async () => {
    await request(server)
      .get('/api/example/bad-request')
      .set('X-Request-Id', 'untrusted-id')
      .expect(400)
      .expect('X-Request-Id', /^[0-9a-f-]{36}$/);
  });

  it('allows configured origins and required request headers', async () => {
    await request(server)
      .options('/api/example')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Idempotency-Key')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect('Access-Control-Allow-Headers', /Idempotency-Key/);
  });

  it('does not grant cross-origin access to other origins', async () => {
    await request(server)
      .get('/api/example/bad-request')
      .set('Origin', 'https://untrusted.example')
      .expect(400)
      .expect((response) => {
        expect(response.headers).not.toHaveProperty(
          'access-control-allow-origin',
        );
      });
  });

  it('does not wrap empty responses', async () => {
    await request(server).post('/api/example/empty').expect(204).expect('');
  });

  it('does not wrap streamed files', async () => {
    await request(server)
      .get('/api/example/file')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('file-content');
  });

  it('preserves raw responses used by third-party callbacks', async () => {
    await request(server)
      .get('/api/example/raw')
      .expect(200)
      .expect({ RspCode: '00' });
  });
});
