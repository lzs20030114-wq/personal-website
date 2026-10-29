/**
 * 「轮回机器」案例页里被做成构件的结构化内容 + 示意台的纯逻辑
 * （design-ref/case-01-dark「10 Case 01」稿，MAPPING §45）。
 *
 * 纯数据与纯函数——不碰 DOM / fs / React，服务端与 'use client' 两边都能 import，
 * 也因此能在 node 下单测（case-reincarnation.test.ts）。
 *
 * 为什么这些放 TS 而不放 MDX：这几块（人格参数表、预测表、技术参数、生命周期、
 * 系统逻辑……）在稿里是**同一份数据驱动多处**——例如人格表既是参数表、又给示意台
 * 取呼吸周期/幅度、还给衰老曲线取「怎么死」那一行。数据一份、两处读，比在 MDX 里写
 * 两遍再指望它们对得上稳。散文仍在 MDX（content/work/reincarnation-machine/*.mdx），
 * 构件只在 MDX 里占位。
 *
 * 文案来源与处置（见 MAPPING §45；2026-10-29 重构见 §79）：
 * - 人格参数表 2026-10-29 起整张由行为引擎的人格表现算（此前是 4 月那张定性底表的原文）；
 * - 技术参数 2026-10-29 按 815.3dm（交接图册实测）改了外形、环间距、零件数、臂、触须、执行器几行，其余仍是作者原文；
 * - 预测表 = 线上 MDX 原文逐字（2026-04-03 写下，保留原样以便与数据对照）；
 * - 其余被稿改成构件的块（组成/五层/闭合/数字对比/系统逻辑/干扰/现状）= 稿内数据，
 *   它们是对线上段落的压缩重排，细节没丢；
 * - 中英各自成文，每个 Bi 两侧必须齐全（测试卡）。
 * - 2026-10-22 按作者要求去 AI 味：组成/五层/闭合/现状/示意台说明里的分号拆成句号或逗号，
 *   「已取消：」那个引出原因的冒号改逗号；人格参数表、预测表、技术参数是作者原文，一字不动。
 */

import { PERSONAS as ENGINE_PERSONAS } from '../linkage/behavior/persona';

export type Lang = 'zh' | 'en';
export type Bi = { zh: string; en: string };
const L = (zh: string, en: string): Bi => ({ zh, en });
export const tx = (b: Bi, lang: Lang): string => b[lang];

/* ── 色 ─────────────────────────────────────────────────────────────────── */
export const INK = 'oklch(0.95 0.032 120)';
export const PAPER = 'oklch(0.19 0.032 228)';
export const MUTE = 'oklch(0.8 0.035 162)';
export const DIM = 'oklch(0.7 0.03 168)';
export const G = 'oklch(0.74 0.1 150)';
export const GH = 'oklch(0.86 0.08 130)';
export const VI = 'oklch(0.72 0.095 291)';
export const AM = 'oklch(0.83 0.12 85)';
export const BL = 'oklch(0.74 0.06 235)';

/* ── 四套人格 ─────────────────────────────────────────────────────────────── */
export type PersonaKey = 'A' | 'B' | 'C' | 'D';
export interface Persona {
  k: PersonaKey;
  name: Bi;
  ink: string;
  /** 呼吸周期（秒） */
  period: number;
  /** 呼吸幅度 0–1 */
  depth: number;
  /** 响应延迟（秒）；null = 每次随机 */
  lat: number | null;
  /** 响应强度 0–1；null = 每次随机 */
  s: number | null;
}
/**
 * 人格表整张取自行为引擎（src/lib/linkage/behavior/persona.ts，按槽位字母 A–D），这一页不另存一份数。
 * 2026-10-29 项目一案例页重构：名字跟着引擎改成 2026-10-14 用户重分的四种（热情 / 沉静 / 回避 / 乱序随机），
 * 表也从 4 月那张定性底表（活力 / 沉静 / 好奇 / 不稳定，史料见 轮回机器_行为引擎spec.md §4.1）换成引擎现行的数。
 * 2026-10-20 起四种人格平时的呼吸收拢在 3.5–4.5 s、50–70%（呼吸是生理信号，会变的是互动引起的唤醒）。
 */
const BR = (k: PersonaKey) => ENGINE_PERSONAS[k];
/** D 型每口气重抽的区间（示意台用） */
export const D_PERIOD = BR('D').breathPeriod;
export const D_DEPTH = BR('D').breathAmp;
/** 回应幅度 ⑤ 换成示意台的 0–1：+50% 记满 */
const gainTo01 = (g: number) => Math.min(1, g / 0.5);
const NAME = (k: PersonaKey): Bi => L(BR(k).zh, BR(k).en);
export const PERSONAS: readonly Persona[] = [
  { k: 'A', name: NAME('A'), ink: 'oklch(0.84 0.12 135)', period: BR('A').breathPeriod[0], depth: BR('A').breathAmp[0], lat: BR('A').latency[0], s: gainTo01(BR('A').gain[0]) },
  { k: 'B', name: NAME('B'), ink: 'oklch(0.76 0.08 225)', period: BR('B').breathPeriod[0], depth: BR('B').breathAmp[0], lat: BR('B').latency[0], s: gainTo01(BR('B').gain[0]) },
  { k: 'C', name: NAME('C'), ink: 'oklch(0.78 0.1 335)', period: BR('C').breathPeriod[0], depth: BR('C').breathAmp[0], lat: BR('C').latency[0], s: gainTo01(BR('C').gain[0]) },
  { k: 'D', name: NAME('D'), ink: 'oklch(0.83 0.12 85)', period: (D_PERIOD[0] + D_PERIOD[1]) / 2, depth: (D_DEPTH[0] + D_DEPTH[1]) / 2, lat: null, s: null },
];
/** 乱序随机每次回应重抽的延迟 / 强度区间（示意台用，取自引擎 ④ ⑤） */
export const D_LATENCY = BR('D').latency;
export const D_STRENGTH: readonly [number, number] = [gainTo01(BR('D').gain[0]), gainTo01(BR('D').gain[1])];
const pct = (v: number): string => `${Math.round(v * 100)}`;

