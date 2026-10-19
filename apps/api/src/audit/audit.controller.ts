import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @Roles(Role.SPEAKER, Role.DG_IT, Role.ADMIN)
  list(@Query('limit') limit?: string) {
    return this.audit.list(Number(limit) || 100);
  }

  @Get('dashboard')
  @Roles(Role.SPEAKER, Role.DG_IT, Role.ADMIN)
  dashboard() {
    return this.audit.dashboard();
  }

  @Get('verify')
  @Roles(Role.SPEAKER, Role.DG_IT, Role.ADMIN)
  verify() {
    return this.audit.verifyChain();
  }

  @Get('report')
  @Roles(Role.SPEAKER, Role.DG_IT, Role.ADMIN)
  async report(@Res() res: Response, @Query('format') format?: string) {
    if (format === 'json') {
      const events = await this.audit.list(1000);
      const verify = await this.audit.verifyChain();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-kpi.json"');
      res.send(JSON.stringify({ generatedAt: new Date().toISOString(), verify, events }, null, 2));
      return;
    }

    const buf = await this.audit.buildExcelReport();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="audit-report-${stamp}.xlsx"`);
    res.send(buf);
  }
}
