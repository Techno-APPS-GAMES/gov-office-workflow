import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SpeechesService } from './speeches.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('speeches')
export class SpeechesController {
  constructor(private speeches: SpeechesService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.speeches.list(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.speeches.get(id);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title: string;
      body: string;
      bodyUr?: string;
      talkingPoints?: string;
      talkingPointsUr?: string;
      language?: string;
      eventDate?: string;
      eventVenue?: string;
      matterId?: string;
      sourcesNote?: string;
      aiAssisted?: boolean;
    },
  ) {
    return this.speeches.create(user.id, body);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.speeches.setStatus(id, user, body.status, body.reason);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title?: string;
      body?: string;
      bodyUr?: string;
      talkingPoints?: string;
      talkingPointsUr?: string;
      language?: string;
      eventDate?: string | null;
      eventVenue?: string;
      matterId?: string | null;
      sourcesNote?: string;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    return this.speeches.update(id, user.id, body);
  }
}
