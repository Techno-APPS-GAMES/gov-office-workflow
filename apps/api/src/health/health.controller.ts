import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { HealthService } from './health.service';
import { Public, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('health')
export class HealthController {
  constructor(private health: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return this.health.check();
  }

  @Get('overview')
  @Roles(Role.SPEAKER, Role.DG_IT, Role.ADMIN, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY)
  overview() {
    return this.health.overview();
  }

  @Get('dashboard')
  @Roles(Role.SPEAKER, Role.ADMIN, Role.SECRETARY_GENERAL, Role.SPECIAL_SECRETARY, Role.DG_IT)
  dashboard(@CurrentUser() user: { id: string; role: Role }) {
    return this.health.dashboard(user);
  }
}
