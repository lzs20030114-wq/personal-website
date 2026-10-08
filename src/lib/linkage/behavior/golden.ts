/**
 * 「没有手时与改动前逐位相同」的守门工具（2026-10-07，Lab 1-6 加手时立）。
 *
 * 一组固定的会话（种子 × 人格顺序 × 生命钟倍率 × 一份写死的访客脚本：在场、拍 / 摸 / 戳、按住、碰触须、
 * 敲、声音、碰臂抓握），跑完把日志与每 0.5 s 一帧的执行器指令各哈希成一串。基准由
 * `scripts/behavior/engine-golden.mjs` 用**改动前**的引擎生成、存在 engine.golden.json；
 * engine.golden.test.ts 用现在的引擎重跑比对。以后再改引擎，只要没有手的路径动了，这道就会红。
 *
 * 执行器指令里 arm.wrap（2026-10-07 新加、没有手恒为 0）不进哈希，另外单独断言为 0。
 * 纯函数、零依赖：引擎从参数传进来（生成基准时传旧引擎）。
 */

export interface GoldenCase {
  seed: number;
  order: string[];
  lifeRate: number;
  /** 跑到这一秒为止 */
  until: number;
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  { seed: 11, order: ['A', 'B', 'C', 'D'], lifeRate: 1, until: 240 },
  { seed: 23, order: ['C', 'A', 'D', 'B'], lifeRate: 1, until: 240 },
  { seed: 131, order: ['B', 'D', 'A', 'C'], lifeRate: 10, until: 900 },
  { seed: 151, order: ['D', 'C', 'B', 'A'], lifeRate: 10, until: 900 },
  { seed: 161, order: ['A', 'B', 'C', 'D'], lifeRate: 60, until: 600 },
  { seed: 171, order: ['C', 'A', 'D', 'B'], lifeRate: 60, until: 600 },
];

/** 写死的访客脚本：种子决定的伪随机（mulberry32），与引擎的随机数流无关 */
export function goldenInputs(seed: number, T: number): { t: number; input: Record<string, unknown> }[] {
  let a = (seed * 2654435761) >>> 0;
  const r = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: { t: number; input: Record<string, unknown> }[] = [];
  let t = 2;
  while (t < T) {
    const b = Math.round((r() * 2 - 1) * Math.PI * 1000) / 1000;
    out.push({ t, input: { kind: 'PRESENCE', band: 'far', bearing: b } });
    out.push({ t: t + 2, input: { kind: 'PRESENCE', band: 'near', bearing: b } });
    for (let u = t + 4; u < t + 30; u += 3 + Math.round(r() * 60) / 10) {
      const x = r();
      const side = r() < 0.5 ? 'L' : 'R';
      if (x < 0.25) out.push({ t: u, input: { kind: 'SHELL_STROKE', half: side, touch: ['pat', 'stroke', 'poke'][Math.floor(r() * 3)] } });
      else if (x < 0.4) out.push({ t: u, input: { kind: 'FEELER_TOUCH', feeler: r() < 0.5 ? 0 : 1, side } });
      else if (x < 0.5) out.push({ t: u, input: { kind: 'KNOCK', intensity: Math.round(r() * 100) / 100 } });
      else if (x < 0.6) out.push({ t: u, input: { kind: 'SOUND', level: Math.round(r() * 100) / 100 } });
      else if (x < 0.7) {
        out.push({ t: u, input: { kind: 'SHELL_HOLD', half: 'both', on: true } });
        out.push({ t: u + 2, input: { kind: 'SHELL_HOLD', half: 'both', on: false } });
      } else {
        out.push({ t: u, input: { kind: 'ARM_TOUCH', on: true } });
        out.push({ t: u + 1.8, input: { kind: 'RESISTANCE', on: true } });
        out.push({ t: u + 4, input: { kind: 'RESISTANCE', on: false } });
        out.push({ t: u + 4.5, input: { kind: 'ARM_TOUCH', on: false } });
      }
    }
    out.push({ t: t + 32, input: { kind: 'PRESENCE', band: 'gone' } });
    t += 40 + Math.round(r() * 200) / 10;
  }
  return out;
}

/**
 * 有手的用例（2026-10-08 迎手链 v2 动工前立）：同一组种子跑现行（v1）带手的会话，基准取自动工前的引擎，
 * 守「v2 的迎手链只改 v2，不漏进 v1」。手是开环的写死脚本（读数不随机身转动重算），只为把手的各条路径都走到：
 * 出现在臂够得着处、停住、慢慢挪、臂伸过去碰到（by: arm）/ 手伸过来碰（不写 by）、卡住、抽手、挪到远处、
 * 绕到背后、离开画布再回来。
 */
export const GOLDEN_HAND_CASES: readonly GoldenCase[] = [
  { seed: 211, order: ['A', 'B', 'C', 'D'], lifeRate: 1, until: 300 },
  { seed: 223, order: ['C', 'D', 'A', 'B'], lifeRate: 1, until: 300 },
  { seed: 241, order: ['B', 'C', 'D', 'A'], lifeRate: 10, until: 900 },
  { seed: 251, order: ['D', 'A', 'B', 'C'], lifeRate: 10, until: 900 },
];

