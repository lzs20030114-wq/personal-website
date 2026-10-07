// 主页「07 Home · Scroll Zone」的数据派生（design-ref/home-scroll-zone，MAPPING §42）。
// 纯函数、不碰 fs / DOM：app/page.tsx 在服务端读内容池后调用，结果作为可序列化 props 递给客户端组件
// （客户端组件不能 import 内容池模块——node:fs 撞 Turbopack，与 log-facets 同一条纪律）。
import { LAB_INDEX } from './lab-index';
import { projectGroupOf, bucketOf, withAnchors } from './log-facets';
import type { LogEntry } from './log-schema';

/** 项目色：稿内 G / V / S 三组（ink = 浅底文字与刻度，hi = 深底高光）。G/V 取站内 token，S 稿内独有。 */
export interface Tone {
  ink: string;
  hi: string;
}
export const TONE_G: Tone = { ink: 'var(--g700)', hi: 'var(--g400)' };
export const TONE_V: Tone = { ink: 'var(--p700)', hi: 'var(--p400)' };
export const TONE_S: Tone = { ink: 'oklch(0.45 0.06 235)', hi: 'oklch(0.74 0.06 235)' };

/* ───────────────────────── 项目卡片 + Lab 分组 ───────────────────────── */

/** 主页展示的三个项目（稿内三卡；project-iv 不上首页——用户拍板 2026-10-01）。 */
const HOME_PROJECTS = [
  { slug: 'reincarnation-machine', kicker: 'Project I', tone: TONE_G, img: '/home/c-fivering.png', title: null },
  // 项目二尚未定名（pool title 仍是 "Project II"），卡片题用描述名；2026-10-04 作者拍板由稿内的 "Spatial simulation"
  // 改为能体现物种的 "Cross-species space"（与 lab-index / log-facets 同步）。定名后删 title 覆写即回内容池。
  { slug: 'project-ii', kicker: 'Project II', tone: TONE_V, img: '/home/c-nine.png', title: 'Cross-species space' },
  { slug: 'project-iii', kicker: 'Project III', tone: TONE_S, img: null, title: null },
] as const;

export interface HomeWorkInput {
  slug: string;
  title: string;
  date: string;
  summary: string;
  role: string[];
  published: boolean;
}

export interface HomeCard {
  n: string;
  kicker: string;
  tone: Tone;
  title: string;
  /** 右上角状态：有主图 = 年份；没有 = In progress */
  status: string;
  wip: boolean;
  slug: string;
  img: string | null;
  thesis: string;
  role: string;
}

export function buildCards(works: HomeWorkInput[]): HomeCard[] {
  return HOME_PROJECTS.map((p, i) => {
    const w = works.find((x) => x.slug === p.slug);
    if (!w) throw new Error(`home-model: 内容池缺 ${p.slug}`);
    const wip = !w.published;
    return {
      n: String(i + 1).padStart(2, '0'),
      kicker: p.kicker,
      tone: p.tone,
      title: p.title ?? w.title,
      status: wip ? 'In progress' : w.date.slice(0, 4),
      wip,
      slug: p.slug,
      img: wip ? null : p.img,
      // 未发稿项目的 summary 是「待盘点」占位，不上主页；稿内占位串原样（作者来写）
      thesis: wip ? `[${p.kicker} thesis · author to write]` : w.summary,
      role: wip ? 'Role · to be written' : w.role.join(' · '),
    };
  });
}

/** 「Other works」行：智能床按作者拍板暂列 other work，没有自己的 /work 页，落到 /archive。 */
export const OTHER_WORKS = [
  {
    title: 'Smart Bed',
    line: '2030 Sleep Foresight Study · Tsinghua Future Lab × DeRucci · design research',
    year: '2026',
    href: '/archive',
  },
] as const;

export interface HomeBench {
  no: string;
  title: string;
  description: string;
  meta: string;
}
export interface HomeSeg {
  n: string;
  label: string;
  benches: HomeBench[];
}
export interface HomeLabGroup {
  n: string;
  tone: Tone;
  title: string;
  sub: string;
  slug: string;
  /** 默认预览的台架编号；null = 无台架 */
  cover: string | null;
  segs: HomeSeg[];
  count: number;
}

/** 稿内各项目默认预览位（Hook 之外 Lab 区的初始选中）。 */
const COVERS: Record<string, string> = { 'project-i': '1-4', 'project-ii': '2-9' };

/** lab-index 的分组 key（project-i）→ 项目路由 slug（/work/[slug]）。 */
const GROUP_SLUG: Record<string, string> = {
  'project-i': 'reincarnation-machine',
  'project-ii': 'project-ii',
};

/**
 * Lab 区分组 = LAB_INDEX（与 /lab 同一份台架清单）+ 项目三的「台架待补」占位组。
 * 台架编号 / 标题 / 说明 / 元数据全部来自 lab-index，这里不留平行数组。
 */
export function buildLabGroups(cards: HomeCard[]): HomeLabGroup[] {
  const groups: HomeLabGroup[] = LAB_INDEX.map((g, i) => {
    const card = cards.find((c) => c.slug === GROUP_SLUG[g.key]);
    if (!card) throw new Error(`home-model: lab-index 分组 ${g.key} 没有对应的项目卡`);
    const segs = g.segments.map((s) => ({
      n: s.n,
      label: s.label,
      benches: s.benches.map(({ no, title, description, meta }) => ({ no, title, description, meta })),
    }));
    return {
      n: String(i + 1).padStart(2, '0'),
      tone: card.tone,
      title: card.title,
      sub: g.sub,
      slug: card.slug,
      cover: COVERS[g.key] ?? null,
      segs,
      count: segs.reduce((a, s) => a + s.benches.length, 0),
    };
  });
  const rest = cards.filter((c) => !groups.some((g) => g.slug === c.slug));
  for (const c of rest) {
    groups.push({
      n: c.n,
      tone: c.tone,
      title: c.title,
      sub: 'Benches to come',
      slug: c.slug,
      cover: null,
      segs: [],
      count: 0,
    });
  }
  return groups;
}

