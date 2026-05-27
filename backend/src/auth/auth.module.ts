import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { UsersModule } from '../users/users.module';
import { MerchantsModule } from '../merchants/merchants.module';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: (config.get('JWT_EXPIRES_IN') || '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    MerchantsModule,
  ],
  providers: [AuthService, JwtStrategy, LocalStrategy, JwtAuthGuard, LocalAuthGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, PassportModule],
})
export class AuthModule {}
