import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SpeechesService } from './speeches.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('speeches')
export class SpeechesController {
  constructor(private speeches: SpeechesService) {}

  @Get()
  list() {
    return this.speeches.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.speeches.get(id);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() body: { title: string; body: string; language?: string; eventDate?: string },
  ) {
    return this.speeches.create(user.id, body);
  }

  @Patch(':id/status')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.speeches.setStatus(id, user.id, status);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() body: { title?: string; body?: string; language?: string },
  ) {
    return this.speeches.update(id, user.id, body);
  }
}
