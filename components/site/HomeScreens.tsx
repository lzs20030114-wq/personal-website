'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StageRotator } from '../lab/StageRotator';
import { MachineBench } from '../lab/MachineBench';
import { snapshotCanvas } from '../lab/snapshot';
import { coverRect, flipCss, flipTransform } from '../../src/lib/site/flip';

/**
 * 主页整屏分幕（design-ref/Home-Screens.dc.html 落地，MAPPING §6；2026-07-26 迭代稿同步）。
 * 三幕：S0 枢纽（卡片组 + 预览舞台）/ S1 About（深色渐变幕）/ S2 Lab+Log+页脚。
 * 分页引擎 = 接管 wheel/touch 的阻力翻页；引擎与光标层仅桌面 + 非 reduced-motion 生效，
 * 其余回落常规文档流（幕 minHeight 100svh，原生滚动）。
 * Stage 待机位 = 四台 Lab 台架顺序轮播 StageRotator（用户 2026-07-27 拍板；此前空占位→单台四杆）。
 * 页面转场 goPT = 迭代稿「媒体块生长 + 遮罩淡入」的 SPA 适配（router.push + body 挂载 + 定时淡出）。
 */

// Tweaks 开关（设计稿 props → 构建期常量，MAPPING §6）
// staggerFx = 翻幕到位后的幕内 stagger + 扫光：迭代稿已把边框闪改为斜向扫光并保留编排，
// 但 2026-07-24 用户真机拍板「翻幕后静置」仍然有效——代码按新稿移植、默认关；启用只翻此常量。
const FX = {
  pagingFeel: true,
  hoverPeek: true,
  entrance: true,
  staggerFx: false,
  stageFx: true,
  cursorReadout: true,
  railFlip: true,
} as const;

// ---- 手感标定项（分页引擎参数，用户拍板对象——原样移植，不改数值）----
const COMMIT_DIST = 360;
const FLICK_V = 140;
const COMMIT_P = 0.5;
const PUSH_MS = 620;
// 直飞转场（/work/*）跳页前：底板从预览块的框展开到铺满视口的时长，铺满即 push。
// 调大 = 展开看得更清楚、但飞之前等更久；调小 = 更利落、但展开会显得赶。
const EXPAND_MS = 380;
const LOCK_TAIL = 160;
const SILENCE = 200;
const PAUSE_SNAP = 120;
const SPRING_MS = 280;
const MAX_PEEK = 0.1;
const TOUCH_COMMIT = 0.18;
const RETURN_DELAY = 300;
// ----------------------------------

const EASE = 'cubic-bezier(0.2,0.7,0.2,1)';
const MICRO = 180;
const STRUCT = 520;
const STAG = 50;

// 迭代稿深色渐变段（稿内字面值，非 token；PT_BG 与 S1 幕底同款）
const PT_BG =
  'linear-gradient(160deg,oklch(0.27 0.052 200) 0%,oklch(0.24 0.048 232) 55%,oklch(0.26 0.052 282) 100%)';
const FOOT_GRAD =
  'linear-gradient(104deg,oklch(0.3 0.062 196) 0%,oklch(0.26 0.058 232) 55%,oklch(0.28 0.062 285) 100%)';
// S0/S2 网格衬底（72px 制图网格）
const GRID_BG =
  'repeating-linear-gradient(to right,oklch(0.235 0.025 215 / 0.07) 0 1px,transparent 1px 72px),repeating-linear-gradient(to bottom,oklch(0.235 0.025 215 / 0.07) 0 1px,transparent 1px 72px),var(--paper)';
// S1 深色幕上的正文色与发丝线（稿内字面值）
const S1_BODY = 'oklch(0.84 0.045 160)';
const HAIR_LIGHT = '1px solid oklch(0.95 0.032 120 / 0.25)';
// 卡片顶部色刻度（稿内节奏：绿 / 灰 / 灰 / 紫）
const TICKS = ['var(--g500)', 'var(--n300)', 'var(--n300)', 'var(--p300)'];

export interface HomeWork {
  title: string;
  slug: string;
  date: string;
  published: boolean;
  /** 内容池 summary（= 案例页 lede 同一句），供稿后顶掉预览位的 thesis 占位 */
  summary: string;
}

// Lab 八卡（文案照搬 Home-Screens 稿；链接改指站内 /lab 台架页，MAPPING §6.3；
// 2026-07-29 加 Lab.05，网格随之 4 列→5 列（用户：卡片后续再优化，先把新的加进来）；
// 2026-08-18 加 Lab.06（项目二第一台，皮肤单元引擎），网格 5 列→6 列——顺带结清
// 「小屏两列时 5 张有一张单行」的待优化项（6 张两列正好铺满）；
// bar/hover = 迭代稿按内核家族双色编码：SVG=绿、WebGL=紫）
const LABS = [
  {
    kicker: 'Lab.01',
    title: 'Four-bar linkage',
    body: '2D PBD testbench — the kernel behind Fig. 01.',
    meta: '36 tests · SVG',
    href: '/lab#lab01',
    bar: 'var(--g500)',
    hover: 'var(--g100)',
    kickerColor: 'var(--accent)',
  },
  {
    kicker: 'Lab.02',
    title: 'Arch ring solver',
    body: 'Angulated scissor arch + crank-slider, from the S4 ring.',
    meta: 'Kernel untouched · SVG',
    href: '/lab#lab02',
    bar: 'var(--g700)',
    hover: 'var(--g100)',
    kickerColor: 'var(--accent)',
  },
  {
    kicker: 'Lab.03',
    title: 'Tendon tentacle',
    body: '16 vertebrae, three tendons at 120° — full 3D kernel.',
    meta: 'Orbit camera · WebGL',
    href: '/lab#lab03',
    bar: 'var(--p500)',
    hover: 'var(--p100)',
    kickerColor: 'var(--accent-2)',
  },
  {
    kicker: 'Lab.04',
    title: 'Five-ring shell',
    body: 'S1–S5 ring family choreography — a breathing body.',
    meta: 'Calibrated stops · WebGL',
    href: '/lab#lab04',
    bar: 'var(--p700)',
    hover: 'var(--p100)',
    kickerColor: 'var(--accent-2)',
  },
  {
    kicker: 'Lab.05',
    title: 'Full assembly',
    body: 'One shaft opens and closes five rings; the arm curls on three tendons.',
    meta: 'Real solids · WebGL',
    href: '/lab#lab05',
    bar: 'var(--p700)',
    hover: 'var(--p100)',
    kickerColor: 'var(--accent-2)',
  },
  {
    kicker: 'Lab.06',
    title: 'Contractile skin',
    body: "Four bond maps under one contraction — Project II's structure engine.",
    meta: 'Python parity · SVG',
    href: '/lab#lab06',
    bar: 'var(--g600)',
    hover: 'var(--g100)',
    kickerColor: 'var(--accent)',
  },
  {
    kicker: 'Lab.07',
    title: 'Skin, solid',
    body: 'The same four units extruded into fabric bands — orbit them in space.',
    meta: 'Shared 3D rig · WebGL',
    href: '/lab#lab07',
    bar: 'var(--p500)',
    hover: 'var(--p100)',
    kickerColor: 'var(--accent-2)',
  },
  {
    kicker: 'Lab.08',
    title: 'Gradient array',
    body: 'Twelve narrow bands morph bulb into box — every band runs the engine.',
    meta: '12 live units · WebGL',
    href: '/lab#lab08',
    bar: 'var(--p700)',
    hover: 'var(--p100)',
    kickerColor: 'var(--accent-2)',
  },
];

