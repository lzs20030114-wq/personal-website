import './case-dark.css';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { getRoutableWork, getRoutableWorkBySlug, type WorkEntry } from '../../../../src/lib/site/content';
import { OPENING_TITLE, extractChapterTitles } from '../../../../src/lib/site/case-headings';
import { BLOCK_UI } from '../../../../src/lib/site/case-reincarnation';
import {
  ConceptCard,
  ConceptGrid,
  FigPair,
  FigSlot,
  IntentNote,
  InteractiveSlot,
  ProcessAside,
  StatusSign,
  Todo,
  VideoSlot,
  type SlotLang,
} from '../../../../components/site/slots';
import { Pick } from '../../../../components/site/CaseLang';
import { CaseFooter } from '../../../../components/lab/LabShell';
import {
  Accent,
  ClosureCards,
  Interference,
  Lead,
  PartGrid,
  ResearchQuestion,
  StatusList,
  SystemLogic,
} from '../../../../components/site/case/CaseBlocks';
import { AgeingCurve } from '../../../../components/site/case/AgeingCurve';
import { CaseIndex } from '../../../../components/site/case/CaseIndex';
import { CaseReveal } from '../../../../components/site/case/CaseReveal';
import { LayersToggle } from '../../../../components/site/case/LayersToggle';
import { LifeCycle } from '../../../../components/site/case/LifeCycle';
import { PersonaBench } from '../../../../components/site/case/PersonaBench';
import { Predictions } from '../../../../components/site/case/Predictions';
import { SpecList } from '../../../../components/site/case/SpecList';
import { StatCompare } from '../../../../components/site/case/StatCompare';
import { LinkageFigure } from '../../../../components/linkage/LinkageFigure';
import { CaseHeroLive } from '../../../../components/site/CaseHeroLive';
import { CaseHeroSpace } from '../../../../components/site/CaseHeroSpace';
import { SkinSolidBench } from '../../../../components/lab/SkinSolidBench';
import { SkinBench } from '../../../../components/lab/SkinBench';
import { ArchBench } from '../../../../components/lab/ArchBench';
import { RingsBench } from '../../../../components/lab/RingsBench';
import { TentacleBench } from '../../../../components/lab/TentacleBench';
import { SkinSeriesBench } from '../../../../components/lab/SkinSeriesBench';
import { SquareRingBench } from '../../../../components/lab/SquareRingBench';
import { WorkInPreparation } from '../../../../components/site/WorkInPreparation';

export function generateStaticParams() {
  return getRoutableWork().map((w) => ({ slug: w.slug }));
}

/**
 * 作品路由只允许构建期列出的 slug（published + 四个主项目）；其余 draft/未知 slug
 * 不做按需渲染。四个主项目里未发稿的三个渲「筹备中」页（用户拍板 2026-07-29）。
 */
export const dynamicParams = false;

/** 去掉作者自留的方括号备注（如 "[summary 草案…]"），仅用于展示。 */
function cleanSummary(s: string): string {
  return s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) notFound();
  // 筹备中的页面没有正文，summary 还是「待盘点」占位——别把占位字当描述发出去，也别让它进索引
  if (entry.status !== 'published') {
    return {
      title: entry.title,
      description: 'In preparation — the case study for this project has not been published yet.',
      robots: { index: false, follow: true },
    };
  }
  return { title: entry.title, description: cleanSummary(entry.summary) };
}

/**
 * MDX 组件表按语言绑定：图注的状态签、Process 标签、概念卡题、各构件的双语数据都要跟着切。
 * 语言在服务端就定死在组件表里（两棵树各渲一次），插槽因此仍是服务端组件——
 * 不为了拿一个 lang 把整个插槽体系推成 client。交互构件（'use client'）同样吃这个 lang prop，
 * 所以只有当前语言那棵会挂载。
 */
