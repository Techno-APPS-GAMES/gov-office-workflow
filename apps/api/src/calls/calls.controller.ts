import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CallStatus, Role } from '@prisma/client';
import { CallsService } from './calls.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('calls')
export class CallsController {
  constructor(private calls: CallsService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.calls.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      direction: string;
      partyName: string;
      summary: string;
      priority?: string;
      organisation?: string;
      phone?: string;
      addressedTo?: string;
      actionRequired?: string;
      followUpNotes?: string;
      matterId?: string;
      directionId?: string;
      status?: CallStatus;
    },
  ) {
    return this.calls.create(user.id, body);
  }

  @Patch(':id/status')
  status(
    @Param('id') id: string,
    @Body('status') status: CallStatus,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.calls.updateStatus(id, status, user);
  }

  @Patch(':id/matter')
  linkMatter(
    @Param('id') id: string,
    @Body('matterId') matterId: string | null,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.calls.linkMatter(id, matterId || null, user);
  }

  @Post(':id/meeting')
  bookMeeting(
    @Param('id') id: string,
    @Body() body: { title?: string; startAt?: string; location?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.calls.bookMeeting(id, user, body);
  }

  @Post(':id/direction')
  issueDirection(
    @Param('id') id: string,
    @Body() body: { title: string; ownerUserId: string; dueDate?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.calls.issueDirection(id, user, body);
  }
}
