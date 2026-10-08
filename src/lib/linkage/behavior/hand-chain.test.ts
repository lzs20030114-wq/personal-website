import { describe, expect, it } from 'vitest';
import { BehaviorEngine, type EngineState, OBS, obsForecast, obsSettled, obsStep } from './engine';
import type { SensorInput } from './events';
import type { LogRecord } from './log';
import { PERSONA_KEYS, type PersonaKey } from './persona';
import { HC, gainAt } from './vocab2-hand';
import {
  ARM_GEOM,
  type HandSent,
  HAND_UI,
  type ViewParams,
  handReading,
  handSendDue,
  projectLogical,
  sweepFraming,
  tendonContractions,
  yawPoint,
} from '../machine-behavior';

/**
 * 迎手链（动作词汇 v2 + 有手，2026-10-08 第八批）的引擎守门。开环的手（读数不随机身转动重算，闭环见
 * hand-loop2.test.ts）+ 一个粗糙的碰到模型：指令在差动平面上离手那一点（换成手那一点上的毫米）< 碰到半径、
 * 待够 0.12 s 算臂碰到手（by: arm）；张力照台架的新规则（贴上做完、臂停稳的 catchT 之后手还在）。
 */
const order = (first: PersonaKey): PersonaKey[] => [first, ...PERSONA_KEYS.filter((k) => k !== first)];

interface Hand {
  bearing: number;
  dist: number;
  face: number;
  aimDir: number;
  aimBend: number;
  aimDist: number;
}
const NEAR: Hand = { bearing: 0, dist: 450, face: 0.25, aimDir: 0.62, aimBend: 0.8, aimDist: 280 };

class Rig {
  e: BehaviorEngine;
  log: LogRecord[] = [];
  hand: Hand | null = { ...NEAR };
  movedAt = 0;
  v = 0;
  touch = false;
  tension = false;
  near = 0;
  /** 碰到模型开着（关掉 = 手只看不碰） */
  contact = true;
  /** 张力开关跟不跟（关掉 = 抓空） */
  catches = true;
  /** 每 6 帧自动报一条 HAND（关掉 = 调用方自己报） */
  autoHand = true;
  t0: number;
  constructor(P: PersonaKey, seed: number, opts: { deepOk?: boolean } = {}) {
    this.e = new BehaviorEngine({ seed, order: order(P), lifeRate: 1, vocab: 2, deepOk: opts.deepOk ?? true });
    this.log.push(...this.e.drain());
    this.e.skip();
    this.e.tick();
    this.log.push(...this.e.drain());
    this.t0 = this.e.time;
  }
  get t(): number {
    return this.e.time - this.t0;
  }
  push(i: SensorInput): void {
    this.e.push(i);
  }
  move(h: Partial<Hand>, v = 300): void {
    this.hand = { ...(this.hand ?? NEAR), ...h };
    this.movedAt = this.t;
    this.v = v;
  }
  run(sec: number, each?: () => void): void {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      const h = this.hand;
      if (this.autoHand && this.e.ticks % 6 === 0) {
        if (h) {
          const still = Math.max(0, this.t - this.movedAt);
          this.push({ kind: 'HAND', on: true, ...h, touch: 32, still: Math.min(9.9, Math.round(still * 10) / 10), v: still < 0.3 ? this.v : 0 });
        } else this.push({ kind: 'HAND', on: false });
      }
      const tg = this.e.targets();
      if (h && this.contact) {
        const D = 0.34 * tg.arm.bend + 0.16 * tg.arm.wrap + 0.3773 * (tg.arm.deep ?? 0);
        const Dh = Math.min(0.5, 0.34 * h.aimBend);
        const mm = Math.hypot(D * Math.cos(tg.arm.dir) - Dh * Math.cos(h.aimDir), D * Math.sin(tg.arm.dir) - Dh * Math.sin(h.aimDir)) * gainAt(h.aimDist, Dh);
        if (!this.touch) {
          this.near = mm < 32 ? this.near + 1 / 60 : 0;
          if (this.near >= 0.12) {
            this.touch = true;
            this.push({ kind: 'ARM_TOUCH', on: true, by: 'arm' });
          }
        }
      }
      const g = this.e.state.grasp;
      if (this.catches && this.touch && !this.tension && g.phase === 'WRAP' && (g.catchT !== undefined ? this.e.time >= g.catchT : (this.e.time - g.t0) / g.dur >= 0.6)) {
        this.tension = true;
        this.push({ kind: 'RESISTANCE', on: true });
      }
      this.e.tick();
      this.log.push(...this.e.drain());
      each?.();
    }
  }
  /** 把手抽走（指针移开 + 电极 / 张力落）；speed = 抽走前那一下的指针速度 */
  withdraw(speed: number): void {
    this.move({ aimBend: 0.25, aimDist: 340, dist: 560 }, speed);
    this.touch = false;
    this.tension = false;
    this.near = -99;
    this.push({ kind: 'HAND', on: true, ...this.hand!, touch: 32, still: 0, v: speed });
    this.push({ kind: 'ARM_TOUCH', on: false });
    this.push({ kind: 'RESISTANCE', on: false });
  }
  ev(name: string): LogRecord[] {
    return this.log.filter((r) => r.ev === name);
  }
  beats(): string[] {
    return this.ev('HAND_STAGE').map((r) => `${String(r.p?.stage)}${r.p?.beat ? `.${String(r.p.beat)}` : ''}`);
  }
}

