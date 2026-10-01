import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { createUploadOptions } from './upload.config';
import { UploadsService } from './uploads.service';

@Module({
  imports: [
    ConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createUploadOptions,
    }),
  ],
  providers: [UploadsService],
  exports: [MulterModule, UploadsService],
})
export class UploadsModule {}
