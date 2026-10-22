import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PressStatus, Role } from '@prisma/client';
import { GreetingsService } from './greetings.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('greetings')
export class GreetingsController {
  constructor(private greetings: GreetingsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.greetings.list(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.greetings.get(id);
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
      channel?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string;
      matterId?: string;
      sourcesNote?: string;
      deliveryNote?: string;
      aiAssisted?: boolean;
    },
  ) {
    return this.greetings.create(user.id, body);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: PressStatus | string; reason?: string; deliveryNote?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.greetings.setStatus(id, user, body.status, {
      reason: body.reason,
      deliveryNote: body.deliveryNote,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      occasion?: string;
      recipient?: string;
      message?: string;
      titleUr?: string;
      messageUr?: string;
      style?: string;
      channel?: string;
      recipientCount?: number;
      occasionKey?: string;
      occasionDate?: string | null;
      matterId?: string | null;
      sourcesNote?: string;
      deliveryNote?: string;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    return this.greetings.update(id, user.id, body);
  }
}