/** 参数表：十四行 × 四列（A/B/C/D），全部由引擎人格表现算。 */
export interface PersonaRow {
  k: Bi;
  cells: { zh: readonly [string, string, string, string]; en: readonly [string, string, string, string] };
}
type Four<T> = [T, T, T, T];
const KEYS: Four<PersonaKey> = ['A', 'B', 'C', 'D'];
const num = (v: number) => String(Math.round(v * 100) / 100);
/** 单值 / 区间按同一种写法：「3.5 秒」「3–5 秒」；unit 两种语言各一个 */
const span = (r: readonly [number, number], f: (v: number) => string = num) => (r[0] === r[1] ? f(r[0]) : `${f(r[0])}–${f(r[1])}`);
const rowOf = (zhK: string, enK: string, cell: (k: PersonaKey) => Bi): PersonaRow => {
  const c = KEYS.map(cell);
  return { k: L(zhK, enK), cells: { zh: c.map((x) => x.zh) as Four<string>, en: c.map((x) => x.en) as Four<string> } };
};
const unit = (zhU: string, enU: string, r: (k: PersonaKey) => readonly [number, number], f?: (v: number) => string) => (k: PersonaKey) =>
  L(`${span(r(k), f)}${zhU}`, `${span(r(k), f)}${enU}`);
const DEATH_EN: Record<string, string> = {
  turn: 'winds down, stops facing the person',
  quiet: 'slows quietly to a stop',
  withdraw: 'turns away, then slowly stops',
  arrhythmia: 'rhythm falls apart, then fades',
};

export const PERSONA_ROWS: readonly PersonaRow[] = [
  rowOf('呼吸周期（平时）', 'Breath period (at rest)', unit(' 秒', ' s', (k) => BR(k).breathPeriod)),
  rowOf('呼吸幅度（平时）', 'Breath depth (at rest)', unit('%', '%', (k) => BR(k).breathAmp, pct)),
  rowOf('运动速度', 'Motion speed', unit(' cm/s', ' cm/s', (k) => BR(k).speed)),
  rowOf('响应延迟', 'Response latency', unit(' 秒', ' s', (k) => BR(k).latency)),
  rowOf('回应幅度', 'Response size', (k) => L(`+${span(BR(k).gain, pct)}%`, `+${span(BR(k).gain, pct)}%`)),
  rowOf('自发动作间隔', 'Idle-motion interval', unit(' 秒', ' s', (k) => BR(k).spont)),
  rowOf('声音基频', 'Voice pitch', unit(' Hz', ' Hz', (k) => BR(k).voiceFreq)),
  rowOf('发声占比', 'Voice duty', unit('%', '%', (k) => BR(k).voiceDuty, pct)),
  rowOf('朝向变化间隔', 'Reorientation interval', unit(' 秒', ' s', (k) => BR(k).orient)),
  rowOf('朝向人的概率', 'Turns toward a person', (k) => L(`${pct(BR(k).toward)}%`, `${pct(BR(k).toward)}%`)),
  rowOf('不朝人时', 'Otherwise', (k) =>
    BR(k).otherwise === 'random' ? L('随便看；对手是看别处', 'looks around; looks elsewhere from a hand') : L('背向人；对手是躲开', 'turns away; keeps away from a hand'),
  ),
  rowOf('惊吓阈值', 'Startle threshold', (k) => L(span(BR(k).startle), span(BR(k).startle))),
  rowOf('死亡方式', 'How it dies', (k) =>
    L(`${BR(k).death.zh}（${BR(k).death.dur} 秒）`, `${DEATH_EN[BR(k).death.kind]} (${BR(k).death.dur} s)`),
  ),
  rowOf('对人的趋避', 'Toward or away from people', (k) => {
    const st = BR(k).stance;
    if (st[0] !== st[1]) return L(`±${span(st)}，每回合随机迎或躲`, `±${span(st)}, toward or away each time`);
    if (st[0] > 0) return L('+1，朝人张开', '+1, opens toward people');
    if (st[0] < 0) return L('−1，收拢、背着人', '−1, closes up, turns away');
    return L('0，不受影响', '0, unaffected');
  }),
];
export const DEATH_ROW = PERSONA_ROWS.findIndex((r) => r.k.en === 'How it dies');

/** 衰老曲线上方那一行「怎么死」：取第 i 套人格那一列的死亡方式（不带时长）。 */
export const deathLabel = (i: number): Bi => L(BR(KEYS[i]).death.zh, DEATH_EN[BR(KEYS[i]).death.kind]);

/* ── 生命周期状态图（N05）────────────────────────────────────────────────── */
export interface LifeSeg {
  n: Bi;
  dur: string;
  /** 条宽权重（flex-grow）；不等比于时长——死亡一格要留够写字的宽度 */
  g: number;
  bg: string;
  fg?: string;
}
export const LIFE: readonly LifeSeg[] = [
  { n: L('诞生', 'Birth'), dur: '1′', g: 1, bg: 'oklch(0.86 0.08 130 / .32)' },
  { n: L('成长与互动', 'Growth & interaction'), dur: '4′', g: 4, bg: 'oklch(0.74 0.1 150 / .22)' },
  { n: L('衰老', 'Ageing'), dur: '1.5′', g: 1.5, bg: 'oklch(0.72 0.095 291 / .3)' },
  // 死亡段 = 按人格的死法，60–120 s（行为引擎 spec §5.1、§5.4）；此前这一格画成一瞬
  { n: L('死亡', 'Death'), dur: "1–2′", g: 1.5, bg: 'oklch(0.95 0.032 120 / .85)', fg: PAPER },
  {
    n: L('空白', 'Blank'),
    dur: '45″',
    g: 0.75,
    bg: 'repeating-linear-gradient(45deg,oklch(0.95 0.032 120 / .08) 0 1px,transparent 1px 7px)',
  },
];
export const LTOT = LIFE.reduce((a, s) => a + s.g, 0);
export const LIVES: readonly Bi[] = [L('第一世', 'Life 1'), L('第二世', 'Life 2'), L('第三世', 'Life 3'), L('第四世', 'Life 4')];
/** 示意节奏：一世 9 秒（≈ 8–9 分钟压缩，1 秒 ≈ 1 分钟），四世一轮 36 秒。 */
export const LIFE_SECONDS = 9;
export const LIFE_LOOP = LIFE_SECONDS * LIVES.length;