/** 第一次看见手时抽到 mode 的种子（4 s 内看见） */
function seedFor(P: PersonaKey, mode: 'toward' | 'away' | 'look', from = 1): number {
  for (let seed = from; seed < from + 600; seed++) {
    const r = new Rig(P, seed);
    r.contact = false;
    r.run(4);
    if (r.ev('HAND_SEEN')[0]?.p?.mode === mode) return seed;
  }
  throw new Error(`no seed ${P} ${mode}`);
}

describe('迎手链：看见 → 凑 → 缠 → 握', () => {
  it('活力型：看见 → 陪着 → 凑 → 蹲 → 停稳 → 扑 → 缠（预期接触，当帧起、不付 ④）→ 卡住 → 握住；投入中 ⑨ 不重新决定', () => {
    const r = new Rig('A', seedFor('A', 'toward'));
    r.run(14);
    const b = r.beats();
    expect(b[0]).toBe('track');
    const seq = ['approach.transport', 'approach.crouch', 'approach.cocked', 'approach.pounce', 'wrap.grab', 'hold'];
    let i = 0;
    for (const x of b) if (x === seq[i]) i++;
    expect(i, b.join(' ')).toBe(seq.length);
    const touch = r.log.find((x) => x.ev === 'ARM_TOUCH' && x.p?.on)!;
    expect(touch.out).toBe('respond');
    const resp = r.ev('RESPONSE').find((x) => x.p?.expected)!;
    expect(resp.p?.latency).toBe(0);
    expect(resp.t).toBe(touch.t);
    expect(r.ev('STARTLE')).toHaveLength(0);
    // 卡住在贴上做完之后（不是缠到 60%）
    const start = r.ev('GRASP_START')[0].t;
    const hold = r.ev('GRASP_HOLD_HUMAN')[0].t;
    expect(hold - start).toBeGreaterThan(0.7);
    // 凑到握住之间没有重新决定
    const t0 = r.log.find((x) => x.ev === 'HAND_STAGE' && x.p?.stage === 'approach')!.t;
    expect(r.ev('HAND_SEEN').filter((x) => x.t > t0 && x.t <= hold)).toHaveLength(0);
  });

  it('好奇型：停半拍 → 瞄准 → 精确伸；看见 → 指令朝手动 ≤ 1 s；握着时随呼吸一紧一松、哼', () => {
    const r = new Rig('C', seedFor('C', 'toward'));
    let seenAt = -1;
    let movedAt = -1;
    let d0 = -1;
    r.run(4, () => {
      if (seenAt < 0 && r.ev('HAND_SEEN').length) {
        seenAt = r.t;
        d0 = r.e.targets().arm.bend;
      }
      if (seenAt >= 0 && movedAt < 0 && Math.abs(r.e.targets().arm.bend - d0) > 0.05) movedAt = r.t;
    });
    expect(movedAt - seenAt).toBeLessThan(1);
    r.run(16);
    const b = r.beats();
    expect(b).toContain('approach.hover');
    expect(b.indexOf('approach.sight')).toBeGreaterThan(b.indexOf('approach.hover'));
    expect(b).toContain('approach.reach');
    expect(b).not.toContain('approach.crouch');
    expect(r.ev('GRASP_HOLD_HUMAN').length).toBeGreaterThan(0);
    // 握着：指令弯曲在动（不再逐位不变），哼在呼气时
    const bends: number[] = [];
    let hum = 0;
    r.run(8, () => {
      const tg = r.e.targets();
      bends.push(0.34 * tg.arm.bend + 0.16 * tg.arm.wrap);
      if (tg.sound.on) hum++;
    });
    expect(r.e.state.grasp.phase).toBe('HOLD_HUMAN');
    expect(Math.max(...bends) - Math.min(...bends)).toBeGreaterThan(0.01);
    expect(hum).toBeGreaterThan(60);
  });

  it('沉静型迎着被手主动碰（I 0.4 > 阈值 0.2）：不惊跳，一缩再接；躲着时被碰照旧惊跳', () => {
    const r = new Rig('B', seedFor('B', 'toward'));
    r.contact = false;
    r.run(4);
    r.push({ kind: 'ARM_TOUCH', on: true });
    r.run(1);
    expect(r.ev('STARTLE')).toHaveLength(0);
    const resp = r.ev('RESPONSE').find((x) => x.p?.expected)!;
    expect(resp.p?.wince).toBe(true);
    expect(resp.p?.by).toBe('hand');
    expect(r.ev('GRASP_START')).toHaveLength(1);
    expect(r.beats()).toContain('wrap.receive');
    const a = new Rig('B', seedFor('B', 'away'));
    a.contact = false;
    a.run(4);
    a.push({ kind: 'ARM_TOUCH', on: true });
    a.run(1);
    expect(a.ev('STARTLE')).toHaveLength(1);
  });

  it('手在视野里（看见了或正要看见）时人走近被吸收：不起在场回应程序、不抽 ⑩、不占「正忙」', () => {
    // 台架上手一出现就同时报一档在场：两者是同一个人，不让在场回应与「看见」同一步撞车
    const r = new Rig('B', seedFor('B', 'toward'));
    r.contact = false;
    r.run(0.5);
    r.push({ kind: 'PRESENCE', band: 'far' });
    r.run(3);
    r.push({ kind: 'PRESENCE', band: 'near' });
    r.run(3);
    expect(r.ev('RESPONSE').filter((x) => x.p?.motion === 'hand.absorb')).toHaveLength(2);
    expect(r.ev('RESPONSE').filter((x) => String(x.p?.motion ?? '').startsWith('respond.approach'))).toHaveLength(0);
    expect(r.log.filter((x) => x.ev === 'PRESENCE' && x.out === 'busy')).toHaveLength(0);
  });
});

