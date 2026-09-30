import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RolesGuard } from './authorization/roles.guard';
import { AuditService } from './authorization/audit.service';
import { AuditInterceptor } from './authorization/audit.interceptor';
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
    AuditService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [TokenService],
})
export class AuthModule {}
