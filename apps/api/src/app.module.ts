import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { DirectionsModule } from './directions/directions.module';
import { VaultModule } from './vault/vault.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { CallsModule } from './calls/calls.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { SearchModule } from './search/search.module';
import { MeetingsModule } from './meetings/meetings.module';
import { ScheduleModule } from './schedule/schedule.module';
import { SpeechesModule } from './speeches/speeches.module';
import { PressModule } from './press/press.module';
import { GreetingsModule } from './greetings/greetings.module';
import { EsignModule } from './esign/esign.module';
import { OcrModule } from './ocr/ocr.module';
import { LdapModule } from './ldap/ldap.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { ExportModule } from './export/export.module';
import { DakModule } from './dak/dak.module';
import { SyncModule } from './sync/sync.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 120 },
        { name: 'auth', ttl: 60_000, limit: 20 },
      ],
      storage: new RedisThrottlerStorage(),
    }),
    PrismaModule,
    CryptoModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    FilesModule,
    DirectionsModule,
    VaultModule,
    NotificationsModule,
    MessagesModule,
    CallsModule,
    WorkItemsModule,
    SearchModule,
    MeetingsModule,
    ScheduleModule,
    SpeechesModule,
    PressModule,
    GreetingsModule,
    EsignModule,
    OcrModule,
    LdapModule,
    AiModule,
    HealthModule,
    ExportModule,
    DakModule,
    SyncModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