/** 播放头状态：elapsed 秒 → 第几世、这一世走到哪（0–1）、在哪一段。 */
export function lifeState(elapsed: number): { life: number; w: number; stage: number } {
  const T = ((elapsed % LIFE_LOOP) + LIFE_LOOP) % LIFE_LOOP;
  const life = Math.floor(T / LIFE_SECONDS);
  const w = (T % LIFE_SECONDS) / LIFE_SECONDS;
  const m = w * LTOT;
  let acc = 0;
  let stage = 0;
  for (let i = 0; i < LIFE.length; i++) {
    acc += LIFE[i].g;
    if (m < acc) {
      stage = i;
      break;
    }
  }
  return { life, w, stage };
}

/* ── 衰老曲线（N17）──────────────────────────────────────────────────────── */
export const AGEING_MARKS: readonly { at: number; label: Bi }[] = [
  { at: 0.1, label: L('呼吸变浅', 'shallower breath') },
  { at: 0.34, label: L('回应变慢', 'slower responses') },
  { at: 0.56, label: L('节律变得不规则', 'irregular rhythm') },
  { at: 0.765, label: L('最后一次呼吸', 'last breath') },
  { at: 0.86, label: L('45 秒静止', '45 s of stillness') },
];
/** 最后一次呼吸在曲线上的位置（0–1）；其后是静止。 */
export const AGEING_END = 0.765;

/** 带种子的小随机数（mulberry32）：衰老曲线要每次刷新都一样，不能用 Math.random。 */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 第 k 套人格的衰老趋势（900 点，0–1）。只画趋势：数值待作者提供（页面注里写明）。
 * 四种死法对应表里「死亡方式」一行（行为引擎 §5.4）：A 精力渐尽、最后朝向人停下 / B 安静慢慢停下 /
 * C 背过身慢慢停下（幅度形状同 A，转身在示意之外）/ D 节律紊乱后渐弱（周期与幅度逐周期抖动，越老越乱）。
 */
export function ageTrace(k: number): Float32Array {
  const N = 900;
  const out = new Float32Array(N);
  const r = rng(11 + k * 7);
  const END = AGEING_END;
  const cyc = [24, 9, 13, 17][k];
  let ph = 0;
  let jit = 1;
  let pj = 1;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    if (x >= END) {
      out[i] = 0;
      continue;
    }
    const u = x / END;
    const w = 1 - u;
    let amp: number;
    let per: number;
    if (k === 0) {
      amp = 0.85 * Math.pow(w, 0.55);
      per = 1 + 0.7 * u;
    } else if (k === 1) {
      amp = 0.34 * Math.pow(w, 1.05);
      per = 1 + 1.3 * u;
    } else if (k === 2) {
      amp = 0.55 * Math.pow(w, 0.8);
      per = 1 + 0.9 * u;
    } else {
      amp = 0.72 * Math.pow(w, 0.7) * jit;
      per = (1 + 0.8 * u) * pj;
    }
    const prev = ph;
    ph += ((1 / (N - 1)) * 2 * Math.PI * cyc) / END / per;
    if (Math.floor(prev / (2 * Math.PI)) !== Math.floor(ph / (2 * Math.PI))) {
      const irr = k === 3 ? 0.25 + u * 0.9 : u * u * 0.5;
      jit = 1 - irr * 0.6 + r() * irr * 0.9;
      pj = 1 - irr * 0.4 + r() * irr * 0.9;
    }
    out[i] = Math.max(0, amp * (0.5 - 0.5 * Math.cos(ph)) + (r() - 0.5) * u * u * (k === 3 ? 0.05 : 0.02));
  }
  return out;
}

/* ── 人格示意台（N06）的纯逻辑 ────────────────────────────────────────────── */
export interface Pulse {
  /** 被碰的时刻 */
  touch: number;
  /** 回应开始的时刻 = touch + 延迟 */
  at: number;
  /** 回应强度 */
  s: number;
}
/** 保留多少秒历史（画布左边界）。 */
export const PERSONA_WINDOW = 10;

/**
 * 示意台的呼吸模拟：呼吸 = 余弦起伏，周期/幅度向目标人格缓动；碰一下 = 延迟后一个
 * 衰减脉冲叠加。D 型每个呼吸周期重抽一次周期与幅度（表里写的「随机」）。
 * 随机数可注入——线上用 Math.random，测试用带种子的，才能断言行为。
 */
export class PersonaSim {
  t = 0;
  ph = 0;
  per = 2;
  dep = 0.5;
  y = 0;
  hist: [number, number][] = [];
  pulses: Pulse[] = [];
  private dPer = (D_PERIOD[0] + D_PERIOD[1]) / 2;
  private dDep = (D_DEPTH[0] + D_DEPTH[1]) / 2;
  constructor(private readonly rnd: () => number = Math.random) {}

