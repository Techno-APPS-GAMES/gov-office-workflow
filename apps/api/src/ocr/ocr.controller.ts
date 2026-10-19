import { Controller, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OcrService } from './ocr.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('ocr')
export class OcrController {
  constructor(private ocr: OcrService) {}

  @Post('attachments/:id')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  extract(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.ocr.extractAttachment(id, user);
  }
}
