import { Module } from '@nestjs/common';
import { EsignService } from './esign.service';
import { EsignController } from './esign.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [EsignService],
  controllers: [EsignController],
})
export class EsignModule {}
