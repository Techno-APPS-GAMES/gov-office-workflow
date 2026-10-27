import { Module } from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { WorkItemsController } from './work-items.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [WorkItemsService],
  controllers: [WorkItemsController],
})
export class WorkItemsModule {}
