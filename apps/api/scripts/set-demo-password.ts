import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const plain = process.env.SEED_PASSWORD || '123456';

async function main() {
  const hash = await bcrypt.hash(plain, 12);
  const r = await prisma.user.updateMany({ data: { passwordHash: hash } });
  console.log(`Updated ${r.count} users to password: ${plain}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
