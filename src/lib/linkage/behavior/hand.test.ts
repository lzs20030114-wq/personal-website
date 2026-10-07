import { describe, expect, it } from 'vitest';
import { ARM_BEND_MAX, BehaviorEngine, HAND, type EngineState, STATE_VERSION, wrapPi } from './engine';
import type { SensorInput } from './events';
import { GRASP } from './grasp';
import type { LogRecord } from './log';
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from './persona';

/**
 * 手（HAND，Lab 1-6 鼠标 = 人的手，2026-10-07）的守门。会坏的地方各卡一道：
 * ① 看见：要过人格的响应延迟、要在视野里（碰到臂另算），没看见之前机器不知道手在哪；
 * ② 决定：迎 / 躲 / 不理的比例按 ⑩，躲只给沉静 / 不稳定、不理只给活力 / 好奇；
 * ③ 跟踪：迎 = 转向手、躲 = 背过去（然后手出了视野会被忘掉）；分层（小偏差只动臂）；取近路，越限少就等、多就绕；
 * ④ 臂：迎 = 弯向手、躲 = 背着手；缠 = 朝手缠、缠得比以前深、脱手后追着手转；握人仍极轻；
 * ⑤ 纯数据：带手的快照恢复后续跑逐位相同，旧版本快照被拒。
 */

const order = (first: PersonaKey): PersonaKey[] => [first, ...PERSONA_KEYS.filter((k) => k !== first)];

/** 一个停在成长段开头的引擎（诞生头 20 s 不响应，测试从成长段起） */
function grown(first: PersonaKey, seed: number): { e: BehaviorEngine; log: LogRecord[] } {
  const e = new BehaviorEngine({ seed, order: order(first), lifeRate: 1 });
  const log: LogRecord[] = e.drain();
  e.skip();
  e.tick();
  log.push(...e.drain());
  return { e, log };
}

/** 跑 sec 秒，日志收进 log */
function run(e: BehaviorEngine, log: LogRecord[], sec: number, each?: () => void): void {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    e.tick();
    log.push(...e.drain());
    each?.();
  }
}

/** 一条 HAND 读数。aimDist 缺省 = 离电机轴的距离减去臂基座离轴的 236 mm（手大致在臂的前方） */
const hand = (bearing: number, dist = 450, aimDir = 0, aimBend = 0.4, aimDist = Math.max(0, dist - 236), face = bearing): SensorInput => ({
  kind: 'HAND',
  on: true,
  bearing,
  dist,
  face,
  aimDir,
  aimBend,
  aimDist,
});
/** 远处的手（臂够不着：要转身） */
const farHand = (bearing: number): SensorInput => hand(bearing, 1000, 0, 0.4, 800);

/** 改快照里的朝向再恢复（测试取近路用） */
function withYaw(e: BehaviorEngine, yaw: number): BehaviorEngine {
  const st: EngineState = e.snapshot();
  st.yaw = { x: yaw, v: 0 };
  st.yawGoal = yaw;
  st.yawTarget = yaw;
  return BehaviorEngine.restore(st);
}

/** 找一个让「看见那一刻」抽到指定决定的种子 */
function seedFor(first: PersonaKey, mode: 'toward' | 'away' | 'look', bearing = 0): number {
  for (let seed = 1; seed < 400; seed++) {
    const { e, log } = grown(first, seed);
    e.push(hand(bearing));
    run(e, log, 4);
    const seen = log.find((r) => r.ev === 'HAND_SEEN');
    if (seen?.p?.mode === mode) return seed;
  }
  throw new Error(`no seed for ${first} ${mode}`);
}

