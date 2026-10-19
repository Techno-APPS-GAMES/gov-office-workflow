import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('123456', 12);

  const users = [
    {
      username: 'speaker',
      displayName: 'Office Speaker',
      email: 'speaker@office.local',
      role: Role.SPEAKER,
    },
    {
      username: 'secgen',
      displayName: 'Secretary General',
      email: 'secgen@office.local',
      role: Role.SECRETARY_GENERAL,
    },
    {
      username: 'specsec',
      displayName: 'Special Secretary',
      email: 'specsec@office.local',
      role: Role.SPECIAL_SECRETARY,
    },
    {
      username: 'dgit',
      displayName: 'DG Information Technology',
      email: 'dgit@office.local',
      role: Role.DG_IT,
    },
    {
      username: 'admin',
      displayName: 'System Administrator',
      email: 'admin@office.local',
      role: Role.ADMIN,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        passwordHash: password,
        active: true,
      },
      create: {
        ...u,
        passwordHash: password,
        mfaEnabled: false,
        active: true,
      },
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: 'org.name' },
    update: { value: 'Government Office Workflow' },
    create: { key: 'org.name', value: 'Government Office Workflow' },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded users (password: 123456). Demo MFA login TOTP skipped when MFA_SKIP_LOGIN_TOTP=true.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
