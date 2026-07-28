import type { CSSProperties, ReactNode } from 'react';

/**
 * 占位插槽系统——把展示逻辑总框架的图目录固化为可视的、带状态的插槽。
 * 素材（摄影/视频/图/论文数据）确定后逐个替换，页面结构与论证链不再变动。
 * Modernist 皮肤（Case-Modernist 稿）：斜纹图框 .hatch、虚线占位 .placeholder-note、
 * 状态标 = .tag（可现产→outline，其余→neutral）。颜色走 class/style（LINKAGE_SPEC §5 条 1）。
 */

export type SlotStatus = '可现产' | '待集成' | '待拍摄' | '研究期后' | '待定' | 'M3 后挂入';

/** 案例页语言（MAPPING §11）；插槽只按它选状态签与固定词的字面，编号与版式不变。 */
export type SlotLang = 'en' | 'zh';

/** 状态签的英文字面取自 Case-Screens 稿（ready / to shoot / tbd / after study）。 */
const STATUS_EN: Record<SlotStatus, string> = {
  可现产: 'ready',
  待集成: 'to integrate',
  待拍摄: 'to shoot',
  研究期后: 'after study',
  待定: 'tbd',
  'M3 后挂入': 'after M3',
};

/**
 * 状态小签：稿里是纯文字（11px/700/0.1em 大写），不是 .tag 盒——迭代稿把 tag 盒退役
 * （MAPPING §6.1）。「可现产」= 稿的 ready/live，走 accent；其余走 n500。
 */
function StatusSign({ status, lang }: { status: SlotStatus; lang: SlotLang }) {
  const ready = status === '可现产';
  return (
    <span className={`fig-cap__status${ready ? ' fig-cap__status--ready' : ''}`}>
      {lang === 'zh' ? status : STATUS_EN[status]}
    </span>
  );
}

/** 图注行（稿）：Fig. NN + 说明 + 状态小签，baseline 对齐、gap 12。 */
export function FigCaption({
  id,
  desc,
  status,
  lang = 'en',
}: {
  id: string;
  desc?: string;
  status: SlotStatus;
  lang?: SlotLang;
}) {
  return (
    <figcaption className="fig-cap">
      <span>{id}</span>
      {desc && <span className="fig-cap__desc">{desc}</span>}
      <StatusSign status={status} lang={lang} />
    </figcaption>
  );
}

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

/**
 * 图插槽：斜纹图框（框内 = 要产出什么素材）+ 图注行（编号 + 说明 + 状态）。ratio 如 "700/520"。
 * 稿里框内标签与图注说明是两串不同的字（前者说"要拍什么"，后者说"这张图是什么"），
 * 故 desc 单独给——稿有 desc 的图照搬其原文，稿没给的（Fig.05/06/13）留空。
 */
export function FigSlot({
  id,
  caption,
  desc,
  status,
  ratio = '16/9',
  size,
  lang = 'en',
}: {
  id: string;
  caption: string;
  desc?: string;
  status: SlotStatus;
  ratio?: string;
  size?: SlotSize;
  lang?: SlotLang;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`}>
      <div className="hatch" style={{ aspectRatio: ratio }}>
        <span style={FRAME_LABEL}>{caption}</span>
      </div>
      <FigCaption id={id} desc={desc} status={status} lang={lang} />
    </figure>
  );
}

/**
 * 双图并置（稿 §04 里 Fig.05 / Fig.06 那一对）：grid 1fr 1fr · gap 24 · max-width 62ch，
 * 各自 4/3。两张互为佐证的小图并排读，比顺次铺两张全宽图省一屏。
 */
export function FigPair({ children }: { children: ReactNode }) {
  return (
    <div
      className="fig-pair"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 24,
        marginTop: 24,
        maxWidth: '62ch',
      }}
    >
      {children}
    </div>
  );
}

/** 视频插槽（SITE_SPEC §9：不自动播放；素材未产时为斜纹占位框）。 */
export function VideoSlot({
  id,
  caption,
  status,
  src,
  size,
  style,
  lang = 'en',
}: {
  id: string;
  caption: string;
  status: SlotStatus;
  src?: string;
  size?: SlotSize;
  style?: CSSProperties;
  lang?: SlotLang;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`} style={style}>
      {src ? (
        <video controls preload="metadata" className="w-full" src={src} />
      ) : (
        <div className="hatch" style={{ aspectRatio: '16/9' }}>
          <span style={FRAME_LABEL}>{id} · video</span>
        </div>
      )}
      <FigCaption id={id} desc={caption} status={status} lang={lang} />
    </figure>
  );
}

/** 交互件插槽（连杆 live）：有 children → 裱框（深色页里仍是浅纸底，稿）；无 → 斜纹占位。 */
export function InteractiveSlot({
  id,
  caption,
  status = 'M3 后挂入',
  size,
  children,
  lang = 'en',
}: {
  id: string;
  caption: string;
  status?: SlotStatus;
  size?: SlotSize;
  children?: ReactNode;
  lang?: SlotLang;
}) {
  return (
    <figure className={`my-8${sizeClass(size)}`}>
      {children ? (
        <div className="fig-live">{children}</div>
      ) : (
        <div className="hatch" style={{ aspectRatio: '700/520' }}>
          <span style={FRAME_LABEL}>{id} · interactive</span>
        </div>
      )}
      <FigCaption id={id} desc={caption} status={status} lang={lang} />
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
export function ProcessAside({ children, lang = 'en' }: { children: ReactNode; lang?: SlotLang }) {
  return (
    <aside
      style={{
        borderLeft: '3px solid var(--accent)',
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
        {lang === 'zh' ? '过程' : 'Process'}
      </div>
      {children}
    </aside>
  );
}

/**
 * 概念卡：卡题 = 当前语言那一侧的名字（另一侧的名字进卡身首位，双写保留），note 是正文。
 * 中英两个 MDX 各自写自己的 note，所以这里只管标题/副名的取用顺序。
 */
export function ConceptCard({
  zh,
  en,
  note,
  lang = 'en',
}: {
  zh: string;
  en?: string;
  note?: string;
  lang?: SlotLang;
}) {
  const title = (lang === 'zh' ? zh : en) ?? zh;
  const alt = lang === 'zh' ? en : zh;
  const fallback = note ?? '占位 · 卡片正文待作者撰写';
  const body = alt ? `${alt} — ${fallback}` : fallback;
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <p className="card-body">{body}</p>
    </div>
  );
}

/** 概念四卡网格：稿是 gap 1px + 发丝线底、无外框（分隔线由卡片间的 1px 缝隙露出）。 */
export function ConceptGrid({ children }: { children: ReactNode }) {
  return <div className="concept-grid my-8">{children}</div>;
}
