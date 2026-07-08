import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="prose-col mono mt-24 text-sm" style={{ color: 'var(--graphite)' }}>
      404 — <Link href="/">back to work</Link>
    </div>
  );
}
