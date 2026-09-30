import { Test } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { resolvePolicy } from '../src/modules/auth/authorization/access-policy';
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
    const module = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    })
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
    const headers = logout.headers as unknown as Record<string, string[]>;
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

  it('every application route has one effective access policy', () => {
    const reflector = new Reflector();
    const discovery = app.get(DiscoveryService);
    for (const wrapper of discovery.getControllers()) {
      if (!wrapper.metatype) continue;
      const prototype = wrapper.metatype.prototype as object;
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(prototype),
      )) {
        const handler: unknown = descriptor.value;
        if (
          typeof handler !== 'function' ||
          !Reflect.hasMetadata(METHOD_METADATA, handler)
        )
          continue;
        const policy = resolvePolicy(reflector, handler, wrapper.metatype);
        expect(policy).toBeDefined();
        expect(policy?.kind).not.toBe('invalid');
      }
    }
  });

  it.each([UserRole.USER, UserRole.MODERATOR, UserRole.ADMIN])(
    'supports self-service and correct admin restrictions for %s',
    async (role) => {
      const owner = await register();
      rows.get(owner.user_id)!.role = role;
      const target = await register('other@example.com');
      const tokens = await login();
      const server = app.getHttpServer();
      const me = await request(server)
        .get('/api/users/me')
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(200);
      expect(me.body).toMatchObject({ data: { user_id: owner.user_id } });
      await request(server)
        .patch('/api/users/me')
        .auth(tokens.accessToken, { type: 'bearer' })
        .send({ fullName: '  My name  ' })
        .expect(200);
      expect(rows.get(owner.user_id)!.fullName).toBe('My name');
      expect(rows.get(target.user_id)!.fullName).toBeNull();
      await request(server)
        .get('/api/users/me')
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(200);
      const status = role === UserRole.ADMIN ? 200 : 403;
      await request(server)
        .get('/api/users')
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(status);
      await request(server)
        .get('/api/users/' + target.user_id)
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(status);
      await request(server)
        .patch('/api/users/' + target.user_id)
        .auth(tokens.accessToken, { type: 'bearer' })
        .send({ fullName: 'Admin name' })
        .expect(status);
      await request(server)
        .post('/api/users')
        .auth(tokens.accessToken, { type: 'bearer' })
        .send({ email: 'created@example.com', password: 'abcdef' })
        .expect(role === UserRole.ADMIN ? 201 : 403);
      await request(server)
        .delete('/api/users/' + target.user_id)
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(404);
      await request(server)
        .patch('/api/users/me/password')
        .auth(tokens.accessToken, { type: 'bearer' })
        .send({ currentPassword: 'abcdef', newPassword: 'new-password' })
        .expect(200);
      await request(server)
        .get('/api/users/me')
        .auth(tokens.accessToken, { type: 'bearer' })
        .expect(401);
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', tokens.refreshCookie)
        .expect(401);
      await request(server)
        .post('/api/auth/login')
        .send({ email: owner.email, password: 'new-password' })
        .expect(200);
    },
  );

  it('requires authentication on all user endpoints', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/users/me').expect(401);
    await request(server)
      .patch('/api/users/me')
      .send({ fullName: 'Name' })
      .expect(401);
    await request(server)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'abcdef', newPassword: 'new-password' })
      .expect(401);
    await request(server).get('/api/users').expect(401);
    await request(server).get('/api/users/other').expect(401);
    await request(server)
      .post('/api/users')
      .send({ email: 'other@example.com', password: 'abcdef' })
      .expect(401);
    await request(server)
      .patch('/api/users/other')
      .send({ fullName: 'Name' })
      .expect(401);
  });

  it('rejects protected fields and invalid names for both self and admin update', async () => {
    const user = await register();
    const tokens = await adminLogin();
    for (const path of ['/api/users/me', '/api/users/' + user.user_id]) {
      for (const field of [
        'userId',
        'user_id',
        'role',
        'status',
        'email',
        'password',
        'emailVerified',
        'reputationScore',
      ]) {
        await request(app.getHttpServer())
          .patch(path)
          .auth(tokens.accessToken, { type: 'bearer' })
          .send({ fullName: 'Name', [field]: 'injected' })
          .expect(400);
      }
      for (const fullName of ['', '   ', null, 12, 'x'.repeat(101)]) {
        await request(app.getHttpServer())
          .patch(path)
          .auth(tokens.accessToken, { type: 'bearer' })
          .send({ fullName })
          .expect(400);
      }
    }
    expect(rows.get(user.user_id)!.fullName).toBeNull();
  });

  it('does not change credentials on an incorrect or identical password', async () => {
    const user = await register();
    const tokens = await login();
    const oldHash = rows.get(user.user_id)!.password;
    for (const body of [
      { currentPassword: 'wrong', newPassword: 'new-password' },
      { currentPassword: 'abcdef', newPassword: 'abcdef' },
      { currentPassword: 'abcdef', newPassword: 'short' },
      { currentPassword: 'abcdef', newPassword: 'x'.repeat(33) },
    ]) {
      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .auth(tokens.accessToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    expect(rows.get(user.user_id)!.password).toBe(oldHash);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
  });

  it('password change clears the refresh cookie and concurrent changes cannot overwrite each other', async () => {
    await register();
    const tokens = await login();
    const responses = await Promise.all(
      ['new-password-a', 'new-password-b'].map((newPassword) =>
        request(app.getHttpServer())
          .patch('/api/users/me/password')
          .auth(tokens.accessToken, { type: 'bearer' })
          .send({ currentPassword: 'abcdef', newPassword }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const headers = responses.find((r) => r.status === 200)!
      .headers as unknown as Record<string, string[]>;
    expect(
      headers['set-cookie'].some(
        (c) => c.startsWith('refresh_token=;') && c.includes('Path=/api/auth;'),
      ),
    ).toBe(true);
  });

  it('uses the current database role and never serializes unexpected entity fields', async () => {
    const user = await register();
    rows.get(user.user_id)!.role = UserRole.ADMIN;
    Object.assign(rows.get(user.user_id)!, {
      privateFutureField: 'private-value',
    });
    const tokens = await login();
    const response = await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    expect(response.body).not.toHaveProperty('data.privateFutureField');
    expect(response.body).not.toHaveProperty('data.password');
    rows.get(user.user_id)!.role = UserRole.USER;
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(403);
  });
});
