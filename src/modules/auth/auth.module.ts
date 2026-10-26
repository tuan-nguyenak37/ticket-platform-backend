import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { SecurityModule } from '../../common/security/security.module';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditService } from './authorization/audit.service';
import { AuditInterceptor } from './authorization/audit.interceptor';
import { RolesGuard } from './authorization/roles.guard';
import { AccessTokenGuard } from './jwt/access-token.guard';
import { TokenService } from './jwt/token.service';

@Module({
  imports: [UsersModule, JwtModule.register({}), SecurityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuditService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [TokenService],
})
export class AuthModule {}
