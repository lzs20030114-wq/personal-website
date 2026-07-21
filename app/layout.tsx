import type { Metadata } from 'next';
// MAPPING §2：自托管 Archivo（可变字重 100–900）——不引 Google Fonts @import。
import '@fontsource-variable/archivo';
import './globals.css';
import { SiteNav } from '../components/site/SiteNav';
import { SiteFooter } from '../components/site/SiteFooter';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
