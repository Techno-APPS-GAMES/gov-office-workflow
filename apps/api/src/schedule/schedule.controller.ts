import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ScheduleService } from './schedule.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('schedule')
export class ScheduleController {
  constructor(private schedule: ScheduleService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }, @Query('ownerId') ownerId?: string) {
    return this.schedule.list(user, ownerId);
  }

  @Post('check')
  check(
    @CurrentUser() user: { id: string; role: Role },
    @Body()
    body: { startAt: string; endAt: string; ownerId?: string; excludeId?: string },
  ) {
    return this.schedule.check(user, body);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string; role: Role },
    @Body()
    body: {
      title: string;
      startAt: string;
      endAt: string;
      location?: string;
      ownerId?: string;
      force?: boolean;
    },
  ) {
    return this.schedule.create(user, body.ownerId || user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.schedule.remove(id, user);
  }
}