describe('迎手链：脱手、抓空、躲', () => {
  it('脱手：快抽 = 扑过去（lunge）、慢抽 = 伸过去送一下（extend）；沉静型放弃 → 侧身躲', () => {
    const go = (P: PersonaKey, speed: number): Rig => {
      const r = new Rig(P, seedFor(P, 'toward'));
      r.run(20);
      expect(r.e.state.grasp.phase, P).toBe('HOLD_HUMAN');
      r.withdraw(speed);
      r.run(1.5);
      return r;
    };
    const fast = go('A', 600);
    expect(fast.ev('GRASP_LOST')[0].p?.reaction).toBe('chase');
    expect(fast.beats()).toContain('chase.lunge');
    const slow = go('C', 60);
    expect(slow.beats()).toContain('chase.extend');
    expect(slow.beats()).not.toContain('chase.lunge');
    const b = go('B', 300);
    expect(b.ev('GRASP_LOST')[0].p?.reaction).toBe('giveUp');
    expect(b.ev('HAND_SEEN')[b.ev('HAND_SEEN').length - 1]?.p).toMatchObject({ mode: 'away', cause: 'giveUp' });
    b.run(8);
    expect(b.e.state.m2?.hc.stage).toBe('avoid');
  });

  it('抓空（张力一直没来）：到限位 → 人格那一拍 → 放开 → 以最后碰到处为中心找', () => {
    const r = new Rig('C', seedFor('C', 'toward'));
    r.catches = false;
    r.run(24);
    expect(r.ev('GRASP_EMPTY').length).toBeGreaterThan(0);
    expect(r.beats()).toContain('release.palpate');
    expect(r.beats()).toContain('search.cast');
    // 放开以后手还搭着、手链回到陪着：3 s 后至多再来一次（抓空后每 ⑨ 一次），不成「缠 → 抓空 → 缠」的死循环
    expect(r.ev('CONTACT').filter((x) => x.p?.rearm).length).toBeLessThanOrEqual(1);
  });

  it('沉静型躲：侧身（手留在身侧、视野内）、60 s 不丢手、偷看；手走了松一口气', () => {
    const r = new Rig('B', seedFor('B', 'away'));
    r.contact = false;
    r.move({ bearing: 0, dist: 900, aimBend: 1.2, aimDist: 700 }, 0);
    let worst = 0;
    r.run(60, () => {
      const rel = Math.abs(Math.atan2(Math.sin(0 - r.e.targets().yaw), Math.cos(0 - r.e.targets().yaw)));
      if (r.t > 8) worst = Math.max(worst, rel);
    });
    expect(r.ev('HAND_LOST')).toHaveLength(0);
    expect(worst).toBeLessThan((125 * Math.PI) / 180);
    expect(worst).toBeGreaterThan((60 * Math.PI) / 180);
    expect(r.ev('SPONTANEOUS').filter((x) => x.p?.action === 'peek').length).toBeGreaterThan(0);
    r.hand = null;
    r.run(2);
    expect(r.beats()).toContain('off.relief');
  });
});

