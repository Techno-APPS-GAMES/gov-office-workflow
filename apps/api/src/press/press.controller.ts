import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PressStatus, Role } from '@prisma/client';
import { PressService } from './press.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('press')
export class PressController {
  constructor(private press: PressService) {}

  @Get()
  list() {
    return this.press.list();
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title: string;
      body: string;
      titleUr?: string;
      bodyUr?: string;
      wire?: string;
    },
  ) {
    return this.press.create(user.id, body);
  }

  @Patch(':id/status')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body('status') status: PressStatus,
    @CurrentUser() user: { id: string },
  ) {
    return this.press.setStatus(id, user.id, status);
  }
}
