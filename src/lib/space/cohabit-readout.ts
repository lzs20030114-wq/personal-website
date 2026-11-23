/**
 * 规则读数（2026-11-19，项目二_规则可视化方案.md §10）：Lab 2-14 说明栏里「感知 → 理解 → 干预」那块读数要的全部数据，
 * 纯函数、零 DOM。理由本身来自 cohabit-reasons.ts（核对脚本 io-audit 用的同一份），这里只管：
 *   十二行的定义（中英两份的判定、感知、干预，字取自 项目二_输入到输出的规则.md 第 4、5、7 节）、
 *   「谁对谁」那一句、累计次数与最近 90 s 仿真时间的走势、访客与猫的名字（第一次出现时发号，删掉不回收）、
 *   点一台单元时那张说明卡。
 * 原型 scripts/rules-viz/proto.ts 是这一份的前身（版式与读法照它，搬上站时按说明栏的宽度收成一行一条）。
 */
import type { CohabitSim } from './cohabit';
import { unitReasons, type RuleHit, type RuleRow, type UnitReason, type UnitReasonKind } from './cohabit-reasons';

export type ReadoutLang = 'zh' | 'en';
/** rel = 第 4 节的人猫关系 · base = 第 5 节桌子与猫脚下 · check = 第 5 节三道检查 · gap = 第 7 节读不到的关系 */
export type ReadoutKind = 'rel' | 'base' | 'check' | 'gap';
export type ReadoutPart = 4 | 5 | 7;

interface RowText {
  /** 理解一栏的判定（第 7 节是那条读不到的关系本身） */
  verdict: string;
  /** 判定相同的两行用它分开 */
  tag?: string;
  see: string;
  act: string;
}

export interface ReadoutRowDef {
  row: RuleRow;
  /** 画面与行首的记号：第 4 节写数字，桌子、猫脚下写字，三道检查写 ×，第 7 节写 ? */
  mark: { zh: string; en: string };
  part: ReadoutPart;
  kind: ReadoutKind;
  zh: RowText;
  en: RowText;
}

const same = (m: string) => ({ zh: m, en: m });

