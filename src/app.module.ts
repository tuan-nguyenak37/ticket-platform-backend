import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database/database.module';
import { CoreModule } from './common/core.module';
import { UsersModule } from './modules/users/users.module';
import { SecurityModule } from './common/security/security.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CoreModule,
    UsersModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