  step(dt: number, p: Persona): void {
    this.t += dt;
    const tp = p.k === 'D' ? this.dPer : p.period;
    const td = p.k === 'D' ? this.dDep : p.depth;
    const ease = Math.min(1, dt * 1.5);
    this.per += (tp - this.per) * ease;
    this.dep += (td - this.dep) * ease;
    const prev = this.ph;
    this.ph += (dt / this.per) * Math.PI * 2;
    if (Math.floor(prev / (Math.PI * 2)) !== Math.floor(this.ph / (Math.PI * 2))) {
      this.dPer = D_PERIOD[0] + this.rnd() * (D_PERIOD[1] - D_PERIOD[0]);
      this.dDep = D_DEPTH[0] + this.rnd() * (D_DEPTH[1] - D_DEPTH[0]);
    }
    let y = this.dep * (0.5 - 0.5 * Math.cos(this.ph));
    for (const pl of this.pulses) {
      const k = this.t - pl.at;
      if (k > 0) y += pl.s * 0.55 * (k / 0.22) * Math.exp(1 - k / 0.22);
    }
    if (dt > 0) this.hist.push([this.t, y]);
    while (this.hist.length && this.hist[0][0] < this.t - (PERSONA_WINDOW + 0.5)) this.hist.shift();
    this.pulses = this.pulses.filter((pl) => pl.touch > this.t - (PERSONA_WINDOW + 0.5));
    this.y = y;
  }

  /** 碰一下：返回这一次实际的延迟与强度（D 型是随机的），供读数显示。 */
  touch(p: Persona): { lat: number; str: number } {
    const lat = p.lat ?? D_LATENCY[0] + this.rnd() * (D_LATENCY[1] - D_LATENCY[0]);
    const str = p.s ?? D_STRENGTH[0] + this.rnd() * (D_STRENGTH[1] - D_STRENGTH[0]);
    this.pulses.push({ touch: this.t, at: this.t + lat, s: str });
    return { lat, str };
  }
}

/* ── 生命周期读数、示意台读数的文案 ───────────────────────────────────────── */
export const strengthWord = (v: number, lang: Lang): string => {
  const words = lang === 'zh' ? ['小', '中', '大'] : ['small', 'medium', 'large'];
  return words[v < 0.45 ? 0 : v < 0.8 ? 1 : 2];
};

/* ── 03 · 它由什么组成 ───────────────────────────────────────────────────── */
export const PARTS: readonly { n: string; name: Bi; x: Bi }[] = [
  {
    n: '5',
    name: L('呼吸环', 'breathing rings'),
    x: L(
      '五道会张合的环沿体轴排开，组成会呼吸的壳。一根中间轴带动五个环同时开合。',
      'Five expanding rings sit along the body and open and close together, all driven from one shaft.',
    ),
  },
  {
    n: '1',
    name: L('臂', 'arm'),
    x: L(
      '六节方盒椎节加一个梢端节，三根肌腱各接一台电机。收哪一根，臂就朝那一侧弯，弯够了能缠住手。',
      'Six box vertebrae and a tip segment, with three tendons on three motors. Pulling one tendon bends the arm towards it, and enough bend wraps a hand.',
    ),
  },
  {
    n: '2',
    name: L('触须', 'feelers'),
    x: L(
      '舵机带着大节前后甩，一段软杆下面连着不受驱动的小块，跟着甩。',
      'A servo swings the upper segment. A short flexible rod carries an undriven block below it, which swings along.',
    ),
  },
  {
    n: '1',
    name: L('底座与转台', 'base and turntable'),
    x: L(
      'X 形底座上装一台蜗轮转台，转台以上的整机绕竖轴转动，机器的朝向由它决定。',
      'A worm-gear turntable on an X-shaped base turns everything above it, which sets where the machine faces.',
    ),
  },
];

/* ── 04 · 行为的五层 ─────────────────────────────────────────────────────── */
/** absent = 设计里有、行为引擎里没有做（构件把这一层的线留空，不和做了的四层画成一样） */
export const LAYERS: readonly { name: Bi; x: Bi; absent?: boolean }[] = [
  {
    name: L('自主运动', 'Self-motion'),
    x: L('没人碰它时，它也在呼吸、转向、做小动作。', 'With nobody touching it, it still breathes, turns and makes small movements.'),
  },
  {
    name: L('非确定性响应', 'Non-deterministic response'),
    x: L('同一次触摸，延迟和幅度每次略有不同。', 'The same touch gets a slightly different delay and size each time.'),
  },
  {
    name: L('内部状态', 'Internal state'),
    x: L(
      '刺激让唤醒升高，呼吸随之变快变浅，十几秒后回落。四套人格的差异放在这一层。',
      'Stimuli raise its arousal, so breathing speeds up and grows shallow, then settles within about fifteen seconds. The personalities differ here.',
    ),
  },
  {
    name: L('关系塑造', 'Relationship'),
    absent: true,
    x: L('引擎里没有做。一世八九分钟，积累不起熟悉。', 'Not built into the engine. One life of eight or nine minutes is too short for familiarity.'),
  },
  {
    name: L('主动性', 'Initiative'),
    x: L(
      '只做了一点：记住这一世里人在哪，人走后热情型仍朝那边看，回避型一直背着那边。',
      'Only a little: it remembers where the person was in this life, so after they leave the warm one keeps looking there and the avoidant one keeps its back to it.',
    ),
  },
];

/* ── 05 · 闭合规则与自由度（N08 / N09）────────────────────────────────────── */
export const CLOSURE: readonly { id: string; k: Bi; f: string; x: Bi }[] = [
  {
    id: 'N08',
    k: L('闭合规则', 'Closure rule'),
    f: 'Σ(180−β) = 180',
    x: L(
      '角化件等臂，折角之和满足这一条才闭环。五个环形状各异，都靠它均匀呼吸。',
      'With equal-arm angulated parts, the ring closes only when its turning angles satisfy this. Five different shapes all breathe evenly by it.',
    ),
  },
  {
    id: 'N09',
    k: L('自由度', 'Degrees of freedom'),
    f: 'M=2 → F=1',
    x: L(
      '裸拱能呼吸也能横摆。中央一根杆加顶点竖直导轨，才剩下一个自由度。',
      'The bare arch can breathe and sway. A central rod plus a vertical rail at the apex leaves a single degree of freedom.',
    ),
  },
];