/** 写死的手脚本：每 0.1 s 一条 HAND（数值取到千分之一 / 毫米，与台架同精度），夹着碰臂、张力、离开 */
export function goldenHandInputs(seed: number, T: number): { t: number; input: Record<string, unknown> }[] {
  let a = (seed * 2246822519) >>> 0;
  const r = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r3 = (x: number): number => Math.round(x * 1000) / 1000;
  const out: { t: number; input: Record<string, unknown> }[] = [];
  const handAt = (t: number, bearing: number, dist: number, aimDir: number, aimBend: number, aimDist: number): void => {
    out.push({
      t: Math.round(t * 10) / 10,
      input: { kind: 'HAND', on: true, bearing: r3(bearing), dist: Math.round(dist), face: r3(bearing + 0.25), aimDir: r3(aimDir), aimBend: r3(aimBend), aimDist: Math.round(aimDist) },
    });
  };
  let t = 3;
  while (t < T - 20) {
    const kind = r();
    const b0 = (r() * 2 - 1) * 1.2;
    const dir = r() < 0.5 ? 0.62 : -2.52;
    if (kind < 0.55) {
      // 臂够得着的手：停住 → 慢慢挪 → 碰到（臂碰 / 手碰）→ 卡住 → 抽手
      const bend0 = 0.3 + r() * 0.9;
      const dur = 6 + r() * 10;
      for (let u = 0; u < dur; u += 0.1) {
        const drift = u > dur * 0.5 ? (u - dur * 0.5) * 0.01 : 0;
        handAt(t + u, b0 + drift, 420 + 60 * r(), dir, bend0 - drift, 260 + 40 * r());
      }
      const tc = t + dur * (0.3 + 0.4 * r());
      out.push({ t: Math.round(tc * 10) / 10, input: r() < 0.5 ? { kind: 'ARM_TOUCH', on: true, by: 'arm' } : { kind: 'ARM_TOUCH', on: true } });
      if (r() < 0.7) out.push({ t: Math.round((tc + 1.6 + r()) * 10) / 10, input: { kind: 'RESISTANCE', on: true } });
      const te = Math.min(t + dur, tc + 3 + r() * 4);
      out.push({ t: Math.round(te * 10) / 10, input: { kind: 'RESISTANCE', on: false } });
      out.push({ t: Math.round((te + 0.1) * 10) / 10, input: { kind: 'ARM_TOUCH', on: false } });
      t += dur;
    } else if (kind < 0.75) {
      // 远处的手（够不着，要转身）
      const dur = 5 + r() * 8;
      for (let u = 0; u < dur; u += 0.1) handAt(t + u, b0 + u * 0.03, 1100 + 200 * r(), dir, 1.6, 900);
      t += dur;
    } else if (kind < 0.88) {
      // 绕到背后
      const dur = 4 + r() * 6;
      for (let u = 0; u < dur; u += 0.1) handAt(t + u, b0 + Math.PI * (u / dur), 700, dir, 1.2, 600);
      t += dur;
    } else {
      // 手在机身上方（摸壳）
      const dur = 3 + r() * 4;
      for (let u = 0; u < dur; u += 0.1) handAt(t + u, b0, 280, dir, 0.2, 120);
      t += dur;
    }
    out.push({ t: Math.round(t * 10) / 10, input: { kind: 'HAND', on: false } });
    t += 2 + r() * 12;
  }
  return out;
}

/** 两路 FNV-1a 32 位拼成 16 位十六进制（不是密码学哈希，只为比对） */
export function fnv64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = (0x01000193 ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

interface Frame {
  targets: { arm: Record<string, number> } & Record<string, unknown>;
}
interface SessionLike {
  log: unknown[];
  frames: Frame[];
}

/**
 * 一个用例 → { log, frames } 两串哈希（frames 里去掉 arm.wrap）与新增字段的最大值。
 * mode：'base' = 现有基准（v1、没有手）；'v2' = 同一组用例、动作词汇 v2、没有手；'hand' = v1、写死的手脚本
 * （frames 保留 arm.wrap——有手时它不恒为 0，正是要守的东西）。
 */
export function goldenDigest(
  run: (o: object) => SessionLike,
  c: GoldenCase,
  mode: 'base' | 'v2' | 'hand' = 'base',
): { log: string; frames: string; wrapMax: number } {
  const inputs = mode === 'hand' ? [...goldenInputs(c.seed, c.until), ...goldenHandInputs(c.seed, c.until)] : goldenInputs(c.seed, c.until);
  const res = run({
    seed: c.seed,
    order: c.order,
    lifeRate: c.lifeRate,
    inputs,
    until: c.until,
    frameEvery: 0.5,
    ...(mode === 'v2' ? { vocab: 2 } : {}),
  });
  let wrapMax = 0;
  const frames = res.frames.map((f) => {
    const { wrap, ...arm } = f.targets.arm;
    if (typeof wrap === 'number') wrapMax = Math.max(wrapMax, wrap);
    return mode === 'hand' ? f : { ...f, targets: { ...f.targets, arm } };
  });
  return { log: fnv64(JSON.stringify(res.log)), frames: fnv64(JSON.stringify(frames)), wrapMax };
}