const mdxComponents = (lang: SlotLang) => ({
  FigSlot: (p: ComponentProps<typeof FigSlot>) => <FigSlot {...p} lang={lang} />,
  FigPair,
  VideoSlot: (p: ComponentProps<typeof VideoSlot>) => <VideoSlot {...p} lang={lang} />,
  InteractiveSlot: (p: ComponentProps<typeof InteractiveSlot>) => (
    <InteractiveSlot {...p} lang={lang} />
  ),
  Todo: (p: ComponentProps<typeof Todo>) => <Todo {...p} lang={lang} />,
  IntentNote: (p: ComponentProps<typeof IntentNote>) => <IntentNote {...p} lang={lang} />,
  ProcessAside: (p: ComponentProps<typeof ProcessAside>) => <ProcessAside {...p} lang={lang} />,
  /**
   * 正文里的链接（2026-09-13）：指回 /archive 某一条日志的引用另给一个类，
   * 读作旁注不读作正文（.cs-cite）。锚点形状 = log-<日期>-<当日序号>，由 log-facets 的
   * withAnchors 现算——不能用 LogList 内部那个带全池下标的 id，那个一发新日志就会指到别的条目上。
   */
  a: ({ href, children, ...rest }: ComponentProps<'a'>) => {
    const cite = typeof href === 'string' && href.startsWith('/archive#log-');
    return (
      <a href={href} className={cite ? 'cs-cite' : undefined} {...rest}>
        {children}
      </a>
    );
  },
  ConceptCard: (p: ComponentProps<typeof ConceptCard>) => <ConceptCard {...p} lang={lang} />,
  ConceptGrid,

  /* ── 「10 Case 01」稿的正文构件（MAPPING §45）：开场 / 研究问题 / 组成 / 闭合规则 /
     生命周期 / 人格示意台 / 五层 / 数字对比 / 衰老曲线 / 系统逻辑 / 自干扰 / 现状 / 预测 / 参数。
     数据在 src/lib/site/case-reincarnation.ts（人格表、预测表、参数表与线上原文逐字一致）。 */
  Lead,
  Accent,
  ResearchQuestion: (p: ComponentProps<typeof ResearchQuestion>) => <ResearchQuestion {...p} lang={lang} />,
  PartGrid: () => <PartGrid lang={lang} />,
  ClosureCards: (p: ComponentProps<typeof ClosureCards>) => <ClosureCards {...p} lang={lang} />,
  LifeCycle: (p: ComponentProps<typeof LifeCycle>) => <LifeCycle {...p} lang={lang} />,
  PersonaBench: (p: ComponentProps<typeof PersonaBench>) => <PersonaBench {...p} lang={lang} />,
  LayersToggle: () => <LayersToggle lang={lang} />,
  StatCompare: () => <StatCompare lang={lang} />,
  AgeingCurve: (p: ComponentProps<typeof AgeingCurve>) => <AgeingCurve {...p} lang={lang} />,
  SystemLogic: (p: ComponentProps<typeof SystemLogic>) => <SystemLogic {...p} lang={lang} />,
  Interference: () => <Interference lang={lang} />,
  StatusList: () => <StatusList lang={lang} />,
  Predictions: () => <Predictions lang={lang} />,
  SpecList: () => <SpecList lang={lang} />,

  LinkageFigure,
  // 项目 II 正文里的活件：四种形态的立体带（Lab 2-2）。正文「空间本体」那节说的
  // 「缆长场决定网面形态、四种典型形态」，在引擎里就是每单元一个收缩自由度 ℓ；
  // 控制条收掉（正文里的图不该带一排按钮），要调去 /lab。
  SkinSolidFigure: () => (
    <SkinSolidBench
      controls={false}
      // 正文里的台架是深色仪表，框是稿的深色活件框；onLight 让台架自带深底与深色 token，
      // 不依赖外层是什么底（globals.css 记过 2026-07-27 的裸奔回归）
      onLight
      hud={
        lang === 'en'
          ? {
              kicker: 'Lab 2-2 / Project II',
              title: 'Four morphologies, one protocol',
              sub: 'Four bands · fabric 5 px · the same contraction run',
              hint: 'Each band locks its own bond map — see /lab to drive it',
              aria:
                'Four fabric bands contracting under one protocol; each bond map locks the surplus into a different morphology: pocket, bulb flange, straight ledge, stepped box.',
            }
          : {
              kicker: 'Lab 2-2 / Project II',
              title: '四种形态 · 同一收缩协议',
              sub: '四条带 · 织物厚度 5px · 同一次收缩',
              hint: '每条带按自己的键谱扣合——要动手调去 /lab',
              aria:
                '四条织物带在同一收缩协议下运行，各自的键谱把富余材料扣成不同形态：袋、蘑菇挑台、直挑台、阶梯方箱。',
            }
      }
    />
  ),
  // 「方法」那节讲的滞回（痕迹衰减比身体离场慢 ⇒ 形态不回退），在引擎里就是
  // **键锁定不可逆**：同一收缩协议下四张键谱各自扣出一种形态，松开也不还原。
  // Lab 2-1 是 2D 剖面、画的是 SVG，正文里最轻的一件。
  SkinUnitFigure: () => <SkinBench controls={false} onLight lang={lang} />,
  // 「行为条款与交互矩阵」那节要的是**形态的连续词汇**：十二条带的键谱逐级微变，
  // 从一种形态走到另一种。注意这是两张既有键谱的形态学串联（演示编排）——
  // 行为矩阵 → 键谱的翻译规则由作者手写，模型不代拟，图注也不许说成是它。
  // 开场取**分列**而不是 /lab 的并拢：并拢的默认机位是侧视，十二条带叠在深度上、
  // 前一条挡住后面的，读者又没有控制条可切——正文里必须一眼看见那条渐变。
  SkinArrayFigure: () => (
    <SkinSeriesBench controls={false} onLight lang={lang} plan="gradient" layout={1} />
  ),
  // 「技术实现」那节说的单元化 + 运动学可解：二十条同谱的带绕轴一圈，
  // 只解一条摆二十处，每条带挑出多远就决定了俯视的轮廓。
  SquareRingFigure: () => <SquareRingBench controls={false} onLight lang={lang} />,

  /* ── 项目 01 正文里的求解器活件（2026-09-13 重构指令 §5）────────────────────
     三台都是 7 月曲柄方案的求解器，实物 8 月改了驱动——**不重做台架**，按「当时的
     产物」嵌入，图注统一带日期与说明。控制条一律收掉（正文里的图不该带一排按钮），
     要动手去 /lab。
     整机那台**有意不嵌**（用户拍板 2026-09-13）：本页主图位已经在跑 MachineBench，
     正文再放一台就是同一台机器两个 WebGL 上下文，而且两者会抢同一个模块级 handoff
     槽（键名 'machine'，宽限期内两个实例都会去恢复主图的位形）。§6.5 末改为一句话
     指回页顶主图。 */
  // ArchBench 不带控制条（它本来就没有控件），故无 controls 可收
  ArchFigure: () => <ArchBench onLight lang={lang} />,
  RingsFigure: () => <RingsBench controls={false} onLight lang={lang} />,
  TentacleFigure: () => <TentacleBench controls={false} onLight lang={lang} />,
});

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } };

