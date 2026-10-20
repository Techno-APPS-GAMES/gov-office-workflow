/**
 * Wipe all transactional data and load a clean tester pack:
 * staff accounts + route templates + exactly 3 curated records per major area.
 *
 * Usage:
 *   npm run prepare:testers -w @gow/api
 *
 * Password: TESTER_PASSWORD or SEED_PASSWORD or Tester@Office1
 * (ASCII-only seed strings for Windows Postgres client_encoding safety.)
 */
import {
  PrismaClient,
  Classification,
  DirectionStatus,
  MatterStatus,
  MeetingStatus,
  CallStatus,
  PressStatus,
  WorkItemStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Tester@Office1';
const VAULT_PASSWORD = 'VaultTest!01';

async function wipeTransactional() {
  await prisma.messageAttachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.meetingAction.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.scheduleItem.deleteMany();
  await prisma.dakEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.vaultGrant.deleteMany();
  await prisma.callRecord.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.esignRecord.deleteMany();
  await prisma.speech.deleteMany();
  await prisma.pressRelease.deleteMany();
  await prisma.greetingCard.deleteMany();
  await prisma.letter.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.matterNote.deleteMany();
  await prisma.matterVersion.deleteMany();
  await prisma.matterRelation.deleteMany();
  await prisma.routeStep.deleteMany();
  await prisma.journeyEvent.deleteMany();
  await prisma.direction.deleteMany();
  await prisma.matter.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
}

async function ensureUsers(passwordHash: string) {
  const users = [
    { username: 'speaker', displayName: 'Office Speaker', email: 'speaker@office.local', role: Role.SPEAKER },
    { username: 'secgen', displayName: 'Secretary General', email: 'secgen@office.local', role: Role.SECRETARY_GENERAL },
    { username: 'specsec', displayName: 'Special Secretary', email: 'specsec@office.local', role: Role.SPECIAL_SECRETARY },
    { username: 'dgit', displayName: 'DG Information Technology', email: 'dgit@office.local', role: Role.DG_IT },
    { username: 'admin', displayName: 'System Administrator', email: 'admin@office.local', role: Role.ADMIN },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        passwordHash,
        active: true,
        mfaEnabled: false,
        mfaSecretEnc: null,
      },
      create: { ...u, passwordHash, mfaEnabled: false, active: true },
    });
  }
  return prisma.user.findMany();
}

async function ensureTemplates() {
  const templates = [
    {
      name: 'Sec Gen examine',
      description: 'Route to Secretary General for examine and advise',
      stepsJson: JSON.stringify([{ toRole: 'SECRETARY_GENERAL', procedure: 'Examine and advise' }]),
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
      stepsJson: JSON.stringify([{ toRole: 'SPECIAL_SECRETARY', procedure: 'Prepare put-up for Speaker' }]),
    },
  ];
  for (const t of templates) {
    await prisma.routeTemplate.upsert({
      where: { name: t.name },
      update: { description: t.description, stepsJson: t.stepsJson, active: true },
      create: t,
    });
  }
}

function daysFromNow(d: number, hour = 10) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(hour, 0, 0, 0);
  return x;
}

