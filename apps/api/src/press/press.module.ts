import { Module } from '@nestjs/common';
import { PressService } from './press.service';
import { PressController } from './press.controller';

@Module({ providers: [PressService], controllers: [PressController] })
export class PressModule {}
