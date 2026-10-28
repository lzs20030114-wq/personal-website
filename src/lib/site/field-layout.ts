/**
 * 01 Field 的格子版式（2026-10-27，画布方案 H6b，MAPPING §71）。
 * 28×15 细线格：标语一字一格（细窄），objects / spaces 每个字母占 2×2（宽粗），
 * 名字、导航、两个按钮、提示都占整数个格子；其余格子放作品，贴着字留一圈有机的空白。
 * 纯函数、不碰 DOM：FieldPage 与守门测试共用。同一份输入在服务端和浏览器里得到同一张版面。
 */

export const FIELD_COLS = 28;
export const FIELD_ROWS = 15;
/** 展开卡占几格（与原 Field Hero 稿一致） */
export const CARD_W = 6;
export const CARD_H = 4;
/** 计算「离字多远」时一格的高宽比（1440×900 下 52.7 / 46）；只影响留白形状，与实际视口无关，版面因此在各尺寸下一致 */
const CELL_ASPECT = 1.145;
/** 作品再多，贴着字也至少空出这么多格；作品超出格子时多出来的轮换上场（FieldPage） */
export const HALO_MIN = 36;

export interface FieldLetter {
  c: number;
  r: number;
  ch: string;
  /** 在整句里的序号（入场错峰用） */
  n: number;
}
export interface FieldKey extends FieldLetter {
  word: 'objects' | 'spaces';
}
export interface FieldBox {
  c0: number;
  c1: number;
  r: number;
}
export interface FieldNav extends FieldBox {
  label: string;
  /** HomeScroll.goIdx 的序号 */
  page: number;
}

export interface FieldText {
  letters: FieldLetter[];
  keys: FieldKey[];
  name: FieldBox;
  nav: FieldNav[];
  work: FieldBox;
  lab: FieldBox;
  hint: FieldBox;
  /** 所有被字、框、按钮占掉的格子 */
  reserved: Set<number>;
  /** 标语、按钮、提示占的格子（不含第一行的名字和导航）；留白按离它们多远来排 */
  textCells: number[];
}

export const cellAt = (c: number, r: number) => r * FIELD_COLS + c;

function buildText(): FieldText {
  const reserved = new Set<number>();
  const textCells: number[] = [];
  const letters: FieldLetter[] = [];
  const keys: FieldKey[] = [];
  let n = 0;
  const take = (c: number, r: number, text: boolean) => {
    reserved.add(cellAt(c, r));
    if (text) textCells.push(cellAt(c, r));
  };
  const line = (r: number, c0: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      take(c0 + i, r, true);
      if (s[i] !== ' ') letters.push({ c: c0 + i, r, ch: s[i], n: n++ });
    }
  };
  const big = (r: number, c0: number, word: 'objects' | 'spaces') => {
    const s = word.toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const c = c0 + 2 * i;
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) take(c + dc, r + dr, true);
      keys.push({ c, r, ch: s[i], n: n++, word });
    }
  };
  const box = (c0: number, c1: number, r: number, text: boolean): FieldBox => {
    for (let c = c0; c <= c1; c++) take(c, r, text);
    return { c0, c1, r };
  };
  // 版面照画布 H6（28×15）：每行居中或对称，大字两侧各空出若干格
  line(2, 4, 'I EXPLORE HOW PEOPLE');
  line(3, 9, 'RELATE TO');
  big(4, 7, 'objects');
  line(6, 12, 'AND');
  big(7, 8, 'spaces');
  line(9, 3, 'THAT RESPOND TO THEM.');
  const work = box(8, 13, 11, true);
  const lab = box(14, 19, 11, true);
  const hint = box(8, 19, 12, true);
  const name = box(0, 6, 0, false);
  const nav: FieldNav[] = (
    [
      ['Work', 1],
      ['About', 2],
      ['Lab', 3],
      ['Log', 4],
    ] as const
  ).map(([label, page], i) => ({ ...box(FIELD_COLS - 8 + i * 2, FIELD_COLS - 7 + i * 2, 0, false), label, page }));
  return { letters, keys, name, nav, work, lab, hint, reserved, textCells };
}

export const FIELD_TEXT: FieldText = buildText();

/** 固定种子的伪随机（与画布稿同一个，便于对照） */
export function seeded(seed = 20261028) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export interface SlotOpts {
  /** 留白边缘的起伏幅度（格）；0 = 规整地贴着字 */
  edge?: number;
  /** 空格里有多少比例散到作品中间 */
  dust?: number;
  seed?: number;
}

/**
 * 放作品的格子：先把空位按「离最近的字有多远 + 平滑起伏」排好，最近的那些留空（贴着字的一圈），
 * 另有一小部分空位从远处随机挑（散在作品里的透气孔）。作品比空位多时只留 HALO_MIN 个空格。
 * 返回放作品的格子（按格序）与留空的格子。
 */
