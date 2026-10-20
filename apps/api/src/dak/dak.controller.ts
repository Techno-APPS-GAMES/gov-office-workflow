import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { DakService } from './dak.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

class StampInDto {
  @IsString() @MinLength(1) fromName!: string;
  @IsOptional() @IsString() fromDesignation?: string;
  @IsOptional() @IsString() toName?: string;
  @IsOptional() @IsString() toDesignation?: string;
  @IsOptional() @IsString() channel?: string;
  @IsString() @MinLength(1) subject!: string;
  @IsOptional() @IsString() classification?: string;
  @IsOptional() @IsString() diaryNo?: string;
  @IsOptional() @IsString() matterId?: string;
  @IsOptional() @IsString() branchName?: string;
}

class StampOutDto {
  @IsString() @MinLength(1) toName!: string;
  @IsOptional() @IsString() toDesignation?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() fromDesignation?: string;
  @IsOptional() @IsString() channel?: string;
  @IsString() @MinLength(1) subject!: string;
  @IsOptional() @IsString() classification?: string;
  @IsOptional() @IsString() diaryNo?: string;
  @IsOptional() @IsString() matterId?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() branchName?: string;
}

@Controller('dak')
export class DakController {
  constructor(private dak: DakService) {}

  @Get()
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  list(@Query('direction') direction?: string) {
    return this.dak.list(direction);
  }

  @Post('in')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  stampIn(
    @Body() dto: StampInDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.dak.stampIn(user, dto);
  }

  @Post('out')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.ADMIN)
  stampOut(
    @Body() dto: StampOutDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.dak.stampOut(user, dto);
  }
}
