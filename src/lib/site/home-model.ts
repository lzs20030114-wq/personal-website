// 主页「07 Home · Scroll Zone」的数据派生（design-ref/home-scroll-zone，MAPPING §42）。
// 纯函数、不碰 fs / DOM：app/page.tsx 在服务端读内容池后调用，结果作为可序列化 props 递给客户端组件
// （客户端组件不能 import 内容池模块——node:fs 撞 Turbopack，与 log-facets 同一条纪律）。
import { LAB_INDEX, labAnchor } from './lab-index';
import { projectGroupOf, bucketOf, withAnchors, aspectOf, OTHER_ASPECT } from './log-facets';
import { LAB_ICONS, PROJECT_ICONS, iconPath, logIcon, type FieldKind, type FieldProject } from './field-visuals';
import type { LogEntry } from './log-schema';
import type { OtherWorks } from './other-works-schema';

/** 项目色：稿内 G / V / S 三组（ink = 浅底文字与刻度，hi = 深底高光）。G/V 取站内 token，S 稿内独有。 */
export interface Tone {
  ink: string;
  hi: string;
}
export const TONE_G: Tone = { ink: 'var(--g700)', hi: 'var(--g400)' };
export const TONE_V: Tone = { ink: 'var(--p700)', hi: 'var(--p400)' };
export const TONE_S: Tone = { ink: 'oklch(0.45 0.06 235)', hi: 'oklch(0.74 0.06 235)' };

/* ───────────────────────── 项目卡片 + Lab 分组 ───────────────────────── */

/**
 * 主页展示的三个项目（稿内三卡；project-iv 不上首页——用户拍板 2026-10-01）。
 * img = Work 卡片封面：两台活台架的定帧（MAPPING §76；作者实拍后换回照片）。
 * intro = Work 卡片悬停时浮出的介绍，只在首页用；案例页与首屏方块场仍用内容池的 summary。
 */
const HOME_PROJECTS = [
  {
    slug: 'reincarnation-machine',
    kicker: 'Project I',
    tone: TONE_G,
    // Lab 1-5 整机：五环停在接近全开的位置，大触手卷起
    img: '/home/cover-reincarnation-machine.webp',
    title: null,
    intro:
      'A desk-sized machine that is born, ages and dies in about eight minutes, then wakes with a different personality in the same body: five breathing rings and an arm that grips a hand. People have to learn it again each life.',
  },
  // 项目二尚未定名（pool title 仍是 "Project II"），卡片题用描述名；2026-10-04 作者拍板由稿内的 "Spatial simulation"
  // 改为能体现物种的 "Cross-species space"（与 lab-index / log-facets 同步）。定名后删 title 覆写即回内容池。
  {
    slug: 'project-ii',
    kicker: 'Project II',
    tone: TONE_V,
    // Lab 2-15 人猫同台，仿真约 160 s：有人坐下、面前的单元落成桌子、猫在台上
    img: '/home/cover-project-ii.webp',
    title: 'Cross-species space',
    intro:
      'Fabric units hang from the ceiling of a simulated cat café and drop down as platforms. When a visitor sits down, the units lead the nearest cat over. With six or more visitors, people stay longer beside cats than with fixed shelves.',
  },
  {
    slug: 'project-iii',
    kicker: 'Project III',
    tone: TONE_S,
    img: null,
    title: null,
    // 未发稿：只写站方框架字与日志里已公开的来历，不代写题目
    intro:
      'The third main project grows out of the sleep research from the smart-bed internship. Its topic is still being narrowed, and the case study will be published here.',
  },
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
  /** 一句话（首屏方块场卡片的说明）：发了稿的取内容池 summary */
  thesis: string;
  /** Work 卡片悬停时的介绍（两三句） */
  intro: string;
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
      intro: p.intro,
      role: wip ? 'Role · to be written' : w.role.join(' · '),
    };
  });
}

/* ───────────────────────── 02 Work：按组横向切换 ───────────────────────── */

/** 其他作品的卡片不挂项目色：墨色刻度 + 深色幕上的青柠高光，与三个主项目分开 */
export const TONE_N: Tone = { ink: 'var(--ink)', hi: 'var(--lime-hi)' };

/** Work 页一张卡：主项目卡与其他作品卡共用这一个形状（标记与样式是同一套 hs-card） */
export interface HomeWorkTile {
  key: string;
  kick: string;
  /** kick 拆开的两半：编号（01 / 02.1）与名称（Project I / 实习类别）；主项目卡把编号放大（MAPPING §70） */
  kickN: string;
  kickLabel: string;
  status: string;
  title: string;
  role: string;
  /** 悬停浮出的一句话；没有就只出 cta */
  thesis: string | null;
  cta: string;
  href: string;
  img: string | null;
  imgPos: 'center' | 'top';
  wip: boolean;
  tone: Tone;
  /** 主项目卡的 slug（案例页）；其他作品为 null */
  caseSlug: string | null;
  /** 点它走「卡片展开成详情页」转场的 slug（MAPPING §48）：主项目 = caseSlug；其他作品有详情页时 = 它的 slug */
  ptSlug: string | null;
}

