import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MeetingsService } from './meetings.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('meetings')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.meetings.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title: string;
      startAt?: string;
      endAt?: string;
      location?: string;
      brief?: string;
      screeningStatus?: string;
      screeningCnic?: string;
      screeningBadge?: string;
      screeningNotes?: string;
      force?: boolean;
    },
  ) {
    return this.meetings.create(user.id, body);
  }

  @Post(':id/decide')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  decide(
    @Param('id') id: string,
    @Body('approve') approve: boolean,
    @CurrentUser() user: { id: string },
  ) {
    return this.meetings.decide(id, user.id, approve !== false);
  }

  @Post(':id/complete')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  complete(
    @Param('id') id: string,
    @Body() body: { minutes?: string; outcome?: string; decision?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.meetings.complete(id, body, user);
  }

  @Post(':id/actions')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  addAction(
    @Param('id') id: string,
    @Body()
    body: {
      title: string;
      ownerName: string;
      ownerId?: string;
      dueDate?: string;
      promoteToDirection?: boolean;
    },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.meetings.addAction(id, user, body);
  }

  @Post(':id/actions/:actionId/promote')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  promoteAction(
    @Param('actionId') actionId: string,
    @Body() body: { ownerId?: string; dueDate?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.meetings.promoteActionToDirection(actionId, user, body);
  }

  @Post(':id/archive')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  archive(@Param('id') id: string) {
    return this.meetings.archive(id);
  }
}