/* ── 05.5 · 算过的，和算错的（数字对比）──────────────────────────────────── */
export interface Stat {
  k: Bi;
  from: number;
  to: number;
  /** 小数位 */
  dec: number;
  unit: string;
  note: Bi;
}
export const STATS: readonly Stat[] = [
  {
    k: L('导轨挠度', 'Rail deflection'),
    from: 1.55,
    to: 0.34,
    dec: 2,
    unit: 'mm',
    note: L('补背肋 8 × 3 与唇边 4 × 2.5', 'with an 8 × 3 rib and a 4 × 2.5 lip'),
  },
  {
    k: L('导轨临界载荷', 'Rail ultimate capacity'),
    from: 19,
    to: 54,
    dec: 0,
    unit: 'N',
    note: L('同一处加强，增加的材料很少', 'same fix, little added weight'),
  },
  {
    k: L('桁架下垂 · 四角 → 通长托条', 'Truss sag · corners → rails'),
    from: 4.8,
    to: 0.02,
    dec: 2,
    unit: 'mm',
    note: L('同一副框架，只换托法：差 200 倍', 'same frame, only the support changed: 200×'),
  },
  {
    k: L('桁架杆件质量', 'Truss member mass'),
    from: 104,
    to: 44,
    dec: 0,
    unit: 'g',
    note: L('强度只用掉 5%，交叉斜撑帮助不大', 'only 5% of strength was used'),
  },
];

/* ── 07 · 系统逻辑（N18）与自干扰 ────────────────────────────────────────── */
export interface SysItem {
  x: Bi;
  /** 清单里尚缺的条目：虚线 + 琥珀色 */
  pend?: boolean;
}
export const SYS_COLS: readonly { h: Bi; n: string; items: readonly SysItem[] }[] = [
  {
    h: L('传感', 'Sensing'),
    n: '6',
    items: [
      { x: L('触须电容 · MPR121 ch0–3', 'Feeler capacitance · MPR121 ch0–3') },
      { x: L('壳体半环电极 · ch4–5', 'Shell half-ring electrodes · ch4–5') },
      { x: L('超声测距', 'Ultrasonic range') },
      { x: L('震动包络 · MPU6050', 'Vibration envelope · MPU6050') },
      { x: L('声音幅度', 'Sound amplitude') },
      { x: L('内部计时器', 'Internal clock') },
    ],
  },
  {
    // 九类事件 2026-10-07 定（行为引擎 spec §3.2）：一类 = 一种对行为有独立意义、能从某一路输入单独判出来的刺激
    h: L('事件', 'Events'),
    n: '9',
    items: [
      { x: L('PRESENCE · 有人在、远近', 'PRESENCE · someone near or far') },
      { x: L('FEELER_TOUCH · 碰触须', 'FEELER_TOUCH · a feeler touched') },
      { x: L('SHELL_STROKE · 摸、拍、戳壳', 'SHELL_STROKE · shell stroked, patted, poked') },
      { x: L('SHELL_HOLD · 按住壳', 'SHELL_HOLD · shell held') },
      { x: L('LIFT · 被拿起', 'LIFT · lifted') },
      { x: L('KNOCK · 敲', 'KNOCK · knocked') },
      { x: L('SOUND · 声音', 'SOUND · sound') },
      { x: L('ARM_TOUCH · 碰臂', 'ARM_TOUCH · arm touched') },
      { x: L('RESISTANCE · 臂上有张力', 'RESISTANCE · tension on the arm') },
    ],
  },
  {
    h: L('人格参数', 'Personality'),
    n: '13',
    items: [
      { x: L('呼吸周期 · 幅度', 'Breath period · depth') },
      { x: L('运动速度', 'Motion speed') },
      { x: L('响应延迟 · 幅度', 'Response latency · size') },
      { x: L('自发动作间隔', 'Idle-motion interval') },
      { x: L('声音基频 · 发声占比', 'Voice pitch · duty') },
      { x: L('朝向间隔 · 朝人概率', 'Reorientation · bias') },
      { x: L('惊吓阈值 · 死亡方式', 'Startle · how it dies') },
      { x: L('对人的趋避', 'Toward or away from people') },
    ],
  },
  {
    // 九路输出 = 七个运动轴 + 声 + 光（行为引擎 spec §6.6）
    h: L('输出', 'Outputs'),
    n: '9',
    items: [
      { x: L('呼吸 · 五环（1 台步进）', 'Breath · five rings (1 stepper)') },
      { x: L('臂 · 三根肌腱（3 台步进）', 'Arm · three tendons (3 steppers)') },
      { x: L('触须（2 只舵机）', 'Feelers (2 servos)') },
      { x: L('偏航 · 转台（1 台步进）', 'Yaw · turntable (1 stepper)') },
      { x: L('WS2812B 灯', 'WS2812B light') },
      { x: L('PAM8403 + 喇叭', 'PAM8403 + speaker') },
    ],
  },
];
export const SYS_OUT: { a: Bi; b: Bi } = {
  a: L('同一串事件驱动行为', 'One event stream drives the behaviour'),
  b: L('同一串事件也是实验记录 · ELAN / 事件锁定 SCR', 'The same stream is the study record · ELAN / event-locked SCR'),
};
export const INTERFERENCE: readonly { a: Bi; b: Bi }[] = [
  { a: L('电机电噪声', 'Motor electrical noise'), b: L('加速度计', 'accelerometer') },
  { a: L('喇叭振动', 'Speaker vibration'), b: L('麦克风', 'microphone') },
  { a: L('手贴住壳体', 'A hand resting on the shell'), b: L('超声读数失效', 'ultrasonic readings') },
  { a: L('长按超过十秒', 'A press held over ten seconds'), b: L('电容基线误报松手', 'capacitive baseline reports a release') },
];

