import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { environmentSchema } from '../environment.schema';
import { validateEnvironment } from '../validate-environment';
import { DatabaseModule } from './database.module';

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

describeDatabase('PostgreSQL connection integration', () => {
  let module: TestingModule | undefined;

  afterAll(async () => {
    await module?.close();
  });

  it('connects through the Nest module without modifying the schema', async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: (environment: Record<string, unknown>) =>
            validateEnvironment(environmentSchema, environment),
        }),
        DatabaseModule,
      ],
    }).compile();
    await module.init();
    const database = module.get(DataSource);
    expect(database.isInitialized).toBe(true);
    expect(database.options.synchronize).toBe(false);
    expect(database.options.migrationsRun).toBe(false);
    expect(database.options.dropSchema).toBe(false);
    expect(await database.query<unknown>('SELECT 1 AS connected')).toEqual([
      { connected: 1 },
    ]);
  }, 15000);
});