/* ───────────────────────── Log：节奏时间线 + 最新三条 ───────────────────────── */

/** 泳道：保留稿内四条；新增项目三独立归属，避免与智能床实习混读。Lab 仍单列。 */
const LANES = [
  { keys: ['Machine'], label: 'Reincarnation Machine', ink: 'var(--g700)' },
  { keys: ['Space'], label: 'Cross-species space', ink: 'var(--p700)' },
  { keys: ['Sleep research'], label: 'Sleep research', ink: TONE_S.ink },
  { keys: ['Lab'], label: 'Lab benches', ink: 'var(--ink)' },
  { keys: ['Sleep', 'Site'], label: 'Smart Bed · site', ink: 'oklch(0.5 0.02 200)' }, // 配色 v2：苔色带上加深一档
] as const;

/** 项目组 → 日志条目上的项目色（与 Work 区同一套编码）。 */
const PROJECT_INK: Record<string, string> = {
  'project-i': TONE_G.ink,
  'project-ii': TONE_V.ink,
  'project-iii': TONE_S.ink,
  'other-work': TONE_S.ink,
  'this-site': 'var(--n600)',
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface HomeTick {
  /** 条目在全池里的下标（最新在前）——ticks 与右侧「最新三条」靠它联动高亮 */
  i: number;
  /** 0–1，条目在时间轴上的位置 */
  f: number;
  /** 同日第几条（>0 的往右错开，避免叠成一根） */
  off: number;
  label: string;
  href: string;
}
export interface HomeLane {
  label: string;
  ink: string;
  count: number;
  ticks: HomeTick[];
}
export interface HomeLatest {
  /** 对应 HomeTick.i */
  i: number;
  date: string;
  tag: string;
  ink: string;
  text: string;
  href: string;
  img: { src: string; alt: string; caption: string } | null;
}
export interface HomeLogData {
  total: number;
  span: string;
  lanes: HomeLane[];
  /** 时间轴月份刻度（f = 该月 1 日的位置） */
  months: { label: string; f: number }[];
  /** 条目 i → 提示条文字与所在泳道（hover 提示条用） */
  tips: Record<number, { lane: number; f: number; text: string }>;
  latest: HomeLatest[];
}

const utc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtMd = (date: string) => `${MON[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

/**
 * 时间轴跨度 = 最早一条所在月 1 日 → 最新一条所在月的下月 1 日（右端标「today」）。
 * 不写死年份与区间：池里再发新日志，跨度自己长。
 */
export function buildHomeLog(entries: LogEntry[]): HomeLogData {
  if (!entries.length) throw new Error('home-model: log 池为空');
  const dates = entries.map((e) => e.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const from = Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1);
  const to = Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 1);
  const fr = (date: string) => (utc(date) - from) / (to - from);

  const anchored = withAnchors(entries);
  const laneOf = (e: LogEntry) => {
    const b = bucketOf(e);
    const k = LANES.findIndex((l) => (l.keys as readonly string[]).includes(b ?? ''));
    return k < 0 ? LANES.length - 1 : k;
  };
  const topic = (e: LogEntry) => e.tags.find((t) => t.variant === 'neutral')?.label.en ?? '';

  const lanes: HomeLane[] = LANES.map((l) => ({ label: l.label, ink: l.ink, count: 0, ticks: [] }));
  const seen = new Map<string, number>();
  const tips: HomeLogData['tips'] = {};
  anchored.forEach(({ entry, anchor }, i) => {
    const lane = laneOf(entry);
    const key = `${lane}|${entry.date}`;
    const off = seen.get(key) ?? 0;
    seen.set(key, off + 1);
    const label = `${fmtMd(entry.date)} · ${lanes[lane].label}${topic(entry) ? ` · ${topic(entry)}` : ''}`;
    lanes[lane].ticks.push({ i, f: fr(entry.date), off, label, href: `/archive#${anchor}` });
    tips[i] = { lane, f: fr(entry.date), text: label };
  });
  lanes.forEach((l) => (l.count = l.ticks.length));

  const months: HomeLogData['months'] = [];
  for (let t = new Date(from); t.getTime() < to; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))) {
    months.push({ label: MON[t.getUTCMonth()], f: (t.getTime() - from) / (to - from) });
  }
  const y = last.slice(0, 4);
  const span = `${MON[Number(first.slice(5, 7)) - 1]} – ${MON[Number(last.slice(5, 7)) - 1]} ${y}`;

  const latest: HomeLatest[] = anchored.slice(0, 3).map(({ entry, anchor }, i) => {
    const grp = projectGroupOf(entry);
    const img = entry.blocks?.find((b) => b.kind === 'image');
    return {
      i,
      date: entry.date,
      tag: grp?.short.en ?? '',
      ink: PROJECT_INK[grp?.key ?? ''] ?? 'var(--n600)',
      text: entry.lead.en,
      href: `/archive#${anchor}`,
      img:
        img && img.kind === 'image'
          ? { src: img.src, alt: img.alt.en, caption: img.caption?.en ?? img.alt.en }
          : null,
    };
  });

  return { total: entries.length, span: `${entries.length} entries · ${span}`, lanes, months, tips, latest };
}
