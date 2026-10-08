import { describe, expect, it } from 'vitest';
import { BehaviorEngine, ENGINE, type EngineState, HZ, STATE_VERSION, STATE_VERSION_V2, runSession, type ScheduledInput } from './engine';
import type { SensorInput } from './events';
import { toJsonl } from './log';
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from './persona';
import { type Phase, type Pose, startProgram, stepProgram } from './programs';
import { tendonContractions } from '../machine-behavior';
import { arcDelta } from './programs';
import {
  OFF_AXIS_DMAX,
  anticPose,
  buildSettle,
  pathLen,
  type BuildCtx,
  type RespKind,
  STARTLE_PRE,
  V2,
  type Variant,
  buildRegister,
  buildResponse,
  buildSpont,
  buildStartle,
  dOf,
  respD,
  spontE,
  tierSpeed,
} from './vocab2';

/**
 * 动作词汇 v2（研究原型，轮回机器_触手与转向研究.md §8）的守门。它要解决的是「惊跳、回应、自发分不清」，
 * 所以卡的是区分它们的那几样东西本身：起动时刻、速度档、幅度层级、方向、潜伏期里的「注意到」——
 * 这些坏了不报错，只会悄悄退回「全是一个 1–2 秒的鼓包」。外加 v2 引擎的复现、交接与执行器量程。
 */

const DEG = Math.PI / 180;
const AX = 120 * DEG;
const K: Record<PersonaKey, number> = { A: Math.sqrt(3 / ENGINE.speedRef), B: Math.sqrt(0.5 / ENGINE.speedRef), C: Math.sqrt(1.5 / ENGINE.speedRef), D: 1 };
const rest: Pose = { bend: 0.25, dir: 0.4, deep: 0 };

/** 人格表的单值直接取；D 取区间中点 */
function ctx(P: PersonaKey, over: Partial<BuildCtx> = {}): BuildCtx {
  const p = PERSONAS[P];
  const mid = (r: readonly number[]): number => (r[0] + r[r.length - 1]) / 2;
  let i = 0;
  return {
    persona: P,
    k: K[P],
    tau: mid(p.latency),
    gAbs: mid(p.gain),
    sign: 1,
    vigor: 1,
    ageU: 0,
    breathAmp: mid(p.breathAmp),
    period: mid(p.breathPeriod),
    rest,
    cur: rest,
    // 可复现的「随机」：0.37、0.74、0.11……
    rnd: () => ((++i * 0.37) % 1),
    ...over,
  };
}

/** 一个程序按 60 Hz 走一遍：每帧的姿态 */
function sample(phases: Phase[], from: Pose): Pose[] {
  const p = startProgram('t', 0, phases, from);
  const out: Pose[] = [];
  for (let i = 0; ; i++) {
    const r = stepProgram(p, i / HZ, rest);
    out.push(r.pose);
    if (r.done) return out;
  }
}
const vec = (q: Pose): [number, number] => [dOf(q) * Math.cos(q.dir), dOf(q) * Math.sin(q.dir)];
/** 指令在差动平面上的峰值速度（D 每秒） */
function peakSpeed(poses: Pose[]): number {
  let v = 0;
  for (let i = 1; i < poses.length; i++) {
    const [x0, y0] = vec(poses[i - 1]);
    const [x1, y1] = vec(poses[i]);
    v = Math.max(v, Math.hypot(x1 - x0, y1 - y0) * HZ);
  }
  return v;
}
const ends = (phases: Phase[]): Pose[] => phases.flatMap((p) => (typeof p.arm === 'object' ? [p.arm] : []));

const DIRECTED: RespKind[] = ['stroke', 'hold', 'pat', 'poke', 'feeler', 'approach', 'other'];
const VARIANTS: Variant[] = ['toward', 'inplace', 'avoid'];
const allResponses = (P: PersonaKey): Phase[][] => [
  ...DIRECTED.flatMap((kind) => VARIANTS.map((variant) => buildResponse(ctx(P), { kind, side: 1, variant, arm: true, feeler: true, turn: 0 }))),
  ...(['knock', 'lift', 'sound'] as RespKind[]).map((kind) => buildResponse(ctx(P), { kind, side: 0, variant: 'toward', arm: true, feeler: true, turn: 0 })),
];