// Work log 预览三条：2026-07-27 起改接内容池最新三条（此前为 Home 稿硬编码字面，
// 会与 /archive 脱节）。主页恒为英文——中英切换是 Log 页专属（MAPPING §5.2 修订）。
export interface HomeLog {
  date: string;
  text: string;
}

// 统计条（MAPPING §4：当前实测测试数，硬编码，发版时人工更新——2026-08-19 vitest 实测 314；
// 迭代稿配色：Tests=绿 700、Kernels=紫 700、Demos=绿 600）
const STATS = [
  { n: '04', label: 'Projects', color: 'var(--ink)' },
  { n: '314', label: 'Tests green', color: 'var(--accent)' },
  { n: '03', label: 'Solver kernels', color: 'var(--accent-2)' },
  { n: '08', label: 'Live demos', color: 'var(--g600)' },
];

const UPPER_11: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const LINK_11: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--accent)',
};
const SCREEN_H2: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};
const CELL_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 4,
};
// 小标签（迭代稿：tag 盒退役，改纯文字小签）
const MINI_TAG: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n500)',
};
const SECTION_BASE: CSSProperties = {
  minHeight: '100svh',
  background: 'var(--paper)',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};
// 翻幕扫光层（迭代稿新形态；仅 staggerFx 开启时被 enter() 点亮）
const FLASH_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  pointerEvents: 'none',
  background:
    'linear-gradient(100deg,transparent 16%,oklch(0.71 0.098 145 / 0.5) 46%,oklch(0.71 0.095 291 / 0.4) 62%,transparent 86%)',
};

/** 点阵叠加层（透明度/遮罩/点色逐处不同，稿内字面值） */
function Dots({ mask, opacity, color }: { mask: string; opacity: number; color?: string }) {
  return (
    <div
      className="om-dots"
      style={{
        opacity,
        WebkitMaskImage: mask,
        maskImage: mask,
        ...(color ? { backgroundImage: `radial-gradient(${color} 1px, transparent 1.2px)` } : {}),
      }}
    />
  );
}

/** 颗粒叠加层 */
function Grain({ opacity, blend = 'overlay' }: { opacity: number; blend?: CSSProperties['mixBlendMode'] }) {
  return <div className="om-grain" style={{ opacity, mixBlendMode: blend }} />;
}

/** 舞台媒体块（深色渐变 + 点阵 + 颗粒；data-ptm = goPT 转场克隆源） */
function StageMedia({
  maskDeg,
  grain,
  children,
  style,
}: {
  maskDeg: number;
  grain: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div data-ptm className="om-media" style={style}>
      <Dots mask={`linear-gradient(${maskDeg}deg,#000 0%,transparent 55%)`} opacity={0.3} />
      <Grain opacity={grain} />
      {children}
    </div>
  );
}

/**
 * 舞台面板 Role/Tools 格的紧凑串（格宽有限，frontmatter 原文太长，按供稿手工压缩）。
 * 有条目 = 该项目已供稿：thesis 位显示内容池 summary。此前用 index===0 判断，
 * 项目 02 供稿（2026-08-14）后不再只有项目 01。
 */
const STAGE_CELLS: Record<string, { role: string; tools: string }> = {
  'reincarnation-machine': {
    role: 'Solo — concept · mechanism · electronics · HRI study',
    tools: 'Rhino / GH · scikit-fem · FDM / SLS · ESP32 · ELAN',
  },
  'project-ii': {
    role: 'Concept · system design · behavioral algorithms · implementation',
    tools: 'Python / NumPy · Matplotlib · Blender / GH · p5.js / three.js',
  },
};

function StagePlaceholderPanel({
  work,
  index,
  active = false,
}: {
  work: HomeWork;
  index: number;
  active?: boolean;
}) {
  // 四项目版式完全同等（红线）；未供稿的项目正文位仍是 [待作者供稿] 占位，不代写。
  const cells = STAGE_CELLS[work.slug];
  const supplied = Boolean(cells);
  // 预览主图的活台架仍只有项目 01（Lab.05 顶替；项目 02 未供图，主图位保持占位）
  const liveMedia = index === 0;
  return (
    <>
      {supplied ? (
        // 供稿后 thesis 位是正文不是占位：撤掉虚线框，走正常字号（内容池 summary 唯一来源）
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--n800)' }}>
          {work.summary}
        </p>
      ) : (
        <div
          style={{
            border: '1px dashed oklch(0.58 0.105 158 / 0.5)',
            padding: '9px 13px',
            fontSize: 12,
            color: 'var(--n700)',
          }}
        >
          <span style={{ fontWeight: 800, color: 'var(--accent)' }}>[待作者供稿]</span> thesis
          一句话。
        </div>
      )}
      {liveMedia ? (
        // 项目 01 临时主图 = Lab.05 整机台架（用户拍板 2026-07-27 先用活件顶上，
        // 07-29 从 Lab.04 五环换成整机——与案例页主图同一件，见 CaseHeroLive）；
        // data-ptm 让它同时是 goPT 转场的克隆源。作者供图后换回 StageMedia。
        <div
          data-ptm
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <MachineBench active={active} controls={false} onLight />
        </div>
      ) : (
        <StageMedia
          maskDeg={150}
          grain={0.14}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              position: 'relative',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--g200)',
            }}
          >
            [待作者供稿] 主图 · duotone
          </span>
        </StageMedia>
      )}
      <div className="grid grid-cols-2" style={{ borderTop: 'var(--hair)' }}>
        <div style={{ padding: '9px 13px 0 0', borderRight: 'var(--hair)' }}>
          <div style={{ ...CELL_LABEL, marginBottom: 3 }}>Role</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--n700)' }}>
            {cells ? cells.role : '[待作者供稿]'}
          </div>
        </div>
        <div style={{ padding: '9px 0 0 13px' }}>
          <div style={{ ...CELL_LABEL, marginBottom: 3 }}>Tools</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--n700)' }}>
            {cells ? cells.tools : '[待作者供稿]'}
          </div>
        </div>
      </div>
      {/* 四个项目一律进各自的 /work/[slug]（用户拍板 2026-07-29）——未发稿的那三个
          落到「筹备中」页，不再统一甩去 /archive。状态签仍保留，别让人以为点进去有正文。 */}
      {work.published ? (
        <a
          data-pt
          href={`/work/${work.slug}`}
          style={{
            alignSelf: 'flex-start',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            color: 'var(--accent)',
            borderBottom: '1px solid var(--g500)',
            paddingBottom: 2,
          }}
        >
          Open case study →
        </a>
      ) : (
        <div className="flex items-baseline" style={{ gap: 14 }}>
          <span style={MINI_TAG}>In preparation</span>
          <a data-pt href={`/work/${work.slug}`} style={LINK_11}>
            Project page →
          </a>
        </div>
      )}
    </>
  );
}

