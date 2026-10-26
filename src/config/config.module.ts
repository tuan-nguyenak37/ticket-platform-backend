import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';
import { validateEnvironment } from './validate-environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment: Record<string, unknown>) =>
        validateEnvironment(envValidationSchema, environment),
      envFilePath: '.env',
    }),
  ],
})
export class AppConfigModule {}
