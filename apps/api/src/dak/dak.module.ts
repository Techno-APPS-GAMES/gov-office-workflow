import { Module } from '@nestjs/common';
import { DakService } from './dak.service';
import { DakController } from './dak.controller';

@Module({
  providers: [DakService],
  controllers: [DakController],
  exports: [DakService],
})
export class DakModule {}
