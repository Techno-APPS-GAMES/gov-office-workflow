import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('inbox')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('desk')
  desk(@CurrentUser() user: { id: string; role: Role }) {
    return this.notifications.desk(user);
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('unread') unread?: string,
    @Query('type') type?: string,
  ) {
    return this.notifications.list(user.id, {
      unreadOnly: unread === '1' || unread === 'true',
      type: type || undefined,
    });
  }

  /** Polled by the shell — exclude from rate limits. */
  @SkipThrottle()
  @Get('unread-count')
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: { id: string }) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.notifications.markRead(user.id, id);
  }
}
