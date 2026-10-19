import { Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LdapService } from './ldap.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('ldap')
export class LdapController {
  constructor(private ldap: LdapService) {}

  @Get('status')
  @Roles(Role.DG_IT, Role.ADMIN)
  status() {
    return this.ldap.status();
  }

  @Post('sync')
  @Roles(Role.DG_IT, Role.ADMIN)
  sync(@CurrentUser() user: { id: string }) {
    return this.ldap.sync(user.id);
  }
}
