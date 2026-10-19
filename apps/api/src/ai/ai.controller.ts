import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AiService } from './ai.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Post('ask')
  ask(
    @CurrentUser() user: { id: string; role: Role },
    @Body() body: { question: string; matterId?: string },
  ) {
    return this.ai.ask(user, body.question, body.matterId);
  }
}