export function fieldSlots(nItems: number, opts: SlotOpts = {}): { slots: number[]; empty: number[] } {
  const { edge = 0.9, dust = 0.15, seed = 20261028 } = opts;
  const rnd = seeded(seed);
  const { reserved, textCells } = FIELD_TEXT;
  const text = textCells.map((c) => [c % FIELD_COLS, Math.floor(c / FIELD_COLS)] as const);
  const lattice = new Map<string, number>();
  const lat = (x: number, y: number) => {
    const k = `${x},${y}`;
    let v = lattice.get(k);
    if (v === undefined) lattice.set(k, (v = rnd()));
    return v;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, f: number) => {
    const X = Math.floor(x / f);
    const Y = Math.floor(y / f);
    const tx = smooth(x / f - X);
    const ty = smooth(y / f - Y);
    const a = lat(X, Y);
    const b = lat(X + 1, Y);
    const c = lat(X, Y + 1);
    const d = lat(X + 1, Y + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const free: number[] = [];
  for (let i = 0; i < FIELD_COLS * FIELD_ROWS; i++) if (!reserved.has(i)) free.push(i);
  const score = new Map<number, number>();
  for (const cell of free) {
    const x = cell % FIELD_COLS;
    const y = Math.floor(cell / FIELD_COLS);
    let m = Infinity;
    for (const [tx, ty] of text) m = Math.min(m, Math.hypot(x - tx, (y - ty) * CELL_ASPECT));
    // 大尺度起伏左右镜像（两侧留白大致对称），小尺度不镜像（边缘不死板）
    const xm = Math.min(x, FIELD_COLS - 1 - x);
    score.set(cell, m + edge * ((noise(xm, y, 3) - 0.5) * 2 + (noise(x + 40, y + 40, 1.5) - 0.5) * 0.8));
  }
  const nEmpty = Math.min(free.length, Math.max(HALO_MIN, free.length - nItems));
  const nDust = Math.round(nEmpty * dust);
  const byNear = [...free].sort((a, b) => score.get(a)! - score.get(b)!);
  const empty = new Set(byNear.slice(0, nEmpty - nDust));
  const rest = byNear.slice(nEmpty - nDust);
  const far = rest.slice(Math.floor(rest.length * 0.25));
  for (let i = far.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [far[i], far[j]] = [far[j], far[i]];
  }
  far.slice(0, nDust).forEach((c) => empty.add(c));
  return { slots: free.filter((c) => !empty.has(c)), empty: [...empty].sort((a, b) => a - b) };
}

/**
 * 展开卡放在哪：在所有盖得住被悬停那一格的 6×4 位置里，挑压到字最少的；一样少时挑离「以那一格为中心」最近的。
 * 这样卡不会盖住标语和按钮。
 */
export function cardOrigin(cell: number, reserved: Set<number> = FIELD_TEXT.reserved): { c0: number; r0: number } {
  const c = cell % FIELD_COLS;
  const r = Math.floor(cell / FIELD_COLS);
  const want = { c0: c - 3, r0: r - 2 };
  let best = { c0: 0, r0: 0 };
  let bestKey = Infinity;
  for (let c0 = c - CARD_W + 1; c0 <= c; c0++) {
    for (let r0 = r - CARD_H + 1; r0 <= r; r0++) {
      if (c0 < 0 || r0 < 0 || c0 + CARD_W > FIELD_COLS || r0 + CARD_H > FIELD_ROWS) continue;
      let hit = 0;
      for (let y = r0; y < r0 + CARD_H; y++) for (let x = c0; x < c0 + CARD_W; x++) if (reserved.has(cellAt(x, y))) hit++;
      const key = hit * 1000 + Math.abs(c0 - want.c0) + Math.abs(r0 - want.r0);
      if (key < bestKey) {
        bestKey = key;
        best = { c0, r0 };
      }
    }
  }
  return best;
}

/** 首屏作品初次落位：非日志的东西（项目、台架、其他作品、关于）先上，日志按新到旧；格子不够时其余进轮换队列 */
export function initialPlacement(kinds: readonly string[], slotCount: number, seed = 20261028): { shown: number[]; queue: number[] } {
  const rnd = seeded(seed + 7);
  const order = kinds.map((_, i) => i);
  const head = order.filter((i) => kinds[i] !== 'log');
  const logs = order.filter((i) => kinds[i] === 'log');
  const pick = [...head, ...logs].slice(0, slotCount);
  const queue = [...head, ...logs].slice(slotCount);
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  return { shown: pick, queue };
}
