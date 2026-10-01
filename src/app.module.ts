import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/utils/filters/global-exception.filter';
import { GlobalResponseInterceptor } from './common/utils/interceptors/global-response.interceptor';
import { EventsModule } from './modules/events/events.module';
import { UploadsModule } from './common/uploads/uploads.module';
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    EventsModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalResponseInterceptor,
    },
  ],
})
export class AppModule {}