describe('看见', () => {
  it('手在正前方：过一个响应延迟（④，±15%）才看见；看见之前机器不知道人在哪', () => {
    for (const k of PERSONA_KEYS) {
      const { e, log } = grown(k, 11);
      const t0 = e.time;
      e.push(hand(0));
      e.tick();
      log.push(...e.drain());
      expect(e.state.bearing).toBeNull();
      run(e, log, 5);
      const seen = log.find((r) => r.ev === 'HAND_SEEN');
      expect(seen, k).toBeDefined();
      const lat = PERSONAS[k].latency;
      expect(seen!.t - t0).toBeGreaterThanOrEqual(lat[0] * 0.85 - 0.05);
      expect(seen!.t - t0).toBeLessThanOrEqual(lat[1] * 1.15 + 0.1);
      expect(e.state.bearing).toBe(0);
    }
  });

  it('手在背后（视野 ±120° 以外）：不看见；一碰到臂就看见', () => {
    const { e, log } = grown('B', 3); // 沉静：40 s 才张望一次，背后的手一直在视野外
    e.push(hand(Math.PI * 0.95));
    run(e, log, 6);
    expect(log.some((r) => r.ev === 'HAND_SEEN')).toBe(false);
    e.push({ kind: 'ARM_TOUCH', on: true });
    run(e, log, PERSONAS.B.latency[1] * 1.15 + 0.3);
    expect(log.some((r) => r.ev === 'HAND_SEEN')).toBe(true);
  });

  it('诞生头 20 s 不看；手离开记 HAND_LOST gone；新出现的手先清掉旧方位', () => {
    const e = new BehaviorEngine({ seed: 5, order: order('C'), lifeRate: 1 });
    const log: LogRecord[] = e.drain();
    e.push({ kind: 'PRESENCE', band: 'mid', bearing: 1.1 });
    e.push(hand(0));
    run(e, log, 10);
    expect(log.some((r) => r.ev === 'HAND_SEEN')).toBe(false);
    expect(e.state.bearing).toBeNull();
    run(e, log, 12); // 过了 20 s 的静默
    expect(log.some((r) => r.ev === 'HAND_SEEN')).toBe(true);
    e.push({ kind: 'HAND', on: false });
    run(e, log, HAND.loseAfter + 0.1); // 看见过的手离开：留 3 s 记忆，到点才记丢
    expect(log.some((r) => r.ev === 'HAND_LOST' && r.p?.reason === 'gone')).toBe(true);
    expect(e.state.hand).toBeNull();
    expect(e.state.bearing).toBe(0); // 人在哪的记忆留着
  });
});

describe('决定', () => {
  it('迎的比例按 ⑩；躲只给沉静 / 不稳定，不理只给活力 / 好奇', () => {
    const N = 160;
    for (const k of PERSONA_KEYS) {
      const n = { toward: 0, away: 0, look: 0 };
      for (let seed = 1; seed <= N; seed++) {
        const { e, log } = grown(k, seed * 7 + 1);
        e.push(hand(0));
        run(e, log, 4);
        const m = log.find((r) => r.ev === 'HAND_SEEN')?.p?.mode as keyof typeof n | undefined;
        expect(m, `${k} seed ${seed}`).toBeDefined();
        n[m!]++;
      }
      const p = PERSONAS[k];
      expect(Math.abs(n.toward / N - p.toward), k).toBeLessThan(0.1);
      if (p.otherwise === 'away') expect(n.look, k).toBe(0);
      else expect(n.away, k).toBe(0);
    }
  });

  it('看见以后按 ⑨ 的间隔重新决定（again），不再在整圈里随便挑方向', () => {
    const { e, log } = grown('A', seedFor('A', 'toward'));
    e.push(hand(0));
    run(e, log, 30);
    const seen = log.filter((r) => r.ev === 'HAND_SEEN');
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.slice(1).every((r) => r.p?.again === true)).toBe(true);
    for (let i = 2; i < seen.length; i++) {
      const gap = seen[i].t - seen[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(PERSONAS.A.orient[0] - 0.05);
      expect(gap).toBeLessThanOrEqual(PERSONAS.A.orient[1] + 1.1);
    }
    // 看见手之前那一下张望可以有（成长段开头 ⑨ 正好到点）；看见以后就不再随便挑方向
    expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'random' && r.t > seen[0].t)).toBe(false);
  });
});