export const READOUT_ROWS: readonly ReadoutRowDef[] = [
  {
    row: 'pass', mark: same('1'), part: 4, kind: 'rel',
    zh: { verdict: '路过', see: '人在行走，路线经过单元', act: '不落台，收开挡路的带' },
    en: { verdict: 'Passing by', see: 'A person is walking and their route crosses a unit', act: 'No unit comes down. The bands in the way retract' },
  },
  {
    row: 'stand', mark: same('2'), part: 4, kind: 'rel',
    zh: { verdict: '站立注视', see: '人站着注视台上一只静止的猫，满 3 s', act: '猫相邻、离人更近的一台落下，每次站定一次' },
    en: { verdict: 'Standing and watching', see: 'A person stands watching a still cat on a unit for 3 s', act: 'The unit next to the cat, nearer the person, comes down. Once per stop' },
  },
  {
    row: 'seatFar', mark: same('3'), part: 4, kind: 'rel',
    zh: { verdict: '落座，猫未到座位前方那台', see: '人坐着，可引导的猫不在座位前方那台', act: '只落猫的下一步，逐台引到座位前方那台' },
    en: { verdict: 'Seated, cat not yet in front of the seat', see: 'A person is seated and the cat that can be led is not on the unit in front of the seat', act: 'Only the cat’s next step comes down, one unit at a time, up to the unit in front of the seat' },
  },
  {
    row: 'met', mark: same('4'), part: 4, kind: 'rel',
    zh: { verdict: '相遇', see: '人坐着，引导中的猫已在座位前方那台', act: '不再落新台，该台保持落下' },
    en: { verdict: 'Meeting', see: 'A person is seated and the cat being led is on the unit in front of the seat', act: 'No new unit comes down and that unit stays down' },
  },
  {
    row: 'catMove', mark: same('5'), part: 4, kind: 'rel',
    zh: { verdict: '猫的位置变更', see: '猫有了新的目标台，不读这次移动相对人是远离还是接近', act: '目标台约 0.7 s 落满' },
    en: { verdict: 'Cat changes place', see: 'A cat has a new target unit. Whether it moves towards or away from a person is not read', act: 'The target unit is fully down in about 0.7 s' },
  },
  {
    row: 'table', mark: { zh: '桌', en: 'T' }, part: 5, kind: 'base',
    zh: { verdict: '需要桌子', see: '人坐到座位上', act: '桌子台落到桌高' },
    en: { verdict: 'Table needed', see: 'A person sits down on a seat', act: 'The table unit comes down to table height' },
  },
  {
    row: 'foot', mark: { zh: '脚', en: 'C' }, part: 5, kind: 'base',
    zh: { verdict: '台被猫占用', see: '猫在一台上', act: '保持落下，猫离开后收回' },
    en: { verdict: 'Occupied by a cat', see: 'A cat is on a unit', act: 'Stays down and withdraws after the cat leaves' },
  },
  {
    row: 'overHead', mark: same('×'), part: 5, kind: 'check',
    zh: { verdict: '与人的身体冲突', tag: '头顶', see: '要落的台会伸到坐着的人头顶上方', act: '不落，已落的收回' },
    en: { verdict: 'Clash with a body', tag: 'over a head', see: 'The unit would reach over a seated person’s head', act: 'Does not come down, and one already down withdraws' },
  },
  {
    row: 'press', mark: same('×'), part: 5, kind: 'check',
    zh: { verdict: '与人的身体冲突', tag: '台角', see: '猫的目标台没落过一半，台角会碰到站着的人', act: '暂不落，猫等待' },
    en: { verdict: 'Clash with a body', tag: 'corner', see: 'The cat’s target unit is less than half down and its corner would hit a standing person', act: 'Does not come down yet and the cat waits' },
  },
  {
    row: 'r5', mark: same('×'), part: 5, kind: 'check',
    zh: { verdict: '会困住人', see: '一台落成墙，会使原本有路的人无路到门', act: '停在墙线以下' },
    en: { verdict: 'Would trap someone', see: 'Forming a wall would leave someone who had a way to the door without one', act: 'Held below the wall line' },
  },
  {
    row: 'gapApproachOther', mark: same('?'), part: 7, kind: 'gap',
    zh: { verdict: '引导中的猫正在向别人移动', see: '不在输入里', act: '继续引导' },
    en: { verdict: 'Cat being led moves towards someone else', see: 'Not in the input', act: 'Keeps leading' },
  },
  {
    row: 'gapWatchedOther', mark: same('?'), part: 7, kind: 'gap',
    zh: { verdict: '引导中的猫正被别人注视', see: '不在输入里', act: '继续递台' },
    en: { verdict: 'Cat being led is watched by someone else', see: 'Not in the input', act: 'Keeps offering units' },
  },
];

export const READOUT_ROW_OF: ReadonlyMap<RuleRow, ReadoutRowDef> = new Map(READOUT_ROWS.map((r) => [r.row, r]));

export const READOUT_PARTS: Record<ReadoutPart, { zh: string; en: string }> = {
  4: { zh: '人猫关系', en: 'Person and cat' },
  5: { zh: '与关系无关', en: 'Regardless of the relation' },
  7: { zh: '读不到的关系', en: 'Not read' },
};

/** 一行里感知、干预两栏的名字（第 7 节换成「单元 · 现行处理」） */
export const READOUT_FLOW: Record<ReadoutLang, { see: string; act: string; gapSee: string; gapAct: string }> = {
  zh: { see: '感知', act: '干预', gapSee: '单元', gapAct: '现行处理' },
  en: { see: 'Sense', act: 'Act', gapSee: 'Unit', gapAct: 'Handled as' },
};

/** 点一台单元时卡上写的理由（cohabit-reasons 的六个理由，记号与读数行一致） */
export const READOUT_REASONS: Record<UnitReasonKind, { row: RuleRow; zh: string; en: string }> = {
  table: { row: 'table', zh: '桌子', en: 'Table' },
  step: { row: 'seatFar', zh: '引猫：路上的一步', en: 'Leading a cat: a step on the way' },
  meet: { row: 'met', zh: '引猫：座位前方那台', en: 'Leading a cat: the unit in front of the seat' },
  offer: { row: 'stand', zh: '站立注视：给一步', en: 'Standing and watching: one step' },
  foot: { row: 'foot', zh: '猫在这台上', en: 'A cat is on it' },
  go: { row: 'catMove', zh: '猫的目标台', en: 'The cat’s target unit' },
  climb: { row: 'catMove', zh: '猫要跳上的台', en: 'The unit the cat jumps onto' },
};

