import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'National Assembly Secretariat',
  description: 'Official workspace — National Assembly Secretariat',
  icons: { icon: '/na-emblem-v4.png' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const langCookie = (await cookies()).get('gow_lang')?.value;
  const lang = langCookie === 'ur' ? 'ur' : 'en';
  const dir = lang === 'ur' ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir} className={lang === 'ur' ? 'lang-ur' : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Libre+Baskerville:wght@400;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
