import { describe, expect, it } from 'vitest';
import { HC } from './vocab2-hand';
import { BehaviorEngine, HAND, type EngineState, STATE_VERSION, runSession, wrapPi } from './engine';
import type { SensorInput } from './events';
import { GRASP } from './grasp';
import type { LogRecord } from './log';
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from './persona';
import { nearestAxisDir } from './vocab2';

/**
 * 手（HAND，Lab 1-6 鼠标 = 人的手，2026-10-07）的守门。会坏的地方各卡一道：
 * ① 看见：要过人格的响应延迟、要在视野里（碰到臂另算），没看见之前机器不知道手在哪；
 * ② 决定：迎 / 躲 / 不理的比例按 ⑩，躲只给回避 / 乱序随机、不理只给热情 / 沉静（2026-10-14 重分类）；
 * ③ 跟踪：迎 = 转向手、躲 = 背过去（然后手出了视野会被忘掉）；分层（小偏差只动臂）；取近路，越限少就等、多就绕；
 * ④ 臂：迎手链怎么凑、缠、握在 hand-chain.test.ts；这里守抓握的记忆、没看见手时的旧路缠法、惊跳背着手；
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

/** 跑到某条事件出现为止（最多 max 秒）：各人格快慢不同，抓握的时间点不写死 */
function until(e: BehaviorEngine, log: LogRecord[], ev: string, max: number): void {
  const n = Math.round(max * 60);
  for (let i = 0; i < n && !log.some((r) => r.ev === ev); i++) {
    e.tick();
    log.push(...e.drain());
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
  it('迎的比例按 ⑩；躲只给回避 / 乱序随机，不理只给热情 / 沉静', () => {
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

  it('看见以后按 ⑨ 重新决定（again），不再在整圈里随便挑方向', () => {
    const { e, log } = grown('A', seedFor('A', 'toward'));
    e.push(hand(0));
    run(e, log, 30);
    const seen = log.filter((r) => r.ev === 'HAND_SEEN');
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.slice(1).every((r) => r.p?.again === true)).toBe(true);
    const [lo, hi] = PERSONAS.A.orient;
    // 迎手链投入中（凑 / 缠 / 握……）⑨ 顺延——别在伸手的半路上改主意；中间没投入过的两次之间才按 ⑨ 的上限
    const engaged = new Set(['approach', 'wrap', 'hold', 'chase', 'release', 'search']);
    for (let i = 2; i < seen.length; i++) {
      const gap = seen[i].t - seen[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(lo - 0.05);
      const busy = log.some((r) => r.ev === 'HAND_STAGE' && r.t >= seen[i - 1].t && r.t < seen[i].t && engaged.has(String(r.p?.stage)));
      if (!busy) expect(gap).toBeLessThanOrEqual(hi + 1.1);
    }
    // 看见手之前那一下张望可以有（成长段开头 ⑨ 正好到点）；看见以后就不再随便挑方向
    expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'random' && r.t > seen[0].t)).toBe(false);
  });
});

