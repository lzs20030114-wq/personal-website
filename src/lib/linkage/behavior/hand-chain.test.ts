import { describe, expect, it } from 'vitest';
import { BehaviorEngine, type EngineState, OBS, obsForecast, obsSettled, obsStep } from './engine';
import type { SensorInput } from './events';
import type { LogRecord } from './log';
import { PERSONA_KEYS, type PersonaKey } from './persona';
import { HC, gainAt } from './vocab2-hand';

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
      if (this.e.ticks % 6 === 0) {
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

  it('看见手以后在场档被吸收：看见那一刻作废还没发的在场回应；之后走近不起程序、不抽 ⑩', () => {
    // 沉静型：看见要 2 s（④），在场回应也要 2 s——手出现 1.5 s 后人走近，回应还没发手就先看见了
    const r = new Rig('B', seedFor('B', 'toward'));
    r.contact = false;
    r.run(1.5);
    r.push({ kind: 'PRESENCE', band: 'far' });
    r.run(3);
    const seenAt = r.ev('HAND_SEEN')[0].t;
    expect(r.ev('RESPONSE_DROP').filter((x) => x.p?.reason === 'hand')).toHaveLength(1);
    r.push({ kind: 'PRESENCE', band: 'near' });
    r.run(3);
    expect(r.ev('RESPONSE').filter((x) => x.p?.motion === 'hand.absorb')).toHaveLength(1);
    expect(r.ev('RESPONSE').filter((x) => x.t >= seenAt && String(x.p?.motion ?? '').startsWith('respond.approach'))).toHaveLength(0);
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
    expect(OBS.za).toBeCloseTo(0.15, 9);
  });
});