describe('跟踪', () => {
  it('迎：臂够不着的手 → 转身对准（偏差 > 20° 才转，停在 20° 以内）', () => {
    const b = 1.4;
    const { e, log } = grown('C', seedFor('C', 'toward', b));
    e.push(farHand(b));
    run(e, log, 9);
    // 好奇 10–15 s 才重新决定一次，9 s 内一直是迎
    expect(log.filter((r) => r.ev === 'HAND_SEEN').every((r) => r.p?.mode === 'toward')).toBe(true);
    expect(Math.abs(wrapPi(e.state.yaw.x - b))).toBeLessThan(HAND.turnAt);
  });

  it('分层：臂够得着的手（哪怕偏出 20° 以上）机身不动，只有臂去够；够不着（aimBend > 1）就转身', () => {
    const { e, log } = grown('C', seedFor('C', 'toward', 0.5));
    e.push(hand(0.5, 420, 1.2, 0.6, 300));
    run(e, log, 5);
    expect(Math.abs(e.state.yaw.x)).toBeLessThan(0.02);
    const arm = e.targets().arm;
    expect(Math.abs(wrapPi(arm.dir - 1.2))).toBeLessThan(0.15);
    expect(arm.bend).toBeGreaterThan(0.45);
    // 同一个方位，但臂满差动也够不着
    e.push(hand(0.5, 420, 1.2, 1.3, 300));
    run(e, log, 6);
    expect(Math.abs(wrapPi(e.state.yaw.x - 0.5))).toBeLessThan(HAND.turnAt);
  });

  it('手在机身上方（在摸壳）：不转身、不去够', () => {
    const { e, log } = grown('C', seedFor('C', 'toward', 0.2));
    e.push(hand(0.2, 300, 1.0, 1.4, 120));
    run(e, log, 6);
    expect(e.state.hand?.seen).toBe(true);
    expect(Math.abs(e.state.yaw.x)).toBeLessThan(0.02);
    expect(e.targets().arm.bend).toBeLessThan(0.35);
  });

  it('诞生 20–40 s：看得见、臂会够，但不转身（转向从 40 s 起）', () => {
    const e = new BehaviorEngine({ seed: 4, order: order('C'), lifeRate: 1 });
    const log: LogRecord[] = e.drain();
    run(e, log, 21);
    e.push(farHand(1.5));
    run(e, log, 8);
    expect(log.some((r) => r.ev === 'HAND_SEEN')).toBe(true);
    expect(Math.abs(e.state.yawTarget)).toBeLessThan(1e-9);
  });

  it('躲：背过身去，手出了视野 3 s 后被忘掉（HAND_LOST unseen），臂背着手弯', () => {
    const b = 0.3;
    const { e, log } = grown('B', seedFor('B', 'away', b));
    e.push(hand(b, 400, 0.5, 0.3));
    let armAway = false;
    // 沉静型转得慢（180° 约 9 s）、转完才开始倒数 3 s
    run(e, log, 28, () => {
      const h = e.state.hand;
      if (h?.seen && h.mode === 'away' && e.targets().arm.bend > 0.3) {
        armAway ||= Math.abs(wrapPi(e.targets().arm.dir - (0.5 + Math.PI))) < 0.4;
      }
    });
    expect(Math.abs(wrapPi(e.state.yaw.x - (b + Math.PI)))).toBeLessThan(Math.PI / 3);
    expect(log.some((r) => r.ev === 'HAND_LOST' && r.p?.reason === 'unseen')).toBe(true);
    expect(e.state.hand?.seen).toBe(false);
    expect(armAway).toBe(true);
  });

  it('取近路：跨过 ±180° 的接缝不绕一整圈；越限不到 60° 停在限位，超过才绕回去（记 ORIENT unwind）', () => {
    const s0 = seedFor('C', 'toward', 0);
    // 朝向 2.8，手在 −2.8（隔着接缝 0.68 rad）：越限 0.34 rad < 60° → 停在 π
    {
      const g = grown('C', s0);
      const e = withYaw(g.e, 2.8);
      const log: LogRecord[] = [];
      e.push(farHand(-2.8));
      run(e, log, 4);
      expect(e.state.yawTarget).toBeCloseTo(Math.PI, 9);
      expect(e.state.yaw.x).toBeGreaterThan(2.8);
      expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'unwind')).toBe(false);
    }
    // 手在 −1.8：越限 1.34 rad ≥ 60° → 绕回去，转到 −1.8 附近
    {
      const g = grown('C', s0);
      const e = withYaw(g.e, 2.8);
      const log: LogRecord[] = [];
      e.push(farHand(-1.8));
      run(e, log, 14);
      expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'unwind')).toBe(true);
      expect(Math.abs(e.state.yaw.x - -1.8)).toBeLessThan(HAND.turnAt);
      expect(Math.abs(e.state.yaw.x)).toBeLessThanOrEqual(Math.PI);
      // 绕的途中手会暂时出视野，但不算丢
      expect(log.some((r) => r.ev === 'HAND_LOST')).toBe(false);
    }
  });

  it('躲开时手在正背后抖动（±0.5°）：转向锁定，不来回掉头', () => {
    // 沉静型：⑨ 30–45 s 才重新决定，8 s 里一直是躲；转得慢，8 s 里一直在转
    const { e, log } = grown('B', seedFor('B', 'away', 0));
    let prevGoal = e.state.yawGoal;
    let prevSign = 0;
    let flips = 0;
    for (let i = 0; i < 60 * 8; i++) {
      if (i % 6 === 0) e.push(hand(((i / 6) % 2 ? 0.5 : -0.5) * (Math.PI / 180), 450, 0.4, 0.4));
      e.tick();
      log.push(...e.drain());
      if (!log.some((r) => r.ev === 'HAND_SEEN')) {
        prevGoal = e.state.yawGoal;
        continue;
      }
      const v = e.state.yawGoal - prevGoal;
      prevGoal = e.state.yawGoal;
      const sg = Math.abs(v) > 1e-6 ? Math.sign(v) : 0;
      if (sg !== 0 && prevSign !== 0 && sg !== prevSign) flips++;
      if (sg !== 0) prevSign = sg;
    }
    expect(log.some((r) => r.ev === 'HAND_SEEN' && r.p?.mode === 'away')).toBe(true);
    expect(flips).toBeLessThanOrEqual(1);
  });

  it('惊跳正在做时不跟踪（缩那一下要缩完）', () => {
    const { e, log } = grown('A', seedFor('A', 'toward', 1.2));
    e.push(farHand(1.2));
    run(e, log, 1);
    e.push({ kind: 'KNOCK', intensity: 1 }); // 活力型阈值 0.8
    run(e, log, 0.2);
    expect(log.some((r) => r.ev === 'STARTLE')).toBe(true);
    const target = e.state.yawTarget;
    run(e, log, 1);
    expect(e.state.yawTarget).toBe(target);
  });
});