async function seedTestData(
  byUser: Record<string, { id: string; displayName: string }>,
  vaultHash: string,
) {
  const speaker = byUser.speaker;
  const secgen = byUser.secgen;
  const specsec = byUser.specsec;
  const year = new Date().getFullYear();

  const m1 = await prisma.matter.create({
    data: {
      diaryNo: `TC-F-${year}-001`,
      subject: '[TC-F-01] Internal invitation - cultural event brief',
      sender: 'Protocol Wing',
      body:
        'Test case F-01. Please examine the invitation for the Speaker and advise whether attendance is recommended. Include logistics and protocol notes in your advice.',
      classification: Classification.INTERNAL,
      subjectArea: 'Protocol',
      priority: 'NORMAL',
      status: MatterStatus.OPEN,
      createdById: speaker.id,
      holderId: speaker.id,
      assigneeId: speaker.id,
    },
  });
  await prisma.journeyEvent.create({
    data: { matterId: m1.id, kind: 'REGISTERED', summary: 'TC-F-01 registered for tester pack', actorId: speaker.id },
  });
  await prisma.matterNote.create({
    data: {
      matterId: m1.id,
      authorId: speaker.id,
      text: 'Noting: registered for UAT - route to Sec Gen when ready.',
      kind: 'NOTE',
      number: 1,
    },
  });

  const m2 = await prisma.matter.create({
    data: {
      diaryNo: `TC-F-${year}-002`,
      subject: '[TC-F-02] Confidential intergovernmental note',
      sender: 'Ministry Desk',
      body:
        'Test case F-02 CONFIDENTIAL. Unlock vault with password VaultTest!01 before open/download. Tester must enter a download reason (min 5 chars).',
      classification: Classification.CONFIDENTIAL,
      subjectArea: 'Intergovernmental',
      priority: 'URGENT',
      status: MatterStatus.OPEN,
      filePasswordHash: vaultHash,
      createdById: speaker.id,
      holderId: speaker.id,
      assigneeId: speaker.id,
    },
  });
  await prisma.journeyEvent.create({
    data: { matterId: m2.id, kind: 'REGISTERED', summary: 'TC-F-02 confidential registered', actorId: speaker.id },
  });

  const m3 = await prisma.matter.create({
    data: {
      diaryNo: `TC-F-${year}-003`,
      subject: '[TC-F-03] File awaiting Sec Gen receipt',
      sender: 'Admin Branch',
      body:
        'Test case F-03. Already routed to Secretary General - acknowledge, add a noting para, then complete procedure or return with remarks.',
      classification: Classification.INTERNAL,
      subjectArea: 'Administration',
      priority: 'NORMAL',
      status: MatterStatus.AWAITING_RECEIPT,
      createdById: speaker.id,
      holderId: secgen.id,
      assigneeId: secgen.id,
    },
  });
  await prisma.routeStep.create({
    data: {
      matterId: m3.id,
      fromUserId: speaker.id,
      toUserId: secgen.id,
      procedure: 'Examine and advise',
      status: 'AWAITING_RECEIPT',
      dueDate: daysFromNow(3),
    },
  });
  await prisma.journeyEvent.create({
    data: {
      matterId: m3.id,
      kind: 'ROUTED',
      summary: 'Routed to Sec Gen for TC-F-03',
      actorId: speaker.id,
    },
  });
  await prisma.notification.create({
    data: {
      userId: secgen.id,
      type: 'ROUTE',
      title: 'File awaiting receipt',
      body: `${m3.diaryNo} awaits your receipt`,
      recordId: m3.id,
    },
  });

  await prisma.dakEntry.createMany({
    data: [
      {
        direction: 'IN',
        fromName: 'Ministry of Finance',
        fromDesignation: 'Section Officer',
        toName: speaker.displayName,
        toDesignation: 'SPEAKER',
        channel: 'HAND',
        subject: '[TC-D-01] Incoming dak - budget brief for Speaker',
        classification: 'INTERNAL',
        diaryNo: m1.diaryNo,
        matterId: m1.id,
        stampedById: secgen.id,
        branchName: 'Speaker Office',
      },
      {
        direction: 'IN',
        fromName: 'Foreign Mission Desk',
        toName: speaker.displayName,
        channel: 'EMAIL',
        subject: '[TC-D-02] Incoming dak - courtesy call request',
        classification: 'INTERNAL',
        stampedById: secgen.id,
        branchName: 'Speaker Office',
      },
      {
        direction: 'OUT',
        fromName: speaker.displayName,
        toName: 'Protocol Wing',
        toDesignation: 'Director',
        channel: 'INTERNAL',
        subject: '[TC-D-03] Outward despatch - acknowledged invitation reply',
        classification: 'INTERNAL',
        reference: `OUT-TC-${year}-003`,
        stampedById: secgen.id,
        branchName: 'Speaker Office',
      },
    ],
  });

  const d1 = await prisma.direction.create({
    data: {
      title: '[TC-DIR-01] Prepare one-page briefing on cultural event',
      status: DirectionStatus.ISSUED,
      ownerId: specsec.id,
      createdById: speaker.id,
      matterId: m1.id,
      dueDate: daysFromNow(5),
    },
  });
  const d2 = await prisma.direction.create({
    data: {
      title: '[TC-DIR-02] Submit confidential talking points (in progress)',
      status: DirectionStatus.IN_PROGRESS,
      ownerId: specsec.id,
      createdById: speaker.id,
      matterId: m2.id,
      dueDate: daysFromNow(2),
    },
  });
  const d3 = await prisma.direction.create({
    data: {
      title: '[TC-DIR-03] Overdue - weekly arrears note',
      status: DirectionStatus.OVERDUE,
      ownerId: specsec.id,
      createdById: speaker.id,
      dueDate: daysFromNow(-2),
    },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: specsec.id,
        type: 'DIRECTION',
        title: 'New direction',
        body: d1.title,
        recordId: d1.id,
      },
      {
        userId: specsec.id,
        type: 'DIRECTION',
        title: 'Direction overdue',
        body: d3.title,
        recordId: d3.id,
      },
    ],
  });

  const meet1 = await prisma.meeting.create({
    data: {
      title: '[TC-M-01] Courtesy call - Ambassador (REQUESTED)',
      status: MeetingStatus.REQUESTED,
      startAt: daysFromNow(4, 11),
      endAt: daysFromNow(4, 12),
      location: 'Speaker Chamber',
      brief: 'UAT: approve or decline; check screening fields.',
      screeningStatus: 'PENDING',
      screeningCnic: '35202-1234567-1',
      screeningNotes: 'Official visitor',
      createdById: secgen.id,
    },
  });
  const meet2 = await prisma.meeting.create({
    data: {
      title: '[TC-M-02] Delegation briefing (APPROVED)',
      status: MeetingStatus.APPROVED,
      startAt: daysFromNow(5, 14),
      endAt: daysFromNow(5, 15),
      location: 'Committee Room',
      brief: 'UAT: add action point and promote to direction.',
      screeningStatus: 'CLEARED',
      screeningBadge: 'V-102',
      screeningNotes: 'Delegation',
      createdById: secgen.id,
    },
  });
  await prisma.meetingAction.create({
    data: {
      meetingId: meet2.id,
      title: 'Circulate briefing pack to Spec Sec',
      ownerName: specsec.displayName,
      ownerId: specsec.id,
      dueDate: daysFromNow(6),
    },
  });
  await prisma.meeting.create({
    data: {
      title: '[TC-M-03] Completed bilateral review',
      status: MeetingStatus.COMPLETED,
      startAt: daysFromNow(-3, 10),
      endAt: daysFromNow(-3, 11),
      location: 'Conference Hall',
      brief: 'Historical record for search UAT.',
      minutes: 'Discussed cooperation agenda. Action: follow up in 2 weeks.',
      outcome: 'Completed - minutes recorded',
      decision: 'Proceed with draft MoU review',
      screeningStatus: 'CLEARED',
      screeningNotes: 'Official visitor',
      createdById: speaker.id,
    },
  });

  await prisma.scheduleItem.createMany({
    data: [
      {
        title: '[TC-S-01] Morning diary - office hours',
        startAt: daysFromNow(1, 9),
        endAt: daysFromNow(1, 10),
        location: 'Chamber',
        ownerId: speaker.id,
      },
      {
        title: '[TC-S-02] Midday engagement (conflict target)',
        startAt: daysFromNow(1, 11),
        endAt: daysFromNow(1, 12),
        location: 'Parliament House',
        ownerId: speaker.id,
      },
      {
        title: '[TC-S-03] Afternoon committee slot',
        startAt: daysFromNow(1, 15),
        endAt: daysFromNow(1, 16),
        location: 'Committee Room A',
        ownerId: speaker.id,
      },
    ],
  });

  await prisma.callRecord.createMany({
    data: [
      {
        loggedById: secgen.id,
        direction: 'IN',
        priority: 'NORMAL',
        status: CallStatus.LOGGED,
        partyName: 'Protocol Officer Khan',
        organisation: 'Protocol Wing',
        phone: '051-9000001',
        summary: '[TC-C-01] Call logged - confirmation of invitation timings',
        matterId: m1.id,
      },
      {
        loggedById: specsec.id,
        direction: 'IN',
        priority: 'URGENT',
        status: CallStatus.FOLLOW_UP,
        partyName: 'PS to Minister',
        organisation: 'Cabinet Division',
        phone: '051-9000002',
        summary: '[TC-C-02] Follow-up required - Speaker availability next week',
        actionRequired: 'Confirm free slot with schedule desk',
      },
      {
        loggedById: secgen.id,
        direction: 'OUT',
        priority: 'NORMAL',
        status: CallStatus.CLOSED,
        partyName: 'Branch Clerk',
        organisation: 'Admin Branch',
        summary: '[TC-C-03] Closed call - despatch confirmation',
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        fromUserId: speaker.id,
        toUserId: secgen.id,
        text: '[TC-MSG-01] Please put up TC-F-01 after examine.',
        priority: 'ROUTINE',
        matterId: m1.id,
      },
      {
        fromUserId: secgen.id,
        toUserId: specsec.id,
        text: '[TC-MSG-02] Spec Sec: confidential file TC-F-02 needs vault unlock before review.',
        priority: 'URGENT',
        matterId: m2.id,
      },
      {
        fromUserId: specsec.id,
        toUserId: speaker.id,
        text: '[TC-MSG-03] Direction TC-DIR-01 accepted - briefing draft underway.',
        priority: 'ROUTINE',
        matterId: m1.id,
      },
    ],
  });

  await prisma.speech.createMany({
    data: [
      {
        title: '[TC-SP-01] Draft welcome remarks - cultural event',
        body: 'Honourable guests... (UAT draft speech - edit and save).',
        language: 'en',
        status: 'DRAFT',
        authorId: specsec.id,
        eventDate: daysFromNow(7),
      },
      {
        title: '[TC-SP-02] Urdu talking points - bilateral visit',
        body: 'Short Urdu talking points (UAT draft - switch UI to Urdu and edit).',
        language: 'ur',
        status: 'DRAFT',
        authorId: specsec.id,
        eventDate: daysFromNow(8),
      },
      {
        title: '[TC-SP-03] Approved short statement',
        body: 'Approved statement text for UAT history.',
        language: 'en',
        status: 'APPROVED',
        authorId: speaker.id,
        eventDate: daysFromNow(-1),
      },
    ],
  });

  await prisma.pressRelease.createMany({
    data: [
      {
        title: '[TC-P-01] Draft press note - office visit',
        body: 'Draft for media desk UAT.',
        status: PressStatus.DRAFT,
        authorId: secgen.id,
        code: 'PR-TC-01',
      },
      {
        title: '[TC-P-02] Approved release - awareness day',
        body: 'Approved copy ready for dispatch UAT.',
        status: PressStatus.APPROVED,
        authorId: speaker.id,
        code: 'PR-TC-02',
      },
      {
        title: '[TC-P-03] Dispatched release - archive',
        body: 'Already dispatched - search/history UAT.',
        status: PressStatus.DISPATCHED,
        authorId: secgen.id,
        code: 'PR-TC-03',
      },
    ],
  });

  await prisma.greetingCard.createMany({
    data: [
      {
        occasion: '[TC-G-01] Eid greetings draft',
        recipient: 'All staff - Speaker Office',
        message: 'Warm wishes from the Speaker Office (UAT).',
        status: PressStatus.DRAFT,
        authorId: secgen.id,
        cardCode: 'GC-TC-01',
      },
      {
        occasion: '[TC-G-02] Independence Day card',
        recipient: 'Honourable Members',
        message: 'Proud greetings - approved for UAT.',
        status: PressStatus.APPROVED,
        authorId: speaker.id,
        cardCode: 'GC-TC-02',
      },
      {
        occasion: '[TC-G-03] Condolence message dispatched',
        recipient: 'Bereaved family (protocol list)',
        message: 'With deepest sympathy - dispatched UAT.',
        status: PressStatus.DISPATCHED,
        authorId: secgen.id,
        cardCode: 'GC-TC-03',
      },
    ],
  });

  await prisma.workItem.createMany({
    data: [
      {
        title: '[TC-W-01] Remote review - draft letter',
        kind: 'LETTER',
        language: 'en',
        status: WorkItemStatus.DRAFT,
        classification: Classification.INTERNAL,
        text: 'Draft letter body for remote UAT.',
        ownerId: specsec.id,
        createdById: secgen.id,
        matterId: m1.id,
      },
      {
        title: '[TC-W-02] Submitted for Speaker approval',
        kind: 'BRIEF',
        language: 'en',
        status: WorkItemStatus.SUBMITTED,
        classification: Classification.INTERNAL,
        text: 'Brief awaiting Speaker decision (UAT).',
        ownerId: speaker.id,
        createdById: specsec.id,
        matterId: m1.id,
      },
      {
        title: '[TC-W-03] Approved work item archive',
        kind: 'NOTE',
        language: 'en',
        status: WorkItemStatus.APPROVED,
        classification: Classification.PUBLIC,
        text: 'Approved note for history UAT.',
        ownerId: speaker.id,
        createdById: speaker.id,
      },
    ],
  });

  await prisma.systemSetting.upsert({
    where: { key: 'org.name' },
    update: { value: 'Government Office Workflow - UAT' },
    create: { key: 'org.name', value: 'Government Office Workflow - UAT' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'uat.pack.version' },
    update: { value: '1.0' },
    create: { key: 'uat.pack.version', value: '1.0' },
  });

  return {
    matters: [m1.diaryNo, m2.diaryNo, m3.diaryNo],
    directions: [d1.title, d2.title, d3.title],
    meetings: [meet1.title, meet2.title],
    vaultPassword: VAULT_PASSWORD,
  };
}

async function main() {
  const plain =
    process.env.TESTER_PASSWORD || process.env.SEED_PASSWORD || DEFAULT_PASSWORD;
  console.log('Wiping transactional data...');
  await wipeTransactional();

  console.log('Refreshing staff accounts...');
  const passwordHash = await bcrypt.hash(plain, 12);
  const vaultHash = await bcrypt.hash(VAULT_PASSWORD, 12);
  const users = await ensureUsers(passwordHash);
  const byUser: Record<string, { id: string; displayName: string }> = {};
  for (const u of users) byUser[u.username] = { id: u.id, displayName: u.displayName };

  console.log('Ensuring route templates...');
  await ensureTemplates();

  console.log('Seeding 3 test records per area...');
  const summary = await seedTestData(byUser, vaultHash);

  console.log('');
  console.log('========== TESTER PACK READY ==========');
  console.log(`Password (all roles): ${plain}`);
  console.log(`Confidential vault password (TC-F-02): ${summary.vaultPassword}`);
  console.log('Accounts: speaker | secgen | specsec | dgit | admin');
  console.log('Matters:', summary.matters.join(', '));
  console.log('See docs/TESTER_HANDOFF.md for full test cases.');
  console.log('=======================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