/* ── 08 · 现状 ───────────────────────────────────────────────────────────── */
export type Tone = 'amber' | 'green' | 'violet';
export const STATUS_ROWS: readonly {
  k: Bi;
  tone: Tone;
  tag: Bi;
  x: Bi;
  /** 日志引用（与 MDX 里的「→ 日志」同一种：锚点 = log-日期-当日序号） */
  cite?: { date: string; anchor: string };
}[] = [
  {
    k: L('机构', 'Mechanism'),
    tone: 'amber',
    tag: L('未装完', 'Not finished'),
    x: L(
      '9 月 10 日的记录：齿条传动没有装完，蒙皮还没做。',
      'As recorded on 10 September, the rack drive is not fully assembled and the skin has not been made.',
    ),
  },
  {
    k: L('行为引擎', 'Behaviour engine'),
    tone: 'green',
    tag: L('网页版完成', 'Web version done'),
    x: L(
      '事件、人格、生命周期和执行器指令写成可测试的纯逻辑，在实验 1-6 里跑整机。人格的数值仍是提案。',
      'Events, personalities, the life cycle and actuator commands are written as testable logic and drive the full machine in Lab 1-6. The personality values are still proposals.',
    ),
    cite: { date: '2026-10-07', anchor: 'log-2026-10-07-1' },
  },
  {
    k: L('固件', 'Firmware'),
    tone: 'amber',
    tag: L('待移植', 'To port'),
    x: L(
      '引擎的输出整理成九路（七个运动轴、声、光）并对应到电机，其中几处分配仍是提案。ESP32 固件还没写，驱动没有标定。',
      'The engine outputs are grouped into nine channels (seven motion axes, sound and light) and mapped to motors, some of them still as proposals. The ESP32 firmware is not written and the drives are not calibrated.',
    ),
  },
  {
    k: L('实验方案', 'Study design'),
    tone: 'green',
    tag: L('已定', 'Settled'),
    x: L(
      '四世一场，33–37 分钟。主要生理指标是事件锁定的皮肤电反应（SCR），分五个时间窗。行为编码用 ELAN，事后做线索回忆访谈。死亡前后心率变异性的比较已取消，所需时间窗远长于一次死亡事件，样本量也不够。',
      'Four lives per session, 33–37 minutes. The main physiological measure is event-locked skin conductance (SCR) across five time windows. Behaviour is coded in ELAN, and a cued-recall interview follows. The HRV comparison across deaths was dropped because it needs a much longer window than a death lasts and the sample is too small.',
    ),
    cite: { date: '2026-07-07', anchor: 'log-2026-07-07-2' },
  },
  {
    k: L('待落实', 'Still to secure'),
    tone: 'violet',
    tag: L('进行中', 'In progress'),
    x: L(
      '伦理（已获同意挂靠实验室项目组）· 中文版量表 · 第二编码员。',
      'Ethics (approved to sit under the lab\'s project group) · validated Chinese scales · a second coder.',
    ),
  },
];
export const TONE_COLOR: Record<Tone, string> = { amber: AM, green: G, violet: VI };

/* ── 08 · 预测（2026-04-03 写下，尚无数据）──────────────────────────────── */
export interface Prediction {
  /** 条形在 0–100 困扰轴上的区间 */
  lo: number;
  hi: number;
  /** 条右侧的读数；字符串 = 双语通用 */
  v: string | Bi;
  /** 虚线空心条（只有方向、没有数值区间的预测） */
  dash?: boolean;
  b: Bi;
  r: Bi;
  p: Bi;
}
export const PREDICTIONS: readonly Prediction[] = [
  {
    lo: 70,
    hi: 80,
    v: '70–80',
    b: L(
      '亲密行为迅速建立，表现为频繁抚摸、很早就给它取名；死亡时出现强烈的握持与言语表达',
      'Intimacy builds fast, with frequent touching and an early name; strong holding and speech at the death',
    ),
    r: L(
      '自评情绪急剧下降，困扰程度 70–80（满分 100），强烈的分离焦虑',
      'Sharp drop in self-rated mood, distress 70–80 of 100, strong separation anxiety',
    ),
    p: L('全程最大的一次皮电反应，心率明显升高', 'The largest skin-conductance response of the session; heart rate clearly up'),
  },
  {
    lo: 80,
    hi: 100,
    v: L('> 第一世', '> life 1'),
    dash: true,
    b: L(
      '预期性焦虑：生命 2 的后半段就出现迹象，触碰变多、趋近变多，形成「抓紧」的模式',
      'Anticipatory anxiety: signs already in the second half of life 2, with more touching and approach, forming a "holding on" pattern',
    ),
    r: L('困扰程度可能高于死亡 1，预期的悲伤叠加实际的悲伤', 'Distress possibly higher than death 1, anticipated grief on top of actual grief'),
    p: L(
      '敏感化而非习惯化：反应不降反升，基线唤醒全程偏高',
      'Sensitisation rather than habituation: responses rise, baseline arousal high across the session',
    ),
  },
  {
    lo: 65,
    hi: 80,
    v: '65–80',
    b: L(
      '最深的依附，同时出现自我保护行为，想靠近又预期失去的矛盾',
      'The deepest attachment, and self-protective behaviour with it, wanting to approach while expecting the loss',
    ),
    r: L(
      '困扰程度 65–80，可能情感溢出，丧失感与失去宠物的经验交织',
      'Distress 65–80, possible emotional overflow, the loss tangled with experience of losing a pet',
    ),
    p: L('持续的高唤醒，主观报告与生理信号高度一致', 'Sustained high arousal; self-report and physiology closely aligned'),
  },
  {
    lo: 55,
    hi: 75,
    v: '55–75',
    b: L(
      '两条可能的路径：情感疲劳导致撤退、触碰频率骤降；或继续高投入但行为变得仪式化',
      'Two possible paths: emotional fatigue and withdrawal, touch frequency dropping; or continued high investment turned ritualised',
    ),
    r: L('困扰程度 55–75，轻微习惯化但仍然高，并转向意义建构', 'Distress 55–75, with slight habituation but still high, turning toward meaning-making'),
    p: L('生理疲劳的迹象：反应性降低，基线仍高', 'Signs of physiological fatigue: lower reactivity, baseline still high'),
  },
];