/** 页面框架字（正文之外的固定词）；正文两侧各自成文，不在这里。 */
const COPY = {
  en: {
    back: '← All work',
    kicker: (n: string) => `Case study ${n} / 04`,
    mRole: 'My role',
    mTools: 'Tools',
    mTime: 'Date',
    mStatus: 'Status',
    mCredits: 'Credits',
    aiK: 'AI disclosure · slot',
    aiX: 'The disclosure statement is written by the author following AI_DISCLOSURE.md; this is its fixed slot.',
    nextK: (n: string) => `Next case study · ${n} / 04`,
    footer: (n: string, t: string, y: string) => `Case study ${n} · ${t} · ${y}`,
    openLab: 'Open in the lab ↗',
  },
  zh: {
    back: '← 全部作品',
    kicker: (n: string) => `案例 ${n} / 04`,
    mRole: '我的角色',
    mTools: '工具',
    mTime: '时间',
    mStatus: '状态',
    mCredits: '协作',
    aiK: 'AI 披露 · 席位',
    aiX: '披露声明由作者按 AI_DISCLOSURE.md 流程撰写，此处为固定席位。',
    nextK: (n: string) => `下一个案例 · ${n} / 04`,
    footer: (n: string, t: string, y: string) => `案例 ${n} · ${t} · ${y}`,
    openLab: '在实验室中打开 ↗',
  },
} as const;

