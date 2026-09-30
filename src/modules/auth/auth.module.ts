import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './jwt/token.service';
import { AccessTokenGuard } from './jwt/access-token.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    TokenService,
    AuthService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
