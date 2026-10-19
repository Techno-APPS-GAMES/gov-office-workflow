import { Controller, Get, Header } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ExportService } from './export.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('export')
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Get('pack')
  @Roles(Role.SPEAKER, Role.ADMIN)
  @Header('Content-Disposition', 'attachment; filename="gow-exit-pack.json"')
  pack(@CurrentUser() user: { id: string; role: Role }) {
    return this.exportService.pack(user);
  }
}
