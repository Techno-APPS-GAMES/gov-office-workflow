import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { VaultService } from './vault.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('vault')
export class VaultController {
  constructor(private vault: VaultService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.vault.listConfidential(user);
  }

  @Get('events')
  events(
    @CurrentUser() user: { id: string; role: Role },
    @Query('limit') limit?: string,
  ) {
    return this.vault.listEvents(user, Number(limit) || 50);
  }

  @Get('verify')
  verify(@CurrentUser() user: { id: string; role: Role }) {
    return this.vault.verifyLedger(user);
  }

  @Post(':matterId/unlock')
  unlock(
    @Param('matterId') matterId: string,
    @Body('password') password: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.vault.unlock(matterId, user.id, password);
  }

  @Post(':matterId/lock')
  lock(@Param('matterId') matterId: string, @CurrentUser() user: { id: string }) {
    return this.vault.lock(matterId, user.id);
  }

  @Post(':matterId/rotate')
  rotate(
    @Param('matterId') matterId: string,
    @Body() body: { current: string; next: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.vault.rotatePassword(matterId, user, body.current, body.next);
  }
}