describe('臂与缠', () => {
  it('迎：近处的手 → 臂弯向手，弯曲按离臂基座的距离加权（太远就不够）', () => {
    const { e, log } = grown('C', seedFor('C', 'toward', 0));
    e.push(hand(0, 500, -0.9, 0.7, 300));
    run(e, log, 4);
    const near = e.targets().arm;
    expect(Math.abs(wrapPi(near.dir - -0.9))).toBeLessThan(0.3);
    expect(near.bend).toBeGreaterThan(0.5);
    e.push(hand(0, 2500, -0.9, 0.7, 2200));
    run(e, log, 4);
    expect(e.targets().arm.bend).toBeLessThan(0.35);
  });

  it('缠：朝手缠、缠得比满差动还深（arm.wrap > 0）；缠的头几成方向追着手；握人保住形状（不在握住那一刻伸直）', () => {
    // 好奇型碰臂必回应、回应必为正（gain 不带符号）→ 缠
    const { e, log } = grown('C', seedFor('C', 'toward', 0));
    e.push(hand(0, 420, 0.8, 0.5));
    run(e, log, 2);
    e.push({ kind: 'ARM_TOUCH', on: true });
    run(e, log, 1.2);
    expect(log.some((r) => r.ev === 'GRASP_START')).toBe(true);
    expect(Math.abs(wrapPi(e.state.grasp.dir - 0.8))).toBeLessThan(0.05);
    // 手往另一边挪：缠的方向跟过去（≤ 1 rad/s × √k_v，缠过四成定住）
    const d0 = e.state.grasp.dir;
    e.push(hand(0, 420, -0.6, 0.5));
    run(e, log, 0.5);
    expect(e.state.grasp.dir).toBeLessThan(d0 - 0.2);
    // 缠到限位附近：深缠那一档在用
    let maxWrap = 0;
    run(e, log, 2.5, () => {
      maxWrap = Math.max(maxWrap, e.targets().arm.wrap);
    });
    expect(maxWrap).toBeGreaterThan(0.5);
    expect(ARM_BEND_MAX).toBeGreaterThan(1);
    // 手被卷住（张力 + 电极）→ 握人：极轻
    const log2: LogRecord[] = [];
    const g2 = grown('C', seedFor('C', 'toward', 0));
    g2.e.push(hand(0, 420, 0.8, 0.5));
    run(g2.e, log2, 2);
    g2.e.push({ kind: 'ARM_TOUCH', on: true });
    run(g2.e, log2, 2.4);
    g2.e.push({ kind: 'RESISTANCE', on: true });
    run(g2.e, log2, 3);
    expect(log2.some((r) => r.ev === 'GRASP_HOLD_HUMAN')).toBe(true);
    const g = g2.e.state.grasp;
    expect(g.contact).toBeGreaterThan(GRASP.human);
    expect(g2.e.targets().arm.bend).toBeGreaterThan(0.8 * g.contact * 0.98);
    expect(g2.e.targets().arm.wrap).toBeCloseTo(0.5 * g.contactW, 1);
  });

  it('没有手时缠法照旧（握人 = 极轻、wrap 恒 0）', () => {
    const { e, log } = grown('C', 31);
    e.push({ kind: 'ARM_TOUCH', on: true });
    run(e, log, 2.4);
    e.push({ kind: 'RESISTANCE', on: true });
    let maxWrap = 0;
    run(e, log, 4, () => {
      maxWrap = Math.max(maxWrap, e.targets().arm.wrap);
    });
    expect(log.some((r) => r.ev === 'GRASP_HOLD_HUMAN')).toBe(true);
    expect(maxWrap).toBe(0);
    expect(e.targets().arm.bend).toBeLessThan(GRASP.human + 0.05);
  });

  it('臂自己伸过去碰到不动的手（by: arm）：按轻抚算，沉静型不惊跳；手伸过来碰（不写 by）照旧会惊跳', () => {
    const reach = grown('B', 13);
    reach.e.push({ kind: 'ARM_TOUCH', on: true, by: 'arm' });
    run(reach.e, reach.log, 0.5);
    const r0 = reach.log.find((r) => r.ev === 'ARM_TOUCH');
    expect(r0?.I).toBeCloseTo(0.1, 12);
    expect(reach.log.some((r) => r.ev === 'STARTLE')).toBe(false);
    const push = grown('B', 13);
    push.e.push({ kind: 'ARM_TOUCH', on: true });
    run(push.e, push.log, 0.5);
    expect(push.log.some((r) => r.ev === 'STARTLE')).toBe(true);
  });

  it('被手吓到（碰臂惊跳）：这只手先不迎了——换成 ⑩ 的「不朝人时」，不抽随机数', () => {
    const { e, log } = grown('B', seedFor('B', 'toward', 0)); // 沉静：迎 20%，惊吓阈值 0.2
    e.push(hand(0, 420, 0.8, 0.5));
    run(e, log, 4);
    e.push({ kind: 'ARM_TOUCH', on: true });
    run(e, log, 0.3);
    expect(log.some((r) => r.ev === 'STARTLE')).toBe(true);
    const after = log.find((r) => r.ev === 'HAND_SEEN' && r.p?.cause === 'startle');
    expect(after?.p?.mode).toBe('away');
    expect(e.state.hand?.mode).toBe('away');
  });

  it('惊跳：看见了手就背着手缩', () => {
    const { e, log } = grown('B', seedFor('B', 'toward', 0)); // 沉静：阈值 0.2，敲一下就惊跳
    e.push(hand(0, 420, 1.0, 0.3));
    run(e, log, 4);
    e.push({ kind: 'KNOCK', intensity: 0.9 });
    run(e, log, 0.15);
    expect(log.some((r) => r.ev === 'STARTLE')).toBe(true);
    const g = e.state.gesture!;
    expect(g.kind).toBe('startle');
    expect(Math.abs(wrapPi(g.dir - (1.0 + Math.PI)))).toBeLessThan(1e-9);
  });
});

