import { Module, forwardRef } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { DakModule } from '../dak/dak.module';
import { OcrModule } from '../ocr/ocr.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [NotificationsModule, DakModule, forwardRef(() => OcrModule), AiModule],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