describe('跟踪', () => {
  it('迎：臂够不着的手 → 转身对准（偏差 > 20° 才转，停在 20° 以内）', () => {
    const b = 1.4;
    const { e, log } = grown('B', seedFor('B', 'toward', b));
    e.push(farHand(b));
    run(e, log, 14);
    // 沉静 30–45 s 才重新决定一次，14 s 内一直是迎（转得慢：1.4 rad 约 5 s）
    expect(log.filter((r) => r.ev === 'HAND_SEEN').every((r) => r.p?.mode === 'toward')).toBe(true);
    expect(Math.abs(wrapPi(e.state.yaw.x - b))).toBeLessThan(HAND.turnAt);
  });

  it('分层：臂够得着的手（哪怕偏出 20° 以上）机身不动，只有臂去凑；在臂长以外够不着就转身', () => {
    const { e, log } = grown('B', seedFor('B', 'toward', 0.5));
    e.push(hand(0.5, 420, 1.2, 0.6, 300));
    run(e, log, 7);
    expect(Math.abs(e.state.yaw.x)).toBeLessThan(0.02);
    const arm = e.targets().arm;
    expect(Math.abs(wrapPi(arm.dir - 1.2))).toBeLessThan(0.15);
    expect(arm.bend).toBeGreaterThan(0.2);
    // 同一个方位，离臂基座 600 mm（臂长 358）：够不着，转身对准。臂长以内的手不转（直臂会扫到手上，交给臂去撑）
    e.push(hand(0.5, 800, 1.2, 1.3, 600));
    run(e, log, 10);
    expect(Math.abs(wrapPi(e.state.yaw.x - 0.5))).toBeLessThan(HAND.turnAt);
  });

  it('手在机身上方（在摸壳）：不转身、不去够', () => {
    const { e, log } = grown('B', seedFor('B', 'toward', 0.2));
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

  it('躲（回避）：很快侧过身去（手留在身侧 115°，还在视野边上），臂背着手弯；手一直看得见，不丢手', () => {
    const b = 0.3;
    const { e, log } = grown('C', seedFor('C', 'away', b));
    e.push(hand(b, 400, 0.5, 0.3));
    let armAway = false;
    let sideAt = -1;
    run(e, log, 28, () => {
      const h = e.state.hand;
      // 躲的姿态：背着手弯、再往下压 25°
      if (h?.seen && h.mode === 'away' && e.targets().arm.bend > 0.3) {
        armAway ||= Math.abs(wrapPi(e.targets().arm.dir - (0.5 + Math.PI))) < 0.5;
      }
      if (sideAt < 0 && Math.abs(Math.abs(wrapPi(b - e.state.yaw.x)) - HC.avoidSide) < (10 * Math.PI) / 180) sideAt = e.time;
    });
    const seenT = log.find((r) => r.ev === 'HAND_SEEN')!.t;
    // 转身快慢只按 ③ 速度（2026-10-19 删掉了「怕的时候转身快」）：看见以后 6 s 内已经侧过去（转 2 rad，实测 4.6 s）
    expect(sideAt - seenT).toBeLessThan(6);
    expect(Math.abs(wrapPi(b - e.state.yaw.x))).toBeLessThanOrEqual(HAND.fov);
    expect(log.some((r) => r.ev === 'HAND_LOST')).toBe(false);
    expect(e.state.hand?.mode).toBe('away');
    expect(armAway).toBe(true);
  });

  it('取近路：跨过 ±180° 的接缝不绕一整圈；越限不到 60° 停在限位，超过才绕回去（记 ORIENT unwind）', () => {
    const s0 = seedFor('B', 'toward', 0);
    // 朝向 2.8，手在 −2.8（隔着接缝 0.68 rad）：越限 0.34 rad < 60° → 停在 π
    {
      const g = grown('B', s0);
      const e = withYaw(g.e, 2.8);
      const log: LogRecord[] = [];
      e.push(farHand(-2.8));
      run(e, log, 5);
      expect(e.state.yawTarget).toBeCloseTo(Math.PI, 9);
      expect(e.state.yaw.x).toBeGreaterThan(2.8);
      expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'unwind')).toBe(false);
    }
    // 手在 −1.8：越限 1.34 rad ≥ 60° → 绕回去，转到 −1.8 附近（沉静转得慢：4.6 rad 约 15 s）
    {
      const g = grown('B', s0);
      const e = withYaw(g.e, 2.8);
      const log: LogRecord[] = [];
      e.push(farHand(-1.8));
      run(e, log, 24);
      expect(log.some((r) => r.ev === 'ORIENT' && r.p?.mode === 'unwind')).toBe(true);
      expect(Math.abs(e.state.yaw.x - -1.8)).toBeLessThan(HAND.turnAt);
      expect(Math.abs(e.state.yaw.x)).toBeLessThanOrEqual(Math.PI);
      // 绕的途中手会暂时出视野，但不算丢
      expect(log.some((r) => r.ev === 'HAND_LOST')).toBe(false);
    }
  });

  it('绕回限位的途中重新决定（看别处）：长路作废、就地停下；手出了视野照样 3 s 后忘掉', () => {
    for (let seed = 1; seed < 80; seed++) {
      const g = grown('A', seed);
      const e = withYaw(g.e, 2.9);
      const log: LogRecord[] = [];
      e.push(farHand(-1.6));
      run(e, log, 25);
      const unwind = log.find((r) => r.ev === 'ORIENT' && r.p?.mode === 'unwind');
      const look = log.find((r) => r.ev === 'HAND_SEEN' && r.p?.mode === 'look' && unwind && r.t > unwind.t);
      if (!unwind || !look) continue;
      // 看别处以后不再沿长路转：不会再有一条 unwind，偏航目标就是看别处给的那个（或之后的新决定）
      expect(e.state.hand === null || e.state.hand.unwind === false).toBe(true);
      return;
    }
    throw new Error('没有种子在绕回途中抽到看别处');
  });

  it('死亡开始时正在绕回：最后朝向人的那一转照样做（不被清注意力抹掉）', () => {
    const g = grown('A', seedFor('A', 'toward', 0));
    const e = withYaw(g.e, 3.1);
    const log: LogRecord[] = [];
    e.push(farHand(-2.083));
    run(e, log, 1.2);
    expect(e.state.hand?.unwind).toBe(true);
    // 直接跳到死亡：成长 → 衰老 → 死亡
    e.skip();
    run(e, log, 0.05);
    e.skip();
    run(e, log, 0.05);
    const fin = log.find((r) => r.ev === 'ORIENT' && r.p?.mode === 'final');
    expect(fin).toBeDefined();
    expect(e.state.yawTarget).toBeCloseTo(fin!.p!.to as number, 9);
  });

  it('躲开时手在正背后抖动（±0.5°）：转向锁定，不来回掉头', () => {
    // 回避型：人在时 1.5–3 s 就重新决定一次，几乎都是躲；重新决定也不改已经锁定的转向
    const { e, log } = grown('C', seedFor('C', 'away', 0));
    // 掉头 = 偏航目标从走过的极点往回退了 0.05 rad 以上（转到位以后手抖 ±0.5° 带出的 0.5° 来回不算）
    let dirSign = 0;
    let extreme = e.state.yawGoal;
    let flips = 0;
    for (let i = 0; i < 60 * 8; i++) {
      if (i % 6 === 0) e.push(hand(((i / 6) % 2 ? 0.5 : -0.5) * (Math.PI / 180), 450, 0.4, 0.4));
      e.tick();
      log.push(...e.drain());
      const g = e.state.yawGoal;
      if (!log.some((r) => r.ev === 'HAND_SEEN')) {
        extreme = g;
        continue;
      }
      if (dirSign === 0) {
        if (Math.abs(g - extreme) > 0.05) dirSign = Math.sign(g - extreme);
        continue;
      }
      if ((g - extreme) * dirSign > 0) extreme = g;
      else if (Math.abs(g - extreme) > 0.05) {
        flips++;
        dirSign = -dirSign;
        extreme = g;
      }
    }
    expect(log.some((r) => r.ev === 'HAND_SEEN' && r.p?.mode === 'away')).toBe(true);
    expect(flips).toBeLessThanOrEqual(1);
  });

  it('惊跳正在做时不跟踪（缩那一下要缩完）', () => {
    const { e, log } = grown('A', seedFor('A', 'toward', 1.2));
    e.push(farHand(1.2));
    run(e, log, 1);
    e.push({ kind: 'KNOCK', intensity: 1 }); // 热情型阈值 0.8
    run(e, log, 0.2);
    expect(log.some((r) => r.ev === 'STARTLE')).toBe(true);
    const target = e.state.yawTarget;
    run(e, log, 1);
    expect(e.state.yawTarget).toBe(target);
  });

  it('热情型：手一直在动时一路跟着手走（2026-10-19 作者：不再一跳一停）', () => {
    // 手在臂前方来回晃 ±34°、从不停下（够得着、读数速度 120 mm/s）：臂的弯向要跟着手，不是跳一下停一下
    const aim = (t: number): number => 0.6 * Math.sin(2 * Math.PI * 0.12 * t);
    const inputs: { t: number; input: SensorInput }[] = [];
    for (let t = 0.5; t < 30; t += 0.05) {
      inputs.push({ t: Math.round(t * 100) / 100, input: { kind: 'HAND', on: true, bearing: 0, dist: 350, face: 0, aimDir: aim(t), aimBend: 0.9, aimDist: 250, touch: 32, still: 0, v: 120 } });
    }
    const res = runSession({ seed: 2, order: ['A', 'B', 'C', 'D'], lifeRate: 1, inputs, until: 30, frameEvery: 0.05 });
    const seen = res.log.find((r) => r.ev === 'HAND_SEEN');
    expect(seen?.p?.mode).toBe('toward');
    expect(res.log.some((r) => r.ev === 'HAND_STAGE' && r.p?.stage === 'track')).toBe(true);
    const lag = res.frames
      .filter((f) => f.persona === 'A' && f.t > seen!.t + 2)
      .map((f) => Math.abs(wrapPi(f.targets.arm.dir - aim(f.t))))
      .sort((a, b) => a - b);
    expect(lag.length).toBeGreaterThan(100);
    expect(lag[Math.floor(lag.length / 2)]).toBeLessThan((25 * Math.PI) / 180);
    expect(lag[Math.floor(lag.length * 0.9)]).toBeLessThan((30 * Math.PI) / 180);
  });
});