describe('离开与回来', () => {
  it('手离开画布：3 s 内回来接着原来的态度（不重新决定）；超过 3 s 记 HAND_LOST gone', () => {
    const { e, log } = grown('C', seedFor('C', 'toward', 0));
    e.push(hand(0));
    run(e, log, 3);
    const n0 = log.filter((r) => r.ev === 'HAND_SEEN').length;
    e.push({ kind: 'HAND', on: false });
    run(e, log, 1.5);
    expect(e.state.hand?.seen).toBe(true);
    e.push(hand(0.1));
    run(e, log, 1);
    expect(log.filter((r) => r.ev === 'HAND_SEEN').length).toBe(n0);
    expect(log.some((r) => r.ev === 'HAND_LOST')).toBe(false);
    e.push({ kind: 'HAND', on: false });
    run(e, log, 3.5);
    expect(log.some((r) => r.ev === 'HAND_LOST' && r.p?.reason === 'gone')).toBe(true);
    expect(e.state.hand).toBeNull();
  });

  it('没看见过的手离开：直接作废，不记 HAND_LOST', () => {
    const { e, log } = grown('B', 3);
    e.push(hand(Math.PI));
    run(e, log, 1);
    e.push({ kind: 'HAND', on: false });
    run(e, log, 0.1);
    expect(e.state.hand).toBeNull();
    expect(log.some((r) => r.ev === 'HAND_LOST')).toBe(false);
  });
});

