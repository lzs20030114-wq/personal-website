import Link from 'next/link';
import { SiteNav } from '../components/site/SiteNav';
import { SiteFooter } from '../components/site/SiteFooter';

// 404 在根布局（无 (site) 组），nav/footer 需自带。
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main>
        <div className="prose-col mono mb-24 mt-24 text-sm" style={{ color: 'var(--graphite)' }}>
          404 — <Link href="/">back to work</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