/** 走势留多少秒（仿真时间） */
export const READOUT_HIST = 90;

// ── 名字：第一次出现时发号，删掉不回收，换一场才重来（人和猫共用一套 id，不能直接拿 id 当号） ──────────

export class ReadoutLabels {
  private people = new Map<number, number>();
  private cats = new Map<number, number>();

  reset(): void {
    this.people.clear();
    this.cats.clear();
  }

  /** 按此刻数组顺序给还没号的人和猫发号（新加的排在后面） */
  sync(sim: Pick<CohabitSim, 'people' | 'cats'>): void {
    for (const p of sim.people) if (!this.people.has(p.id)) this.people.set(p.id, this.people.size + 1);
    for (const c of sim.cats) if (!this.cats.has(c.id)) this.cats.set(c.id, this.cats.size + 1);
  }

  /** 访客的号（1、2、3…）；没见过的返回 0 */
  personNo(id: number): number {
    return this.people.get(id) ?? 0;
  }

  /** 猫的字母（A、B、C…，过了 Z 接 AA） */
  catLetter(id: number): string {
    let n = this.cats.get(id) ?? 0;
    if (!n) return '?';
    let s = '';
    while (n > 0) {
      n -= 1;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  person(id: number, lang: ReadoutLang): string {
    const n = this.personNo(id);
    const k = n ? String(n) : '?';
    return lang === 'zh' ? `访客 ${k}` : `Visitor ${k}`;
  }

  cat(id: number, lang: ReadoutLang): string {
    return lang === 'zh' ? `猫 ${this.catLetter(id)}` : `Cat ${this.catLetter(id)}`;
  }
}

/** 「谁对谁」那一句。单元编号画面上看不到，所以只写人、猫和台数，要看是哪一台就点画面 */
export function readoutWho(h: RuleHit, sim: CohabitSim, labels: ReadoutLabels, lang: ReadoutLang): string {
  const zh = lang === 'zh';
  const ps = h.people.map((id) => labels.person(id, lang));
  const cs = h.cats.map((id) => labels.cat(id, lang));
  switch (h.row) {
    case 'pass': {
      const n = h.bands?.length ?? 0;
      return zh ? `${ps[0]} · 收开 ${n} 条带` : `${ps[0]} · ${n} band${n === 1 ? '' : 's'} retracted`;
    }
    case 'seatFar': {
      const g = sim.guides.find((q) => q.kind === 'sit' && q.person === h.people[0]);
      const c = sim.cats.find((q) => q.id === h.cats[0]);
      const left = g ? g.path.length - (c && c.unit ? 1 : 0) : 0;
      return zh ? `${ps[0]} → ${cs[0]} · 还差 ${left} 台` : `${ps[0]} → ${cs[0]} · ${left} unit${left === 1 ? '' : 's'} to go`;
    }
    case 'met':
      return `${ps[0]} · ${cs[0]}`;
    case 'stand':
      return zh ? `${ps[0]} 注视 ${cs[0]}` : `${ps[0]} watching ${cs[0]}`;
    case 'gapApproachOther':
      return zh ? `${cs[0]} 由 ${ps[0]} 引导 · 向 ${ps[1]} 移动` : `${cs[0]} led by ${ps[0]} · moving towards ${ps[1]}`;
    case 'gapWatchedOther':
      return zh ? `${cs[0]} 由 ${ps[0]} 引导 · ${ps[1]} 注视` : `${cs[0]} led by ${ps[0]} · watched by ${ps[1]}`;
    default: {
      const named = [ps.join(zh ? '、' : ', '), cs.join(zh ? '、' : ', ')].filter(Boolean).join(' · ');
      const n = h.units.length;
      return named || (zh ? `${n} 台` : `${n} unit${n === 1 ? '' : 's'}`);
    }
  }
}

// ── 记账：累计次数按「新出现的一条」记，走势按仿真秒记 ──────────────────────────────────────────

/** 同一条成立持续多帧只记一次：按行 + 人 + 猫（③ 与 ① 不看单元——引猫换到下一步、收开的带变了都还是同一条） */
export function readoutKey(h: RuleHit): string {
  return `${h.row}|${h.people.join(',')}|${h.cats.join(',')}|${h.row === 'seatFar' || h.row === 'pass' ? '' : h.units.join(',')}`;
}

export class ReadoutTracker {
  readonly totals = new Map<RuleRow, number>();
  /** 每行最近 READOUT_HIST 个仿真秒、每秒那一刻成立几条 */
  readonly hist = new Map<RuleRow, number[]>();
  private live = new Set<string>();
  private lastSec = 0;

  constructor(t0 = 0) {
    this.reset(t0);
  }

  reset(t0 = 0): void {
    this.totals.clear();
    this.live = new Set();
    for (const r of READOUT_ROWS) this.hist.set(r.row, []);
    this.lastSec = Math.floor(t0);
  }

  /** 每推进一次仿真调一次；t = 仿真时间（s） */
  account(hits: readonly RuleHit[], t: number): void {
    const keys = new Set<string>();
    const count = new Map<RuleRow, number>();
    for (const h of hits) {
      const k = readoutKey(h);
      keys.add(k);
      if (!this.live.has(k)) this.totals.set(h.row, (this.totals.get(h.row) ?? 0) + 1);
      count.set(h.row, (count.get(h.row) ?? 0) + 1);
    }
    this.live = keys;
    const sec = Math.floor(t);
    // 一帧跨过几秒（倍速高时）每秒都补一格，最多补满窗口
    const from = Math.max(this.lastSec, sec - READOUT_HIST);
    for (let s = from; s < sec; s++)
      for (const r of READOUT_ROWS) {
        const a = this.hist.get(r.row)!;
        a.push(count.get(r.row) ?? 0);
        if (a.length > READOUT_HIST) a.shift();
      }
    if (sec > this.lastSec) this.lastSec = sec;
  }
}

// ── 交给面板的一份快照 ───────────────────────────────────────────────────────────────────

export interface ReadoutRowSnap {
  def: ReadoutRowDef;
  /** 此刻成立几条 */
  now: number;
  /** 此刻成立的每一条「谁对谁」（脚下那一行不写名字，猫脚下的台本来就随猫走） */
  who: string[];
  total: number;
  hist: readonly number[];
}

export interface ReadoutSnap {
  rows: ReadoutRowSnap[];
  /** 每节此刻成立几行 */
  partOn: Record<ReadoutPart, number>;
}

export function readoutSnapshot(hits: readonly RuleHit[], tracker: ReadoutTracker, sim: CohabitSim, labels: ReadoutLabels, lang: ReadoutLang): ReadoutSnap {
  const byRow = new Map<RuleRow, RuleHit[]>();
  for (const h of hits) {
    if (!byRow.has(h.row)) byRow.set(h.row, []);
    byRow.get(h.row)!.push(h);
  }
  const partOn: Record<ReadoutPart, number> = { 4: 0, 5: 0, 7: 0 };
  const rows = READOUT_ROWS.map((def) => {
    const list = byRow.get(def.row) ?? [];
    if (list.length) partOn[def.part] += 1;
    return {
      def,
      now: list.length,
      who: def.row === 'foot' ? [] : list.map((h) => readoutWho(h, sim, labels, lang)),
      total: tracker.totals.get(def.row) ?? 0,
      hist: tracker.hist.get(def.row)!.slice(),
    };
  });
  return { rows, partOn };
}

// ── 点一台单元：它此刻为什么落、被什么拦着 ──────────────────────────────────────────────────

export interface UnitCard {
  unit: number;
  /** 1 = 落满 · (0,1) = 落到几成 · 0 = 收着 */
  degree: number;
  reasons: { mark: string; kind: ReadoutKind; name: string; who: string }[];
  blocks: { see: string; act: string }[];
}

export function unitCard(sim: CohabitSim, hits: readonly RuleHit[], u: number, labels: ReadoutLabels, lang: ReadoutLang): UnitCard {
  const reasons = unitReasons(sim)[u].map((r) => {
    const name = READOUT_REASONS[r.kind];
    const def = READOUT_ROW_OF.get(name.row)!;
    const who = [r.person !== undefined ? labels.person(r.person, lang) : '', r.cat !== undefined ? labels.cat(r.cat, lang) : ''].filter(Boolean).join(' · ');
    return { mark: def.mark[lang], kind: def.kind, name: name[lang], who };
  });
  const blocks = hits
    .filter((h) => (h.row === 'overHead' || h.row === 'press' || h.row === 'r5') && h.units.includes(u))
    .map((h) => {
      const t = READOUT_ROW_OF.get(h.row)![lang];
      return { see: t.see, act: t.act };
    });
  return { unit: u, degree: sim.act.degree[u], reasons, blocks };
}

/** 单元卡上的状态字：落满 / 落到几成 / 收着 */
export function unitState(degree: number, lang: ReadoutLang): string {
  if (degree >= 1 - 1e-9) return lang === 'zh' ? '落满' : 'fully down';
  if (degree > 1e-6) return lang === 'zh' ? `落到 ${Math.round(degree * 100)}%` : `${Math.round(degree * 100)}% down`;
  return lang === 'zh' ? '收着' : 'stowed';
}

// ── 最近触发（2026-11-23）：一次新出现的理由 = 一条「感知 → 理解 → 干预」 ─────────────────────────────
// 上面的读数是「此刻成立的状态」；这里记的是「刚刚被调动的那一次」：哪一台、因为看到了什么、认定成什么、怎么动。
// 只记会让单元动起来的六个理由与三道检查；猫脚下那台不记（猫站上去以后台保持落下，是结果不是触发）。

/** 被调动的是哪一样：六个让单元落下的理由（猫脚下除外）或三道检查之一 */
export type FeedKind = Exclude<UnitReasonKind, 'foot'> | 'overHead' | 'press' | 'r5';

export interface FeedEntry {
  /** 发号，越大越新 */
  id: number;
  /** 仿真时间（s） */
  t: number;
  unit: number;
  kind: FeedKind;
  person?: number;
  cat?: number;
}

/** 面板上留几条 */
export const READOUT_FEED_N = 3;

const FEED_ROW: Record<FeedKind, RuleRow> = {
  table: 'table', step: 'seatFar', meet: 'met', offer: 'stand', go: 'catMove', climb: 'catMove',
  overHead: 'overHead', press: 'press', r5: 'r5',
};

export class ReadoutFeed {
  /** 新的在前，最多 READOUT_FEED_N 条 */
  readonly list: FeedEntry[] = [];
  private live = new Set<string>();
  private seeded = false;
  private next = 1;

  reset(): void {
    this.list.length = 0;
    this.live = new Set();
    this.seeded = false;
  }

  /**
   * 每推进一次仿真调一次。why = unitReasons(sim)，hits = ruleReadout(sim)（调用处本来就算了，不再算一遍）。
   * reset 之后的第一次只记下此刻已有的理由、不出条目（「放一场」先跑了 90 秒，开场那一刻的理由不算刚被调动）。
   */
  account(t: number, why: readonly (readonly UnitReason[])[], hits: readonly RuleHit[]): void {
    const keys = new Set<string>();
    const fresh: Omit<FeedEntry, 'id'>[] = [];
    const add = (key: string, e: Omit<FeedEntry, 'id'>) => {
      keys.add(key);
      if (!this.live.has(key)) fresh.push(e);
    };
    for (let u = 0; u < why.length; u++)
      for (const r of why[u]) {
        if (r.kind === 'foot') continue;
        add(`${u}|${r.kind}|${r.person ?? ''}|${r.cat ?? ''}`, { t, unit: u, kind: r.kind, person: r.person, cat: r.cat });
      }
    for (const h of hits) {
      if (h.row !== 'overHead' && h.row !== 'press' && h.row !== 'r5') continue;
      add(readoutKey(h), { t, unit: h.units[0], kind: h.row, person: h.people[0], cat: h.cats[0] });
    }
    this.live = keys;
    if (!this.seeded) {
      this.seeded = true;
      return;
    }
    for (const e of fresh) this.list.unshift({ ...e, id: this.next++ });
    if (this.list.length > READOUT_FEED_N) this.list.length = READOUT_FEED_N;
  }
}

export interface FeedText {
  id: number;
  unit: number;
  mark: string;
  kind: ReadoutKind;
  /** 仿真时间 m:ss */
  clock: string;
  see: string;
  verdict: string;
  act: string;
}

const clockOf = (t: number): string => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 一条写成三句：单元看到了什么 · 认定成什么（规则文档第 4、5 节的判定）· 哪一台怎么动 */
export function feedText(e: FeedEntry, labels: ReadoutLabels, lang: ReadoutLang): FeedText {
  const zh = lang === 'zh';
  const P = e.person !== undefined ? labels.person(e.person, lang) : zh ? '有人' : 'someone';
  const C = e.cat !== undefined ? labels.cat(e.cat, lang) : zh ? '猫' : 'a cat';
  const N = zh ? `第 ${e.unit + 1} 台` : `Unit ${e.unit + 1}`;
  const def = READOUT_ROW_OF.get(FEED_ROW[e.kind])!;
  const v = def[lang];
  const see: Record<FeedKind, string> = zh
    ? {
        table: `${P} 坐下`,
        step: `${P} 坐着，${C} 未到座位前方那台`,
        meet: `${P} 坐着，${C} 下一步到座位前方那台`,
        offer: `${P} 站着注视 ${C} 满 3 s`,
        go: `${C} 有了新的目标台`,
        climb: `${C} 要从地面跳上一台`,
        overHead: `要落的台会伸到 ${P} 头顶上方`,
        press: `台角会碰到站着的 ${P}`,
        r5: '落成墙会使有人无路到门',
      }
    : {
        table: `${P} sits down`,
        step: `${P} is seated, ${C} is not yet in front of the seat`,
        meet: `${P} is seated, ${C} is one step from the seat`,
        offer: `${P} stands watching ${C} for 3 s`,
        go: `${C} has a new target unit`,
        climb: `${C} is about to jump up from the floor`,
        overHead: `The unit would reach over ${P}’s head`,
        press: `Its corner would hit ${P}, standing`,
        r5: 'A wall here would leave someone without a way out',
      };
  const act: Record<FeedKind, string> = zh
    ? {
        table: `${N} 落到桌高`,
        step: `${N} 落下，作 ${C} 的下一步`,
        meet: `${N}（座位前方那台）落下`,
        offer: `${N} 落下，给 ${C} 一步`,
        go: `${N} 约 0.7 s 落满`,
        climb: `${N} 约 0.7 s 落满`,
        overHead: `${N} 不落`,
        press: `${N} 暂不落，${C} 等待`,
        r5: `${N} 停在墙线以下`,
      }
    : {
        table: `${N} comes down to table height`,
        step: `${N} comes down as ${C}’s next step`,
        meet: `${N}, in front of the seat, comes down`,
        offer: `${N} comes down as one step for ${C}`,
        go: `${N} is fully down in about 0.7 s`,
        climb: `${N} is fully down in about 0.7 s`,
        overHead: `${N} does not come down`,
        press: `${N} waits, and so does ${C}`,
        r5: `${N} is held below the wall line`,
      };
  return {
    id: e.id,
    unit: e.unit,
    mark: def.mark[lang],
    kind: def.kind,
    clock: clockOf(e.t),
    see: see[e.kind],
    verdict: v.tag ? `${v.verdict} · ${v.tag}` : v.verdict,
    act: act[e.kind],
  };
}

/** 台上那枚记号用哪个理由（一台几个理由时按这个先后取一个） */
const MARK_ORDER: readonly UnitReasonKind[] = ['table', 'meet', 'step', 'offer', 'climb', 'go', 'foot'];

/** 每台此刻挂哪枚记号（没有理由 = null）：立体台架挂在台面上方，与读数行同一个记号 */
export function unitMarks(why: readonly (readonly UnitReason[])[], lang: ReadoutLang): ({ mark: string; kind: ReadoutKind; row: RuleRow } | null)[] {
  return why.map((rs) => {
    if (!rs.length) return null;
    const k = MARK_ORDER.find((m) => rs.some((r) => r.kind === m)) ?? rs[0].kind;
    const def = READOUT_ROW_OF.get(READOUT_REASONS[k].row)!;
    return { mark: def.mark[lang], kind: def.kind, row: def.row };
  });
}