export interface HomeWorkGroup {
  key: string;
  n: string;
  title: string;
  tiles: HomeWorkTile[];
}

/** 一屏放几张卡；一组超过这个数就分成几屏，横着接着切（MAPPING §58） */
export const WORK_PER_PANEL = 3;

/**
 * 其他作品点进去去哪：有详情页 → /work/<slug>（MAPPING §60）；否则登记了 `log`（日志项目组）且那一组有记录
 * → 那一组最新一条的锚点；再否则用 href。Work 页卡片与首屏方块场共用这一条，两处不会指向不同地方。
 */
export function otherWorkHref(w: OtherWorks['works'][number], entries: LogEntry[]): string {
  if (w.page && w.slug) return `/work/${w.slug}`;
  // schema 保证：没有详情页就一定有 href
  const fallback = w.href ?? '/archive';
  if (!w.log) return fallback;
  const latest = withAnchors(entries)
    .filter(({ entry }) => projectGroupOf(entry)?.key === w.log)
    .reduce<{ entry: LogEntry; anchor: string } | undefined>(
      (best, item) => (!best || item.entry.date > best.entry.date ? item : best),
      undefined,
    );
  return latest ? `/archive#${latest.anchor}` : fallback;
}

/** 第一组 = 三个主项目（Selected work），后面按内容池登记的顺序一组一组排。 */
export function buildWorkGroups(cards: HomeCard[], other: OtherWorks, entries: LogEntry[]): HomeWorkGroup[] {
  const n2 = (i: number) => String(i).padStart(2, '0');
  const selected: HomeWorkGroup = {
    key: 'selected',
    n: '01',
    title: 'Selected work',
    tiles: cards.map((c) => ({
      key: c.slug,
      kick: `${c.n} · ${c.kicker}`,
      kickN: c.n,
      kickLabel: c.kicker,
      status: c.status,
      title: c.title,
      role: c.role,
      thesis: c.intro,
      cta: c.img ? 'Read the case study ↗' : 'Preview ↗',
      href: `/work/${c.slug}`,
      img: c.img,
      imgPos: 'center',
      wip: c.wip,
      tone: c.tone,
      caseSlug: c.slug,
      ptSlug: c.slug,
    })),
  };
  const rest = other.groups.map((g, gi): HomeWorkGroup => {
    const n = n2(gi + 2);
    return {
      key: g.key,
      n,
      title: g.title,
      tiles: other.works
        .filter((w) => w.group === g.key)
        .map((w, i) => ({
          key: `${g.key}-${i}`,
          kick: `${n}.${i + 1} · ${w.context.split(' · ')[0]}`,
          kickN: `${n}.${i + 1}`,
          kickLabel: w.context.split(' · ')[0],
          status: w.year,
          title: w.title,
          role: w.context,
          thesis: w.intro ?? w.line ?? null,
          cta: 'Open ↗',
          href: otherWorkHref(w, entries),
          img: w.card?.src ?? w.image?.src ?? null,
          imgPos: w.card ? 'center' : (w.image?.position ?? 'center'),
          wip: false,
          tone: TONE_N,
          caseSlug: null,
          ptSlug: w.page && w.slug ? w.slug : null,
        })),
    };
  });
  return [selected, ...rest];
}

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
      // 项目色取自项目注册表（log-facets PROJECT_GROUPS.accent），首页浅底上解析为 700 级，与 Work 区同值
      ink: grp?.accent ?? 'var(--graphite)',
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

/* ───────────────────────── 01 Field（池子 = 稿 17 Field Hero §55；版面 = 画布 H6b §71） ───────────────────────── */

/** 场里一张卡：悬停某个亮着的方块时展开成它。 */
export interface FieldItem {
  /** 永久内容身份；同一条日志换排序、换配图后仍是同一张卡。 */
  id: string;
  kind: FieldKind;
  project: FieldProject;
  no: string;
  img: string;
  title: string;
  cap: string;
  tone: Tone;
  href: string;
  cta: string;
}
export interface HomeField {
  pool: FieldItem[];
  /** 已发稿的主项目数 / 台架总数 / 日志条数（首屏底注与副题，全部现算） */
  projects: number;
  benches: number;
  entries: number;
}

