import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { WorkItemsService } from './work-items.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('work-items')
export class WorkItemsController {
  constructor(private workItems: WorkItemsService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.workItems.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title: string;
      kind: string;
      text: string;
      language?: string;
      classification?: Classification;
      ownerId?: string;
      matterId?: string;
    },
  ) {
    return this.workItems.create(user.id, body);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.workItems.submit(id, user.id);
  }

  @Post(':id/decide')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  decide(
    @Param('id') id: string,
    @Body('approve') approve: boolean,
    @CurrentUser() user: { id: string },
  ) {
    return this.workItems.decide(id, user.id, approve !== false);
  }
}
