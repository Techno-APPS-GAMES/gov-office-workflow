import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DirectionsService } from './directions.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('directions')
export class DirectionsController {
  constructor(private directions: DirectionsService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.directions.list(user);
  }

  @Get(':id/activity')
  activity(@Param('id') id: string) {
    return this.directions.activity(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.directions.start(id, user.id);
  }

  @Post(':id/evidence')
  evidence(
    @Param('id') id: string,
    @Body('evidence') evidence: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.directions.evidence(id, user.id, evidence);
  }

  @Post(':id/verify')
  @Roles(Role.SPEAKER, Role.ADMIN)
  verify(
    @Param('id') id: string,
    @Body('approve') approve: boolean,
    @CurrentUser() user: { id: string },
  ) {
    return this.directions.verify(id, user.id, approve !== false);
  }

  @Post(':id/escalate')
  escalate(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.directions.escalate(id, user, note);
  }
}