describe('动作词汇 v2 · 程序表', () => {
  it('速度五档：每种人格都是 自发 < 刻意 < 急 < 恢复；刻意档封顶 0.26（A 也到不了惊跳的一半）；A 永远比 B 快', () => {
    for (const k of [0.58, 1, 1.41, 1.63]) {
      expect(tierSpeed('spont', k)).toBeLessThan(tierSpeed('deliberate', k));
      expect(tierSpeed('deliberate', k)).toBeLessThan(tierSpeed('urgent', k));
      expect(tierSpeed('urgent', k)).toBeLessThan(tierSpeed('recover', k));
      expect(tierSpeed('deliberate', k)).toBeLessThanOrEqual(0.26);
    }
    expect(tierSpeed('reflex', 1)).toBe(Infinity);
    expect(tierSpeed('deliberate', K.A)).toBeGreaterThan(tierSpeed('deliberate', K.B));
  });

  it('惊跳的反射段四种人格逐位相同：0.1 s 后起动、0.15 s 屈曲、沿背离刺激的那根下方腱轴（左来 → −120°、右来 → +120°）', () => {
    const heads = PERSONA_KEYS.map((P) => buildStartle(ctx(P), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases.slice(0, 2));
    for (const h of heads) {
      expect(h[0]).toMatchObject({ name: 'latency', dur: V2.startleLatency, arm: 'hold' });
      expect(h[1]).toMatchObject({ name: 'flex', dur: V2.startleFlex, ease: 'out4', path: 'line' });
      const arm = h[1].arm as Pose;
      expect(arm.dir).toBeCloseTo(-AX, 12);
      // 慢的人格两步缩（第一步到 0.6），其余一步到底；第一步就 ≥ 0.6 × 下限深度
      expect(dOf(arm)).toBeGreaterThanOrEqual(V2.zvFirst * V2.startleDMin - 1e-9);
    }
    const right = buildStartle(ctx('C'), { I: 0.95, th: 0.5, side: -1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases[1].arm as Pose;
    expect(right.dir).toBeCloseTo(AX, 12);
  });

  it('惊跳深度按超出阈值的程度分级（0.45–0.72）；12 s 内再吓一次变浅、凝住减半；深度永不低于 0.45', () => {
    const D = (I: number, repeats = 0): number => {
      const ph = buildStartle(ctx('C'), { I, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats }).phases;
      return Math.max(...ends(ph).map(dOf));
    };
    expect(D(0.51)).toBeCloseTo(V2.startleDMin + (V2.startleDMax - V2.startleDMin) * 0.02, 6);
    expect(D(1)).toBeCloseTo(V2.startleDMax, 6);
    expect(D(1, 1)).toBeCloseTo(V2.startleDMax * 0.8, 6);
    expect(D(1, 5)).toBeCloseTo(V2.startleDMin, 6);
    const freeze = (repeats: number): number =>
      buildStartle(ctx('C'), { I: 1, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats }).phases.find((p) => p.name === 'freeze')!.dur;
    expect(freeze(1)).toBeCloseTo(freeze(0) / 2, 9);
  });

  it('深卷只在正对腱轴的姿态上；要换弯向先在轴上把深卷收回（unhook），执行层的硬窗不会被一下子跨过去', () => {
    for (const P of PERSONA_KEYS) {
      const { phases } = buildStartle(ctx(P), { I: 1, th: 0.3, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 });
      let at: Pose = rest;
      for (const p of phases) {
        const to = p.arm === 'hold' ? at : p.arm === 'rest' ? rest : p.arm;
        if (to.deep > 0) expect(Math.abs(Math.abs(to.dir) - AX)).toBeLessThan(1e-9);
        if (at.deep > 1e-9 && Math.abs(to.dir - at.dir) > 1e-9) throw new Error(`${P}：段 ${p.name} 带着深卷换弯向`);
        at = to;
      }
      expect(phases.some((p) => p.name === 'unhook')).toBe(true);
    }
  });

  it('人格的差别在恢复的结构里：A 抬起弹回、B 探出又缩回、C 回头朝刺激那边查看、D 先松一半再余震或生硬落回', () => {
    const names = (P: PersonaKey, rnd?: () => number): string[] =>
      buildStartle(ctx(P, rnd ? { rnd } : {}), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 })
        .phases.map((p) => p.name)
        .filter((n) => !STARTLE_PRE.has(n) && n !== 'unhook');
    expect(names('A')).toEqual(['probe', 'rebound', 'look', 'settle']);
    expect(names('B')).toEqual(['probe', 'peek', 'pause', 'reflinch', 'pause', 'unfurl']);
    expect(names('C')).toEqual(['probe', 'orient', 'inspect', 'return']);
    expect(names('D', () => 0.1)).toEqual(['loosen', 'aftershock', 'hold2', 'drop']);
    expect(names('D', () => 0.9)).toEqual(['loosen', 'hold2', 'drop']);
    // C 的查看朝刺激那一侧（左 = 正）
    const c = buildStartle(ctx('C'), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases.find((p) => p.name === 'orient')!;
    expect((c.arm as Pose).dir).toBeGreaterThan(0);
    // 慢的两步缩、快的指令回弹
    expect(buildStartle(ctx('B'), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases.some((p) => p.name === 'zv2')).toBe(true);
    expect(buildStartle(ctx('A'), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases.some((p) => p.name === 'recoil')).toBe(true);
  });

  it('「正忙」窗口 = 反射 + 凝住 + 恢复的第一段（之后的恢复可以被再惊一次打断）', () => {
    const { phases, busy } = buildStartle(ctx('B'), { I: 0.95, th: 0.2, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 });
    const i = phases.findIndex((p) => !STARTLE_PRE.has(p.name));
    expect(busy).toBeCloseTo(phases.slice(0, i + 1).reduce((s, p) => s + p.dur, 0), 12);
    expect(busy).toBeLessThan(phases.reduce((s, p) => s + p.dur, 0));
  });

  it('幅度层级（指令）：惊跳 ≥ 0.45 > 任何回应 ≤ 0.40 > 自发离静息 ≤ 0.16；同一人格里自发 < 回应', () => {
    for (const P of PERSONA_KEYS) {
      const st = Math.max(...ends(buildStartle(ctx(P), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases).map(dOf));
      const resp = Math.max(...allResponses(P).flatMap(ends).map(dOf));
      const sp = Math.max(...(['curl', 'sway'] as const).flatMap((k) => ends(buildSpont(ctx(P), k))).map((q) => Math.hypot(...vec(q).map((x, j) => x - vec(rest)[j]) as [number, number])));
      expect(st).toBeGreaterThanOrEqual(V2.startleDMin);
      expect(resp).toBeLessThanOrEqual(0.4 + 1e-9);
      expect(sp).toBeLessThanOrEqual(0.16);
      expect(spontE(ctx(P))).toBeLessThan(respD(ctx(P)));
    }
    // 自发幅度跟着 ② 呼吸幅度走：A > C > B，D 封顶
    expect(spontE(ctx('A'))).toBeGreaterThan(spontE(ctx('C')));
    expect(spontE(ctx('C'))).toBeGreaterThan(spontE(ctx('B')));
    expect(spontE(ctx('D', { breathAmp: 0.9 }))).toBeLessThanOrEqual(V2.spontDMax);
  });

  it('速度层级（指令）：惊跳的峰速 ≥ 任何回应的 2.5 倍、自发最慢', () => {
    for (const P of PERSONA_KEYS) {
      const st = peakSpeed(sample(buildStartle(ctx(P), { I: 0.95, th: 0.5, side: 1, recoilYaw: 0, turnBack: 0, repeats: 0 }).phases, rest));
      const resp = Math.max(...allResponses(P).map((ph) => peakSpeed(sample(ph, rest))));
      const sp = Math.max(...(['curl', 'sway'] as const).map((k) => peakSpeed(sample(buildSpont(ctx(P), k), rest))));
      expect(st).toBeGreaterThanOrEqual(2.5 * resp);
      expect(sp).toBeLessThan(resp);
      expect(sp).toBeLessThanOrEqual(tierSpeed('spont', K[P]) * 1.25);
    }
  });

  it('注意到：潜伏期里臂不动；呼吸放慢（τ ≥ 1 s 先屏住，最多 2 s）；震 / 声一律屏住；接近阈值先一缩（0.1 s 后、差动 ≥ 0.12、背离刺激、一声 tsk、不猛收）', () => {
    const slow = buildRegister(ctx('B'), { dur: 2.5, side: 1, kind: 'directed' });
    expect(slow.map((p) => [p.dur, p.breath?.rate])).toEqual([
      [2, 0],
      [0.5, 0.3],
    ]);
    expect(slow.every((p) => p.arm === 'hold' && p.feel?.pose === 'point' && p.feel.side === 1)).toBe(true);
    expect(buildRegister(ctx('A'), { dur: 0.2, side: -1, kind: 'directed' }).map((p) => p.breath?.rate)).toEqual([0.3]);
    expect(buildRegister(ctx('A'), { dur: 0.2, side: 0, kind: 'alert' })[0]).toMatchObject({ breath: { rate: 0 }, feel: { pose: 'splay' } });
    expect(buildRegister(ctx('A'), { dur: 0.2, side: 0, kind: 'listen' })[0]).toMatchObject({ breath: { rate: 0 }, feel: { pose: 'raise' } });
    const w = buildRegister(ctx('A'), { dur: 0.2, side: 1, kind: 'directed', wince: true });
    expect(w[0]).toMatchObject({ name: 'latency', dur: V2.startleLatency, arm: 'hold' });
    expect(w[1]).toMatchObject({ name: 'wince', voice: 'tsk' });
    expect(w[1].breath?.clench).toBeUndefined();
    const arm = w[1].arm as Pose;
    expect(dOf(arm)).toBeGreaterThanOrEqual(V2.winceD - 1e-9);
    expect(arm.dir).toBeCloseTo(-AX, 12);
  });

  it('回应的方向说意思：迎 = 朝刺激那侧偏上、原地 = 正上、躲 = 另一侧平着让开；没方向的「震 / 声」竖直', () => {
    const main = (kind: RespKind, variant: Variant, side = 1): Pose =>
      ends(buildResponse(ctx('C'), { kind, side, variant, arm: true, feeler: true, turn: 0 })).reduce((a, b) => (dOf(b) > dOf(a) ? b : a));
    expect(main('stroke', 'toward').dir).toBeCloseTo(70 * DEG, 9);
    expect(main('stroke', 'toward', -1).dir).toBeCloseTo(-70 * DEG, 9);
    expect(main('pat', 'inplace').dir).toBeCloseTo(0, 9);
    expect(main('feeler', 'avoid').dir).toBeCloseTo(-90 * DEG, 9);
    expect(main('knock', 'toward', 0).dir).toBeCloseTo(0, 9);
    // 臂没抽中 = 同一个形状 × 0.6；触须没抽中 = 动作里不再指向
    const full = buildResponse(ctx('A'), { kind: 'stroke', side: 1, variant: 'toward', arm: true, feeler: true, turn: 0 });
    const small = buildResponse(ctx('A'), { kind: 'stroke', side: 1, variant: 'toward', arm: false, feeler: false, turn: 0 });
    expect(Math.max(...ends(small).map(dOf))).toBeLessThan(Math.max(...ends(full).map(dOf)));
    expect(small.some((p) => p.feel?.pose === 'point')).toBe(false);
  });
});

describe('动作词汇 v2 · 审查抓到的（2026-10-08）', () => {
  const S = (P: PersonaKey, cur: Pose, side: number, repeats = 0) =>
    buildStartle(ctx(P, { cur }), { I: 0.95, th: 0.3, side, recoilYaw: 0, turnBack: 0, repeats, axis: side === 0 ? undefined : undefined });

  it('再吓一次时臂还卷在另一根轴上：反射照样 0.1 s 起动（解钩不许插到屈曲前面），「正忙」盖住屈曲与凝住', () => {
    for (const P of PERSONA_KEYS) {
      const curled: Pose = { bend: 1, dir: -AX, deep: 0.64 };
      const { phases, busy } = S(P, curled, -1);
      expect(phases.slice(0, 2).map((p) => [p.name, p.dur])).toEqual([
        ['latency', V2.startleLatency],
        ['flex', V2.startleFlex],
      ]);
      const pre = phases.filter((p) => STARTLE_PRE.has(p.name)).reduce((a, p) => a + p.dur, 0);
      expect(busy).toBeGreaterThan(pre);
    }
  });

  it('臂已经沿这根轴卷着：惊跳只会卷得更深，不会把臂打开（递减的深度、慢的人格第一步都不低于此刻）', () => {
    const curled: Pose = { bend: 1, dir: -AX, deep: 0.4 };
    for (const P of PERSONA_KEYS) {
      for (const repeats of [0, 1, 3]) {
        const { phases } = S(P, curled, 1, repeats);
        const flex = phases.find((p) => p.name === 'flex')!.arm as Pose;
        expect(dOf(flex)).toBeGreaterThanOrEqual(dOf(curled) - 1e-9);
      }
    }
  });

  it('深卷只给惊跳：所有回应的目标姿态 deep = 0、差动 ≤ OFF_AXIS_DMAX（正对腱轴也一样，给点头 / 蹭留余量）', () => {
    for (const P of PERSONA_KEYS) {
      for (const g of [0.1, 0.4, 0.5]) {
        for (const side of [-1, 0, 1]) {
          for (const kind of DIRECTED) {
            for (const variant of VARIANTS) {
              const ph = buildResponse(ctx(P, { gAbs: g }), { kind, side, variant, arm: true, feeler: true, turn: side * 0.3 });
              for (const q of ends(ph)) {
                expect(q.deep).toBe(0);
                expect(dOf(q)).toBeLessThanOrEqual(OFF_AXIS_DMAX + 1e-9);
              }
            }
          }
        }
      }
    }
  });

  it('预备只是往反方向挪一小步：离此刻 0.04、主动作从它出发不绕半圈', () => {
    const to: Pose = { bend: 0.8, dir: 70 * DEG, deep: 0 };
    for (const cur of [rest, { bend: 0.25, dir: -1.9, deep: 0 }, { bend: 0.05, dir: 2.5, deep: 0 }]) {
      const a = anticPose(cur, to, 0.04);
      const [ax, ay] = vec(a);
      const [cx, cy] = vec(cur);
      expect(Math.hypot(ax - cx, ay - cy)).toBeCloseTo(0.04, 6);
    }
    // 主动作从预备点出发：弧不绕过 90°（绕得多的段改走直线，穿过中心）
    for (const cur of [rest, { bend: 0.25, dir: -1.9, deep: 0 }, { bend: 0.05, dir: 2.5, deep: 0 }]) {
      for (const variant of ['toward', 'inplace'] as Variant[]) {
        const ph = buildResponse(ctx('A', { cur }), { kind: 'stroke', side: 1, variant, arm: true, feeler: true, turn: 0 });
        const ai = ph.findIndex((p) => p.name === 'antic');
        const lean = ph[ai + 1];
        if (lean.path !== 'line') expect(Math.abs(arcDelta(ph[ai].arm as Pose, lean.arm as Pose))).toBeLessThanOrEqual(Math.PI / 2);
        expect(pathLen(ph[ai].arm as Pose, lean.arm as Pose, lean.path)).toBeLessThanOrEqual(pathLen(cur, lean.arm as Pose, 'line') + 0.1);
      }
    }
    // 活力型抚摸「迎」：倚过去那一段不再被拉长到几秒
    const ph = buildResponse(ctx('A'), { kind: 'stroke', side: 1, variant: 'toward', arm: true, feeler: true, turn: 0 });
    expect(ph.find((p) => p.name === 'lean')!.dur).toBeLessThan(2.5);
  });

  it('死亡时的收场：从深卷的钩出发也先在轴上解钩；时长 0.6–1.2 s', () => {
    const p = buildSettle(ctx('B', { cur: { bend: 1, dir: -AX, deep: 0.9 } }));
    expect(p[0].name).toBe('unhook');
    expect(p[p.length - 1].dur).toBeGreaterThanOrEqual(0.6);
    expect(p[p.length - 1].dur).toBeLessThanOrEqual(1.2);
  });

  it('摆动的峰速不超档（沉静型点头、嗅探收小）', () => {
    for (const P of PERSONA_KEYS) {
      for (const kind of ['pat', 'feeler', 'stroke'] as RespKind[]) {
        for (const p of buildResponse(ctx(P), { kind, side: 1, variant: 'toward', arm: true, feeler: true, turn: 0 })) {
          if (p.osc) expect(2 * Math.PI * p.osc.hz * p.osc.amp * 0.34).toBeLessThanOrEqual(tierSpeed('deliberate', K[P]) + 1e-9);
        }
      }
    }
  });
});

// ------------------------------------------------------------------ v2 引擎

/** 跳过诞生、关掉自发与张望，给一个干净的成长段 */
function grown(P: PersonaKey, seed = 7): BehaviorEngine {
  const e = new BehaviorEngine({ seed, order: [P, ...PERSONA_KEYS.filter((k) => k !== P)], loop: false, vocab: 2 });
  e.skip();
  e.tick();
  e.drain();
  const st = e.state as EngineState;
  st.nextSpont = 1e9;
  st.nextOrient = 1e9;
  e.advance(4, 1000);
  e.drain();
  return e;
}
const armD = (e: BehaviorEngine): number => {
  const a = e.targets().arm;
  return 0.34 * a.bend + 0.377 * (a.deep ?? 0);
};
const armXY = (e: BehaviorEngine): [number, number] => {
  const a = e.targets().arm;
  return [a.bend * Math.cos(a.dir), a.bend * Math.sin(a.dir)];
};

describe('动作词汇 v2 · 引擎', () => {
  it('vocab: 2 的会话：快照记 v4、JSON 往返后接着跑逐字相同；v3 / v4 与有没有 m2 对不上一律拒收', () => {
    const inputs: ScheduledInput[] = [
      { t: 70, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' } },
      { t: 78, input: { kind: 'KNOCK', intensity: 0.95 } },
      { t: 80, input: { kind: 'FEELER_TOUCH', feeler: 1, side: 'R' } },
    ];
    const head = runSession({ seed: 5, vocab: 2, inputs, until: 79 }).engine;
    expect(head.vocab()).toBe(2);
    const snap = JSON.parse(JSON.stringify(head.snapshot())) as EngineState;
    expect(snap.v).toBe(STATE_VERSION_V2);
    const back = BehaviorEngine.restore(snap);
    const tail = (e: BehaviorEngine): string => {
      const out = [];
      for (let i = 0; i < 20 * HZ; i++) {
        if (i === 60) e.push(inputs[2].input);
        e.tick();
        out.push(JSON.stringify(e.targets()));
      }
      return out.join('\n') + toJsonl(e.drain());
    };
    expect(tail(back)).toBe(tail(head));
    expect(() => BehaviorEngine.restore({ ...snap, v: STATE_VERSION })).toThrow();
    const v1 = runSession({ seed: 5, until: 3 }).engine.snapshot();
    expect(() => BehaviorEngine.restore({ ...v1, v: STATE_VERSION_V2 })).toThrow();
    expect(BehaviorEngine.restore(v1).vocab()).toBe(1);
  });

  it('会话头记动作词汇（只在 v2 时出现）：照会话头回放，日志逐字相同', () => {
    const inputs: ScheduledInput[] = [
      { t: 66, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' } },
      { t: 74, input: { kind: 'KNOCK', intensity: 0.9 } },
    ];
    const a = runSession({ seed: 9, vocab: 2, lifeRate: 10, inputs, until: 110 });
    expect(a.header.vocab).toBe(2);
    expect(runSession({ seed: 9, until: 1 }).header).not.toHaveProperty('vocab');
    const h = a.header;
    const b = runSession({ seed: h.seed, order: [...h.order], lifeRate: h.lifeRate, vocab: h.vocab ?? 1, inputs, until: 110 });
    expect(toJsonl(b.log, b.header)).toBe(toJsonl(a.log, a.header));
  });

  it('非确定性：同一次轻抚连发 20 次，动作组合（变体 / 臂 / 触须 / 转身）不止一种', () => {
    for (const k of ['A', 'B', 'C'] as const) {
      const strokes = Array.from({ length: 20 }, (_, i) => ({ t: 64 + i * 12, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' } as SensorInput }));
      const { log } = runSession({ seed: 71, order: [k, ...PERSONA_KEYS.filter((x) => x !== k)], vocab: 2, inputs: strokes, until: 330 });
      const resp = log.filter((r) => r.ev === 'RESPONSE');
      expect(resp.length).toBeGreaterThanOrEqual(12);
      const combos = new Set(resp.map((r) => `${r.p!.motion}/${r.p!.arm}/${r.p!.feeler}/${r.p!.turn}`));
      expect(combos.size).toBeGreaterThan(1);
    }
  });

  it('惊跳在 0.1 s 之前一动不动，0.25 s 时已缩到 ≥ 0.6 × 0.45；四种人格同一时刻起动', () => {
    const starts = new Set<number>();
    for (const P of PERSONA_KEYS) {
      const e = grown(P);
      const [x0, y0] = armXY(e);
      e.push({ kind: 'KNOCK', intensity: 0.99 });
      let moved = -1;
      for (let i = 0; i < 0.25 * HZ; i++) {
        e.tick();
        const [x, y] = armXY(e);
        if (moved < 0 && Math.hypot(x - x0, y - y0) > 1e-6) moved = i;
      }
      // 刺激那一帧 + 6 帧潜伏（0.1 s），下一帧起动
      expect(moved).toBe(Math.round(V2.startleLatency * HZ) + 1);
      starts.add(moved);
      expect(armD(e)).toBeGreaterThanOrEqual(V2.zvFirst * V2.startleDMin - 1e-9);
      expect(e.motion()?.name).toBe('startle');
    }
    expect(starts.size).toBe(1);
  });

  it('惊跳时环身猛收：呼吸在行程中段时，输出往收拢端走 ≥ 0.15（活力型原型里被呼吸中心夹住，只收得动 +0.09）', () => {
    const e = grown('A');
    // 等到呼吸走到中段（在收拢端时本来就收着，猛收看不出来）
    while (Math.abs(e.targets().breath.s - 0.5) > 0.05) e.tick();
    const s0 = e.targets().breath.s;
    e.push({ kind: 'KNOCK', intensity: 0.99 });
    let hi = s0;
    for (let i = 0; i < 0.8 * HZ; i++) {
      e.tick();
      hi = Math.max(hi, e.targets().breath.s);
    }
    expect(hi - s0).toBeGreaterThanOrEqual(0.15);
    expect(hi).toBeLessThanOrEqual(0.92 + 1e-9);
  });

  it('沉静型的轻抚：0.3 s 内就「注意到」（呼吸几乎停住、触须转过去），臂要等 τ 才动', () => {
    const e = grown('B');
    const [x0, y0] = armXY(e);
    const f0 = e.targets().feelers.map((f) => f.base);
    e.push({ kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' });
    e.advance(0.3, 1000);
    expect(e.state.m2!.rate.x).toBeLessThan(0.35);
    // 0.5 s 内两条触须停止扫动、一齐指向左边（+）
    e.advance(0.2, 1000);
    const f1 = e.targets().feelers.map((f) => f.base);
    for (const f of f1) expect(f).toBeCloseTo(V2.feelerPoint, 1);
    expect(f0.length).toBe(2);
    e.advance(1.5, 1000);
    const [x1, y1] = armXY(e);
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1e-6);
    expect(e.motion()?.name).toBe('register');
  });

  it('握着人的时候被吓：惊跳程序不被吞掉（猛收、短叫、凝住照样有），臂由程序接管', () => {
    const e = grown('A', 141);
    e.push({ kind: 'ARM_TOUCH', on: true });
    e.advance(1.5, 1000);
    e.push({ kind: 'RESISTANCE', on: true });
    e.advance(3, 1000);
    expect(e.state.grasp.phase).toBe('HOLD_HUMAN');
    e.push({ kind: 'KNOCK', intensity: 0.99 });
    e.advance(0.5, 1000);
    expect(e.motion()?.name).toBe('startle');
    expect(e.state.m2!.clench.x).toBeGreaterThan(0.1);
    expect(armD(e)).toBeGreaterThan(V2.startleDMin - 0.05);
  });

  it('死亡开始时还在做的动作不演完：换成平平的收场，死亡里没有任何呼吸 / 声 / 光提示', () => {
    const e = new BehaviorEngine({ seed: 11, order: ['C', 'A', 'B', 'D'], loop: false, vocab: 2, lifeRate: 20 });
    let sawSettle = false;
    let cueInDeath = false;
    let poked = false;
    for (let i = 0; i < 200 * HZ && !e.done; i++) {
      const st = e.status();
      // 死前 1 s 给一下，让回应跨进死亡段
      if (!poked && st.phase === 'AGE' && st.phaseLen - st.phaseElapsed < 20 * HZ) {
        e.push({ kind: 'FEELER_TOUCH', feeler: 0, side: 'L' });
        poked = true;
      }
      e.tick();
      for (const r of e.drain()) if (r.ev === 'LIFE_DEATH_START') sawSettle = e.motion()?.name === 'settle' || e.motion() === null;
      if (e.status().phase === 'DEATH') {
        const m = e.motion();
        const ph = m ? e.state.m2!.prog!.phases[e.state.m2!.prog!.idx] : null;
        if (ph && (ph.breath || ph.voice || ph.light !== undefined)) cueInDeath = true;
      }
      if (e.status().life > 1) break;
    }
    expect(poked).toBe(true);
    expect(sawSettle).toBe(true);
    expect(cueInDeath).toBe(false);
  });

  it('全场：各通道在量程内；呼吸、偏航、触须逐步不跳；臂的指令只在反射段里阶跃（台架三根肌肉 ω 5 低通）', () => {
    const REFLEX = new Set(['flex', 'zv2', 'aftershock', 'recoil', 'wince', 'unhook', 'antic']);
    const CYCLE: SensorInput[] = [
      { kind: 'PRESENCE', band: 'far', bearing: 0.8 },
      { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' },
      { kind: 'PRESENCE', band: 'near', bearing: 0.5 },
      { kind: 'SHELL_STROKE', half: 'R', touch: 'pat' },
      { kind: 'FEELER_TOUCH', feeler: 0, side: 'L' },
      { kind: 'SOUND', level: 0.5 },
      { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' },
      { kind: 'KNOCK', intensity: 0.7 },
      { kind: 'SHELL_HOLD', half: 'both', on: true },
      { kind: 'SHELL_HOLD', half: 'both', on: false },
      { kind: 'KNOCK', intensity: 0.15 },
      { kind: 'PRESENCE', band: 'gone' },
    ];
    for (const seed of [161, 162]) {
      const e = new BehaviorEngine({ seed, order: [PERSONA_KEYS[seed % 4], ...PERSONA_KEYS.filter((k) => k !== PERSONA_KEYS[seed % 4])], vocab: 2, lifeRate: 5 });
      let prev = e.targets();
      const m = { sLo: 1, sHi: 0, bend: 0, deep: 0, dS: 0, dYaw: 0, dArm: 0, dFeeler: 0, dTendon: 0 };
      let prevC = tendonContractions(prev.arm, { deep: true });
      let next = 3.3;
      let n = 0;
      while (!e.done && e.time < 480) {
        if (e.time >= next) {
          e.push(CYCLE[n++ % CYCLE.length]);
          next += 3.7;
        }
        e.tick();
        e.drain();
        const tg = e.targets();
        m.sLo = Math.min(m.sLo, tg.breath.s);
        m.sHi = Math.max(m.sHi, tg.breath.s);
        m.bend = Math.max(m.bend, tg.arm.bend);
        m.deep = Math.max(m.deep, tg.arm.deep ?? 0);
        m.dS = Math.max(m.dS, Math.abs(tg.breath.s - prev.breath.s));
        m.dYaw = Math.max(m.dYaw, Math.abs(tg.yaw - prev.yaw));
        const ph = e.motion()?.phase ?? '';
        if (!REFLEX.has(ph)) {
          const dx = tg.arm.bend * Math.cos(tg.arm.dir) - prev.arm.bend * Math.cos(prev.arm.dir);
          const dy = tg.arm.bend * Math.sin(tg.arm.dir) - prev.arm.bend * Math.sin(prev.arm.dir);
          m.dArm = Math.max(m.dArm, Math.hypot(dx, dy));
        }
        // 三腱指令（台架开着深卷）：反射段以外逐帧不跳——两腱之间带深卷扫过腱轴硬窗，就是在这里跳的
        const c = tendonContractions(tg.arm, { deep: true });
        if (!REFLEX.has(ph)) m.dTendon = Math.max(m.dTendon, ...c.map((x, j) => Math.abs(x - prevC[j])));
        prevC = c;
        for (const k of [0, 1] as const) m.dFeeler = Math.max(m.dFeeler, Math.abs(tg.feelers[k].base - prev.feelers[k].base));
        prev = tg;
      }
      expect(m.sLo).toBeGreaterThanOrEqual(0);
      expect(m.sHi).toBeLessThanOrEqual(1);
      expect(m.bend).toBeLessThanOrEqual(1);
      expect(m.deep).toBeLessThanOrEqual(1);
      expect(m.dS).toBeLessThan(0.045);
      expect(m.dYaw).toBeLessThan(0.05);
      // 反射段以外，最快的是惊跳后的恢复档（≤ 1.2 D/s ≈ 3.5 弯曲/s ≈ 每帧 0.059）；v1 的跟随器是每帧 < 0.04
      expect(m.dArm).toBeLessThan(0.062);
      expect(m.dFeeler).toBeLessThan(0.15);
      expect(m.dTendon).toBeLessThan(0.06);
    }
  });
});
