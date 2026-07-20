import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource-variable/archivo';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Modernist 导航语法：通栏 2px 底线，品牌 800 重、链接主题化 hover */}
        <header className="rule2-b">
          <div className="sheet flex items-baseline justify-between py-5">
            {/* 占位：站名/姓名由作者定（SITE_SPEC：URL 简短可明文抄写） */}
            <Link href="/" className="text-lg font-extrabold no-underline">
              [NAME·占位]
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link href="/" className="nav-link no-underline">
                Work
              </Link>
              <Link href="/archive" className="nav-link no-underline">
                Archive
              </Link>
              <Link href="/about" className="nav-link no-underline">
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="pb-24">{children}</main>
        <footer className="rule2-t">
          <div className="sheet kicker py-8" style={{ color: 'var(--graphite)' }}>
            [email·占位] · no password, plain URLs
          </div>
        </footer>
      </body>
    </html>
  );
}
