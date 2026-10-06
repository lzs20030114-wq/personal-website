import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { AM, BL, BLOCK_UI, DIM, G } from '../../src/lib/site/case-reincarnation';

/**
 * 占位插槽系统——把展示逻辑总框架的图目录固化为可视的、带状态的插槽。
 * 素材（摄影/视频/图/论文数据）确定后逐个替换，页面结构与论证链不再变动。
 *
 * 皮肤 = 「10 Case 01」稿（design-ref/case-01-dark，MAPPING §45）：图框是斜纹占位 + 角标 + 左上编号 /
 * 右上状态（圆点 + 文字），图注是「编号 | 标题 + 副说明」两列；活件框是渐变底 + 内环 + 顶线 + 四角标。
 * 样式在 app/(site)/work/[slug]/case-dark.css（.cs-*）。这些插槽只被案例页模板消费。
 */

export type SlotStatus = '可现产' | '待集成' | '待拍摄' | '研究期后' | '待定' | 'M3 后挂入';

/** 案例页语言（MAPPING §11）；插槽只按它选状态签与固定词的字面，编号与版式不变。 */
export type SlotLang = 'en' | 'zh';

/** 状态签：圆点色 + 双语字面。字面与配色取自稿的 ST 表（ready / to shoot / pending / after study）。 */
const STATUS: Record<SlotStatus, { color: string; zh: string; en: string }> = {
  可现产: { color: G, zh: '可现产', en: 'Ready' },
  待拍摄: { color: AM, zh: '待拍摄', en: 'To shoot' },
  待定: { color: DIM, zh: '待定', en: 'Pending' },
  研究期后: { color: BL, zh: '研究期后', en: 'After study' },
  待集成: { color: DIM, zh: '待集成', en: 'To integrate' },
  'M3 后挂入': { color: DIM, zh: 'M3 后挂入', en: 'After M3' },
};

export function StatusSign({ status, lang }: { status: SlotStatus; lang: SlotLang }) {
  const s = STATUS[status];
  return (
    <span className="cs-stat">
      <i style={{ background: s.color }} />
      {s[lang]}
    </span>
  );
}

/** 图宽两档：inline = 640px（稿 figs 单图）；wide = 占满正文列。 */
export type SlotSize = 'inline' | 'wide';

/**
 * 图插槽（稿 figs 里的一张 figure）：
 * - 有 src：浅纸底 + `contain` 的真图（稿 `bg oklch(.97 .006 100)`）；
 * - 无 src：斜纹占位 + 框内居中的说明字（desc，缺省退回 caption）+ 左上/右下角标 + 顶行（编号｜状态）。
 * 图注两列：编号（44px）｜标题（caption）+ 副说明（有真图时才显示 desc——占位框里它已经在中间了）。
 */
export function FigSlot({
  id,
  caption,
  desc,
  status,
  ratio = '4/3',
  size,
  src,
  alt,
  lang = 'en',
}: {
  id: string;
  caption: string;
  desc?: string;
  status: SlotStatus;
  ratio?: string;
  size?: SlotSize;
  /**
   * 素材到位后填：`/log/…` 或 `/work/…` 下的静态图，填了就画真图、不再画斜纹框
   * （2026-09-13 加——此前插槽只会画占位框，连已经躺在仓库里的图也贴不上去）。
   */
  src?: string;
  /** src 存在时必给：读屏与裂图时唯一的信息来源。 */
  alt?: string;
  lang?: SlotLang;
}) {
  return (
    <figure className={`cs-figure${size === 'wide' ? ' cs-figure--wide' : ''}`}>
      <div className={`cs-figure__frame${src ? ' cs-figure__frame--shot' : ''}`} style={{ aspectRatio: ratio }}>
        {src ? (
          // 原生 img，与 /archive 的日志图同一做法：静态图不需要按尺寸重采样服务。
          <img className="cs-figure__img" src={src} alt={alt ?? caption} loading="lazy" decoding="async" />
        ) : (
          <>
            <div className="cs-figure__ph">{desc ?? caption}</div>
            <span className="cs-figure__c cs-figure__c--tl" />
            <span className="cs-figure__c cs-figure__c--br" />
            <div className="cs-figure__tag">
              <span className="cs-id">{id}</span>
              <StatusSign status={status} lang={lang} />
            </div>
          </>
        )}
      </div>
      <figcaption>
        <span className="cs-cap__id">{id}</span>
        <span className="cs-cap__t">
          <span className="cs-cap__cap">{caption}</span>
          {src && desc ? <span className="cs-cap__sub">{desc}</span> : null}
        </span>
      </figcaption>
    </figure>
  );
}

/** 并置的两张图（稿里一个 figs 块放多张时的两列网格）。 */
export function FigPair({ children }: { children: ReactNode }) {
  return <div className="cs-figs cs-figs--wide cs-figs--pair">{children}</div>;
}

