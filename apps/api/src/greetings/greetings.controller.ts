import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PressStatus, Role } from '@prisma/client';
import { GreetingsService } from './greetings.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('greetings')
export class GreetingsController {
  constructor(private greetings: GreetingsService) {}

  @Get()
  list() {
    return this.greetings.list();
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      occasion: string;
      recipient: string;
      message: string;
      titleUr?: string;
      messageUr?: string;
      style?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string;
    },
  ) {
    return this.greetings.create(user.id, body);
  }

  @Patch(':id/status')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body('status') status: PressStatus,
    @CurrentUser() user: { id: string },
  ) {
    return this.greetings.setStatus(id, user.id, status);
  }
}
