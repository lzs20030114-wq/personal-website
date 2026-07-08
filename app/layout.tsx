import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sheet flex items-baseline justify-between py-6">
          {/* 占位：站名/姓名由作者定（SITE_SPEC：URL 简短可明文抄写） */}
          <Link href="/" className="mono text-sm no-underline tracking-wide">
            [NAME·占位]
          </Link>
          <nav className="mono flex gap-5 text-xs" style={{ color: 'var(--graphite)' }}>
            <Link href="/" className="no-underline">
              Work
            </Link>
            <Link href="/archive" className="no-underline">
              Archive
            </Link>
            <Link href="/about" className="no-underline">
              About
            </Link>
          </nav>
        </header>
        <main className="pb-24">{children}</main>
        <footer className="sheet hairline-t mono py-8 text-xs" style={{ color: 'var(--graphite)' }}>
          [email·占位] · no password, plain URLs
        </footer>
      </body>
    </html>
  );
}
