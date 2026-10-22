/** Protocol felicitation catalogue (served via GET /greetings/occasions). */
export type GreetingOccasion = {
  key: string;
  tag: string;
  title: string;
  titleUr: string;
  date: string;
  audience: string;
  defaultRecipient: string;
  defaultCount: number;
  defaultStyle: string;
  sampleEn: string;
  sampleUr: string;
};

export const GREETING_OCCASIONS: GreetingOccasion[] = [
  {
    key: 'eid-fitr-1447',
    tag: 'Religious Occasion',
    title: 'Eid-ul-Fitr 1447 AH',
    titleUr: 'عید الفطر مبارک',
    date: '2026-04-10',
    audience: 'All Dignitaries & Parliamentarians',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 470,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On the blessed occasion of Eid-ul-Fitr, the Speaker conveys heartfelt felicitations to the nation and the Muslim Ummah. May this day renew our commitment to compassion, unity and parliamentary harmony.',
    sampleUr:
      'عید الفطر کے بابرکت موقع پر اسپیکر قوم اور مسلم امہ کو دلی مبارکباد پیش کرتے ہیں۔ یہ دن رحمدلی، اتحاد اور پارلیمانی ہم آہنگی کے عزم کو تازہ کرے۔',
  },
  {
    key: 'pakistan-day-2026',
    tag: 'National Day',
    title: 'Pakistan Day (23rd March)',
    titleUr: 'یوم پاکستان',
    date: '2026-03-23',
    audience: 'Foreign Ambassadors & Governors',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 342,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'Warm felicitations on the historic occasion of Pakistan Day. Parliament renews its pledge to democratic values, federal harmony and the ideals of the Lahore Resolution.',
    sampleUr:
      'یوم پاکستان کے تاریخی موقع پر دلی مبارکباد۔ پارلیمان جمہوری اقدار، وفاقی ہم آہنگی اور قرارداد لاہور کے نظریات پر اپنے عہد کو تازہ کرتی ہے۔',
  },
  {
    key: 'independence-2026',
    tag: 'National Day',
    title: 'Independence Day (14th August)',
    titleUr: 'جشن آزادی پاکستان',
    date: '2026-08-14',
    audience: 'All National & Diplomatic Leadership',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps',
    defaultCount: 420,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On our auspicious Independence Day, Parliament honours the sacrifices of our founding forebears under Quaid-e-Azam Muhammad Ali Jinnah. May our democratic institutions grow ever resilient.',
    sampleUr:
      'یوم آزادی پر پارلیمان قائداعظم محمد علی جناح کی قیادت میں قربانیوں کو خراج تحسین پیش کرتی ہے۔ ہمارے جمہوری ادارے مزید مضبوط ہوں۔',
  },
  {
    key: 'constitution-2026',
    tag: 'Constitutional Day',
    title: 'Constitution Day (10th April)',
    titleUr: 'یوم دستور پاکستان',
    date: '2026-04-10',
    audience: 'Judiciary & Constitutional Dignitaries',
    defaultRecipient: 'Judiciary & Constitutional Dignitaries',
    defaultCount: 95,
    defaultStyle: 'DIPLOMATIC',
    sampleEn:
      'Commemorating Constitution Day, the custodian of the House honours the consensus-based 1973 Constitution as the sacred covenant upholding the rule of law and federal parliamentary democracy.',
    sampleUr:
      'یوم دستور پر ایوان کا محافظ دستورِ پاکستان ۱۹۷۳ کو قانون کی حکمرانی اور وفاقی پارلیمانی جمہوریت کے مقدس عہد کے طور پر خراجِ عقیدت پیش کرتا ہے۔',
  },
  {
    key: 'eid-azha-1447',
    tag: 'Religious Occasion',
    title: 'Eid-ul-Azha 1447 AH',
    titleUr: 'عید الاضحیٰ مبارک',
    date: '2026-06-17',
    audience: 'Parliamentarians & Muslim World Envoys',
    defaultRecipient: 'Federal Cabinet & Provincial Leadership',
    defaultCount: 175,
    defaultStyle: 'STATE_GOLD',
    sampleEn:
      'On Eid-ul-Azha, the Speaker conveys heartfelt felicitations on the spirit of sacrifice and brotherhood to the nation and the Islamic world.',
    sampleUr:
      'عید الاضحیٰ پر اسپیکر قربانی اور بھائی چارے کے جذبے پر قوم اور اسلامی دنیا کو دلی مبارکباد پیش کرتے ہیں۔',
  },
  {
    key: 'quaid-christmas-2026',
    tag: 'National & Religious Observance',
    title: 'Quaid-e-Azam Day & Christmas (25th December)',
    titleUr: 'یوم ولادت قائد اعظم اور کرسمس',
    date: '2026-12-25',
    audience: 'Parliamentarians, Christian Community & Diplomatic Corps',
    defaultRecipient: 'Parliamentarians & Diplomatic Corps, Federal Cabinet & Provincial Leadership',
    defaultCount: 427,
    defaultStyle: 'CONSTITUTIONAL',
    sampleEn:
      'Heartfelt greetings to our Christian brethren celebrating Christmas and warmest tributes to our Father of the Nation on his birth anniversary.',
    sampleUr:
      'کرسمس منانے والے مسیحی بھائیوں کو دلی مبارکباد اور قائداعظم یومِ ولادت پر خراجِ عقیدت۔',
  },
  {
    key: 'diplomatic-ny-2027',
    tag: 'Diplomatic Protocol',
    title: 'Diplomatic New Year 2027',
    titleUr: 'نئے سال کی سفارتی مبارکباد',
    date: '2027-01-01',
    audience: 'International Parliamentary Speakers & Envoys',
    defaultRecipient: 'Foreign Heads of Mission & Ambassadors',
    defaultCount: 128,
    defaultStyle: 'DIPLOMATIC',
    sampleEn:
      'The National Assembly of Pakistan conveys warm regards and best wishes for peace and parliamentary cooperation in the New Year.',
    sampleUr:
      'قومی اسمبلی پاکستان نئے سال پر امن اور پارلیمانی تعاون کی نیک تمنائیں پیش کرتی ہے۔',
  },
];