/* ── 10 · 技术参数 ───────────────────────────────────────────────────────── */
export interface Spec {
  k: Bi;
  v: Bi;
  /** 数值本身尚待确认：整行值用琥珀色 */
  pending?: boolean;
}
/**
 * 技术参数。2026-10-29 重构：外形、环间距、零件数、臂、触须、执行器按 815.3dm（2026-08-13 作者最新模型，
 * 交接图册 RM-HO-02 / 03 / 05 实测）改写；其余行仍是作者原文。待确认的行用 pending（整行琥珀色）。
 */
export const SPECS: readonly Spec[] = [
  {
    k: L('整机外形', 'Overall size'),
    v: L('780 × 405 × 382 mm（含臂，815 模型实测）；不含臂的机身 387 × 387 mm', '780 × 405 × 382 mm including the arm (815 model); body without the arm 387 × 387 mm'),
  },
  { k: L('呼吸环', 'Breathing rings'), v: L('5 个异形 Hoberman 角化拱', '5 irregular angulated Hoberman arches') },
  {
    k: L('五环尺寸', 'Ring sizes'),
    v: L('全开宽 276–345 mm、拱顶高 103–221 mm；折叠后拱顶高为全开的 53–56%', 'open width 276–345 mm, apex 103–221 mm; folded, the apex drops to 53–56% of its open height'),
  },
  { k: L('环间距', 'Ring pitch'), v: L('85 mm（815 模型逐对实测）', '85 mm (measured pair by pair in the 815 model)') },
  { k: L('三角形零件', 'Triangle parts'), v: L('66 件，11 组全等类，环内复用', '66 parts in 11 congruence classes, reused within each ring') },
  {
    k: L('主驱动', 'Main drive'),
    v: L(
      'NEMA17（0.51 N·m）+ TMC2209，GT2 皮带 3:1 减速（20T / 60T）；中轴摆角约 336°',
      'NEMA17 (0.51 N·m) + TMC2209, GT2 belt 3:1 (20T / 60T); shaft swing about 336°',
    ),
  },
  {
    k: L('呼吸传动', 'Breathing transmission'),
    v: L(
      '钢齿轮 m=1，齿数 32 / 33 / 32 / 29 / 25（S1–S5）；商用钢齿条截断 + 打印 U 形卡接件，推拉每环的内侧脚',
      'Steel gears, module 1, 32 / 33 / 32 / 29 / 25 teeth (S1–S5); cut commercial steel rack with printed U-clips, pushing each ring\'s inner feet',
    ),
  },
  {
    k: L('偏航', 'Yaw'),
    v: L(
      '汉德保 HDB60XZ45B 蜗轮中空旋转平台 45:1，TMC2209',
      'Handebao HDB60XZ45B worm-gear hollow rotary platform, 45:1, TMC2209',
    ),
  },
  { k: L('主轴', 'Main shaft'), v: L('⌀6 mm D 轴，对边 5.5 mm', '⌀6 mm D-shaft, 5.5 mm across flats') },
  {
    k: L('峰值设计扭矩', 'Peak design torque'),
    v: L('0.3 – 0.5 N·m（重力与摩擦主导，惯性可忽略）', '0.3 – 0.5 N·m (gravity and friction dominant; inertia negligible)'),
  },
  {
    k: L('臂', 'Arm'),
    v: L('6 节方盒椎节（节长 47.7 → 30.8 mm）+ 梢端节，节间 TPU 脊柱杆', '6 box vertebrae (47.7 → 30.8 mm) + tip segment, joined by a TPU spine rod'),
  },
  {
    k: L('肌腱', 'Tendons'),
    v: L(
      '3 根 0.4–0.5 mm 编织 PE 线，各接一台 NEMA17（GT2 20T 带轮作绕线盘）；每根最多收 44 mm，前 12 mm 收直松弛；实物三台电机是否装齐待确认',
      '3 × 0.4–0.5 mm braided PE, each on its own NEMA17 (GT2 20T pulley as spool); up to 44 mm each, the first 12 mm taking up slack; whether all three motors are fitted is to confirm',
    ),
    pending: true,
  },
  {
    k: L('触须', 'Feelers'),
    v: L('SG90 舵机 + 大节（约 49 mm）+ 软杆 3.9 × 3.9 × 26 mm + 不受驱动的小块，左右镜像', 'SG90 servo + upper segment (about 49 mm) + 3.9 × 3.9 × 26 mm flexible rod + undriven block, mirrored left and right'),
  },
  {
    k: L('执行器', 'Actuators'),
    v: L('7 个：4 台 NEMA17（呼吸 1、肌腱 3）、转台自带 42 步进、2 只 SG90', '7: four NEMA17 (one for breathing, three for tendons), the turntable\'s own stepper, two SG90'),
  },
  {
    k: L('底座', 'Base'),
    v: L('X 形底座，四脚中心约 351 × 351 mm；倾覆角约 42°（2.3 倍裕度），对应哪一版底座待确认', 'X-shaped base, feet about 351 × 351 mm apart; tipping angle about 42° (2.3× margin), base version to confirm'),
    pending: true,
  },
  { k: L('主控', 'Controller'), v: L('ESP32 WROOM-32，双核', 'ESP32 WROOM-32, dual core') },
  {
    k: L('传感', 'Sensing'),
    v: L('MPR121 电容触摸 · MPU6050 · 超声测距 · 声音传感器', 'MPR121 capacitive touch · MPU6050 · ultrasonic rangefinder · sound sensor'),
  },
  {
    k: L('表达', 'Expression'),
    v: L('呼吸 · 臂 · 触须 · 偏航 · WS2812B 灯 · PAM8403 + 喇叭', 'breath · arm · feelers · yaw · WS2812B · PAM8403 + speaker'),
  },
  { k: L('电源', 'Power'), v: L('12 V 5 A + XL4015 降压至 5 V 轨', '12 V 5 A, XL4015 buck to the 5 V rail') },
  {
    k: L('制造', 'Fabrication'),
    v: L('FDM（主）+ SLS 尼龙 / 光敏树脂（活动件），M2 / M3 标准件', 'FDM (primary) + SLS nylon / resin (moving parts), M2 / M3 hardware'),
  },
  { k: L('材料预算', 'Material budget'), v: L('约 ¥300（不含已有库存）', 'about ¥300, excluding stock on hand') },
];
/** 技术参数默认露出的条数，其余折叠。 */
export const SPECS_VISIBLE = 8;

