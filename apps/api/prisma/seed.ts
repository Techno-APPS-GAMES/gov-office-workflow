import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { assertPasswordPolicy } from '../src/auth/password-policy';

const prisma = new PrismaClient();

const DEFAULT_SEED_PASSWORD = 'ChangeMe!Office1';

function isPilotMode() {
  return process.env.PILOT_MODE === 'true' || process.env.NODE_ENV === 'production';
}

async function main() {
  const pilot = isPilotMode();
  const plain = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;

  if (pilot) {
    if (process.env.MFA_SKIP_LOGIN_TOTP === 'true') {
      throw new Error(
        'PILOT_MODE/production forbids MFA_SKIP_LOGIN_TOTP=true. Set it to false or remove it.',
      );
    }
    if (process.env.DEMO_WEAK_PASSWORDS === 'true') {
      throw new Error(
        'PILOT_MODE/production forbids DEMO_WEAK_PASSWORDS=true. Use the strong password policy.',
      );
    }
    if (process.env.ALLOW_WEAK_SEED !== 'true') {
      // Temporarily clear demo weak flag so policy enforces complexity
      const prev = process.env.DEMO_WEAK_PASSWORDS;
      process.env.DEMO_WEAK_PASSWORDS = 'false';
      try {
        assertPasswordPolicy(plain);
      } finally {
        if (prev === undefined) delete process.env.DEMO_WEAK_PASSWORDS;
        else process.env.DEMO_WEAK_PASSWORDS = prev;
      }
    }
  } else if (process.env.DEMO_WEAK_PASSWORDS !== 'true') {
    assertPasswordPolicy(plain);
  } else if (plain.length < 6) {
    throw new Error('SEED_PASSWORD must be at least 6 characters');
  }

  const password = await bcrypt.hash(plain, 12);

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

  const templates = [
    {
      name: 'Sec Gen examine',
      description: 'Route to Secretary General for examine and advise',
      stepsJson: JSON.stringify([
        { toRole: 'SECRETARY_GENERAL', procedure: 'Examine and advise' },
      ]),
    },
    {
      name: 'Sec Gen then Spec Sec',
      description: 'First hop to Secretary General (complete, then route Spec Sec manually)',
      stepsJson: JSON.stringify([
        { toRole: 'SECRETARY_GENERAL', procedure: 'Examine and advise' },
        { toRole: 'SPECIAL_SECRETARY', procedure: 'Review and put up' },
      ]),
    },
    {
      name: 'Spec Sec put-up',
      description: 'Route to Special Secretary for put-up',
      stepsJson: JSON.stringify([
        { toRole: 'SPECIAL_SECRETARY', procedure: 'Prepare put-up for Speaker' },
      ]),
    },
  ];
  for (const t of templates) {
    await prisma.routeTemplate.upsert({
      where: { name: t.name },
      update: { description: t.description, stepsJson: t.stepsJson, active: true },
      create: t,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded users (password from SEED_PASSWORD / default ${DEFAULT_SEED_PASSWORD}).` +
      (pilot
        ? ' Pilot mode: MFA skip and weak passwords are forbidden.'
        : ' Demo: MFA login TOTP skipped only when MFA_SKIP_LOGIN_TOTP=true.'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
