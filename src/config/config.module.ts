import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Biến config thành global module
      validationSchema: envValidationSchema,
      envFilePath: '.env',
    }),
  ],
})
export class AppConfigModule {}
