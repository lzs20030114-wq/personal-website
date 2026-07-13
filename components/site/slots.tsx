import type { ReactNode } from 'react';

/**
 * 占位插槽系统——把展示逻辑总框架的图目录固化为可视的、带状态的插槽。
 * 素材（摄影/视频/图/论文数据）确定后逐个替换，页面结构与论证链不再变动。
 * 颜色走 class/style（SVG/站点同守 LINKAGE_SPEC §5 条 1 的 var() 坑规矩）。
 */

export type SlotStatus = '可现产' | '待集成' | '待拍摄' | '研究期后' | '待定' | 'M3 后挂入';

function StatusChip({ status }: { status: SlotStatus }) {
  const isReady = status === '可现产';
  return (
    <span
      className="mono rounded-sm border px-1.5 py-0.5 text-[10px]"
      style={{
        color: isReady ? 'var(--trace-blue)' : 'var(--graphite)',
        borderColor: isReady ? 'var(--trace-blue)' : 'var(--hairline)',
      }}
    >
      {status}
    </span>
  );
}

/** 图宽三档（SITE_SPEC §8 v2）：inline = 正文列宽（默认）；wide = 正文 + 边缘列。 */
export type SlotSize = 'inline' | 'wide';

const sizeClass = (size?: SlotSize) => (size === 'wide' ? ' fig-wide' : '');

/** 图插槽：FIG 编号 + 说明 + 状态。ratio 如 "700/520"。 */
export function FigSlot({
  id,
  caption,
  status,
  ratio = '16/9',
  size,
}: {
  id: string;
  caption: string;
  status: SlotStatus;
  ratio?: string;
  size?: SlotSize;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`}>
      <div
        className="figframe flex items-center justify-center"
        style={{ aspectRatio: ratio }}
      >
        <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
          {id}
        </span>
      </div>
      <figcaption className="mono mt-2 flex items-baseline gap-2 text-xs">
        <span style={{ color: 'var(--ink)' }}>{id}</span>
        <span style={{ color: 'var(--graphite)' }}>{caption}</span>
        <StatusChip status={status} />
      </figcaption>
    </figure>
  );
}

/** 视频插槽（SITE_SPEC §9：不自动播放；素材未产时为占位框）。 */
export function VideoSlot({
  id,
  caption,
  status,
  src,
  size,
}: {
  id: string;
  caption: string;
  status: SlotStatus;
  src?: string;
  size?: SlotSize;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`}>
      {src ? (
        <video controls preload="metadata" className="w-full" src={src} />
      ) : (
        <div className="figframe flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
          <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
            {id} · video
          </span>
        </div>
      )}
      <figcaption className="mono mt-2 flex items-baseline gap-2 text-xs">
        <span>{id}</span>
        <span style={{ color: 'var(--graphite)' }}>{caption}</span>
        <StatusChip status={status} />
      </figcaption>
    </figure>
  );
}

/** 交互件插槽（连杆组件 M3 后挂入；静态兜底图与之并存——SITE_SPEC §6 双轨）。 */
export function InteractiveSlot({
  id,
  caption,
  status = 'M3 后挂入',
  size,
  children,
}: {
  id: string;
  caption: string;
  status?: SlotStatus;
  size?: SlotSize;
  children?: ReactNode;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`}>
      <div
        className={`figframe ${children ? '' : 'flex items-center justify-center border-dashed'}`}
        style={{ aspectRatio: '700/520', borderStyle: children ? undefined : 'dashed' }}
      >
        {children ?? (
          <span className="mono text-xs" style={{ color: 'var(--trace-blue)' }}>
            {id} · interactive
          </span>
        )}
      </div>
      <figcaption className="mono mt-2 flex items-baseline gap-2 text-xs">
        <span>{id}</span>
        <span style={{ color: 'var(--graphite)' }}>{caption}</span>
        <StatusChip status={status} />
      </figcaption>
    </figure>
  );
}

/** 意图占位：骨架的"每段一句话意图"可视化——明确标注非正文。 */
export function IntentNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mono my-5 border border-dashed p-3 text-xs leading-relaxed"
      style={{ borderColor: 'var(--hairline)', color: 'var(--graphite)' }}
    >
      <span style={{ color: 'var(--trace-blue)' }}>占位 · 正文待作者撰写</span> — {children}
    </div>
  );
}

/** 过程侧栏（评审明文要看 process——ADMISSIONS_RESEARCH §三.2）。 */
export function ProcessAside({ children }: { children: ReactNode }) {
  return (
    <aside
      className="my-6 border-l-2 pl-4 text-sm"
      style={{ borderColor: 'var(--hairline)', color: 'var(--graphite)' }}
    >
      <div className="mono mb-1 text-[10px] tracking-widest" style={{ color: 'var(--ink)' }}>
        PROCESS
      </div>
      {children}
    </aside>
  );
}

/** 概念卡（P1 的四张卡；正文由作者填，先渲染卡名与占位）。 */
export function ConceptCard({ zh, en, note }: { zh: string; en?: string; note?: string }) {
  return (
    <div className="border p-4" style={{ borderColor: 'var(--hairline)' }}>
      <div className="font-semibold">{zh}</div>
      {en && (
        <div className="mono mt-0.5 text-[11px]" style={{ color: 'var(--graphite)' }}>
          {en}
        </div>
      )}
      <div className="mono mt-2 text-xs" style={{ color: 'var(--graphite)' }}>
        {note ?? '占位 · 卡片正文待作者撰写'}
      </div>
    </div>
  );
}

export function ConceptGrid({ children }: { children: ReactNode }) {
  return <div className="my-8 grid gap-3 sm:grid-cols-2">{children}</div>;
}