describe('迎手链：深卷预算与纯数据', () => {
  it('深卷：门开着（手在腱轴 0 正上方、平卷够不着）才用，≤ 0.62、每轮 ≤ 4 s；deepOk = false 时恒 0', () => {
    const deepHand: Hand = { bearing: 0, dist: 480, face: 0.25, aimDir: 0, aimBend: 1.47, aimDist: 250 };
    const seed = seedFor('A', 'toward');
    const run = (deepOk: boolean): { used: number; maxD: number; maxDeep: number } => {
      const r = new Rig('A', seed, { deepOk });
      r.move(deepHand, 0);
      let used = 0;
      let maxD = 0;
      let maxDeep = 0;
      r.run(30, () => {
        const a = r.e.targets().arm;
        const D = 0.34 * a.bend + 0.16 * a.wrap + 0.3773 * (a.deep ?? 0);
        maxDeep = Math.max(maxDeep, a.deep ?? 0);
        if ((a.deep ?? 0) > 0) {
          maxD = Math.max(maxD, D);
          if (D > HC.flatMax) used += 1 / 60;
          expect(Math.abs(a.dir)).toBeLessThan(0.15);
        }
      });
      return { used, maxD, maxDeep };
    };
    const on = run(true);
    expect(on.maxDeep).toBeGreaterThan(0);
    expect(on.maxD).toBeLessThanOrEqual(HC.deepMax + 1e-6);
    expect(on.used).toBeLessThanOrEqual(4 + 1 / 60 + 1e-9);
    expect(run(false).maxDeep).toBe(0);
  });

  it('凑 / 缠 / 握的中途快照 → JSON → 恢复，接着跑与一口气跑完逐位相同', () => {
    const seed = seedFor('A', 'toward');
    for (const at of [3, 6, 12]) {
      const a = new Rig('A', seed);
      a.run(at);
      const st: EngineState = JSON.parse(JSON.stringify(a.e.snapshot()));
      const b = new Rig('A', seed);
      b.e = BehaviorEngine.restore(st);
      b.t0 = a.t0;
      Object.assign(b, { hand: a.hand, movedAt: a.movedAt, v: a.v, touch: a.touch, tension: a.tension, near: a.near });
      for (let i = 0; i < 240; i++) {
        a.run(1 / 60);
        b.run(1 / 60);
        expect(b.e.targets(), `${at} s + ${i}`).toEqual(a.e.targets());
      }
    }
  });

  it('臂余振观测器：阶跃以后预测停稳的时刻与它自己往前推的一致；指令不动时最终停稳', () => {
    const o = [0, 0, 0, 0, 0, 0, 0, 0];
    const f = obsForecast(o, 0.2, 0, 0.03, 6);
    let t = 0;
    while (!obsSettled(o, 0.2, 0, 0.03) && t < 6) {
      obsStep(o, 0.2, 0, 1 / 60);
      t += 1 / 60;
    }
    expect(Math.abs(t - f)).toBeLessThan(1 / 30);
    expect(t).toBeGreaterThan(1);
    expect(OBS.za).toBeCloseTo(0.12, 9);
  });
});

