import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EsignService } from './esign.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('esign')
export class EsignController {
  constructor(private esign: EsignService) {}

  @Get()
  list(@CurrentUser() user: { id: string; role: Role }, @Query('matterId') matterId?: string) {
    return this.esign.list(user, matterId);
  }

  @Get('verify')
  verify(@Query('certId') certId: string) {
    return this.esign.verify(certId);
  }

  @Post('request')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  request(
    @Body() body: { matterId: string; signerId: string },
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.esign.request(body.matterId, body.signerId, user);
  }

  @Post(':id/sign')
  sign(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.esign.sign(id, user.id);
  }

  @Post(':id/revoke')
  @Roles(Role.SPEAKER, Role.ADMIN, Role.DG_IT)
  revoke(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.esign.revoke(id, user.id);
  }
}