/**
 * hero / V.60 席位的题注是项目相关的框架字，按 slug 取——此前硬编码成项目 01 专属
 * （V.60 写着「生命周期」），项目 02 发布（2026-08-14）后会串台。
 * heroLive 只有主图被活台架顶替的项目才有；heroLab = 对应 /lab 台架编号（按钮直达）。
 */
type SlotCopy = {
  video: string;
  heroLabel: string;
  heroDesc: string;
  heroLive?: string;
  /** 主图的图号。默认 Fig. 01 / 图 01；项目 01 的图目录 2026-09-13 改为 N01–N20，故单独给。 */
  heroId?: string;
  /** 主图框里底部左侧的操作动词（活件没有控制条——「去实验室操作」才有）。 */
  heroVerb?: string;
  /** 主图图注的完整一句（稿 heroCap）。 */
  heroCap?: string;
};
const SLOT_COPY: Record<string, { lab?: string; en: SlotCopy; zh: SlotCopy }> = {
  'reincarnation-machine': {
    // 稿的动词写的是「拖动旋转」，但 Lab 1-5 整机台架按用户拍板（2026-07-29）**不挂拖拽、视角只由按钮控制**，
    // 主图位里更没有按钮——照稿写会说谎。改成这台实际上做的事 + 去哪操作。
    lab: '1-5',
    en: {
      video:
        'One full life cycle — birth, interaction, ageing, stop, blank — eight minutes compressed to ninety seconds. Does not autoplay.',
      heroLabel: 'machine hero photo · studio white sweep · B/W',
      heroDesc: 'The machine, full view',
      heroLive: '[stand-in] Lab 1-5 full assembly · live',
      heroId: 'N01',
      heroVerb: 'one shaft drives five rings · click a small arm · views and controls in the lab',
      heroCap: '[stand-in] Lab 1-5 full assembly · hero photo to shoot',
    },
    zh: {
      video: '一个完整生命周期：诞生、互动、衰老、停止、空白——约 8 分钟压缩到 90 秒。不自动播放。',
      heroLabel: '整机主照 · 影棚白弧扫 · 黑白',
      heroDesc: '整机全貌',
      heroLive: '[顶替] Lab 1-5 整机活件',
      heroId: 'N01',
      heroVerb: '一根中轴带动五个环 · 点一下小触手 · 视角与控制在实验室',
      heroCap: '[顶替] Lab 1-5 整机活件 · 整机主照待拍摄',
    },
  },
  'project-ii': {
    lab: '2-8',
    en: {
      video: 'Simulation video — the domestic human–cat scenario',
      heroLabel: 'hero image · to be supplied',
      heroDesc: 'Hero image',
      heroLive: '[stand-in] Lab 2-8 sixteen-ring floor · live',
      heroVerb: 'sixteen rings in a room, a 1.70 m figure for scale · controls in the lab',
      heroCap: '[stand-in] Lab 2-8 sixteen-ring floor · hero image to be supplied',
    },
    zh: {
      video: '仿真演示视频——居家人猫场景',
      heroLabel: '主图 · 待供图',
      heroDesc: '主图',
      heroLive: '[顶替] Lab 2-8 十六环场地活件',
      heroVerb: '一间房里十六个环，旁边一个 1.70 m 的人作比例 · 控制在实验室',
      heroCap: '[顶替] Lab 2-8 十六环场地活件 · 主图待供图',
    },
  },
};
/** 将来新发布的项目在补进 SLOT_COPY 前先落到中性兜底，不再借别的项目的题注。 */
const SLOT_COPY_FALLBACK: { lab?: string; en: SlotCopy; zh: SlotCopy } = {
  en: { video: 'Project video — to be supplied', heroLabel: 'hero image · to be supplied', heroDesc: 'Hero image' },
  zh: { video: '项目视频——待供', heroLabel: '主图 · 待供图', heroDesc: '主图' },
};