/** 三腱指令逐帧变化的最大值（惊跳程序在跑的帧不算：它本来就是一下猛缩） */
function jumpWatch(r: Rig): { step: () => void; worst: () => { d: number; t: number; at: string } } {
  let prev: [number, number, number] | null = null;
  let worst = { d: 0, t: -1, at: '' };
  return {
    step: () => {
      const c = tendonContractions(r.e.targets().arm, { deep: true });
      const startle = r.e.motion()?.name === 'startle';
      if (prev && !startle) {
        const d = Math.max(...c.map((x, i) => Math.abs(x - prev![i])));
        if (d > worst.d) {
          const hs = r.e.handStage();
          worst = { d, t: r.t, at: `${hs?.stage ?? 'off'}.${hs?.beat ?? ''} ${r.e.state.grasp.phase} ${r.e.motion()?.name ?? ''}` };
        }
      }
      prev = c;
    },
    worst: () => worst,
  };
}

/** 俯视台架（与 MachineBench 的预设同式）：闭环读数——每帧按此刻的偏航重算 */
const TOP: ViewParams = { ...sweepFraming([1, 0, 0, 0, 1, 0, 0, 0, 1]), m: [1, 0, 0, 0, 1, 0, 0, 0, 1], pan: { x: 0, y: 0 }, persp: 0 };
type V3 = { x: number; y: number; z: number };
const segDist3 = (p: V3, a: V3, b: V3): number => {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
  return Math.hypot(p.x - a.x - u * ab.x, p.y - a.y - u * ab.y, p.z - a.z - u * ab.z);
};
/** 臂坐标系里的一点（沿臂 s mm、水平侧偏 lat mm，+ = 左）换成世界点 */
function armFramePoint(s: number, lat: number): V3 {
  const B = ARM_GEOM.base;
  const T = ARM_GEOM.tip;
  const L = ARM_GEOM.length;
  const e = { x: (T.x - B.x) / L, y: (T.y - B.y) / L, z: (T.z - B.z) / L };
  const h = Math.hypot(e.x, e.y);
  const n = { x: -e.y / h, y: e.x / h };
  return { x: B.x + e.x * s + n.x * lat, y: B.y + e.y * s + n.y * lat, z: B.z + e.z * s };
}
/**
 * 闭环报手：每帧按此刻偏航重算读数，发不发调台架同一个 handSendDue（v2 下指针还在挪也发）。where(t) = 指针此刻的世界点；
 * moving(t) = 指针此刻在不在挪、多快（mm/s）
 */
