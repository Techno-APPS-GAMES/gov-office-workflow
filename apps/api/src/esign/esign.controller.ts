import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { EsignService } from './esign.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

class RequestEsignDto {
  @IsUUID()
  matterId!: string;

  @IsUUID()
  signerId!: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsIn(['LOCAL_PKI', 'WET_INK'])
  method?: 'LOCAL_PKI' | 'WET_INK';
}

class SignDto {
  @IsOptional()
  @IsString()
  confirmHash?: string;

  @IsOptional()
  @IsString()
  wetInkNote?: string;
}

class ReasonDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}

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

  @Get(':id/preview')
  preview(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.esign.preview(id, user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.esign.getOne(id, user);
  }

  @Post('request')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  request(@Body() body: RequestEsignDto, @CurrentUser() user: { id: string; role: Role }) {
    return this.esign.request(body.matterId, body.signerId, user, {
      purpose: body.purpose,
      method: body.method,
    });
  }

  @Post(':id/sign')
  @UseInterceptors(
    FileInterceptor('scan', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  sign(
    @Param('id') id: string,
    @Body() body: SignDto,
    @UploadedFile() scan: Express.Multer.File | undefined,
    @CurrentUser() user: { id: string },
  ) {
    return this.esign.sign(id, user.id, {
      confirmHash: body.confirmHash,
      wetInkNote: body.wetInkNote,
      scanFile: scan,
    });
  }

  @Post(':id/decline')
  decline(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.esign.decline(id, user.id, body.reason);
  }

  @Post(':id/revoke')
  @Roles(Role.SPEAKER, Role.ADMIN, Role.DG_IT)
  revoke(
    @Param('id') id: string,
    @Body() body: ReasonDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.esign.revoke(id, user.id, body.reason);
  }
}
