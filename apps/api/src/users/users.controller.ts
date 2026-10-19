import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

class CreateUserDto {
  @IsString()
  username!: string;
  @IsString()
  displayName!: string;
  @IsEmail()
  email!: string;
  @IsString()
  @MinLength(12)
  password!: string;
  @IsEnum(Role)
  role!: Role;
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.SPEAKER, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.DG_IT, Role.ADMIN)
  list() {
    return this.users.list();
  }

  @Post()
  @Roles(Role.ADMIN, Role.DG_IT)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: { id: string }) {
    return this.users.create({ ...dto, actorId: actor.id });
  }
}
