import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Classification, Role } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { WorkItemsService } from './work-items.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';

class CreateWorkDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  kind!: string;

  @IsString()
  @MinLength(10)
  text!: string;

  @IsOptional()
  @IsIn(['en', 'ur'])
  language?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'])
  classification?: Classification;

  @IsOptional()
  @IsIn(['NORMAL', 'PRIORITY', 'URGENT', 'VIP'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

class UpdateWorkDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  text?: string;

  @IsOptional()
  @IsIn(['en', 'ur'])
  language?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'])
  classification?: Classification;

  @IsOptional()
  @IsIn(['NORMAL', 'PRIORITY', 'URGENT', 'VIP'])
  priority?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string | null;

  @IsOptional()
  @IsString()
  dueAt?: string | null;
}

class DecideDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('work-items')
export class WorkItemsController {
  constructor(private workItems: WorkItemsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string; role: Role },
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    return this.workItems.list(user, { status, kind });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.workItems.get(id, user);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: CreateWorkDto) {
    return this.workItems.create(user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() body: UpdateWorkDto,
  ) {
    return this.workItems.update(id, user, body);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.workItems.submit(id, user);
  }

  @Post(':id/decide')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.ADMIN)
  decide(
    @Param('id') id: string,
    @Body() body: DecideDto,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return this.workItems.decide(id, user, {
      approve: body.approve !== false,
      reason: body.reason,
      note: body.note,
    });
  }
}
