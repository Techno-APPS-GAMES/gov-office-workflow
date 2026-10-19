import { Module } from '@nestjs/common';
import { GreetingsService } from './greetings.service';
import { GreetingsController } from './greetings.controller';

@Module({ providers: [GreetingsService], controllers: [GreetingsController] })
export class GreetingsModule {}
