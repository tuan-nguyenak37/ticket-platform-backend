import { Test } from '@nestjs/testing';
import { INestApplication, Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseModule } from '../src/config/database/database.module';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/entities/enums/user-role.enum';
import { UserStatus } from '../src/modules/users/entities/enums/user-status.enum';
import { hashPassword } from '../src/common/utils/password.util';
import { configureApp } from '../src/configure-app';

@Module({})
class NoDatabaseModule {}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  refreshCookie: string;
}
interface UserResponse {
  user_id: string;
  email: string;
  fullName: string | null;
}

function responseTokens(response: { body: unknown; headers: unknown }): Tokens {
  const body = response.body as { data: { accessToken: string } };
  expect(body.data).not.toHaveProperty('refreshToken');
  const headers = response.headers as Record<string, string[] | undefined>;
  const cookie = headers['set-cookie']?.find((value) =>
    value.startsWith('refresh_token='),
  );
  expect(cookie).toBeDefined();
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Path=/api/auth');
  const refreshCookie = cookie!.split(';')[0];
  return {
    accessToken: body.data.accessToken,
    refreshCookie,
    refreshToken: decodeURIComponent(
      refreshCookie.slice('refresh_token='.length),
    ),
  };
}

describe('Application HTTP flows (repository in memory)', () => {
  let app: INestApplication<App>;
  const rows = new Map<string, User>();
  const repository = {
    create: (data: Partial<User>) =>
      Object.assign(
        new User(),
        {
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
          fullName: null,
        },
        data,
      ),
    save: (user: User) => {
      user.generateUserId();
      rows.set(user.user_id, { ...user } as User);
      return Promise.resolve(user);
    },
    findOne: ({ where }: { where: Partial<User> }) => {
      const user = [...rows.values()].find((row) =>
        Object.entries(where).every(
          ([key, value]) => row[key as keyof User] === value,
        ),
      );
      return Promise.resolve(user ? { ...user } : null);
    },
    find: () =>
      Promise.resolve(
        [...rows.values()].filter((user) => user.status !== UserStatus.DELETED),
      ),
    update: (
      where: Record<string, unknown>,
      changes: Record<string, unknown>,
    ) => {
      let affected = 0;
      for (const row of rows.values()) {
        const matches = Object.entries(where).every(([key, value]) =>
          value instanceof FindOperator
            ? row[key as keyof User] !== value.value
            : row[key as keyof User] === value,
        );
        if (!matches) continue;
        affected++;
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'tokenVersion' && typeof value === 'function')
            row.tokenVersion++;
          else Object.assign(row, { [key]: value });
        }
      }
      return Promise.resolve({ affected });
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule(NoDatabaseModule)
      .overrideProvider(getRepositoryToken(User))
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => rows.clear());
  afterAll(async () => {
    await app?.close();
  });

  async function register(email = 'person@example.com') {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'abcdef' })
      .expect(201);
    return (response.body as { data: UserResponse }).data;
  }

  async function login(email = 'person@example.com') {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'abcdef' })
      .expect(200);
    return responseTokens(response);
  }

  async function adminLogin() {
    const admin = repository.create({
      email: 'admin@example.com',
      password: await hashPassword('abcdef'),
      role: UserRole.ADMIN,
    });
    await repository.save(admin);
    return login(admin.email);
  }

  it('keeps the public root response in the standard envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api').expect(200);
    expect(response.body).toMatchObject({
      success: true,
      statusCode: 200,
      data: 'Hello World!',
    });
  });

  it('returns 400 for non-string email and refuses privilege injection', async () => {
    for (const body of [
      { email: 123, password: 'abcdef' },
      { email: 'person@example.com', password: 'abcdef', role: 'admin' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(body)
        .expect(400);
    }
    expect(rows.size).toBe(0);
  });

  it('normalizes login email, allows missing fullName and rejects duplicate registration', async () => {
    const user = await register(' Person@Example.com ');
    expect(user.email).toBe('person@example.com');
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('tokenVersion');
    expect(user.fullName).toBeNull();
    await login(' PERSON@EXAMPLE.COM ');
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'person@example.com', password: 'abcdef' })
      .expect(409);
  });

  it('rotates refresh tokens and revokes both tokens on logout', async () => {
    await register();
    const old = await login();
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', old.refreshCookie)
      .expect(200);
    const next = responseTokens(response);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', old.refreshCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(old.accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(next.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', next.refreshCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(next.accessToken, { type: 'bearer' })
      .expect(401);
  });

  it('uses the cookie jar for refresh and clears the cookie at the same path on logout', async () => {
    await register();
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/api/auth/login')
      .send({ email: 'person@example.com', password: 'abcdef' })
      .expect(200);
    const refreshed = await browser
      .post('/api/auth/refresh')
      .send({})
      .expect(200);
    const tokens = responseTokens(refreshed);
    const logout = await browser
      .post('/api/auth/logout')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    const headers = logout.headers as Record<string, string[]>;
    expect(
      headers['set-cookie'].some(
        (cookie) =>
          cookie.startsWith('refresh_token=;') &&
          cookie.includes('Path=/api/auth;') &&
          cookie.includes('Expires=Thu, 01 Jan 1970'),
      ),
    ).toBe(true);
    await browser.post('/api/auth/refresh').send({}).expect(401);
  });

  it('returns 401 when the refresh cookie is missing, invalid or a JSON object', async () => {
    for (const cookie of [
      '',
      'refresh_token=invalid',
      'refresh_token=j%3A%7B%7D',
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .send({})
        .expect(401);
    }
  });

  it('accepts only one of two concurrent refresh requests', async () => {
    await register();
    const tokens = await login();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', tokens.refreshCookie),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
  });

  it('rejects blocked accounts and previously issued tokens', async () => {
    const user = await register();
    const tokens = await login();
    rows.get(user.user_id)!.status = UserStatus.BANNED;
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'abcdef' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', tokens.refreshCookie)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(401);
  });

  it('requires authentication and admin role for user management', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
    await register();
    const tokens = await login();
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(tokens.refreshToken, { type: 'bearer' })
      .expect(401);
  });

  it('lets admins create, read, update and soft-delete users without exposing hashes', async () => {
    const tokens = await adminLogin();
    const server = app.getHttpServer();
    await request(server)
      .post('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .send({})
      .expect(400);
    const created = await request(server)
      .post('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .send({ email: 'new@example.com', password: 'abcdef' })
      .expect(201);
    const user = (created.body as { data: UserResponse }).data;
    expect(user).not.toHaveProperty('password');
    const accountTokens = await login(user.email);
    const updated = await request(server)
      .patch('/api/users/' + user.user_id)
      .auth(tokens.accessToken, { type: 'bearer' })
      .send({ fullName: 'New name', password: 'changed123' })
      .expect(200);
    expect(updated.body).toMatchObject({ data: { fullName: 'New name' } });
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', accountTokens.refreshCookie)
      .expect(401);
    await request(server)
      .get('/api/users/' + user.user_id)
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    const list = await request(server)
      .get('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    for (const row of (list.body as { data: UserResponse[] }).data)
      expect(row).not.toHaveProperty('password');
    await request(server)
      .delete('/api/users/' + user.user_id)
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    await request(server)
      .get('/api/users/' + user.user_id)
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(404);
    await request(server)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'changed123' })
      .expect(401);
  });
});
