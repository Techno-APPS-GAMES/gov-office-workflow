import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Prefer DATABASE_URL?options=-c%20client_encoding%3DUTF8 for all pool connections.
    await this.$executeRawUnsafe(`SET client_encoding TO 'UTF8'`);
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