/* ── 块里的固定词（稿 UI 表里属于构件的那部分）───────────────────────────── */
export interface BlockUi {
  todo: string;
  process: string;
  live: string;
  toLab: string;
  lifeTitle: string;
  lifeScale: string;
  lifeNote: string;
  pzKicker: string;
  pzTitle: string;
  pzPick: string;
  touch: string;
  param: string;
  pzNote: string;
  pzIdle: string;
  pzRead: (period: string, depth: string) => string;
  pzResp: (lat: string, strength: string) => string;
  randomPeriod: string;
  randomDepth: string;
  secUnit: string;
  layersNote: string;
  layersOff: string;
  layersOn: string;
  agKicker: string;
  agLeft: string;
  agRight: string;
  agNote: string;
  sysTitle: string;
  sysSub: string;
  prKicker: string;
  prTitle: string;
  prAxis: string;
  prCols: readonly [string, string, string];
  specsAll: (n: number) => string;
  specsFew: string;
}
export const BLOCK_UI: Record<Lang, BlockUi> = {
  zh: {
    todo: '待补',
    process: '过程 · 参照',
    live: '活件',
    toLab: '去实验室操作 ↗',
    lifeTitle: '生命周期状态图',
    lifeScale: '一世约 8–9 分钟 · 此处 1 秒 ≈ 1 分钟',
    lifeNote: '四世一场，33–37 分钟。死亡一段按人格持续 1–2 分钟，衰老段长短前后浮动半分钟。人格顺序在被试间用拉丁方平衡，此处按 A → B → C → D 示意。',
    pzKicker: '示意台 · 非实测',
    pzTitle: '同一次触摸，四种回应',
    pzPick: '选择人格',
    touch: '轻触它',
    param: '参数',
    pzNote: '呼吸、延迟与回应幅度都取自参数表（与实验 1-6 的行为引擎同一份）。这里只画呼吸曲线，不含唤醒、惊跳与转身。实拍对比（N06 · 两套人格的呼吸）待拍摄。',
    pzIdle: '等你碰它',
    pzRead: (p, d) => `呼吸周期 ${p} · 幅度 ${d}`,
    pzResp: (l, s) => `上次回应 · 延迟 ${l} s · 强度 ${s}`,
    randomPeriod: `${D_PERIOD[0]}–${D_PERIOD[1]} 秒随机`,
    randomDepth: `${pct(D_DEPTH[0])}–${pct(D_DEPTH[1])}% 随机`,
    secUnit: ' 秒',
    layersNote: '设计中的死亡会让这五层行为同时停止。',
    layersOff: '让它死去',
    layersOn: '重新醒来',
    agKicker: '衰老曲线 · 趋势示意',
    agLeft: '衰老开始',
    agRight: '空白 → 下一世',
    agNote: '向下滚动，它会衰老。数值待作者提供，页面只画趋势。切换人格可看四种死亡方式。',
    sysTitle: '系统逻辑',
    sysSub: '传感 → 事件 → 人格参数 → 输出',
    prKicker: '预测 · 写于 2026-04-03 · 尚无数据',
    prTitle: '四次死亡，困扰程度的预测',
    prAxis: '困扰 / 100',
    prCols: ['行为预测', '主观报告预测', '生理预测'],
    specsAll: (n) => `全部 ${n} 项参数 ↓`,
    specsFew: '收起 ↑',
  },
  en: {
    todo: 'To come',
    process: 'Process · references',
    live: 'live',
    toLab: 'Open in the lab ↗',
    lifeTitle: 'Life-cycle state diagram',
    lifeScale: 'one life ≈ 8–9 min · here 1 s ≈ 1 min',
    lifeNote:
      'Four lives per session, 33–37 minutes. Dying lasts 1–2 minutes depending on the personality, and ageing varies by half a minute either way. The order of personalities is counterbalanced with a Latin square and shown here as A → B → C → D.',
    pzKicker: 'Illustrative bench · not measured',
    pzTitle: 'One touch, four answers',
    pzPick: 'Pick a personality',
    touch: 'Touch it',
    param: 'Parameter',
    pzNote:
      'Breathing, latency and response size all come from the parameter table, the same one the behaviour engine in Lab 1-6 uses. Only the breathing curve is drawn here, without arousal, startle or turning. The filmed comparison (N06) is still to shoot.',
    pzIdle: 'waiting for your touch',
    pzRead: (p, d) => `breath ${p} · depth ${d}`,
    pzResp: (l, s) => `last answer · latency ${l} s · strength ${s}`,
    randomPeriod: `random ${D_PERIOD[0]}–${D_PERIOD[1]} s`,
    randomDepth: `random ${pct(D_DEPTH[0])}–${pct(D_DEPTH[1])}%`,
    secUnit: ' s',
    layersNote: 'At death, all five layers stop together.',
    layersOff: 'Let it die',
    layersOn: 'Wake it again',
    agKicker: 'Ageing curve · trend only',
    agLeft: 'ageing begins',
    agRight: 'blank → next life',
    agNote:
      'Scroll and it ages. Values are to come from the author, so the page draws the trend only. Switch personality to see four ways of dying.',
    sysTitle: 'System logic',
    sysSub: 'sensing → events → personality → outputs',
    prKicker: 'Predictions · written 2026-04-03 · no data yet',
    prTitle: 'Four deaths, predicted distress',
    prAxis: 'distress / 100',
    prCols: ['Behaviour', 'What they will report', 'Physiology'],
    specsAll: (n) => `All ${n} specs ↓`,
    specsFew: 'Fewer ↑',
  },
};
