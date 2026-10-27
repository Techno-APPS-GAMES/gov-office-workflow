import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  /** Polled every few seconds by open workspace tabs — must not hit rate limits. */
  @SkipThrottle()
  @Get('stamp')
  stamp() {
    return this.sync.stamp();
  }
}
