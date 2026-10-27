import { Module } from '@nestjs/common';
import { PressService } from './press.service';
import { PressController } from './press.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [PressService],
  controllers: [PressController],
})
export class PressModule {}