describe('纯数据', () => {
  it('带手的快照：JSON 往返后续跑与一口气跑完逐字相同；旧版本快照被拒', () => {
    const script = (e: BehaviorEngine, i: number): void => {
      if (i === 30) e.push(hand(0.6, 500, 0.4, 0.5));
      if (i === 400) e.push(hand(1.2, 380, -0.3, 1.2));
      if (i === 700) e.push({ kind: 'ARM_TOUCH', on: true });
      if (i === 900) e.push({ kind: 'HAND', on: false });
    };
    const a = grown('A', 21).e;
    const la: LogRecord[] = [];
    for (let i = 0; i < 1500; i++) {
      script(a, i);
      a.tick();
      la.push(...a.drain());
    }
    let b = grown('A', 21).e;
    const lb: LogRecord[] = [];
    for (let i = 0; i < 1500; i++) {
      if (i === 600) b = BehaviorEngine.restore(JSON.parse(JSON.stringify(b.snapshot())) as EngineState);
      script(b, i);
      b.tick();
      lb.push(...b.drain());
    }
    expect(lb).toEqual(la);
    expect(b.targets()).toEqual(a.targets());
    const old = { ...a.snapshot(), v: 2 } as unknown as EngineState;
    expect(() => BehaviorEngine.restore(old)).toThrow();
    expect(STATE_VERSION).toBe(3);
  });

  it('没有手的分支不碰随机数：同一场里推一个手 off（从来没有过手）不改变后面的任何东西', () => {
    const a = grown('D', 9).e;
    const b = grown('D', 9).e;
    b.push({ kind: 'HAND', on: false });
    const la: LogRecord[] = [];
    const lb: LogRecord[] = [];
    for (let i = 0; i < 1200; i++) {
      a.tick();
      b.tick();
      la.push(...a.drain());
      lb.push(...b.drain().filter((r) => r.ev !== 'HAND'));
    }
    expect(lb.map(({ id: _id, ...r }) => r)).toEqual(la.map(({ id: _id, ...r }) => r));
    expect(b.targets()).toEqual(a.targets());
  });
});
