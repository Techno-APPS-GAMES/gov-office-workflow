import { Module } from '@nestjs/common';
import { EsignService } from './esign.service';
import { EsignController } from './esign.controller';

@Module({ providers: [EsignService], controllers: [EsignController] })
export class EsignModule {}