/** 视频席位（稿尾段 V.60）：不自动播放；素材未产时是斜纹占位框 + 播放圈。 */
export function VideoSlot({
  id,
  caption,
  status,
  src,
  lang = 'en',
}: {
  id: string;
  caption: string;
  status: SlotStatus;
  src?: string;
  lang?: SlotLang;
}) {
  return (
    <figure className="cs-video">
      <div className="cs-video__frame">
        {src ? (
          <video controls preload="metadata" src={src} />
        ) : (
          <>
            <span className="cs-video__play" aria-hidden>
              ▶
            </span>
            <div className="cs-video__tag">
              <span>{id}</span>
              <StatusSign status={status} lang={lang} />
            </div>
          </>
        )}
      </div>
      <figcaption>
        <span>{id}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/**
 * 活件框（稿 lab 块）：渐变底 + 内环 + 绿色顶线 + 四角标；上条 = 编号 · 「活件」，下条 = 操作动词 +
 * 「去实验室操作 ↗」；台架本身放在两条之间，自带的 HUD（真实读数）保留。
 *
 * 有 children → 活件；无 → 斜纹占位。`paper`：2D 连杆（SVG、浅色配色封盘）要自己的纸面，
 * 在深色框里单独垫一块浅纸底（稿 Case-Screens 起一直是这个处理）。
 * `lab` 是对应 /lab 台架编号（如 '1-4'）——按钮直达 `/lab#lab1-4`；缺省不出按钮。
 */
export function InteractiveSlot({
  id,
  caption,
  status = 'M3 后挂入',
  verb,
  lab,
  paper,
  children,
  lang = 'en',
}: {
  id: string;
  caption: string;
  status?: SlotStatus;
  size?: SlotSize;
  verb?: string;
  lab?: string;
  paper?: boolean;
  children?: ReactNode;
  lang?: SlotLang;
}) {
  const ui = BLOCK_UI[lang];
  // 页面转场（MAPPING §48）：点「去实验室操作」时，台架画面这一块飞到实验室里它那一格。
  // data-pt-scope 圈出链接与画框同属一件；data-pt-frame 只在真有活件时挂（占位框没有可飞的东西）
  return (
    <figure className="cs-lab" data-pt-scope>
      <div className="cs-lab__frame">
        <span className="cs-lab__c cs-lab__c--tl" />
        <span className="cs-lab__c cs-lab__c--tr" />
        <span className="cs-lab__c cs-lab__c--bl" />
        <span className="cs-lab__c cs-lab__c--br" />
        <div className="cs-lab__top">
          <span className="cs-id">{id}</span>
          {children ? (
            <span className="cs-live">
              <i />
              {ui.live}
            </span>
          ) : (
            <StatusSign status={status} lang={lang} />
          )}
        </div>
        <div
          className={`cs-lab__stage${paper ? ' cs-lab__stage--paper' : ''}`}
          data-pt-frame={children && lab ? lab : undefined}
        >
          {children ?? <div className="cs-figure__ph" style={{ position: 'static', minHeight: 260 }}>{id} · live bench</div>}
        </div>
        <div className="cs-lab__bot">
          <span>{verb ?? ''}</span>
          {lab ? (
            <Link href={`/lab#lab${lab}`} data-pt="frame">
              {ui.toLab}
            </Link>
          ) : null}
        </div>
      </div>
      <figcaption className="cs-lab__cap">
        <span className="cs-cap__id">{id}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/**
 * 待补（稿 todo）：琥珀虚线框 + 「待补」小签。明确标注非正文——保持占位形态（MAPPING §5.2），
 * 作者的待办一律走它，模型不代填。
 */
export function Todo({ children, lang = 'zh' }: { children: ReactNode; lang?: SlotLang }) {
  return (
    <div className="cs-todo">
      <span className="cs-todo__tag">{BLOCK_UI[lang].todo}</span>
      <div>{children}</div>
    </div>
  );
}
/** 旧名保留：MDX 里的 IntentNote 就是 Todo。 */
export const IntentNote = Todo;

/**
 * 过程 · 参照（稿 aside）：紫色小签 + 参照说明；`pend` 是琥珀色的待补句（稿里与正文分两行）。
 */
export function ProcessAside({
  children,
  pend,
  lang = 'en',
}: {
  children: ReactNode;
  pend?: string;
  lang?: SlotLang;
}) {
  return (
    <aside className="cs-aside">
      <span className="cs-aside__k">{BLOCK_UI[lang].process}</span>
      {children}
      {pend ? <p className="cs-aside__pend">{pend}</p> : null}
    </aside>
  );
}

/**
 * 概念卡（稿 concepts）：编号（CSS counter）｜大标题 = 当前语言那一侧的名字，副题 = 另一侧的名字（mono）｜正文。
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
  const big = (lang === 'zh' ? zh : en) ?? zh;
  const small = lang === 'zh' ? en : zh;
  return (
    <div className="cs-concept">
      <span className="cs-concept__t">
        <span className="cs-concept__big">{big}</span>
        {small ? <span className="cs-concept__small">{small}</span> : null}
      </span>
      <p>{note ?? '占位 · 卡片正文待作者撰写'}</p>
    </div>
  );
}

/** 概念卡网格：稿是 gap 1px + 发丝线底、无外框（分隔线由卡片间的 1px 缝隙露出）。 */
export function ConceptGrid({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="cs-concepts" style={style}>
      {children}
    </div>
  );
}
