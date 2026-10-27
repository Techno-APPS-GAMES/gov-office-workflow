import { Module } from '@nestjs/common';
import { SpeechesService } from './speeches.service';
import { SpeechesController } from './speeches.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [SpeechesService],
  controllers: [SpeechesController],
})
export class SpeechesModule {}
