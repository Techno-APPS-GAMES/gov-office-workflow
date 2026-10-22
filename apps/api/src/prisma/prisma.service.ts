import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Ensure Unicode (Urdu summaries, etc.) — WIN1252 client/DB rejects Arabic script.
    await this.$executeRawUnsafe(`SET client_encoding TO 'UTF8'`);
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