/** 作品路由名与日志/Lab 的项目组名只有项目一不同。 */
const FIELD_PROJECT_BY_SLUG: Record<string, FieldProject> = {
  'reincarnation-machine': 'project-i',
  'project-ii': 'project-ii',
  'project-iii': 'project-iii',
};
const FIELD_NEUTRAL: Tone = { ink: 'var(--n700)', hi: 'var(--n200)' };
const FIELD_TONES: Record<FieldProject, Tone> = {
  'project-i': TONE_G,
  'project-ii': TONE_V,
  'project-iii': TONE_S,
  'other-work': FIELD_NEUTRAL,
  'this-site': FIELD_NEUTRAL,
  about: FIELD_NEUTRAL,
};

function fieldProject(key: string): FieldProject {
  if (!(key in FIELD_TONES)) throw new Error(`home-model: 首屏项目组 ${key} 未登记`);
  return key as FieldProject;
}

/** 全部可路由作品；首屏自动收录新作品，不依赖主页固定的三张主项目卡。 */
export interface FieldWorkInput extends HomeWorkInput {
  selected: boolean;
  cover?: string;
}

export function buildHomeField(cards: HomeCard[], works: FieldWorkInput[], entries: LogEntry[], other: OtherWorks): HomeField {
  const card = (slug: string) => {
    const c = cards.find((x) => x.slug === slug);
    if (!c) throw new Error(`home-model: 主页卡片缺 ${slug}`);
    return c;
  };
  const ordered = [...works].sort((a, b) => Number(b.selected) - Number(a.selected));
  const projects: FieldItem[] = ordered.map((work) => {
    const c = cards.find((item) => item.slug === work.slug);
    const knownProject = FIELD_PROJECT_BY_SLUG[work.slug];
    const project = knownProject ?? 'other-work';
    const wip = !work.published;
    return {
      id: `project:${work.slug}`,
      kind: 'project',
      project,
      no: c?.kicker ?? (work.selected ? 'Project' : 'Work'),
      img: iconPath(knownProject ? PROJECT_ICONS[knownProject] : 'archive'),
      title: c?.title ?? work.title,
      cap: wip ? 'In preparation' : c?.thesis ?? work.summary,
      tone: c?.tone ?? FIELD_TONES[project],
      href: `/work/${work.slug}`,
      cta: wip ? 'View progress ↗' : 'Case study ↗',
    };
  });
  const benches: FieldItem[] = LAB_INDEX.flatMap((group) => {
    const c = card(GROUP_SLUG[group.key]);
    const project = fieldProject(group.key);
    return group.segments.flatMap((segment) => segment.benches.map((bench) => ({
      id: `lab:${bench.no}`,
      kind: 'lab' as const,
      project,
      no: `Lab ${bench.no}`,
      img: iconPath(LAB_ICONS[bench.no] ?? 'experiment'),
      title: bench.title,
      cap: `${c.title} · ${bench.kind.split(' · ')[0]}`,
      tone: c.tone,
      href: `/lab#${labAnchor(bench.no)}`,
      cta: 'Open bench ↗',
    })));
  });
  const anchored = withAnchors(entries);
  const logs: FieldItem[] = anchored.map(({ entry, anchor }) => {
    const group = projectGroupOf(entry);
    if (!group) throw new Error(`home-model: 日志 ${anchor} 没有项目组`);
    const project = fieldProject(group.key);
    const aspect = aspectOf(entry);
    return {
      id: `log:${anchor}`,
      kind: 'log',
      project,
      no: `Log · ${fmtMd(entry.date)}`,
      img: iconPath(logIcon(entry)),
      title: entry.lead.en,
      cap: `${group.short.en} · ${aspect === OTHER_ASPECT ? 'Other' : aspect}`,
      tone: FIELD_TONES[project],
      href: `/archive#${anchor}`,
      cta: 'Read entry ↗',
    };
  });
  // 其他作品（content/other/works.json，MAPPING §58）逐件入池；链接与 Work 页卡片同一条规则
  const others: FieldItem[] = other.works.map((w, i) => ({
    id: `other:${w.group}:${i}`,
    kind: 'other' as const,
    project: 'other-work' as const,
    no: 'Other work',
    img: iconPath(PROJECT_ICONS['other-work']),
    title: w.title,
    cap: [w.line, w.context].filter(Boolean).join(' · '),
    tone: FIELD_TONES['other-work'],
    href: otherWorkHref(w, entries),
    cta: 'Open ↗',
  }));
  const pool: FieldItem[] = [
    ...projects,
    ...benches,
    ...logs,
    ...others,
    {
      id: 'about:zishuo-li',
      kind: 'about',
      project: 'about',
      no: 'About',
      img: iconPath(PROJECT_ICONS.about),
      title: 'About Zishuo Li',
      cap: 'Background · approach · contact',
      tone: FIELD_TONES.about,
      href: '/#about',
      cta: 'Meet the designer ↓',
    },
  ];
  return {
    pool,
    projects: works.filter((work) => work.selected && work.published).length,
    benches: LAB_INDEX.reduce((n, g) => n + g.segments.reduce((m, s) => m + s.benches.length, 0), 0),
    entries: entries.length,
  };
}
