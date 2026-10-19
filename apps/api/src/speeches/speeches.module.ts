import { Module } from '@nestjs/common';
import { SpeechesService } from './speeches.service';
import { SpeechesController } from './speeches.controller';

@Module({ providers: [SpeechesService], controllers: [SpeechesController] })
export class SpeechesModule {}