function closedLoopHand(r: Rig, where: (t: number) => V3, speed: (t: number) => number): () => void {
  r.autoHand = false;
  r.hand = null;
  let sent: HandSent | null = null;
  let aimDir = 0;
  let lastMoveAt = 0;
  return () => {
    const t = r.t;
    const v = speed(t);
    if (v > 0) lastMoveAt = t;
    const read = handReading(TOP, projectLogical(TOP, where(t)), r.e.targets().yaw, sent?.bearing);
    if (read.side >= HAND_UI.sideMin || !sent) aimDir = read.aimDir;
    if (handSendDue(read, sent, aimDir, t, { v2: true, lastMoveAt })) {
      const r3 = (x: number): number => Math.round(x * 1000) / 1000;
      const send = { bearing: r3(read.bearing), dist: Math.round(read.dist), face: r3(read.face), aimDir: r3(aimDir), aimBend: r3(read.aimBend), aimDist: Math.round(read.aimDist) };
      sent = { ...send, at: t };
      r.push({ kind: 'HAND', on: true, ...send, touch: 32, still: Math.min(9.9, Math.round((t - lastMoveAt) * 10) / 10), v: Math.round(v) });
    }
  };
}

describe('迎手链：评审第二轮的守门（2026-10-08）', () => {
  it('旧路抓握（没看见手时碰臂起的缠 / 握）期间看见了手：手链不起程序、不写臂、不凑不撑', () => {
    let seenDuring = 0;
    for (const P of ['A', 'C', 'D'] as PersonaKey[]) {
      for (let seed = 1; seed <= 6; seed++) {
        const r = new Rig(P, seed);
        r.contact = false;
        r.hand = null;
        r.run(0.5);
        r.push({ kind: 'ARM_TOUCH', on: true, by: 'hand' });
        r.touch = true;
        r.run(4);
        if (!r.ev('GRASP_START').length) continue;
        r.hand = { ...NEAR };
        r.movedAt = r.t;
        let bad = '';
        let seen = false;
        r.run(10, () => {
          const ph = r.e.state.grasp.phase;
          if (ph !== 'WRAP' && ph !== 'HOLD_HUMAN' && ph !== 'HOLD_OBJECT') return;
          if (r.e.state.hand?.seen) seen = true;
          const mo = r.e.motion();
          const st = r.e.state.m2!.hc.stage;
          if (!bad && ((mo && mo.name.startsWith('hand.')) || st === 'approach' || st === 'strain')) bad = `${r.t.toFixed(2)} ${st} ${mo?.name ?? ''}`;
        });
        if (seen) seenDuring++;
        expect(bad, `${P} ${seed}`).toBe('');
      }
    }
    expect(seenDuring).toBeGreaterThan(3);
  });

  it('追的途中手出了视野、3 s 后丢掉：抓握当即判抓空，不按兜底时长一直缠下去', () => {
    for (const P of ['A', 'C'] as PersonaKey[]) {
      const r = new Rig(P, seedFor(P, 'toward'));
      r.run(20);
      expect(r.e.state.grasp.phase, P).toBe('HOLD_HUMAN');
      r.withdraw(600);
      r.contact = false;
      r.move({ bearing: 3.0, face: 3.0, dist: 650, aimBend: 1.47, aimDist: 520 }, 600);
      r.run(12);
      const lostAt = r.ev('GRASP_LOST')[0].t;
      expect(r.ev('GRASP_LOST')[0].p?.reaction, P).toBe('chase');
      const empty = r.ev('GRASP_EMPTY').find((x) => x.t >= lostAt);
      expect(empty, `${P} ${r.beats().join(' ')}`).toBeDefined();
      const unseen = r.ev('HAND_LOST').find((x) => x.p?.reason === 'unseen' && x.t >= lostAt);
      if (unseen && unseen.t <= empty!.t) expect(empty!.t - unseen.t, P).toBeLessThanOrEqual(0.6);
      expect(empty!.t - lostAt, P).toBeLessThan(6);
    }
  });

  it('惊跳以后手一直搭在臂上（电极没断）：照样重新武装、再缠一次（不会永远等不到）', () => {
    let cases = 0;
    let regrabs = 0;
    for (const P of ['A', 'C'] as PersonaKey[]) {
      for (const from of [1, 100, 200]) {
        const r = new Rig(P, seedFor(P, 'toward', from));
        r.run(20);
        if (r.e.state.grasp.phase !== 'HOLD_HUMAN') continue;
        r.push({ kind: 'KNOCK', intensity: 0.98 });
        r.run(1);
        if (!r.ev('STARTLE').length) continue;
        const n0 = r.ev('GRASP_START').length;
        r.run(12);
        if (r.e.state.hand?.mode !== 'toward') continue;
        cases++;
        if (r.ev('GRASP_START').length > n0) regrabs++;
      }
    }
    expect(cases).toBeGreaterThan(0);
    expect(regrabs).toBe(cases);
  });

  it('惊跳正忙时手碰臂：记正忙、惊跳做完再补认，不当场起缠抢走惊跳的臂', () => {
    const r = new Rig('C', seedFor('C', 'toward'));
    r.contact = false;
    for (let i = 0; i < 60 && !r.e.state.hand?.seen; i++) r.run(0.1);
    expect(r.e.state.hand?.seen).toBe(true);
    r.push({ kind: 'KNOCK', intensity: 0.98 });
    r.run(0.4);
    expect(r.ev('STARTLE')).toHaveLength(1);
    const busyUntil = r.e.state.m2!.startleBusy;
    r.push({ kind: 'ARM_TOUCH', on: true, by: 'hand' });
    r.touch = true;
    r.run(0.1);
    const touch = r.log.filter((x) => x.ev === 'ARM_TOUCH' && x.p?.on).pop()!;
    expect(touch.out).toBe('busy');
    r.run(10);
    const gs = r.ev('GRASP_START');
    for (const g of gs) expect(g.t + r.t0).toBeGreaterThanOrEqual(busyUntil - 1e-9);
  });

  it('投入中起的回应 / 触须抖只放提示：手链退出投入时不接管臂（三腱逐帧 ≤ 0.06）', () => {
    const far: Hand = { bearing: 0, dist: 700, face: 0.1, aimDir: 0.62, aimBend: 1.47, aimDist: 420 };
    for (const P of ['A', 'C', 'D'] as PersonaKey[]) {
      for (const from of [1, 50, 150]) {
        const r = new Rig(P, seedFor(P, 'toward', from));
        r.contact = false;
        r.move(far, 0);
        const j = jumpWatch(r);
        let patted = false;
        r.run(40, () => {
          j.step();
          if (!patted && r.e.state.m2!.hc.stage === 'strain') {
            patted = true;
            r.push({ kind: 'SHELL_STROKE', half: 'L', touch: 'pat' });
          }
        });
        expect(j.worst().d, `${P} ${from} ${JSON.stringify(j.worst())}`).toBeLessThanOrEqual(0.06);
      }
    }
  });

  it('深卷交接不跳：握着时留物件（握人 → 握物）、深卷途中手离开画布丢掉——三腱逐帧 ≤ 0.06', () => {
    const deepHand: Hand = { bearing: 0, dist: 480, face: 0.25, aimDir: 0, aimBend: 1.47, aimDist: 250 };
    let holds = 0;
    let curls = 0;
    for (const from of [1, 100, 200, 300]) {
      const seed = seedFor('A', 'toward', from);
      // 握人（深卷）→ 留物件
      const a = new Rig('A', seed);
      a.move(deepHand, 0);
      let deepHold = false;
      a.run(30, () => {
        if (!deepHold && a.e.state.grasp.phase === 'HOLD_HUMAN' && (a.e.targets().arm.deep ?? 0) > 0.1 && a.t - (a.ev('GRASP_HOLD_HUMAN')[0]?.t ?? 1e9) + a.t0 > 1) deepHold = true;
      });
      if (deepHold || (a.e.state.grasp.phase === 'HOLD_HUMAN' && (a.e.targets().arm.deep ?? 0) > 0.1)) {
        holds++;
        const j = jumpWatch(a);
        a.push({ kind: 'ARM_TOUCH', on: false });
        a.touch = false;
        a.contact = false;
        a.hand = null;
        a.run(4, j.step);
        expect(a.e.state.grasp.phase).toBe('HOLD_OBJECT');
        expect(j.worst().d, `hold ${from} ${JSON.stringify(j.worst())}`).toBeLessThanOrEqual(0.06);
      }
      // 卷到一半手离开画布 → 3 s 后丢掉 → 手链关
      const b = new Rig('A', seed);
      b.move(deepHand, 0);
      b.contact = false;
      let cut = false;
      const j = jumpWatch(b);
      b.run(30, () => {
        if (!cut && b.e.handStage()?.beat === 'curl' && (b.e.targets().arm.deep ?? 0) > 0.3) {
          cut = true;
          b.hand = null;
        }
        if (cut) j.step();
      });
      if (cut) {
        curls++;
        expect(j.worst().d, `curl ${from} ${JSON.stringify(j.worst())}`).toBeLessThanOrEqual(0.06);
      }
    }
    expect(holds + curls).toBeGreaterThan(1);
  });

  it('指针 40 mm/s 慢慢挪个不停（台架按 handSendDue 报）：引擎不把它当停稳——不凑、不撑、不缠', () => {
    for (const P of ['A', 'C'] as PersonaKey[]) {
      for (const from of [1, 100]) {
        const r = new Rig(P, seedFor(P, 'toward', from));
        r.contact = false;
        const send = closedLoopHand(
          r,
          (t) => armFramePoint(150 + 40 * Math.min(t, 4), 150),
          (t) => (t <= 4 ? 40 : 0),
        );
        const stages = new Set<string>();
        for (let i = 0; i < 4 * 60; i++) {
          send();
          r.run(1 / 60);
          stages.add(r.e.handStage()?.stage ?? 'off');
        }
        expect([...stages].filter((x) => x === 'approach' || x === 'strain' || x === 'wrap'), `${P} ${from}`).toEqual([]);
        expect(r.ev('GRASP_START'), `${P} ${from}`).toHaveLength(0);
      }
    }
  });

  it('手静止放在臂侧、靠近基座（闭环：读数随偏航重算）：迎的转身不把笔直的臂扫到手上', () => {
    for (const P of ['A', 'C'] as PersonaKey[]) {
      for (const lat of [150, -150, 180]) {
        const r = new Rig(P, seedFor(P, 'toward'));
        r.contact = false;
        const P0 = armFramePoint(108, lat);
        const send = closedLoopHand(r, () => P0, () => 0);
        let minClear = Infinity;
        let engaged = false;
        for (let i = 0; i < 6 * 60; i++) {
          send();
          r.run(1 / 60);
          const st = r.e.handStage()?.stage ?? 'off';
          if (st !== 'off' && st !== 'track') engaged = true;
          if (engaged) continue;
          const yaw = r.e.targets().yaw;
          minClear = Math.min(minClear, segDist3(P0, yawPoint(ARM_GEOM.base, yaw), yawPoint(ARM_GEOM.tip, yaw)));
        }
        expect(minClear, `${P} ${lat}`).toBeGreaterThan(60);
      }
    }
  });
});
