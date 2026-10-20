import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { DirectionsService } from './directions.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { sanitizeFilename } from '../auth/access';

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

  @Get(':id/evidence-file/download')
  async downloadEvidence(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Res() res: Response,
  ) {
    const file = await this.directions.downloadEvidence(id, user);
    const safe = sanitizeFilename(file.fileName);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.send(file.bytes);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.directions.start(id, user.id);
  }

  @Post(':id/evidence')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  evidence(
    @Param('id') id: string,
    @Body('evidence') evidence: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    return this.directions.evidence(id, user.id, evidence, file);
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