export function HomeScreens({ works, logs }: { works: HomeWork[]; logs: HomeLog[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 当前舞台面板（0 = 待机轮播，1..4 = 项目预览）——用于给面板内的活台架做 active 门控
  const [panel, setPanel] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const offs: Array<() => void> = [];
    const on = (el: EventTarget, ev: string, fn: EventListener, opt?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn, opt);
      offs.push(() => el.removeEventListener(ev, fn, opt));
    };
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fxEntrance = FX.entrance && !reduced;
    const fxStagger = FX.staggerFx && !reduced;
    const fxStage = FX.stageFx && !reduced;
    const fxCursor = FX.cursorReadout && !reduced && window.matchMedia('(hover: hover)').matches;
    const fxRail = FX.railFlip && !reduced;
    const hoverPeek = FX.hoverPeek;
    const wantPaging = FX.pagingFeel && !reduced;

    const N = 2;
    const vp = $('vp');
    const track = $('track');
    const s2el = $('s2');
    const railEl = $('rail');
    const prog = $('prog');
    const pFig = $('pFig');
    const chip = $('figChip');
    const lbl = $('stageLbl');
    const cardsBox = $('cards');
    const aboutLink = $('aboutLink');
    const secs = ['s0', 's1', 's2'].map((id) => $(id));
    if (!vp || !track || !s2el || !railEl || !pFig || !chip || !lbl || !cardsBox || !aboutLink) return;
    if (secs.some((s) => !s)) return;
    const sections = secs as HTMLElement[];
    const flashes = sections.map((s) => s.querySelector<HTMLElement>('[data-flash]'));
    const railItems = Array.from(railEl.querySelectorAll<HTMLElement>('[data-rail]'));
    const panels = [pFig, ...works.map((_, i) => $(`wp${i + 1}`))].filter(Boolean) as HTMLElement[];
    const cards = works.map((_, i) => $(`c${i + 1}`)).filter(Boolean) as HTMLElement[];
    const lblTxt = [
      'Stage — Lab 台架轮播',
      ...works.map((w, i) => `Preview — ${String(i + 1).padStart(2, '0')} ${w.title}`),
    ];

    let engine = false;
    let cur = 0;
    let small = false;
    const H = () => vp.clientHeight;
    const W = () => vp.clientWidth;
    const setTrack = (y: number, ms: number) => {
      track.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      track.style.transform = `translate3d(0,${y}px,0)`;
    };
    // S2 从右侧水平推入（s1↔s2 为横向转场，设计稿原样）
    const setS2 = (x: number, ms: number) => {
      s2el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      s2el.style.transform = `translate3d(${x}px,0,0)`;
    };
    const setRail = (n: number) =>
      railItems.forEach((it, i) => {
        const bar = it.querySelector<HTMLElement>('[data-rbar]');
        const num = it.querySelector<HTMLElement>('[data-rnum]');
        if (bar) {
          bar.style.background = i === n ? 'var(--g500)' : 'var(--n300)';
          bar.style.width = i === n ? '22px' : '14px';
        }
        if (num) {
          num.style.color = i === n ? 'var(--accent)' : 'var(--n500)';
          if (i === n && fxRail)
            num.animate(
              [
                { transform: 'translateY(60%)', opacity: 0 },
                { transform: 'translateY(0)', opacity: 1 },
              ],
              { duration: MICRO, easing: EASE },
            );
        }
        if (prog && i === n) prog.style.transform = `scaleX(${(n + 1) / (N + 1)})`;
      });
    /**
     * 引擎态把非当前幕整体摘出可交互树。屏幕外的链接若还能 Tab 进去，浏览器为了让
     * 焦点可见会去滚 #vp——而这个位移 transform 引擎既不知道也还原不了：实测停在 S0
     * 连按 Tab，第 14 次 scrollTop 就被顶到 484，第 20 次 scrollLeft 到 1440，纵横都歪，
     * 除了刷新没有任何交互能救回来。文档流态（<1024 / reduced-motion）不加，那时三幕
     * 本来就该全部可达。
     */
    const setInert = (n: number) =>
      sections.forEach((sec, i) => {
        if (engine && i !== n) sec.setAttribute('inert', '');
        else sec.removeAttribute('inert');
      });
    /**
     * 不变量兜底：引擎态下 #vp 完全由 transform 驱动，**任何真实滚动都是异常**，
     * 归零即可——没有哪个合法状态需要 #vp 自己滚。
     *
     * 为什么 inert 之后还要这一层：inert 挡住的是「焦点进入非当前幕」这条路，但翻幕途中
     * 目标幕已经 live、transform 却还在移动，以及横向停放的幕会给容器留出滚动溢出区，
     * 这些窗口仍能让浏览器为「让焦点可见」滚一下容器。实测到过 scrollLeft=949 的偶发，
     * 按相位复现失败——说明触发路径比单一窗口更刁钻。与其继续猜触发条件，不如守住
     * 不变量本身：这样无论哪条路径把它顶歪，下一帧都自己回正。
     */
    on(vp, 'scroll', () => {
      if (!engine) return;
      if (vp.scrollTop !== 0) vp.scrollTop = 0;
      if (vp.scrollLeft !== 0) vp.scrollLeft = 0;
    });
    // 翻幕编排（迭代稿：斜向扫光 + 幕内 stagger）——staggerFx 默认关（07-24 真机拍板），enter 即空转。
    const enter = (i: number) => {
      if (!fxStagger) return;
      flashes[i]?.animate(
        [
          { opacity: 0, transform: 'translateX(-16%)' },
          { opacity: 1, transform: 'translateX(0)', offset: 0.45 },
          { opacity: 0, transform: 'translateX(16%)' },
        ],
        { duration: 460, easing: EASE },
      );
      sections[i].querySelectorAll<HTMLElement>('[data-row]').forEach((row, k) =>
        row.animate(
          [
            { opacity: 0, transform: 'translateY(12px)', clipPath: 'inset(0 0 100% 0)' },
            { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 -10% 0)' },
          ],
          { duration: STRUCT, delay: k * STAG, easing: EASE, fill: 'backwards' },
        ),
      );
    };

    // ---------- 页面转场 goPT（迭代稿 MPA 版的 SPA 适配） ----------
    // 稿内：veil 淡入 + 视口缩放模糊 + 媒体块克隆生长 → location.href；目标页以 sessionStorage
    // 交接 om-veil 开场淡出。SPA 下文档不重载：节点挂 body（组件卸载后仍在），router.push 完成
    // 客户端渲染后定时淡出移除；四个目标路由挂载时预取，push 即时。
    let ptBusy = false;
    /**
     * 带修饰键 / 非左键的点击是「在别处打开」，不是「在本页跳转」——转场必须让路，
     * 交回浏览器原生行为，否则 ⌘/Ctrl-click 开新标签会被吃成当场跳走。
     * 卡片与舞台链接共用（BackTransition 里是同一套判据）。
     */
    const modifiedClick = (e: Event): boolean => {
      const me = e as MouseEvent;
      return (
        me.defaultPrevented ||
        me.button !== 0 ||
        me.metaKey ||
        me.ctrlKey ||
        me.shiftKey ||
        me.altKey
      );
    };
    const goPT = (href: string, fromEl: HTMLElement | null) => {
      if (ptBusy) return;
      if (reduced) {
        router.push(href);
        return;
      }
      ptBusy = true;
      // 深色目标（case/archive）交接给目标页 PageEnter 播放揭开进入段；
      // 写一次性标记 + 媒体块底色，供着陆平面同族续接。
      const isDark = /^\/(work\/|archive)/.test(href);
      // 直飞 = 目标页有 hero 落点（只有 case 页有）：预览块钉在原位跳页，落地后一次飞到主图位。
      // 其余路由没地方可落，仍走稿内的「生长铺满」。
      const direct = /^\/work\//.test(href);
      const bg = fromEl ? getComputedStyle(fromEl).backgroundImage : '';
      const finish = () => {
        try {
          if (isDark) {
            sessionStorage.setItem('om-pt', String(Date.now()));
            sessionStorage.setItem('om-pt-bg', bg && bg !== 'none' ? bg : PT_BG);
          }
        } catch {
          /* sessionStorage 不可用：目标页无揭开，goPT 兜底淡出仍生效 */
        }
        router.push(href);
        // 兜底淡出（PageEnter 接管时会先清掉这些残留；延迟给足接管窗口，防双层闪）
        setTimeout(() => {
          document.querySelectorAll<HTMLElement>('[data-pt-tmp]').forEach((el) => {
            const from = el.hasAttribute('data-pt-veil') ? 0.92 : 1;
            el.animate([{ opacity: from }, { opacity: 0 }], {
              duration: STRUCT,
              easing: EASE,
              fill: 'forwards',
            }).onfinish = () => el.remove();
          });
        }, 700);
      };
      // 源块矩形先量：直飞时底板要从它的框展开，遮罩的起始形状依赖它
      const r0 = fromEl ? fromEl.getBoundingClientRect() : null;
      const usable = !!r0 && r0.width >= 10 && r0.height >= 10;
      const veil = document.createElement('div');
      veil.setAttribute('data-pt-tmp', '1');
      veil.setAttribute('data-pt-veil', '1');
      veil.style.cssText = `position:fixed;inset:0;z-index:199;pointer-events:none;opacity:0;background:${
        bg && bg !== 'none' ? bg : PT_BG
      }`;
      document.body.appendChild(veil);
      if (direct && usable && r0) {
        // 背景从预览块展开（用户拍板 2026-07-27：「现在是直接一下闪过来的，不太自然」）。
        // 换页那一帧必须被盖住，但**怎么盖**是有讲究的：整块淡入 = 平白多出一层东西；
        // 改成底板从预览块的框沿四边铺开，读起来是这块预览自己的底板长成了新页面的背景。
        // 用 clip-path 而非 scale：缩放会把渐变一起拉伸变形，clip 只是把同一块底板露出来。
        const from = `inset(${r0.top}px ${window.innerWidth - r0.right}px ${
          window.innerHeight - r0.bottom
        }px ${r0.left}px)`;
        veil.style.opacity = '1';
        veil.style.clipPath = from;
        veil.animate([{ clipPath: from }, { clipPath: 'inset(0px 0px 0px 0px)' }], {
          duration: EXPAND_MS,
          easing: EASE,
          fill: 'forwards',
        });
      } else {
        // 生长那条路仍是稿内的 0.92 / STRUCT 淡入；直飞但量不到源块时退回全屏淡入
        veil.animate([{ opacity: 0 }, { opacity: direct ? 1 : 0.92 }], {
          duration: direct ? EXPAND_MS : STRUCT,
          easing: EASE,
          fill: 'forwards',
        });
      }
      vp.style.willChange = 'transform,filter';
      vp.animate(
        direct
          ? [
              { transform: 'scale(1)', filter: 'blur(0px)' },
              { transform: 'scale(1.015)', filter: 'blur(4px)' },
            ]
          : [
              { transform: 'scale(1)', filter: 'blur(0px)' },
              { transform: 'scale(1.04)', filter: 'blur(8px)' },
            ],
        { duration: direct ? EXPAND_MS : PUSH_MS, easing: EASE, fill: 'forwards' },
      );
      if (!fromEl || !usable || !r0) {
        setTimeout(finish, direct ? EXPAND_MS : 540);
        return;
      }
      const r = r0;
      const wrap = document.createElement('div');
      wrap.setAttribute('data-pt-tmp', '1');
      // data-pt-morph + 版式盒尺寸：目标页 PageEnter 接手这个克隆，把它从当前的满屏帧
      // 继续送到 hero 主图位（第二段）。盒尺寸得留着——克隆此刻带着 transform，
      // getBoundingClientRect 量到的是变换后的框，算不回原盒。
      wrap.setAttribute('data-pt-morph', '1');
      wrap.dataset.ptRect = JSON.stringify({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      });
      wrap.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;z-index:200;pointer-events:none;overflow:hidden;transform-origin:50% 50%;will-change:transform`;
      const clone = fromEl.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.inset = '0';
      clone.style.width = '100%';
      clone.style.height = '100%';
      clone.style.margin = '0';
      clone.style.flex = 'none';
      clone.style.minHeight = '0';
      // canvas 的像素不随 cloneNode 复制（克隆是空画布）——3D 台架当预览时，点下去
      // 机构会凭空消失。改挂快照位图，静止但画面连得上（snapshot.ts）。
      const srcCanvas = fromEl.querySelectorAll('canvas');
      const dstCanvas = clone.querySelectorAll('canvas');
      srcCanvas.forEach((src, i) => {
        const dst = dstCanvas[i];
        const url = snapshotCanvas(src);
        if (!dst || !url) return;
        const box = src.getBoundingClientRect();
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.cssText = `display:block;width:100%;aspect-ratio:${Math.max(box.width, 1)}/${Math.max(box.height, 1)}`;
        dst.replaceWith(img);
      });
      wrap.appendChild(clone);
      document.body.appendChild(wrap);

      if (direct) {
        // 直飞（用户拍板 2026-07-27：「不要中间放大一下再缩小过去」）：这里**不动**克隆，
        // 让它钉在原位，等目标页量到 hero 落点后一次飞过去（PageEnter 第 ① 条路）。
        // 等底板铺满（EXPAND_MS）再 push——铺满前换页会从没盖住的边角漏出浅底主页
        // 硬切成深色案例页那一帧，那一下比放大还扎眼。预览块这期间原地不动。
        wrap.setAttribute('data-pt-direct', '1');
        setTimeout(finish, EXPAND_MS);
        return;
      }

      // 无落点的路由（/archive /lab）：仍是稿内的「媒体块生长铺满」再交接
      const cover = coverRect(r, window.innerWidth, window.innerHeight);
      wrap.animate(
        [{ transform: 'translate(0px,0px) scale(1)' }, { transform: flipCss(flipTransform(r, cover)) }],
        { duration: PUSH_MS, easing: EASE, fill: 'forwards' },
      ).onfinish = () => setTimeout(finish, 50);
    };
    // 舞台内页链接（data-pt）：所在面板的媒体块作克隆源；无面板则链接自身生长（稿内行为）
    const ptLinks = Array.from(root.querySelectorAll<HTMLElement>('a[data-pt]'));
    ptLinks.forEach((a) =>
      on(a, 'click', (e) => {
        if (modifiedClick(e)) return;
        e.preventDefault();
        const href = a.getAttribute('href');
        if (!href) return;
        const panel = a.closest<HTMLElement>('[id^="wp"]');
        goPT(href, panel ? panel.querySelector<HTMLElement>('[data-ptm]') : a);
      }),
    );
    // goPT 目标路由预取（卡片 + data-pt 链接）
    const ptTargets = new Set<string>();
    cards.forEach((c) => {
      const h = c.getAttribute('data-href');
      if (h) ptTargets.add(h);
    });
    ptLinks.forEach((a) => {
      const h = a.getAttribute('href');
      if (h) ptTargets.add(h);
    });
    ptTargets.forEach((h) => router.prefetch(h));

    // ---------- 分页引擎（物理原样移植） ----------
    let acc = 0;
    let lockUntil = 0;
    let lockDir = 0;
    let needRearm = false;
    let lastInputT = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const applyOffset = () => {
      const sign = Math.sign(acc) || 1;
      const pv = Math.min(Math.abs(acc) / COMMIT_DIST, 1);
      if (cur === 1 && sign > 0) {
        setS2(W() - MAX_PEEK * W() * easeOut(pv), 0);
        return;
      }
      if (cur === 2) {
        setS2(sign < 0 ? MAX_PEEK * W() * easeOut(pv) : -0.03 * W() * easeOut(pv), 0);
        return;
      }
      const end = cur === 0 && sign < 0;
      const off = (end ? 0.03 : MAX_PEEK) * H() * easeOut(pv) * sign;
      setTrack(-Math.min(cur, 1) * H() - off, 0);
    };
    const springBack = () => {
      acc = 0;
      setTrack(-Math.min(cur, 1) * H(), SPRING_MS);
      setS2(cur === 2 ? 0 : W(), SPRING_MS);
    };
    const commit = (n: number, sign: number) => {
      n = Math.max(0, Math.min(N, n));
      clearTimeout(pauseTimer);
      if (n === cur) {
        springBack();
        return;
      }
      lockDir = sign || Math.sign(n - cur);
      lockUntil = performance.now() + PUSH_MS + LOCK_TAIL;
      needRearm = true;
      acc = 0;
      cur = n;
      setTrack(-Math.min(n, 1) * H(), PUSH_MS);
      setS2(n === 2 ? 0 : W(), PUSH_MS);
      setRail(n);
      setInert(n);
      setTimeout(() => enter(n), PUSH_MS);
    };
    const goScreen = (n: number) => {
      if (performance.now() < lockUntil) return;
      commit(n, Math.sign(n - cur) || 1);
    };
    on(
      vp,
      'wheel',
      (e) => {
        if (!engine) return;
        e.preventDefault();
        const we = e as WheelEvent;
        const now = performance.now();
        let dy = we.deltaY;
        if (we.deltaMode === 1) dy *= 16;
        const sign = Math.sign(dy) || 1;
        if (now < lockUntil) {
          if (sign === lockDir) {
            lastInputT = now;
            return;
          }
        }
        if (needRearm) {
          if (now >= lockUntil && (sign !== lockDir || now - lastInputT >= SILENCE)) needRearm = false;
          else {
            lastInputT = now;
            return;
          }
        }
        lastInputT = now;
        if (Math.sign(acc) !== sign) acc = 0;
        acc += dy;
        const p = Math.abs(acc) / COMMIT_DIST;
        applyOffset();
        clearTimeout(pauseTimer);
        if (p >= COMMIT_P || Math.abs(dy) >= FLICK_V) {
          commit(cur + sign, sign);
          return;
        }
        pauseTimer = setTimeout(springBack, PAUSE_SNAP);
      },
      { passive: false },
    );
    let tch: { y: number; t: number } | null = null;
    on(vp, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (!engine || pe.pointerType !== 'touch') return;
      const path = pe.composedPath ? pe.composedPath() : [pe.target];
      if (
        path.some(
          (t) =>
            t instanceof Element && /^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(t.tagName),
        )
      )
        return;
      tch = { y: pe.clientY, t: performance.now() };
    });
    on(vp, 'pointermove', (e) => {
      if (!engine || !tch) return;
      const pe = e as PointerEvent;
      const d = tch.y - pe.clientY;
      const sign = Math.sign(d) || 1;
      if (cur === 1 && sign > 0) {
        setS2(Math.max(W() - d, 0), 0);
        return;
      }
      if (cur === 2) {
        setS2(sign < 0 ? Math.min(-d, W()) : -d * 0.3, 0);
        return;
      }
      const end = cur === 0 && sign < 0;
      setTrack(-Math.min(cur, 1) * H() - (end ? d * 0.3 : d), 0);
    });
    const tup = (e: Event) => {
      if (!engine || !tch) return;
      const pe = e as PointerEvent;
      const d = tch.y - pe.clientY;
      const dt = performance.now() - tch.t;
      const v = Math.abs(d) / Math.max(dt, 1);
      tch = null;
      if (performance.now() < lockUntil) {
        springBack();
        return;
      }
      if (Math.abs(d) > H() * TOUCH_COMMIT || v > 0.5) commit(cur + Math.sign(d), Math.sign(d));
      else springBack();
    };
    on(vp, 'pointerup', tup);
    on(vp, 'pointercancel', tup);
    on(document, 'keydown', (e) => {
      if (!engine) return;
      const ke = e as KeyboardEvent;
      const t = (ke.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (ke.key === 'PageDown' || ke.key === 'ArrowDown') {
        ke.preventDefault();
        goScreen(cur + 1);
      } else if (ke.key === 'PageUp' || ke.key === 'ArrowUp') {
        ke.preventDefault();
        goScreen(cur - 1);
      }
    });
    const railGo = (it: HTMLElement) => {
      const n = Number(it.getAttribute('data-rail'));
      if (engine) goScreen(n);
      else
        window.scrollTo({
          top: sections[n].getBoundingClientRect().top + window.scrollY,
          behavior: 'smooth',
        });
    };
    on(railEl, 'click', (e) => {
      const it = (e.target as HTMLElement).closest<HTMLElement>('[data-rail]');
      if (it) railGo(it);
    });
    on(aboutLink, 'click', (e) => {
      e.preventDefault();
      if (engine) goScreen(1);
      else
        window.scrollTo({
          top: sections[1].getBoundingClientRect().top + window.scrollY,
          behavior: 'smooth',
        });
    });

    // ---------- 舞台三态：偷看 / 回归 / 驻留 ----------
    // 迭代稿：点击卡片改走 goPT 转场跳页（驻留仅剩 hoverPeek=false 手感分支，chip 解除保留）。
    let showing = 0;
    let pinned = 0;
    let hoverT: ReturnType<typeof setTimeout> | undefined;
    let swapT: ReturnType<typeof setTimeout> | undefined;
    let returnT: ReturnType<typeof setTimeout> | undefined;
    const showP = (el: HTMLElement, vis: boolean) => {
      el.style.visibility = vis ? 'visible' : 'hidden';
      el.style.opacity = vis ? '1' : '0';
    };
    const setCards = () =>
      cards.forEach((c, i) => {
        const num = c.querySelector<HTMLElement>('[data-cnum]');
        const active = pinned === i + 1 || showing === i + 1;
        if (num)
          num.style.color = active
            ? 'var(--g800)'
            : works[i]?.published
              ? 'var(--g600)'
              : 'var(--n400)';
        c.style.background = pinned === i + 1 ? 'var(--g100)' : 'transparent';
      });
    const showStage = (n: number, slow?: boolean) => {
      if (n === showing) return;
      const old = panels[showing];
      const next = panels[n];
      showing = n;
      setPanel(n);
      lbl.textContent = lblTxt[n];
      chip.style.visibility = n === 0 ? 'hidden' : 'visible';
      setCards();
      clearTimeout(swapT);
      const dur = slow ? STRUCT : MICRO;
      if (!fxStage) {
        panels.forEach((p, i) => showP(p, i === n));
        return;
      }
      old.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(8px)' },
        ],
        { duration: dur, easing: EASE },
      );
      swapT = setTimeout(() => {
        panels.forEach((p, i) => showP(p, i === n));
        next.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: dur, easing: EASE },
        );
      }, Math.round(dur / 2));
    };
    cards.forEach((c, i) => {
      const n = i + 1;
      on(c, 'mouseenter', () => {
        clearTimeout(returnT);
        if (!hoverPeek) {
          pinned = n;
          showStage(n);
          return;
        }
        if (pinned) return;
        clearTimeout(hoverT);
        hoverT = setTimeout(() => {
          if (!pinned) showStage(n);
        }, 80);
      });
      on(c, 'mouseleave', () => clearTimeout(hoverT));
      // 卡片现在是真链接（<a href>），转场只是接管默认行为：修饰键点击交回浏览器，
      // 普通左键才走 goPT。href 与 data-href 同值——前者给浏览器/爬虫，后者给引擎读。
      on(c, 'click', (e) => {
        if (modifiedClick(e)) return;
        e.preventDefault();
        const href = c.getAttribute('data-href');
        if (!href) return;
        const media = small ? null : (panels[n]?.querySelector<HTMLElement>('[data-ptm]') ?? c);
        goPT(href, media);
      });
    });
    on(cardsBox, 'mouseleave', () => {
      clearTimeout(hoverT);
      if (!hoverPeek || pinned) return;
      clearTimeout(returnT);
      returnT = setTimeout(() => {
        if (!pinned) showStage(0, true);
      }, RETURN_DELAY);
    });
    on(cardsBox, 'mouseenter', () => clearTimeout(returnT));
    on(chip, 'click', () => {
      pinned = 0;
      showStage(0, true);
      setCards();
    });

    // ---------- 光标读数（lerp 跟随，rAF） ----------
    let craf = 0;
    if (fxCursor) {
      const tag = $('cursorTag');
      if (tag) {
        let tx = 0;
        let ty = 0;
        let px: number | null = null;
        let py = 0;
        let txt = '';
        const tick = () => {
          if (px === null) {
            craf = 0;
            return;
          }
          px += (tx - px) * 0.15;
          py += (ty - py) * 0.15;
          tag.style.transform = `translate3d(${px}px,${py}px,0)`;
          if (Math.abs(tx - px) > 0.5 || Math.abs(ty - py) > 0.5) craf = requestAnimationFrame(tick);
          else craf = 0;
        };
        on(document, 'mousemove', (e) => {
          const me = e as MouseEvent;
          tx = me.clientX + 16;
          ty = me.clientY + 18;
          if (px === null) {
            px = tx;
            py = ty;
          }
          const z = (me.target as HTMLElement | null)?.closest?.('[data-cursor]');
          if (z) {
            const t = z.getAttribute('data-cursor') ?? '';
            if (t !== txt) {
              txt = t;
              tag.textContent = t;
            }
            tag.style.opacity = '1';
          } else tag.style.opacity = '0';
          if (!craf) craf = requestAnimationFrame(tick);
        });
      }
    }

    // ---------- 入场编排（只此一次） ----------
    if (fxEntrance) {
      sections[0].querySelectorAll<HTMLElement>('[data-row]').forEach((row, k) =>
        row.animate(
          [
            { opacity: 0, transform: 'translateY(12px)', clipPath: 'inset(0 0 100% 0)' },
            { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 -10% 0)' },
          ],
          { duration: STRUCT, delay: k * STAG, easing: EASE, fill: 'backwards' },
        ),
      );
      cards.forEach((c, i) =>
        c.animate(
          [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: MICRO + 80, delay: 260 + i * STAG, easing: EASE, fill: 'backwards' },
        ),
      );
      const ff = $('figFrame');
      if (ff)
        ff.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
          duration: STRUCT,
          delay: 400,
          easing: 'linear',
        });
    }

    // ---------- 模式切换：引擎（桌面）↔ 文档流（<1024 / reduced-motion） ----------
    const mqS = window.matchMedia('(max-width: 1023px)');
    const applyMode = () => {
      small = mqS.matches;
      engine = wantPaging && !small;
      vp.style.height = engine ? '100svh' : 'auto';
      vp.style.overflow = engine ? 'hidden' : 'visible';
      track.style.transition = 'none';
      track.style.transform = engine ? `translate3d(0,${-Math.min(cur, 1) * H()}px,0)` : '';
      if (engine) {
        s2el.style.position = 'absolute';
        s2el.style.top = '100svh';
        s2el.style.left = '0';
        s2el.style.right = '0';
        // 稿内隐性层叠 bug 的落地修正：track 的 willChange 建层叠上下文后，S1 内容层 z1
        // 会盖穿横向推入的 s2（transform 上下文 z auto）——引擎态显式抬 s2。
        s2el.style.zIndex = '2';
        s2el.style.transition = 'none';
        s2el.style.transform = cur === 2 ? 'translate3d(0,0,0)' : `translate3d(${W()}px,0,0)`;
      } else {
        s2el.style.position = 'relative';
        s2el.style.top = '';
        s2el.style.left = '';
        s2el.style.right = '';
        s2el.style.zIndex = '';
        s2el.style.transition = 'none';
        s2el.style.transform = '';
      }
      sections.forEach((sec) => {
        sec.style.height = engine ? '100svh' : 'auto';
        sec.style.minHeight = engine ? '' : '100svh';
        sec.style.overflow = engine ? 'hidden' : 'visible';
      });
      railEl.style.display = engine ? 'flex' : 'none';
      if (prog) prog.style.display = engine ? 'block' : 'none';
      setInert(cur);
      // 模式切换时先归零：文档流态下积累的滚动不该带进引擎态
      if (engine) {
        vp.scrollTop = 0;
        vp.scrollLeft = 0;
      }
      acc = 0;
    };
    applyMode();
    on(mqS, 'change', applyMode);
    on(window, 'resize', () => {
      if (engine) {
        setTrack(-Math.min(cur, 1) * H(), 0);
        setS2(cur === 2 ? 0 : W(), 0);
      }
    });
    setCards();
    // 深链：/#lab（SiteNav 自内页链回）→ 引擎态直接落到 S2
    if (engine && window.location.hash === '#lab') {
      window.scrollTo(0, 0);
      cur = 2;
      setTrack(-H(), 0);
      setS2(0, 0);
      setRail(2);
      setInert(2);
    }

    return () => {
      offs.forEach((f) => f());
      if (craf) cancelAnimationFrame(craf);
      clearTimeout(pauseTimer);
      clearTimeout(hoverT);
      clearTimeout(swapT);
      clearTimeout(returnT);
    };
  }, [router, works]);

  return (
    <div ref={rootRef}>
      {/* 光标读数标签（hover:hover 门控在 effect 内） */}
      <div
        id="cursorTag"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 95,
          pointerEvents: 'none',
          opacity: 0,
          padding: '5px 10px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          background: 'var(--accent)',
          color: 'var(--paper)',
          whiteSpace: 'nowrap',
          transition: 'opacity var(--dur-micro) var(--ease-site)',
        }}
      />

      {/* 顶缘进度条（迭代稿新增；仅引擎态显示，applyMode 控制） */}
      <div
        id="prog"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 96,
          pointerEvents: 'none',
          transformOrigin: '0 50%',
          transform: 'scaleX(0.334)',
          background: 'var(--g500)',
          transition: 'transform var(--dur-struct) var(--ease-site)',
          display: 'none',
        }}
      />

      {/* 右缘 rail（仅引擎态显示，applyMode 控制） */}
      <div
        id="rail"
        style={{
          position: 'fixed',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 90,
          display: 'none',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {['S0', 'S1', 'S2'].map((s, i) => (
          <button key={s} type="button" className="rail-btn" data-rail={i} data-cursor={`Go ${s} →`}>
            <span
              data-rbar
              style={{
                display: 'inline-block',
                width: i === 0 ? 22 : 14,
                height: 2,
                background: i === 0 ? 'var(--g500)' : 'var(--n300)',
                transition: 'width var(--dur-micro) var(--ease-site)',
              }}
            />
            <span
              data-rnum
              className="mono"
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: i === 0 ? 'var(--accent)' : 'var(--n500)',
              }}
            >
              {String(i).padStart(2, '0')}
            </span>
          </button>
        ))}
      </div>

      <main id="vp" style={{ position: 'relative' }}>
        <div id="track" style={{ willChange: 'transform' }}>
          {/* ——— S0 枢纽幕 ——— */}
          <section id="s0" style={{ ...SECTION_BASE, background: GRID_BG }}>
            {/* SiteNav 的 Work 指向 /#work（MAPPING §3），此前全站没有这个锚点，
                自内页点 Work 只是落到页顶、看着像没反应。与 s1 的 #about-preview、
                s2 的 #lab 同一形态：零高度 span，不参与版式。 */}
            <span id="work" />
            <div
              className="hub-grid"
              style={{
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '28px 64px 32px 48px',
                boxSizing: 'border-box',
              }}
            >
              <div className="flex min-h-0 flex-col" style={{ gap: 16 }}>
                <p
                  data-row
                  className="flex justify-between"
                  style={{
                    margin: 0,
                    gap: 16,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  <span>
                    <span style={{ color: 'var(--ink)', fontWeight: 800 }}>[Name]</span> — Portfolio
                    2026
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--accent)',
                    }}
                  >
                    <span
                      data-pulse
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--g500)',
                        animation: 'pulse 1.6s ease-in-out infinite',
                      }}
                    />
                    The solver runs live
                  </span>
                </p>
                <h1
                  data-row
                  style={{
                    fontSize: 'clamp(34px, 3.4vw, 52px)',
                    fontWeight: 800,
                    lineHeight: 0.98,
                    letterSpacing: '-0.02em',
                    margin: 0,
                    textTransform: 'uppercase',
                    maxWidth: '16ch',
                  }}
                >
                  Structures that move, <span style={{ color: 'var(--accent)' }}>machines that live.</span>
                </h1>
                <svg data-row width={230} height={8} style={{ display: 'block', overflow: 'visible' }}>
                  <line
                    data-dash
                    x1={0}
                    y1={4}
                    x2={230}
                    y2={4}
                    strokeWidth={1.5}
                    strokeDasharray="8 6"
                    style={{ stroke: 'var(--g500)', animation: 'dashmove 2.6s linear infinite' }}
                  />
                </svg>
                <p data-row style={{ fontSize: 14, lineHeight: 1.5, margin: 0, maxWidth: '44ch' }}>
                  Mechanism design, custom physics solvers, and human–robot interaction research.
                  Four projects, built and measured.
                </p>
                <div id="cards" className="hub-cards">
                  {works.map((w, i) => (
                    // 卡片是导航，就得是链接：此前是 <button> + JS 跳转，于是整页只有
                    // 舞台面板里那一条 href 指向案例页，而舞台在 <1024 是 display:none。
                    // 结果卡片对爬虫、对「复制链接地址」、对新标签页、对禁用 JS 全都不存在。
                    // 转场不受影响——引擎照旧读 data-href，只是改成接管默认行为（见 goPT 接线）。
                    <a
                      key={w.slug}
                      id={`c${i + 1}`}
                      className="hub-card"
                      data-card={i + 1}
                      data-cursor={`View ${String(i + 1).padStart(2, '0')} →`}
                      // 四张卡各进各的详情页（用户拍板 2026-07-29）：未发稿的三个落
                      // 「筹备中」页，不再全指 /archive——四项目地位同等，导航上也得同等。
                      href={`/work/${w.slug}`}
                      data-href={`/work/${w.slug}`}
                    >
                      <span
                        data-tick
                        style={{
                          position: 'absolute',
                          top: -2,
                          left: 0,
                          width: 26,
                          height: 3,
                          background: TICKS[i] ?? 'var(--n300)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span className="flex items-baseline justify-between" style={{ gap: 10 }}>
                        <span
                          data-cnum
                          style={{
                            fontSize: 26,
                            fontWeight: 800,
                            color: w.published ? 'var(--g600)' : 'var(--n400)',
                            transition: 'color var(--dur-micro) var(--ease-site)',
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: w.published ? 700 : 600,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            color: w.published ? 'var(--accent)' : 'var(--n500)',
                          }}
                        >
                          {w.published ? 'live' : 'in prep'}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          lineHeight: 1.25,
                        }}
                      >
                        {w.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: 'var(--n600)',
                        }}
                      >
                        {w.published ? w.date : 'TBD'}
                      </span>
                    </a>
                  ))}
                </div>
                <a data-row id="aboutLink" href="#about-preview" data-cursor="Go S1 →" style={LINK_11}>
                  About + contact ↓
                </a>
                <div
                  data-row
                  className="flex flex-wrap"
                  style={{
                    marginTop: 'auto',
                    borderTop: 'var(--hair)',
                    paddingTop: 10,
                    gap: 24,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  {STATS.map((s) => (
                    <span key={s.label}>
                      <b style={{ color: s.color, fontWeight: 800 }}>{s.n}</b> {s.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* 预览舞台（默认位 = 空占位，用户拍板 2026-07-24：先空着） */}
              <div
                id="wstage"
                data-row
                className="hub-stage"
                style={{
                  minHeight: 0,
                  flexDirection: 'column',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="flex items-baseline justify-between"
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    gap: 16,
                    padding: '0 0 8px',
                    borderBottom: 'var(--hair)',
                  }}
                >
                  <span
                    id="stageLbl"
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                    }}
                  >
                    Stage — Lab 台架轮播
                  </span>
                  <button id="figChip" type="button" className="figchip" style={{ visibility: 'hidden' }}>
                    00 · Stage
                  </button>
                </div>
                <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
                  <div
                    id="pFig"
                    data-cursor="Lab 台架 · live — 可拖动"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      padding: '14px 0 2px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div
                      id="figFrame"
                      style={{
                        position: 'absolute',
                        inset: 4,
                        border: '1px solid var(--accent)',
                        opacity: 0,
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Stage 待机 = 四台 Lab 台架顺序轮播（用户拍板 2026-07-27；
                        此前为单台四杆，再之前为空占位）。图注与 data-ptm 都在组件内。 */}
                    <StageRotator />
                  </div>
                  {works.map((w, i) => (
                    <div
                      key={w.slug}
                      id={`wp${i + 1}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        padding: '14px 0 2px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        visibility: 'hidden',
                        opacity: 0,
                      }}
                    >
                      <StagePlaceholderPanel work={w} index={i} active={panel === i + 1} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Grain opacity={0.055} blend="multiply" />
            <div data-flash style={FLASH_STYLE} />
          </section>

          {/* ——— S1 About 幕（迭代稿：深色渐变底 + 点阵/颗粒叠加） ——— */}
          <section id="s1" style={{ ...SECTION_BASE, background: PT_BG }}>
            <span id="about-preview" />
            <Dots mask="linear-gradient(115deg,#000 0%,transparent 45%)" opacity={0.2} />
            <Grain opacity={0.12} />
            <div
              className="flex flex-col"
              style={{
                position: 'relative',
                zIndex: 1,
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '24px 64px 32px 48px',
                boxSizing: 'border-box',
                gap: 16,
              }}
            >
              <div data-row className="flex items-baseline justify-between" style={{ minHeight: 24 }}>
                <h2 style={{ ...SCREEN_H2, color: 'var(--g100)' }}>
                  <span style={{ color: 'var(--g400)' }}>S1</span> About
                </h2>
                <Link
                  href="/about"
                  style={{
                    ...LINK_11,
                    color: 'var(--g400)',
                    borderBottom: '1px solid oklch(0.71 0.098 145 / 0.5)',
                    paddingBottom: 2,
                  }}
                >
                  Full about →
                </Link>
              </div>
              <h2
                data-row
                style={{
                  fontSize: 'clamp(34px, 3.6vw, 54px)',
                  fontWeight: 800,
                  lineHeight: 0.98,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  textTransform: 'uppercase',
                  maxWidth: '20ch',
                  color: 'var(--g100)',
                }}
              >
                Builder first, <span style={{ color: 'var(--g400)' }}>researcher by method.</span>
              </h2>
              <svg data-row width={230} height={8} style={{ display: 'block', overflow: 'visible' }}>
                <line
                  data-dash
                  x1={0}
                  y1={4}
                  x2={230}
                  y2={4}
                  strokeWidth={1.5}
                  strokeDasharray="8 6"
                  style={{ stroke: 'var(--g400)', animation: 'dashmove 2.6s linear infinite' }}
                />
              </svg>
              <div
                data-row
                className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
                style={{ flex: 1, minHeight: 0 }}
              >
                <div className="flex flex-col" style={{ gap: 16 }}>
                  <div
                    style={{
                      border: '1px dashed oklch(0.71 0.098 145 / 0.45)',
                      padding: '12px 16px',
                      fontSize: 13,
                      color: S1_BODY,
                      maxWidth: '60ch',
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--g400)' }}>[待作者供稿]</span> 摘要 —
                    两三句：背景、方向、申请目标。
                  </div>
                  <div className="grid grid-cols-2" style={{ borderTop: HAIR_LIGHT }}>
                    <div style={{ padding: '12px 16px 0 0', borderRight: HAIR_LIGHT }}>
                      <div style={{ ...CELL_LABEL, color: 'var(--g100)' }}>Contact</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: S1_BODY }}>
                        [email placeholder]
                        <br />
                        GitHub · plain URLs · no password
                      </div>
                    </div>
                    <div style={{ padding: '12px 0 0 16px' }}>
                      <div style={{ ...CELL_LABEL, color: 'var(--g100)' }}>Currently</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: S1_BODY }}>
                        <span style={{ color: 'var(--rose)' }}>●</span> [待作者供稿] 状态一行
                      </div>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-2"
                    style={{ marginTop: 'auto', borderTop: HAIR_LIGHT }}
                  >
                    <div style={{ padding: '12px 16px 0 0', borderRight: HAIR_LIGHT }}>
                      <div style={{ ...CELL_LABEL, color: 'var(--g100)' }}>Role</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: S1_BODY }}>
                        Concept &amp; research design · mechanism &amp; fabrication · electronics &amp;
                        behavior · HRI study
                      </div>
                    </div>
                    <div style={{ padding: '12px 0 0 16px' }}>
                      <div style={{ ...CELL_LABEL, color: 'var(--g100)' }}>Tools</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: S1_BODY }}>
                        Rhino / Grasshopper · SLS / FDM / resin · ESP32 · ELAN · TypeScript solvers
                      </div>
                    </div>
                  </div>
                </div>
                <figure className="flex min-h-0 flex-col" style={{ margin: 0, gap: 8 }}>
                  <div
                    style={{
                      position: 'relative',
                      flex: 1,
                      minHeight: 200,
                      isolation: 'isolate',
                      background: 'var(--g200)',
                    }}
                  >
                    <Dots
                      mask="linear-gradient(150deg,#000 0%,transparent 60%)"
                      opacity={0.5}
                      color="var(--g500)"
                    />
                    <div
                      className="flex items-center justify-center"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        padding: 24,
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ ...UPPER_11, color: 'var(--g700)' }}>
                        [待作者供稿] 人像 — duotone green
                      </span>
                    </div>
                  </div>
                  <figcaption
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--g400)',
                    }}
                  >
                    Portrait · duotone green
                  </figcaption>
                </figure>
              </div>
            </div>
            <Grain opacity={0.055} blend="multiply" />
            <div data-flash style={FLASH_STYLE} />
          </section>

          {/* ——— S2 Lab + Log + 页脚幕 ——— */}
          <section id="s2" style={{ ...SECTION_BASE, background: GRID_BG, borderTop: 'var(--hair)' }}>
            <span id="lab" />
            <div
              className="flex flex-col"
              style={{
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '24px 64px 0 48px',
                boxSizing: 'border-box',
                gap: 14,
              }}
            >
              <div data-row className="flex items-baseline justify-between" style={{ minHeight: 24 }}>
                <h2 style={SCREEN_H2}>
                  <span style={{ color: 'var(--accent-2)' }}>S2</span> The lab
                </h2>
                <span className="flex items-center" style={{ ...UPPER_11, gap: 14 }}>
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ width: 9, height: 9, background: 'var(--g500)' }} />
                    SVG
                  </span>
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ width: 9, height: 9, background: 'var(--p500)' }} />
                    WebGL
                  </span>
                  <span>All live</span>
                </span>
              </div>
              <div
                data-row
                className="grid grid-cols-2 lg:grid-cols-8"
                style={{ gap: 1, background: 'oklch(0.235 0.025 215 / 0.22)' }}
              >
                {LABS.map((lab) => (
                  <a
                    key={lab.kicker}
                    href={lab.href}
                    className="card lab-card"
                    style={{ '--lab-bar': lab.bar, '--lab-hover': lab.hover } as CSSProperties}
                  >
                    <div
                      className="card-kicker"
                      style={{ alignSelf: 'flex-start', color: lab.kickerColor }}
                    >
                      {lab.kicker}
                    </div>
                    <div className="card-title">{lab.title}</div>
                    <p className="card-body">{lab.body}</p>
                    <div className="card-meta">{lab.meta}</div>
                  </a>
                ))}
              </div>
              <div
                data-row
                className="flex items-baseline justify-between"
                style={{ marginTop: 6 }}
              >
                <h2 style={SCREEN_H2}>Work log</h2>
                <a data-pt href="/archive" style={LINK_11}>
                  All entries →
                </a>
              </div>
              <div data-row style={{ flex: 1, minHeight: 0 }}>
                {logs.map((e, i) => (
                  <div
                    key={`${e.date}-${i}`}
                    className="log-row"
                    style={i === logs.length - 1 ? { borderBottom: 'var(--hair)' } : undefined}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
                      {e.date}
                    </span>
                    {/* 池里条目长短不一，钳到两行——S2 幕高度固定，不能让预览把页脚顶出去 */}
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--n700)',
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {e.text}
                    </span>
                  </div>
                ))}
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  Colophon —{' '}
                  <span style={{ borderBottom: '1px dashed var(--n400)' }}>
                    [待作者供稿] 一句：这个站本身如何被构建
                  </span>
                </p>
              </div>
            </div>
            <footer
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: FOOT_GRAD,
                color: 'var(--g100)',
              }}
            >
              <Dots mask="linear-gradient(92deg,#000 0%,transparent 55%)" opacity={0.26} />
              <Grain opacity={0.1} />
              <div
                className="flex items-baseline justify-between"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  maxWidth: 1400,
                  margin: '0 auto',
                  padding: '24px 64px 24px 48px',
                  gap: 32,
                }}
              >
                <span
                  className="hub-footer-email"
                  style={{
                    fontSize: 'clamp(22px, 2.2vw, 32px)',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                  }}
                >
                  [email placeholder]
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--g400)',
                  }}
                >
                  GitHub · no password · plain URLs
                </span>
              </div>
            </footer>
            <Grain opacity={0.055} blend="multiply" />
            <div data-flash style={FLASH_STYLE} />
          </section>
        </div>
      </main>
    </div>
  );
}