describe('臂与缠', () => {
  it('握住以后形状看抓握的记忆：手抓住的物件在指针离开后仍保形；没手抓住的，指针进来也不变紧', () => {
    // 有手抓 → 留物件（电极落、张力在）→ 指针离开 4 s
    const a = grown('A', seedFor('A', 'toward', 0));
    a.e.push(hand(0, 420, 0.8, 0.5));
    run(a.e, a.log, 2);
    a.e.push({ kind: 'ARM_TOUCH', on: true });
    until(a.e, a.log, 'GRASP_START', 2);
    run(a.e, a.log, 1);
    a.e.push({ kind: 'RESISTANCE', on: true });
    run(a.e, a.log, 1);
    a.e.push({ kind: 'ARM_TOUCH', on: false });
    run(a.e, a.log, 1.5);
    expect(a.e.state.grasp.phase).toBe('HOLD_OBJECT');
    const b0 = a.e.targets().arm.bend;
    expect(b0).toBeGreaterThan(0.4);
    a.e.push({ kind: 'HAND', on: false });
    run(a.e, a.log, 4);
    expect(a.e.state.hand).toBeNull();
    expect(a.e.targets().arm.bend).toBeGreaterThan(0.8 * b0);
    // 没手抓 → 握人（极轻）→ 指针才进来
    const b = grown('A', 31);
    b.e.push({ kind: 'ARM_TOUCH', on: true });
    until(b.e, b.log, 'GRASP_START', 2);
    run(b.e, b.log, 1);
    b.e.push({ kind: 'RESISTANCE', on: true });
    run(b.e, b.log, 3);
    expect(b.e.state.grasp.phase).toBe('HOLD_HUMAN');
    const bend0 = b.e.targets().arm.bend;
    b.e.push(hand(0, 420, 0.8, 0.5));
    run(b.e, b.log, 2);
    expect(b.e.targets().arm.bend).toBeLessThan(bend0 + 0.05);
    expect(b.e.targets().arm.wrap).toBe(0);
  });

  it('没有手时缠法照旧（握人 = 极轻、wrap 恒 0）', () => {
    const { e, log } = grown('A', 31);
    e.push({ kind: 'ARM_TOUCH', on: true });
    until(e, log, 'GRASP_START', 2);
    run(e, log, 1);
    e.push({ kind: 'RESISTANCE', on: true });
    let maxWrap = 0;
    run(e, log, 4, () => {
      maxWrap = Math.max(maxWrap, e.targets().arm.wrap);
    });
    expect(log.some((r) => r.ev === 'GRASP_HOLD_HUMAN')).toBe(true);
    expect(maxWrap).toBe(0);
    expect(e.targets().arm.bend).toBeLessThan(GRASP.human + 0.05);
  });

  it('没看见手的缠（旧路）不读手：手在场但碰的那一刻还没看见，缠的弯向不追手、不往深里卷；缠着时手被看见了也一样', () => {
    // 2026-10-19 第二轮审核第 1 条：此前缠的头四成弯向追着看见的手转、有手对象就往深里卷、握人保住 0.85 倍弯曲与一半深缠
    let tried = 0;
    for (let seed = 1; seed < 80 && tried < 3; seed++) {
      const { e, log } = grown('A', seed);
      e.push(hand(Math.PI * 0.95)); // 背后：碰到臂之前看不见
      run(e, log, 1);
      e.push({ kind: 'ARM_TOUCH', on: true }); // 一碰就进视野，看见要再过一个 ④——回应先到的那几场走旧路
      until(e, log, 'GRASP_START', 2);
      if (e.state.grasp.phase !== 'WRAP' || e.state.grasp.catchT !== undefined) continue;
      tried++;
      const dir0 = e.state.grasp.dir;
      let maxWrap = 0;
      let maxTurn = 0;
      run(e, log, 2.5, () => {
        maxWrap = Math.max(maxWrap, e.targets().arm.wrap);
        if (e.state.grasp.phase === 'WRAP') maxTurn = Math.max(maxTurn, Math.abs(wrapPi(e.state.grasp.dir - dir0)));
      });
      expect(log.some((r) => r.ev === 'HAND_SEEN'), `种子 ${seed}：缠着的时候手被看见了`).toBe(true);
      expect(maxWrap, `种子 ${seed}`).toBe(0);
      expect(maxTurn, `种子 ${seed}`).toBe(0);
    }
    expect(tried).toBeGreaterThan(0);
  });

  it('臂自己伸过去碰到不动的手（by: arm）：按轻抚算，回避型也不惊跳；手伸过来碰（不写 by）照旧会惊跳', () => {
    const reach = grown('C', 13);
    reach.e.push({ kind: 'ARM_TOUCH', on: true, by: 'arm' });
    run(reach.e, reach.log, 0.5);
    const r0 = reach.log.find((r) => r.ev === 'ARM_TOUCH');
    expect(r0?.I).toBeCloseTo(0.1, 12);
    expect(reach.log.some((r) => r.ev === 'STARTLE')).toBe(false);
    const push = grown('C', 13);
    push.e.push({ kind: 'ARM_TOUCH', on: true });
    run(push.e, push.log, 0.5);
    expect(push.log.some((r) => r.ev === 'STARTLE')).toBe(true);
  });

  it('被手吓到（碰臂惊跳）：这只手不迎——换成 ⑩ 的「不朝人时」，不抽随机数（迎着时手碰臂是预期接触，不惊跳，见 hand-chain.test）', () => {
    const { e, log } = grown('C', seedFor('C', 'away', 0)); // 回避：躲着，惊吓阈值 0.25
    e.push(hand(0, 420, 0.8, 0.5));
    run(e, log, 4);
    e.push({ kind: 'ARM_TOUCH', on: true });
    run(e, log, 0.3);
    expect(log.some((r) => r.ev === 'STARTLE')).toBe(true);
    const after = log.find((r) => r.ev === 'HAND_SEEN' && r.p?.cause === 'startle');
    expect(after?.p?.mode).toBe('away');
    expect(e.state.hand?.mode).toBe('away');
  });

  it('惊跳：看见了手就沿背着手的那根腱轴缩', () => {
    const { e, log } = grown('C', seedFor('C', 'toward', 0)); // 回避：阈值 0.25，敲一下就惊跳
    e.push(hand(0, 420, 1.0, 0.3));
    run(e, log, 4);
    e.push({ kind: 'KNOCK', intensity: 0.9 });
    run(e, log, 0.3);
    const st = log.find((r) => r.ev === 'STARTLE');
    expect(st?.p?.rule).toBe('hand');
    expect(e.state.gesture?.kind).toBe('startle');
    const arm = e.targets().arm;
    expect(Math.abs(wrapPi(arm.dir - nearestAxisDir(1.0 + Math.PI)))).toBeLessThan(1e-9);
    expect(arm.bend).toBeCloseTo(1, 9);
  });
});

describe('离开与回来', () => {
  it('手离开画布：3 s 内回来接着原来的态度（不重新决定）；超过 3 s 记 HAND_LOST gone', () => {
    // 沉静：30–45 s 才重新决定一次，这几秒里不会自己改主意
    const { e, log } = grown('B', seedFor('B', 'toward', 0));
    e.push(hand(0));
    run(e, log, 4);
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
    expect(STATE_VERSION).toBe(10);
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