/** 「下一个案例」卡上的名字：项目 II 尚未定名，沿用主页卡片的描述名（home-model.ts 里同一处覆写，定名后一并删）。 */
const NEXT_TITLE: Record<string, { en: string; zh: string }> = {
  'project-ii': { en: 'Spatial simulation', zh: '空间模拟' },
};

/** 首屏元数据条（稿 dl）：我的角色 / 工具 / 时间 / 状态；状态一列只有写了 progress 的项目才有。 */
function HeroMeta({ entry, lang }: { entry: WorkEntry; lang: SlotLang }) {
  const c = COPY[lang];
  const zh = lang === 'zh';
  const role = (zh && entry.zh?.role) || entry.role;
  const tools = (zh && entry.zh?.tools) || entry.tools;
  const period = (zh && entry.zh?.period) || entry.period || entry.date.replace('-', '.');
  const progress = (zh && entry.zh?.progress) || entry.progress;
  const dots = ['var(--cs-am)', 'var(--cs-dim)', 'var(--cs-dim)'];
  return (
    <dl className="cs-meta" data-rv>
      <div>
        <dt>{c.mRole}</dt>
        <dd>
          {role.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </dd>
      </div>
      <div>
        <dt>{c.mTools}</dt>
        <dd>
          {(tools ?? ['—']).map((r) => (
            <span key={r}>{r}</span>
          ))}
        </dd>
      </div>
      <div>
        <dt>{c.mTime}</dt>
        <dd>{period}</dd>
      </div>
      {entry.credits && entry.credits.length > 0 ? (
        <div>
          <dt>{c.mCredits}</dt>
          <dd>
            {entry.credits.map((x) => (
              <span key={x.name}>
                {x.name} — {x.role}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
      {progress && progress.length > 0 ? (
        <div>
          <dt>{c.mStatus}</dt>
          <dd>
            {progress.map((x, i) => (
              <span className="cs-chip" key={x}>
                <i style={{ background: dots[Math.min(i, dots.length - 1)] }} />
                {x}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * case study（「10 Case 01 - Reincarnation Machine」稿，design-ref/case-01-dark，MAPPING §45）：
 * 整屏首屏（返回/案例号/状态 → 标题 + 双线尺 + 一句话 → 主图框）→ 元数据四列 →
 * 左目录栏（可收）+ 右正文 → V.60 视频席位 → AI 披露席位 → 下一个案例。
 * 仍由 frontmatter / 内容池 / MDX 驱动，只换渲染模板；顶栏（含中英切换与阅读进度）在布局层，页脚在本页。
 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) notFound();
  // 四个主项目里还没发稿的：同一条路由、同一套外壳，正文位换成「筹备中」框架字（不代写）
  if (entry.status !== 'published') return <WorkInPreparation entry={entry} />;

  const caseNo = String(entry.order ?? 1).padStart(2, '0');
  // 主图暂用活台架顶替的项目（作者供图后删掉对应的一支即回占位块）：
  // 项目 01 = Lab 1-5 整机（与主页预览位同一件）· 项目 II = Lab 2-8 4×4 环阵列
  // （九台里只有它带真实尺度——房、人、十六片吊在天花下的平台）
  const liveHero = slug === 'reincarnation-machine' || slug === 'project-ii';
  const sc = SLOT_COPY[slug] ?? SLOT_COPY_FALLBACK;
  const heroId = (l: SlotLang) => sc[l].heroId ?? (l === 'zh' ? '图 01' : 'Fig. 01');
  const year = entry.date.slice(0, 4);
  const nextOrder = (entry.order ?? 0) + 1;
  const next = getRoutableWork().find((w) => w.order === nextOrder);
  const nextTitle = (l: SlotLang) =>
    next ? NEXT_TITLE[next.slug]?.[l] ?? (l === 'zh' ? next.zh?.title ?? next.title : next.title) : '';
  const progress0 = (l: SlotLang) => (l === 'zh' ? entry.zh?.progress?.[0] : undefined) ?? entry.progress?.[0];

  const indexEn = [OPENING_TITLE.en, ...extractChapterTitles(entry.body)];
  const indexZh = [OPENING_TITLE.zh, ...extractChapterTitles(entry.bodyZh ?? entry.body)];

  return (
    <>
      {/* 深色底铺满视口；顶栏 / 语言上下文在布局层（LabLanguageRoot 对 /work 生效）。
          页面转场在根布局（MAPPING §48）：data-case-order 供「下一个案例」判断左右 */}
      <div className="ground-plane ld-ground" aria-hidden />
      <CaseReveal />
      <div className="cs pg-dark" data-case-order={entry.order ?? undefined}>
        <div className="cs-dots" aria-hidden style={{ top: -64 }} />

        <section className="cs-hero" data-screen-label={`Case ${caseNo} · hero`}>
          <div className="cs-hero__screen">
            <div className="cs-hero__row1" data-rv>
              <Link href="/#work" className="cs-back">
                <Pick en={COPY.en.back} zh={COPY.zh.back} />
              </Link>
              <span className="cs-hero__meta">
                <span>
                  <Pick en={COPY.en.kicker(caseNo)} zh={COPY.zh.kicker(caseNo)} />
                </span>
                {progress0('en') ? (
                  <span className="cs-state">
                    <i />
                    <Pick en={progress0('en')} zh={progress0('zh')} />
                  </span>
                ) : null}
              </span>
            </div>
            <div className="cs-hero__row2">
              <div className="cs-hero__lead">
                <h1 className="cs-title" data-rv>
                  <Pick en={entry.title} zh={entry.zh?.title ?? entry.title} />
                </h1>
                {/* 标题下的双线尺（稿）：上一条绿虚线行进（reduced-motion 停），下一条紫实线 150px */}
                <svg className="cs-rule" width="230" height="12" aria-hidden data-rv>
                  <line
                    data-dash
                    x1="0"
                    y1="4"
                    x2="230"
                    y2="4"
                    stroke="oklch(0.74 0.1 150)"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                    style={{ animation: 'dashmove 2.6s linear infinite' }}
                  />
                  <line x1="0" y1="10" x2="150" y2="10" stroke="oklch(0.72 0.095 291)" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="cs-lede" data-rv>
                <Pick
                  en={cleanSummary(entry.summary)}
                  zh={cleanSummary(entry.zh?.summary ?? entry.summary)}
                />
              </p>
            </div>

            {/* 主图框（稿 hero figure）：渐变底 + 暗角 + 顶线 + 四角标 + 框内标签；图注在框外。
                页面转场里它是共享元素（data-pt-frame = 框里那台台架的编号：点「在实验室中打开」时
                这个框飞到实验室那一格，MAPPING §48）。主图只能有一份活台架（两份 = 两个 WebGL 上下文），
                所以它不进 Pick，由一层客户端壳读语言上下文。首屏完整性由 .cs-hero__screen 的高度预算保证。 */}
            <figure className="cs-fig" data-rv>
              <div className="cs-stage" data-pt-frame={liveHero && sc.lab ? sc.lab : undefined}>
                {liveHero ? (
                  <div className="cs-stage__bench">
                    {/* 项目 01 临时主图 = Lab 1-5 整机活件（用户拍板 2026-07-27 先用活件顶上、07-29 从五环换成整机；
                        与主页预览位同一件）。作者供图后删掉本分支即回占位。
                        控制条不出：稿的主图框里没有控件、只有「去实验室操作」——点那里去 /lab 才有视角与部件开关。 */}
                    {slug === 'project-ii' ? <CaseHeroSpace /> : <CaseHeroLive />}
                  </div>
                ) : (
                  <div className="cs-stage__ph">
                    <Pick en={sc.en.heroLabel} zh={sc.zh.heroLabel} />
                  </div>
                )}
                <div className="cs-stage__vignette" />
                <span className="cs-corner cs-corner--tl" />
                <span className="cs-corner cs-corner--tr" />
                <span className="cs-corner cs-corner--bl" />
                <span className="cs-corner cs-corner--br" />
                <div className="cs-stage__top">
                  <span className="cs-id">
                    <Pick en={heroId('en')} zh={heroId('zh')} />
                    {sc.lab ? ` · LAB ${sc.lab}` : ''}
                  </span>
                  {liveHero ? (
                    <span className="cs-live">
                      <i />
                      <Pick en={BLOCK_UI.en.live} zh={BLOCK_UI.zh.live} />
                    </span>
                  ) : (
                    <Pick en={<StatusSign status="待拍摄" lang="en" />} zh={<StatusSign status="待拍摄" lang="zh" />} />
                  )}
                </div>
                {liveHero && sc.lab ? (
                  <div className="cs-stage__bot">
                    <span className="cs-stage__verb">
                      <Pick en={sc.en.heroVerb ?? ''} zh={sc.zh.heroVerb ?? ''} />
                    </span>
                    <Link href={`/lab#lab${sc.lab}`} className="cs-open" data-pt="frame">
                      <Pick en={COPY.en.openLab} zh={COPY.zh.openLab} />
                    </Link>
                  </div>
                ) : null}
              </div>
              <figcaption className="cs-figcap">
                <span>
                  <Pick en={heroId('en')} zh={heroId('zh')} />
                </span>
                <span>
                  <Pick
                    en={(liveHero && sc.en.heroCap) || sc.en.heroDesc}
                    zh={(liveHero && sc.zh.heroCap) || sc.zh.heroDesc}
                  />
                </span>
              </figcaption>
            </figure>
          </div>

          <Pick en={<HeroMeta entry={entry} lang="en" />} zh={<HeroMeta entry={entry} lang="zh" />} />
        </section>

        <div className="cs-layout">
          <CaseIndex en={indexEn} zh={indexZh} />

          <div className="cs-main">
            {/* 编号 section（CSS counter 作用于 .cs-body h2）——中英各一棵树，
                两棵都随 RSC 载荷发下来，只有当前语言那棵挂载。
                remark-gfm：正文里的表是 GFM 管道表，非 GFM 会原样吐出竖线。 */}
            <div className="cs-body">
              <Pick
                en={
                  <MDXRemote
                    source={entry.body}
                    components={mdxComponents('en')}
                    options={mdxOptions}
                  />
                }
                zh={
                  <MDXRemote
                    source={entry.bodyZh ?? entry.body}
                    components={mdxComponents('zh')}
                    options={mdxOptions}
                  />
                }
              />
            </div>

            <section className="cs-tail" data-screen-label={`Case ${caseNo} · tail`}>
              {/* 视频席位（frontmatter 提供 src 前为斜纹占位框，不自动播放） */}
              <Pick
                en={
                  <VideoSlot
                    id="V.60"
                    caption={sc.en.video}
                    status={entry.video ? '可现产' : '待拍摄'}
                    src={entry.video?.src}
                    lang="en"
                  />
                }
                zh={
                  <VideoSlot
                    id="V.60"
                    caption={sc.zh.video}
                    status={entry.video ? '可现产' : '待拍摄'}
                    src={entry.video?.src}
                    lang="zh"
                  />
                }
              />
              {/* AI 披露席位（SITE_SPEC §9：v1 留插槽，文字由作者按 AI_DISCLOSURE.md 流程撰写） */}
              <div className="cs-ai">
                <span>
                  <Pick en={COPY.en.aiK} zh={COPY.zh.aiK} />
                </span>
                <span>
                  <Pick en={COPY.en.aiX} zh={COPY.zh.aiX} />
                </span>
              </div>
              {next ? (
                <Link href={`/work/${next.slug}`} className="cs-next" data-pt="next">
                  <span>
                    <span className="cs-next__k">
                      <Pick
                        en={COPY.en.nextK(String(nextOrder).padStart(2, '0'))}
                        zh={COPY.zh.nextK(String(nextOrder).padStart(2, '0'))}
                      />
                    </span>
                    <span className="cs-next__t">
                      <Pick en={nextTitle('en')} zh={nextTitle('zh')} />
                    </span>
                  </span>
                  <span className="cs-next__arrow" aria-hidden>
                    →
                  </span>
                </Link>
              ) : null}
            </section>
          </div>
        </div>

        <CaseFooter
          labelEn={COPY.en.footer(caseNo, entry.title, year)}
          labelZh={COPY.zh.footer(caseNo, entry.zh?.title ?? entry.title, year)}
        />
      </div>
    </>
  );
}
