import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role)
  role!: Role;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.DG_IT, Role.ADMIN)
  list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('active') active?: string,
  ) {
    return this.users.list({ q, role, active });
  }

  @Get(':id')
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.DG_IT, Role.ADMIN)
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DG_IT)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: { id: string }) {
    return this.users.create({ ...dto, actorId: actor.id });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DG_IT)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.users.update(id, actor.id, dto);
  }
}
