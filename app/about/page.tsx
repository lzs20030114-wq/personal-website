import { DisclosureSlot } from '../../components/site/RoleBlock';

export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <div className="prose-col">
      <h1 className="mono mt-10 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
        ABOUT
      </h1>
      <p className="mono mt-6 border border-dashed p-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--graphite)' }}>
        占位 · about 正文由作者撰写（背景、方法、联系方式）。
      </p>
      <DisclosureSlot />
    </div>
  );
}
