import type { CSSProperties, ReactNode } from 'react';

/**
 * 占位插槽系统——把展示逻辑总框架的图目录固化为可视的、带状态的插槽。
 * 素材（摄影/视频/图/论文数据）确定后逐个替换，页面结构与论证链不再变动。
 * Modernist 皮肤（Case-Modernist 稿）：斜纹图框 .hatch、虚线占位 .placeholder-note、
 * 状态标 = .tag（可现产→outline，其余→neutral）。颜色走 class/style（LINKAGE_SPEC §5 条 1）。
 */

export type SlotStatus = '可现产' | '待集成' | '待拍摄' | '研究期后' | '待定' | 'M3 后挂入';

/** 状态标：设计稿 tag 视觉形态——「可现产/ready/live」用 outline，其余用 neutral。 */
function StatusTag({ status }: { status: SlotStatus }) {
  const ready = status === '可现产';
  return <span className={`tag ${ready ? 'tag-outline' : 'tag-neutral'}`}>{status}</span>;
}

const CAP_ROW: CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};
const FRAME_LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
  textAlign: 'center',
  padding: '0 16px',
};

/** 图宽三档（SITE_SPEC §8 v2）：inline = 正文列宽（默认）；wide = 正文 + 边缘列。 */
export type SlotSize = 'inline' | 'wide';

const sizeClass = (size?: SlotSize) => (size === 'wide' ? ' fig-wide' : '');

/** 图插槽：斜纹图框（内含图说明）+ 题栏（编号 + 状态标）。ratio 如 "700/520"。 */
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
      <div className="hatch" style={{ aspectRatio: ratio }}>
        <span style={FRAME_LABEL}>{caption}</span>
      </div>
      <figcaption className="flex items-baseline gap-3" style={CAP_ROW}>
        <span>{id}</span>
        <StatusTag status={status} />
      </figcaption>
    </figure>
  );
}

/** 视频插槽（SITE_SPEC §9：不自动播放；素材未产时为斜纹占位框）。 */
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
        <div className="hatch" style={{ aspectRatio: '16/9' }}>
          <span style={FRAME_LABEL}>{id} · video</span>
        </div>
      )}
      <figcaption className="flex items-baseline gap-3" style={CAP_ROW}>
        <span>{id}</span>
        <span style={{ color: 'var(--n600)' }}>{caption}</span>
        <StatusTag status={status} />
      </figcaption>
    </figure>
  );
}

/** 交互件插槽（连杆 live）：有 children → 2px 墨边 + 纸底裱框；无 → 斜纹占位。SITE_SPEC §6 双轨。 */
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
      {children ? (
        <div style={{ border: '2px solid var(--ink)', background: 'var(--paper)' }}>{children}</div>
      ) : (
        <div className="hatch" style={{ aspectRatio: '700/520' }}>
          <span style={FRAME_LABEL}>{id} · interactive</span>
        </div>
      )}
      <figcaption className="flex items-baseline gap-3" style={CAP_ROW}>
        <span>{id}</span>
        <span style={{ color: 'var(--n600)' }}>{caption}</span>
        <StatusTag status={status} />
      </figcaption>
    </figure>
  );
}

/** 意图占位（Placeholder）：虚线框，明确标注非正文——保持占位形态（MAPPING §5.2）。 */
export function IntentNote({ children }: { children: ReactNode }) {
  return (
    <div className="placeholder-note my-6" style={{ maxWidth: '62ch' }}>
      <span style={{ fontWeight: 800, color: 'var(--accent)' }}>占位 · 正文待作者撰写</span> — {children}
    </div>
  );
}

/** 过程侧栏（评审明文要看 process）：左 4px accent 竖线 aside（Case-Modernist 稿）。 */
export function ProcessAside({ children }: { children: ReactNode }) {
  return (
    <aside
      style={{
        borderLeft: '4px solid var(--accent)',
        paddingLeft: 16,
        marginTop: 24,
        maxWidth: '62ch',
        fontSize: 13,
        color: 'var(--n700)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        Process
      </div>
      {children}
    </aside>
  );
}

/** 概念卡：英文名为卡题（站点英文优先），中文名 + 占位入卡身；.card 皮肤。 */
export function ConceptCard({ zh, en, note }: { zh: string; en?: string; note?: string }) {
  const title = en ?? zh;
  const fallback = note ?? '占位 · 卡片正文待作者撰写';
  const body = en ? `${zh} — ${fallback}` : fallback;
  return (
    <div className="card" style={{ gap: 6 }}>
      <div className="card-title">{title}</div>
      <p className="card-body">{body}</p>
    </div>
  );
}

/** 概念四卡网格：2px 墨色分隔（design 稿 gap:2px + ink 底）。 */
export function ConceptGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="my-8 grid grid-cols-1 sm:grid-cols-2"
      style={{ gap: 2, background: 'var(--ink)', border: '2px solid var(--ink)' }}
    >
      {children}
    </div>
  );
}
