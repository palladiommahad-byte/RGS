import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BackupsModule } from './backups/backups.module';
import { BillingModule } from './billing/billing.module';
import { CheckinModule } from './checkin/checkin.module';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { CryptoModule } from './common/crypto/crypto.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FinanceModule } from './finance/finance.module';
import { HrModule } from './hr/hr.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RegisterModule } from './register/register.module';
import { RetentionService } from './retention/retention.service';
import { RoomsModule } from './rooms/rooms.module';
import { StaysModule } from './stays/stays.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    AuditModule,
    AuthCoreModule,
    StorageModule,
    RealtimeModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    AuthModule,
    RoomsModule,
    StaysModule,
    CheckinModule,
    BillingModule,
    RegisterModule,
    ExpensesModule,
    FinanceModule,
    HrModule,
    SettingsModule,
    UsersModule,
    BackupsModule,
  ],
  controllers: [HealthController],
  providers: [
    RetentionService,
    // Order matters: rate limit -> authenticate -> authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
