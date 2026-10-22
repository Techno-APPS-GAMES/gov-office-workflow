import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PressStatus, Role } from '@prisma/client';
import { PressService } from './press.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('press')
export class PressController {
  constructor(private press: PressService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.press.list(status);
  }

  @Get('clips')
  listClips() {
    return this.press.listClips();
  }

  @Get('digest')
  digest() {
    return this.press.digest();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.press.get(id);
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
      socialTargets?: string;
      matterId?: string;
      sourcesNote?: string;
      embargoUntil?: string;
      aiAssisted?: boolean;
    },
  ) {
    return this.press.create(user.id, body);
  }

  @Post('clips')
  addClip(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      outlet: string;
      headline: string;
      url?: string;
      note?: string;
      platform?: string;
      pressReleaseId?: string;
      observedAt?: string;
    },
  ) {
    return this.press.addClip(user.id, body);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body()
    body: { status: PressStatus | string; reason?: string; socialApproved?: boolean },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.press.setStatus(id, user, body.status, {
      reason: body.reason,
      socialApproved: body.socialApproved,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      title?: string;
      body?: string;
      titleUr?: string;
      bodyUr?: string;
      wire?: string;
      socialTargets?: string;
      socialApproved?: boolean;
      matterId?: string | null;
      sourcesNote?: string;
      embargoUntil?: string | null;
      aiAssisted?: boolean;
      markHumanReviewed?: boolean;
    },
  ) {
    return this.press.update(id, user.id, body);
  }
}
