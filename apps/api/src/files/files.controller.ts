import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Classification, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { sanitizeFilename } from '../auth/access';

class RegisterDto {
  @IsString() subject!: string;
  @IsString() sender!: string;
  @IsString() body!: string;
  @IsEnum(Classification) classification!: Classification;
  @IsString() subjectArea!: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() @MinLength(12) filePassword?: string;
}

class RouteDto {
  @IsUUID() toUserId!: string;
  @IsString() procedure!: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() remarks?: string;
}

class DecisionDto {
  @IsString() text!: string;
  @IsString() decisionType!: string;
  @IsOptional() @IsString() directionTitle?: string;
  /** Empty string from the form is treated as absent (Approve/Reject). */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsUUID()
  ownerUserId?: string;
  @IsOptional() @IsString() dueDate?: string;
}

class ReturnDto {
  @IsString() @MinLength(10) remarks!: string;
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsUUID()
  toUserId?: string;
}

class NoteDto {
  @IsString() @MinLength(3) text!: string;
  @IsOptional() @IsString() kind?: string;
}

@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Get()
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  list(@CurrentUser() user: { id: string; role: Role }) {
    return this.files.list(user);
  }

  @Get('letters/dispatched')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  dispatched(@CurrentUser() user: { id: string; role: Role }) {
    return this.files.dispatchedLetters(user);
  }

  @Get('attachments/:attachmentId/download')
  async download(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: { id: string; role: Role },
    @Res() res: Response,
    @Query('reason') reason?: string,
  ) {
    const file = await this.files.downloadAttachment(attachmentId, user, reason);
    const safe = sanitizeFilename(file.fileName);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.send(file.bytes);
  }

  @Get('route-templates')
  listTemplates() {
    return this.files.listRouteTemplates();
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.files.get(id, user);
  }

  @Get(':id/put-up-check')
  putUpCheck(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.files.putUpCheck(id, user);
  }

  @Post()
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  register(@Body() dto: RegisterDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.files.register(user, dto);
  }

  @Post('letters/:letterId/dispatch')
  dispatchLetter(
    @Param('letterId') letterId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.dispatchLetter(letterId, user);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.addAttachment(id, user, file);
  }

  @Post(':id/route')
  route(
    @Param('id') id: string,
    @Body() dto: RouteDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.route(id, user, dto);
  }

  @Post(':id/route-template')
  applyTemplate(
    @Param('id') id: string,
    @Body('templateId') templateId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.applyRouteTemplate(id, user, templateId);
  }

  @Post(':id/summary')
  generateSummary(
    @Param('id') id: string,
    @Body('lang') lang: 'en' | 'ur',
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.generateSummary(id, user, lang === 'ur' ? 'ur' : 'en');
  }

  @Post(':id/summary/accept')
  acceptSummary(
    @Param('id') id: string,
    @Body('text') text: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.acceptSummary(id, user, text);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.files.acknowledge(id, user);
  }

  @Post(':id/return')
  returnMatter(
    @Param('id') id: string,
    @Body() dto: ReturnDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.returnMatter(id, user, dto);
  }

  @Post(':id/complete-procedure')
  complete(
    @Param('id') id: string,
    @Body('outcome') outcome: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.files.completeProcedure(id, user, outcome || 'Completed');
  }

  @Post(':id/decide')
  @Roles(Role.SPEAKER, Role.ADMIN)
  decide(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.decide(id, user, dto);
  }

  @Post(':id/versions')
  version(
    @Param('id') id: string,
    @Body() body: { text: string; reason: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.addVersion(id, user, body.text, body.reason);
  }

  @Post(':id/notes')
  note(
    @Param('id') id: string,
    @Body() body: NoteDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.addNote(id, user, body.text, body.kind || 'NOTE');
  }

  @Post(':id/related')
  related(
    @Param('id') id: string,
    @Body('relatedId') relatedId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.linkRelated(id, relatedId, user);
  }

  @Post(':id/letters')
  letter(
    @Param('id') id: string,
    @Body() body: { recipient: string; text: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.createLetter(id, user, body.recipient, body.text);
  }

  @Post(':id/close')
  @Roles(Role.SPEAKER, Role.ADMIN)
  close(
    @Param('id') id: string,
    @Body('outcome') outcome: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.files.close(id, user, outcome);
  }
}
