export type Lang = 'en' | 'ur';

const en: Record<string, string> = {
  appName: 'National Assembly Secretariat',
  brandSub: 'OFFICIAL WORKSPACE',
  tagline: 'Trace each matter, follow directions and review the institutional record in one secure workspace.',
  kicker: 'Government of Pakistan',
  chooseRole: 'Choose a role',
  chooseRoleHelp: 'Each role has a distinct workspace. Each confidential file has its own password set at registration.',
  enterWorkspace: 'Enter workspace →',
  loginNote: 'Unique staff accounts with password + MFA. Confidential files require the password set when they were registered.',
  username: 'Username',
  password: 'Password',
  totp: 'Authenticator code',
  overview: 'Office overview',
  overview_SPEAKER: 'Office overview',
  overview_SECRETARY_GENERAL: 'Secretary desk',
  overview_SPECIAL_SECRETARY: 'My work',
  overview_DG_IT: 'System oversight',
  inbox: 'Appointment inbox',
  messages: 'Encrypted office messages',
  files: 'Files & documents',
  registry: 'Dak register (R&I)',
  vault: 'Confidential vault',
  movement: 'File movement',
  directions: 'Directions',
  putUpReady: 'Ready for Speaker put-up',
  putUpNotReady: 'Put-up incomplete',
  generateSummary: 'Generate summary',
  acceptSummary: 'Accept summary',
  routeTemplate: 'Route template',
  directions_SPECIAL_SECRETARY: 'My directions',
  calls: 'Call register',
  remote: 'Remote work & E-sign',
  meetings: 'Meetings',
  schedule: 'Schedule',
  speeches: 'Speeches',
  press: 'Press & media',
  greetings: 'Greeting cards',
  search: 'Search',
  extensions: 'Work records',
  people: 'Staff directory',
  audit: 'Audit dashboard',
  ai: 'AI helper',
  guide: 'Operator guide',
  logout: 'Switch role',
  register: 'Register matter',
  save: 'Save',
  submit: 'Submit',
  workspace: 'Workspace',
  searchHint: 'Search matters, meetings, directions…',
  livePill: '● Live system',
  myDesk: 'My desk',
  filesDecisions: 'Files & decisions',
  calendarMedia: 'Calendar & media',
  researchRecords: 'Research & records',
  governance: 'Governance',
  help: 'Help',
};

const ur: Record<string, string> = {
  ...en,
  appName: 'قومی اسمبلی سیکرٹریٹ',
  brandSub: 'سرکاری ورک اسپیس',
  tagline: 'ہر معاملے کا سراغ رکھیں، ہدایات پر عمل کریں اور ادارہ جاتی ریکارڈ ایک محفوظ ورک اسپیس میں دیکھیں۔',
  kicker: 'حکومتِ پاکستان',
  chooseRole: 'کردار منتخب کریں',
  enterWorkspace: 'ورک اسپیس میں داخل ہوں ←',
  logout: 'کردار بدلیں',
  overview: 'جائزہ',
  inbox: 'اپائنٹمنٹ ان باکس',
  messages: 'محفوظ دفتری پیغامات',
  files: 'فائلیں اور دستاویزات',
  registry: 'ڈاک رجسٹر (وصول و اجراء)',
  vault: 'محفوظ خانہ',
  movement: 'فائل منتقلی',
  directions: 'ہدایات',
  putUpReady: 'اسپیکر پیشکش کے لیے تیار',
  putUpNotReady: 'پیشکش نامکمل',
  generateSummary: 'خلاصہ تیار کریں',
  acceptSummary: 'خلاصہ قبول کریں',
  routeTemplate: 'روٹ سانچہ',
  calls: 'کال رجسٹر',
  remote: 'ریموٹ و ای سائن',
  meetings: 'اجلاس',
  schedule: 'شیڈول',
  speeches: 'تقاریر',
  press: 'پریس اور میڈیا',
  greetings: 'مبارکباد کارڈز',
  search: 'تلاش',
  extensions: 'کام ریکارڈ',
  people: 'عملہ ڈائریکٹری',
  audit: 'آڈٹ ڈیش بورڈ',
  ai: 'اے آئی معاون',
  guide: 'آپریٹر گائیڈ',
};

const strings: Record<Lang, Record<string, string>> = { en, ur };

export function t(lang: Lang, key: string) {
  return strings[lang][key] || strings.en[key] || key;
}

export function pageTitle(lang: Lang, page: string, role?: string) {
  if (page === 'overview' && role) {
    const keyed = t(lang, `overview_${role}`);
    if (keyed !== `overview_${role}`) return keyed;
  }
  if (page === 'directions' && role === 'SPECIAL_SECRETARY') {
    return t(lang, 'directions_SPECIAL_SECRETARY');
  }
  return t(lang, page);
}
