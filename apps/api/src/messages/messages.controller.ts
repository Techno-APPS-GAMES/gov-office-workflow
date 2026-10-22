import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { MessagesService } from './messages.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Get('contacts')
  contacts(@CurrentUser() user: { id: string }, @Query('q') q?: string) {
    return this.messages.contacts(user.id, q);
  }

  @Get('conversations')
  conversations(@CurrentUser() user: { id: string }, @Query('q') q?: string) {
    return this.messages.conversations(user.id, q);
  }

  @Get('thread/:peerId')
  thread(@Param('peerId') peerId: string, @CurrentUser() user: { id: string }) {
    return this.messages.thread(user.id, peerId);
  }

  @Get('attachments/:id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const file = await this.messages.downloadAttachment(id, user.id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    res.send(file.bytes);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  send(
    @CurrentUser() user: { id: string; role: Role },
    @Body()
    body: {
      toUserId: string;
      text?: string;
      priority?: string;
      matterId?: string;
    },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.messages.send(user, body, files || []);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.messages.markRead(id, user.id);
  }
}
