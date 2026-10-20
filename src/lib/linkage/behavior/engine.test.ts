import { describe, expect, it } from 'vitest';
import { BehaviorEngine, HZ, runSession, type ScheduledInput } from './engine';
import type { SensorInput } from './events';
import { LIFE } from './life';
import { type LogRecord, toJsonl } from './log';
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from './persona';
import { STARTLE_PRE } from './vocab2';

/** 惊跳里走反射档的段（vocab2.ts buildStartle 的 tiers：反射前段 + 乱序随机的余震） */
const REFLEX_PHASES: ReadonlySet<string> = new Set([...STARTLE_PRE, 'shock1', 'shock2']);

/**
 * 行为引擎守门测试（spec §8）。三类事故各卡一道：
 * ① 复现与交接坏了（同种子跑出不同日志 / 快照接不上）——研究日志与跨路由交接都靠它；
 * ② 规则走样（时序、阈值、静默期、抓握真值表、衰老与死亡方向）——这些不报错，只「演错」；
 * ③ 输出不能直接喂执行器（越界、跳变）——台架与将来的固件都假设指令是平滑的。
 */

/** 一位很忙的被试：每 5.5 秒一个刺激，把九类事件轮一遍，铺满整场四世的各个阶段 */
const CYCLE: SensorInput[] = [
  { kind: 'PRESENCE', band: 'far', bearing: 0.8 },
  { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' },
  { kind: 'PRESENCE', band: 'near', bearing: 0.5 },
  { kind: 'SHELL_STROKE', half: 'R', touch: 'pat' },
  { kind: 'FEELER_TOUCH', feeler: 0, side: 'L' },
  { kind: 'ARM_TOUCH', on: true },
  { kind: 'RESISTANCE', on: true },
  { kind: 'ARM_TOUCH', on: false },
  { kind: 'RESISTANCE', on: false },
  { kind: 'SOUND', level: 0.5 },
  { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' },
  { kind: 'KNOCK', intensity: 0.7 },
  { kind: 'SHELL_HOLD', half: 'both', on: true },
  { kind: 'SHELL_HOLD', half: 'both', on: false },
  { kind: 'LIFT', lifted: true },
  { kind: 'LIFT', lifted: false },
  { kind: 'PRESENCE', band: 'gone' },
];
function busy(until = 2300, dt = 5.5): ScheduledInput[] {
  const out: ScheduledInput[] = [];
  for (let i = 0, t = 3.3; t < until; i++, t += dt) out.push({ t, input: CYCLE[i % CYCLE.length] });
  return out;
}

/** 与 runSession 同一套喂入语义，但可以分段跑（快照测试要接着喂） */
function feeder(inputs: readonly ScheduledInput[]): (e: BehaviorEngine) => void {
  const sorted = [...inputs].sort((a, b) => a.t - b.t);
  let i = 0;
  return (e) => {
    while (i < sorted.length && sorted[i].t <= e.time + 1e-9) e.push(sorted[i++].input);
  };
}
function drive(e: BehaviorEngine, feed: (e: BehaviorEngine) => void, until: number, each?: (e: BehaviorEngine) => void): LogRecord[] {
  const log = e.drain();
  while (!e.done && e.time < until) {
    feed(e);
    e.tick();
    for (const r of e.drain()) log.push(r);
    each?.(e);
  }
  return log;
}

/** 某人格排第一世（其余随后），第一世诞生在 t = 0 */
const first = (k: PersonaKey): PersonaKey[] => [k, ...PERSONA_KEYS.filter((x) => x !== k)];
const at = (t: number, input: SensorInput): ScheduledInput => ({ t, input });
const evs = (log: LogRecord[], ev: string): LogRecord[] => log.filter((r) => r.ev === ev);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('复现与交接', () => {
  it('同种子 + 同事件序列 ⇒ 日志逐字相同、执行器指令逐位相同；换种子就不同', () => {
    const inputs = busy();
    const a = runSession({ seed: 11, inputs, frameEvery: 1 });
    const b = runSession({ seed: 11, inputs, frameEvery: 1 });
    const c = runSession({ seed: 12, inputs });
    expect(toJsonl(a.log, a.header)).toBe(toJsonl(b.log, b.header));
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames));
    expect(toJsonl(c.log)).not.toBe(toJsonl(a.log));
  });

  it('中途快照 → JSON 往返 → 恢复后接着跑，与一口气跑完逐字相同', () => {
    const inputs = busy();
    const whole = new BehaviorEngine({ seed: 23, order: ['D', 'B', 'C', 'A'] });
    const logWhole = drive(whole, feeder(inputs), Infinity);

    const feed = feeder(inputs);
    const head = new BehaviorEngine({ seed: 23, order: ['D', 'B', 'C', 'A'] });
    const log1 = drive(head, feed, 777.7);
    const wire = JSON.stringify(head.snapshot());
    const tail = BehaviorEngine.restore(JSON.parse(wire));
    const log2 = drive(tail, feed, Infinity);

    expect(toJsonl([...log1, ...log2])).toBe(toJsonl(logWhole));
    expect(JSON.stringify(tail.targets())).toBe(JSON.stringify(whole.targets()));
  });

  it('人格顺序不是 A–D 各一次就拒绝', () => {
    expect(() => new BehaviorEngine({ seed: 1, order: ['A', 'A', 'B', 'C'] })).toThrow();
  });

  it('advance 按真实时间定步：1 秒 = 60 步，与逐步 tick 同一状态', () => {
    const a = new BehaviorEngine({ seed: 4 });
    const b = new BehaviorEngine({ seed: 4 });
    expect(a.advance(1, 1000)).toBe(HZ);
    for (let i = 0; i < HZ; i++) b.tick();
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });
});

describe('生命周期', () => {
  it('阶段次序与时长精确、人格按顺序轮换、死亡时点在 ±30 s 窗口内、整场 33–37 分钟', () => {
    const order: PersonaKey[] = ['C', 'A', 'D', 'B'];
    const { log } = runSession({ seed: 31, order });
    const life = log.filter((r) => r.ev.startsWith('LIFE_') || r.ev === 'SESSION_END');
    expect(life.map((r) => r.ev)).toEqual([
      ...order.flatMap(() => ['LIFE_BIRTH', 'LIFE_GROW', 'LIFE_AGE', 'LIFE_DEATH_START', 'LIFE_DEATH']),
      'SESSION_END',
    ]);
    for (let k = 0; k < 4; k++) {
      const [birth, grow, age, deathStart, death] = life.slice(k * 5, k * 5 + 5);
      const p = PERSONAS[order[k]];
      expect(birth.persona).toBe(order[k]);
      expect(birth.life).toBe(k + 1);
      expect(grow.t - birth.t).toBeCloseTo(LIFE.birth, 9);
      expect(age.t - grow.t).toBeCloseTo(LIFE.grow, 9);
      expect(death.t - deathStart.t).toBeCloseTo(p.death.dur, 9);
      const nominal = LIFE.birth + LIFE.grow + LIFE.age + p.death.dur;
      expect(Math.abs(death.t - birth.t - nominal)).toBeLessThanOrEqual(LIFE.deathWindow + 1e-9);
      const next = life[k * 5 + 5];
      expect(next.t - death.t).toBeCloseTo(LIFE.blank, 9);
    }
    const minutes = life[life.length - 1].t / 60;
    expect(minutes).toBeGreaterThanOrEqual(33);
    expect(minutes).toBeLessThanOrEqual(37);
  });

  it('交互挪不动死亡时点：同种子有人无人，四次死亡时刻逐一相同（「交互加速死亡」搁置）', () => {
    for (const seed of [1, 2, 3]) {
      const quiet = evs(runSession({ seed }).log, 'LIFE_DEATH').map((r) => r.t);
      const touched = evs(runSession({ seed, inputs: busy(2300, 2.5) }).log, 'LIFE_DEATH').map((r) => r.t);
      expect(touched).toEqual(quiet);
    }
  });

  it('每一世诞生时内部状态清零（覆写而非累积）：唤醒、动作、待发响应、抓握全空', () => {
    const e = new BehaviorEngine({ seed: 8 });
    const births: number[] = [];
    drive(e, feeder(busy()), Infinity, (eng) => {
      const s = eng.state;
      if (s.phase === 'BIRTH' && s.phaseLt === 1 && s.life > 1) {
        births.push(s.life);
        expect(s.arousal).toBe(0);
        expect(s.gesture).toBeNull();
        expect(s.pending).toBeNull();
        expect(s.grasp.phase).toBe('IDLE');
        expect(s.sighNext).toBe(false);
      }
    });
    expect(births).toEqual([2, 3, 4]);
  });
});

describe('人格在行为里读得出来', () => {
  /** 无人时跑完第一世的成长段，收集每次呼吸（换气那一刻的周期 / 基础幅度 / 是否叹气）与幅度跟随值 */
  function growBreaths(k: PersonaKey, seed: number): { period: number[]; amp: number[]; followed: number[] } {
    const e = new BehaviorEngine({ seed, order: first(k) });
    const period: number[] = [];
    const amp: number[] = [];
    const followed: number[] = [];
    let phi = e.state.phi;
    drive(e, () => undefined, LIFE.birth + LIFE.grow, (eng) => {
      const s = eng.state;
      if (s.phase !== 'GROW') return;
      if (s.phi < phi && !s.sighNow) {
        period.push(s.period);
        amp.push(s.ampBase);
      }
      phi = s.phi;
      if (eng.time > LIFE.birth + 10) followed.push(s.amp.x);
    });
    return { period, amp, followed };
  }

  it('呼吸：A/B/C 成长段的周期与幅度均值落在表值 ±5%（叹气除外），且每次略有不同', () => {
    for (const k of ['A', 'B', 'C'] as const) {
      const { period, amp, followed } = growBreaths(k, 41);
      const p = PERSONAS[k];
      expect(Math.abs(mean(period) / p.breathPeriod[0] - 1)).toBeLessThan(0.05);
      expect(Math.abs(mean(amp) / p.breathAmp[0] - 1)).toBeLessThan(0.05);
      expect(Math.max(...period) - Math.min(...period)).toBeGreaterThan(0);
      const sorted = [...followed].sort((a, b) => a - b);
      expect(Math.abs(sorted[sorted.length >> 1] / p.breathAmp[0] - 1)).toBeLessThan(0.06);
    }
  });

  it('呼吸：D 每次重抽，周期铺满表的区间、均值在中间（2026-10-20 起区间收到 3.2–4.8 s，呼吸不随性格大变）', () => {
    const all = [51, 52, 53].flatMap((seed) => growBreaths('D', seed).period);
    const [lo, hi] = PERSONAS.D.breathPeriod;
    expect(Math.min(...all)).toBeLessThan(lo + 0.1 * (hi - lo));
    expect(Math.max(...all)).toBeGreaterThan(hi - 0.1 * (hi - lo));
    expect(Math.abs(mean(all) / ((lo + hi) / 2) - 1)).toBeLessThan(0.08);
  });

  it('呼吸是生理信号（2026-10-20 作者）：四种人格平时的呼吸差得不多，被碰过之后才变急促——快、浅，热情最明显、沉静几乎不变', () => {
    // 平时：四种人格每口气的周期都在 3–5 s 之间，最快与最慢差不到 1.5 倍
    const rest = PERSONA_KEYS.map((k) => mean(growBreaths(k, 41).period));
    expect(Math.min(...rest)).toBeGreaterThan(3);
    expect(Math.max(...rest)).toBeLessThan(5);
    expect(Math.max(...rest) / Math.min(...rest)).toBeLessThan(1.5);
    // 被碰：戳 · 拍 · 戳，之后 8–23 s 一口气实际走多长（相位回绕之间）与没被碰的同一段相比
    const breathLen = (k: PersonaKey, poked: boolean): number => {
      const t0 = LIFE.birth + 20;
      const inputs = poked
        ? [
            at(t0, { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' }),
            at(t0 + 3, { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' }),
            at(t0 + 6, { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' }),
          ]
        : [];
      const e = new BehaviorEngine({ seed: 43, order: first(k) });
      const wraps: number[] = [];
      let phi = e.state.phi;
      drive(e, feeder(inputs), t0 + 23, (eng) => {
        if (eng.state.phi < phi - 0.5 && eng.time >= t0 + 8) wraps.push(eng.time);
        phi = eng.state.phi;
      });
      return (wraps[wraps.length - 1] - wraps[0]) / (wraps.length - 1);
    };
    const quicken = (k: PersonaKey) => breathLen(k, false) / breathLen(k, true);
    expect(quicken('A')).toBeGreaterThan(1.3);
    expect(quicken('C')).toBeGreaterThan(1.2);
    expect(quicken('B')).toBeLessThan(1.15);
    expect(quicken('A')).toBeGreaterThan(quicken('B'));
  });

  it('自发动作间隔：A/B/C 均值落在表的区间中点 ±12%（2026-10-19 删掉了「人在时另一套间隔」）', () => {
    const gaps = (k: PersonaKey, inputs: ScheduledInput[] = []): number[] => {
      const { log } = runSession({ seed: 61, order: first(k), inputs, until: LIFE.birth + LIFE.grow });
      const t = evs(log, 'SPONTANEOUS').map((r) => r.t).filter((x) => x >= LIFE.birth);
      return t.slice(1).map((x, i) => x - t[i]);
    };
    for (const k of ['A', 'B', 'C'] as const) {
      const [lo, hi] = PERSONAS[k].spont;
      expect(Math.abs(mean(gaps(k)) / ((lo + hi) / 2) - 1)).toBeLessThan(0.12);
    }
  });

  it('非确定性：同一次轻抚连发 20 次，响应延迟与强度均值对得上表，但每次不同、动作组合也不同', () => {
    // 隔 16 s 一次：沉静型的回应程序比 8 s 长，挨得太近后一下会落在「正忙」里
    for (const k of ['A', 'B', 'C'] as const) {
      const strokes = Array.from({ length: 20 }, (_, i) => at(64 + i * 16, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }));
      const { log } = runSession({ seed: 71, order: first(k), inputs: strokes, until: 420 });
      const sensor = log.filter((r) => r.ev === 'SHELL_STROKE');
      expect(sensor.every((r) => r.out === 'respond')).toBe(true);
      const resp = evs(log, 'RESPONSE');
      expect(resp).toHaveLength(20);
      const lat = resp.map((r) => r.p!.latency as number);
      const gain = resp.map((r) => r.p!.gain as number);
      const p = PERSONAS[k];
      // 记下的延迟 = 潜伏期里「注意到」那段程序的长度：至少等满抽到的 τ
      expect(mean(lat) / p.latency[0]).toBeGreaterThan(0.95);
      expect(mean(lat) / p.latency[0]).toBeLessThan(1.2);
      expect(Math.abs(mean(gain) / p.gain[0] - 1)).toBeLessThan(0.08);
      expect(new Set(gain).size).toBeGreaterThan(10);
      const combos = new Set(resp.map((r) => `${r.p!.arm}/${r.p!.feeler}/${r.p!.turn}`));
      expect(combos.size).toBeGreaterThan(1);
    }
  });

  it('惊吓阈值：I > 阈值必惊吓，I ≤ 阈值必不（热情、沉静难吓，回避一碰就缩）', () => {
    for (const k of ['A', 'B', 'C'] as const) {
      const th = PERSONAS[k].startle[0];
      // 隔 14 s 一次：沉静型惊跳后慢慢放回要 10 s 出头，挨得太近后一下会落在「正忙」里
      const knocks = Array.from({ length: 10 }, (_, i) => at(70 + i * 14, { kind: 'KNOCK', intensity: i % 2 ? th + 0.01 : th }));
      const { log } = runSession({ seed: 81, order: first(k), inputs: knocks, until: 230 });
      const outs = log.filter((r) => r.ev === 'KNOCK').map((r) => r.out);
      expect(outs).toEqual(knocks.map((_, i) => (i % 2 ? 'startle' : 'respond')));
      expect(evs(log, 'STARTLE')).toHaveLength(5);
    }
    // 回避型连轻拍（0.3）都会缩；热情、沉静被拿起（0.7）也只是回应
    const pat = { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } as const;
    expect(runSession({ seed: 82, order: first('C'), inputs: [at(70, pat)], until: 80 }).log.find((r) => r.ev === 'SHELL_STROKE')?.out).toBe('startle');
    const lift = { kind: 'LIFT', lifted: true } as const;
    for (const k of ['A', 'B'] as const) expect(runSession({ seed: 82, order: first(k), inputs: [at(70, lift)], until: 80 }).log.find((r) => r.ev === 'LIFT')?.out).toBe('respond');
  });

  it('乱序随机：阈值每次重抽，同样的敲击有时惊吓有时只是回应；回应有时迎、有时躲', () => {
    const knocks = Array.from({ length: 26 }, (_, i) => at(64 + i * 8, { kind: 'KNOCK', intensity: 0.55 }));
    const { log } = runSession({ seed: 91, order: first('D'), inputs: knocks, until: 300 });
    const outs = log.filter((r) => r.ev === 'KNOCK').map((r) => r.out);
    expect(outs.filter((o) => o === 'startle').length).toBeGreaterThan(4);
    expect(outs.filter((o) => o === 'respond').length).toBeGreaterThan(4);
    // 有方向的刺激（轻抚）：⑩ 一半一半，回应有时迎、有时躲（2026-10-19 以前还有「⑤ 抽到负 = 缩」，与躲是同一件事，并掉）
    const strokes = Array.from({ length: 16 }, (_, i) => at(64 + i * 14, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }));
    const motions = evs(runSession({ seed: 92, order: first('D'), inputs: strokes, until: 300 }).log, 'RESPONSE').map((r) => String(r.p!.motion));
    expect(motions.some((m) => m.endsWith('.avoid'))).toBe(true);
    expect(motions.some((m) => m.endsWith('.toward'))).toBe(true);
  });
});

describe('事件流：刺激与响应一一对得上（同一条流既驱动行为又是实验记录）', () => {
  it('每条 respond 恰有一条 RESPONSE 或 RESPONSE_DROP 指回它；STARTLE / REFLEX 指回真实的刺激；静默期一律 muted', () => {
    for (const seed of [101, 102, 103]) {
      const { log } = runSession({ seed, order: first(PERSONA_KEYS[seed % 4]), inputs: busy(2300, 3.1) });
      const byId = new Map(log.map((r) => [r.id, r]));
      const births = evs(log, 'LIFE_BIRTH').map((r) => ({ life: r.life, t: r.t }));
      for (const r of log) {
        if (r.src === 'sensor') {
          const answers = log.filter((x) => (x.ev === 'RESPONSE' || x.ev === 'RESPONSE_DROP') && x.p?.to === r.id);
          expect(answers).toHaveLength(r.out === 'respond' ? 1 : 0);
          const birth = births.find((b) => b.life === r.life)!;
          const early = r.phase === 'BIRTH' && r.t - birth.t < LIFE.respondAt - 1e-9;
          const silent = r.phase === 'DEATH' || r.phase === 'BLANK' || early;
          if ((r.I ?? 0) > 0) expect(r.out === 'muted').toBe(silent);
          else expect(r.out).toBe('none');
        }
        // 「忙完再认一次」的补认也是一次刺激：恰有一个回答、指回一次 busy 的碰臂
        if (r.ev === 'CONTACT') {
          const answers = log.filter((x) => (x.ev === 'RESPONSE' || x.ev === 'RESPONSE_DROP') && x.p?.to === r.id);
          expect(answers).toHaveLength(r.out === 'respond' ? 1 : 0);
          expect(['respond', 'startle']).toContain(r.out);
          const touch = byId.get(r.p!.to as number);
          expect(touch?.ev).toBe('ARM_TOUCH');
          expect(touch?.out).toBe('busy');
        }
        if (r.ev === 'STARTLE') expect(byId.get(r.p!.to as number)?.out).toBe('startle');
        if (r.ev === 'REFLEX') {
          const src = byId.get(r.p!.to as number);
          expect(src?.src === 'sensor' || src?.ev === 'CONTACT').toBe(true);
        }
        if (r.ev === 'RESPONSE' || r.ev === 'STARTLE') expect(['BIRTH', 'GROW', 'AGE']).toContain(r.phase);
      }
    }
  });
});

describe('衰老与死亡', () => {
  it('衰老（占位斜坡）：衰老段末尾响应变慢、呼吸变浅', () => {
    const e = new BehaviorEngine({ seed: 111, order: first('C') });
    const ageLen = e.state.ageLens[0];
    const ageEnd = LIFE.birth + LIFE.grow + ageLen;
    const strokes: ScheduledInput[] = [];
    for (let t = 64; t < ageEnd - 4; t += 8) strokes.push(at(t, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }));
    const grow: number[] = [];
    const late: number[] = [];
    const log = drive(e, feeder(strokes), ageEnd, (eng) => {
      const s = eng.state;
      if (s.phase === 'GROW' && eng.time > LIFE.birth + 10) grow.push(s.amp.x);
      if (s.phase === 'AGE' && eng.time > ageEnd - 15) late.push(s.amp.x);
    });
    const latency = (from: number, to: number): number =>
      mean(evs(log, 'RESPONSE').filter((r) => r.t >= from && r.t < to).map((r) => r.p!.latency as number));
    expect(latency(ageEnd - ageLen / 3, ageEnd) / latency(LIFE.birth, LIFE.birth + LIFE.grow)).toBeGreaterThan(1.4);
    const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    expect(med(late) / med(grow)).toBeLessThan(0.65);
  });

  it('死亡即安静：每一世死时收拢到折叠端、松弛无力；空白 45 秒里纹丝不动、不出声', () => {
    const e = new BehaviorEngine({ seed: 121 });
    let deathAt = -1;
    let ref = '';
    let checked = 0;
    drive(e, () => undefined, Infinity, (eng) => {
      const s = eng.state;
      if (s.phase !== 'BLANK') {
        deathAt = -1;
        return;
      }
      if (deathAt < 0) deathAt = eng.time;
      const el = eng.time - deathAt;
      const tg = eng.targets();
      if (el > 2 && el < 3) {
        expect(tg.breath.s).toBeGreaterThan(0.995);
        expect(tg.arm.tone).toBe(0);
        expect(tg.arm.bend).toBeLessThan(0.01);
        expect(Math.abs(tg.feelers[0].base)).toBeLessThan(0.01);
        expect(tg.sound.on).toBe(false);
      }
      if (el > 5) {
        const now = JSON.stringify({ s: tg.breath.s, a: tg.arm, f: tg.feelers.map((f) => f.base), y: tg.yaw, l: tg.light, on: tg.sound.on });
        if (ref) expect(now).toBe(ref);
        ref = now;
        checked++;
      } else ref = '';
    });
    expect(checked).toBeGreaterThan(4 * 35 * HZ);
  });

  it('热情型最后朝向人、回避型最后背过身：死亡开始时转向（背对）最后已知的人位，死时停在那里', () => {
    const inputs = [at(100, { kind: 'PRESENCE', band: 'far', bearing: 1.2 }), at(200, { kind: 'PRESENCE', band: 'gone' })];
    for (const [k, want] of [['A', 1.2], ['C', 1.2 - Math.PI]] as const) {
      const e = new BehaviorEngine({ seed: 131, order: first(k) });
      const log = drive(e, feeder(inputs), 2000, () => undefined);
      const final = evs(log, 'ORIENT').find((r) => r.p!.mode === (k === 'A' ? 'final' : 'finalAway') && r.life === 1);
      expect(final?.p!.to).toBeCloseTo(want, 9);
      const deathT = evs(log, 'LIFE_DEATH')[0].t;
      const replay = new BehaviorEngine({ seed: 131, order: first(k) });
      drive(replay, feeder(inputs), deathT);
      expect(replay.targets().yaw).toBeCloseTo(want, 2);
    }
  });
});

describe('抓握（真值表接进行为）', () => {
  it('热情型：碰臂 → 缠 → 握人（极轻）→ 手指离开电极仍有张力 = 握物 → 脱手追一次 → 抓空松开 → 搜寻', () => {
    const inputs = [
      at(100, { kind: 'ARM_TOUCH', on: true }),
      at(101.5, { kind: 'RESISTANCE', on: true }),
      at(106, { kind: 'ARM_TOUCH', on: false }),
      at(110, { kind: 'RESISTANCE', on: false }),
      at(130, { kind: 'ARM_TOUCH', on: true }),
      at(130.5, { kind: 'ARM_TOUCH', on: false }),
    ];
    const bend: Record<string, number> = {};
    const e = new BehaviorEngine({ seed: 141, order: first('A') });
    const log = drive(e, feeder(inputs), 150, (eng) => {
      const t = Math.round(eng.time * HZ);
      if (t === 104 * HZ) bend.human = eng.targets().arm.bend;
      if (t === 109 * HZ) bend.object = eng.targets().arm.bend;
    });
    const seq = log
      .filter((r) => r.ev.startsWith('GRASP_') || r.ev === 'RELEASE_DONE')
      .map((r) => (r.ev === 'GRASP_START' ? `START${r.p!.chase ? '·chase' : ''}` : r.ev.replace('GRASP_', '')));
    expect(seq).toEqual(['START', 'HOLD_HUMAN', 'HOLD_OBJECT', 'LOST', 'START·chase', 'EMPTY', 'RELEASE_DONE', 'START', 'EMPTY', 'RELEASE_DONE']);
    expect(evs(log, 'GRASP_LOST')[0].p!.reaction).toBe('chase');
    expect(evs(log, 'SPONTANEOUS').some((r) => r.p!.action === 'search' && r.t > 110 && r.t < 130)).toBe(true);
    // 握人极轻、握物要紧
    expect(bend.human).toBeGreaterThan(0.25);
    expect(bend.human).toBeLessThan(0.45);
    expect(bend.object).toBeGreaterThan(0.55);
  });

  it('抓空以后的找以缠开始的地方为中心（与迎手链的找同一段）：摆过去又回来，不跑到写死的绝对角度上', () => {
    // 2026-10-19 第二轮审核第 2 条：此前旧路的找是一段自发动作，摆向写死在 −40° / 55° / −70°（绝对），与碰在哪无关
    const inputs = [at(100, { kind: 'ARM_TOUCH', on: true }), at(100.5, { kind: 'ARM_TOUCH', on: false })];
    const e = new BehaviorEngine({ seed: 141, order: first('A') });
    let dir0: number | null = null;
    let searchAt = -1;
    let maxOff = 0;
    const log = drive(e, feeder(inputs), 125, (eng) => {
      const g = eng.state.grasp;
      if (dir0 === null && g.phase === 'WRAP') dir0 = g.dir;
      const prog = eng.state.m2.prog;
      if (prog?.name !== 'search') return;
      if (searchAt < 0) searchAt = eng.time;
      // 只看探的那几段（最后垂回静息那一段的弯向是静息的）
      if (!/^(cast|probe)/.test(prog.phases[prog.idx]?.name ?? '') || dir0 === null) return;
      const a = eng.targets().arm;
      maxOff = Math.max(maxOff, Math.abs(Math.atan2(Math.sin(a.dir - dir0), Math.cos(a.dir - dir0))));
    });
    expect(evs(log, 'GRASP_EMPTY')[0].p!.searches).toBeGreaterThan(0);
    expect(searchAt).toBeGreaterThan(0);
    expect(dir0).not.toBeNull();
    // 每一头的摆幅 30° / −30° / 45°，加上臂跟过去的余量
    expect(maxOff * (180 / Math.PI)).toBeGreaterThan(15);
    expect(maxOff * (180 / Math.PI)).toBeLessThan(55);
  });

  it('碰臂时正忙：手一直在，就等它空下来认一次（只认一次）；中途松手就作罢', () => {
    // 热情型：先轻抚一下让它去回应，回应途中碰臂 → busy
    const stroke = at(100, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' });
    const e = new BehaviorEngine({ seed: 171, order: first('A') });
    // 回应那一笔记账（gesture）做完的时刻 = 「空下来」
    let gestureEnd = -1;
    const held = drive(e, feeder([stroke, at(100.6, { kind: 'ARM_TOUCH', on: true })]), 130, (eng) => {
      const g = eng.state.gesture;
      if (gestureEnd < 0 && g && g.kind === 'response') gestureEnd = g.t0 + g.dur;
    });
    const touch = held.find((r) => r.ev === 'ARM_TOUCH')!;
    expect(touch.out).toBe('busy');
    const contacts = evs(held, 'CONTACT');
    expect(contacts).toHaveLength(1); // 手一直按到最后，也只补认这一次
    const c = contacts[0];
    expect(c.p!.to).toBe(touch.id);
    expect(c.out).toBe('respond');
    const answer = held.find((r) => r.ev === 'RESPONSE' && r.p?.to === c.id)!;
    expect(answer.p!.grasp).toBe(true); // 迎上来就缠
    expect(gestureEnd).toBeGreaterThan(100);
    expect(c.t).toBeGreaterThanOrEqual(gestureEnd - 1 / HZ);
    expect(c.t).toBeLessThan(gestureEnd + 0.1);
    // 中途松手：不补认
    const left = runSession({
      seed: 171,
      order: first('A'),
      inputs: [stroke, at(100.6, { kind: 'ARM_TOUCH', on: true }), at(101, { kind: 'ARM_TOUCH', on: false })],
      until: 130,
    }).log;
    expect(evs(left, 'CONTACT')).toHaveLength(0);
    expect(evs(left, 'GRASP_START')).toHaveLength(0);
  });

  it('回避型被碰臂是惊吓（阈值 0.25 < 0.4），只缩不抓', () => {
    const { log } = runSession({ seed: 151, order: first('C'), inputs: [at(100, { kind: 'ARM_TOUCH', on: true })], until: 110 });
    expect(log.find((r) => r.ev === 'ARM_TOUCH')?.out).toBe('startle');
    expect(evs(log, 'GRASP_START')).toHaveLength(0);
  });
});

describe('输出能直接喂执行器', () => {
  it('全场：各通道在量程内，逐步变化有上界（呼吸、臂、偏航、触须都不跳）', () => {
    const FEELER_MAX = (75 * Math.PI) / 180;
    for (const seed of [161, 162, 163]) {
      const e = new BehaviorEngine({ seed, order: first(PERSONA_KEYS[seed % 4]) });
      let prev = e.targets();
      // 逐步只累计极值（每步十几次 expect 会让这条跑 40 秒），跑完一次断言
      const m = { sLo: 1, sHi: 0, toneLo: 1, toneHi: 0, bend: 0, yaw: 0, feeler: 0, dS: 0, dYaw: 0, dArm: 0, dReflex: 0, dFeeler: 0 };
      drive(e, feeder(busy(2300, 3.7)), Infinity, (eng) => {
        const tg = eng.targets();
        m.sLo = Math.min(m.sLo, tg.breath.s);
        m.sHi = Math.max(m.sHi, tg.breath.s);
        m.toneLo = Math.min(m.toneLo, tg.arm.tone);
        m.toneHi = Math.max(m.toneHi, tg.arm.tone);
        m.bend = Math.max(m.bend, tg.arm.bend);
        m.yaw = Math.max(m.yaw, Math.abs(tg.yaw));
        m.dS = Math.max(m.dS, Math.abs(tg.breath.s - prev.breath.s));
        m.dYaw = Math.max(m.dYaw, Math.abs(tg.yaw - prev.yaw));
        const dx = tg.arm.bend * Math.cos(tg.arm.dir) - prev.arm.bend * Math.cos(prev.arm.dir);
        const dy = tg.arm.bend * Math.sin(tg.arm.dir) - prev.arm.bend * Math.sin(prev.arm.dir);
        const mo = eng.motion();
        const reflex = mo !== null && mo.name === 'startle' && REFLEX_PHASES.has(mo.phase);
        if (reflex) m.dReflex = Math.max(m.dReflex, Math.hypot(dx, dy));
        else m.dArm = Math.max(m.dArm, Math.hypot(dx, dy));
        for (const k of [0, 1] as const) {
          m.feeler = Math.max(m.feeler, Math.abs(tg.feelers[k].base));
          m.dFeeler = Math.max(m.dFeeler, Math.abs(tg.feelers[k].base - prev.feelers[k].base));
        }
        prev = tg;
      });
      expect(m.sLo).toBeGreaterThanOrEqual(0);
      expect(m.sHi).toBeLessThanOrEqual(1);
      expect(m.toneLo).toBeGreaterThanOrEqual(0);
      expect(m.toneHi).toBeLessThanOrEqual(1);
      expect(m.bend).toBeLessThanOrEqual(1);
      expect(m.yaw).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(m.feeler).toBeLessThanOrEqual(FEELER_MAX + 1e-9);
      // 呼吸每步 ≤ 0.045（≈ 2.7 行程/秒）；偏航受限速，每步 ≤ 0.05 rad（≈ 3 rad/s，惊吓时）；
      // 臂的弯曲向量：惊跳的反射段（0.15 s 猛缩、余震）本来就是一步到位、由执行层的肌肉磨圆，每步 < 0.75；
      // 其余每步 < 0.075（= 最快的那一档 1.5 差动/秒）——超过就是跳；触须基角每步 < 0.15 rad（含 2 Hz 的抖动）
      expect(m.dS).toBeLessThan(0.045);
      expect(m.dYaw).toBeLessThan(0.05);
      expect(m.dArm).toBeLessThan(0.075);
      expect(m.dReflex).toBeLessThan(0.75);
      expect(m.dFeeler).toBeLessThan(0.15);
    }
  });
});

describe('生命钟（M2：台架「生命时钟」档）', () => {
  /** 一场里各段的起点（生命事件时刻），按出现顺序 */
  const marks = (log: LogRecord[]): { ev: string; t: number }[] =>
    log.filter((r) => r.ev.startsWith('LIFE_') || r.ev === 'SESSION_END').map((r) => ({ ev: r.ev, t: r.t }));

  it('倍率 10：每一段时长 = 生命秒 ÷ 10（逐段差不过一步），交互仍挪不动死亡时点', () => {
    const slow = marks(runSession({ seed: 5 }).log);
    const fast = marks(runSession({ seed: 5, lifeRate: 10 }).log);
    const busyFast = marks(runSession({ seed: 5, lifeRate: 10, inputs: busy(230, 0.7) }).log);
    expect(fast.map((m) => m.ev)).toEqual(slow.map((m) => m.ev));
    for (let i = 1; i < fast.length; i++) {
      const d1 = slow[i].t - slow[i - 1].t;
      const d10 = fast[i].t - fast[i - 1].t;
      expect(Math.abs(d10 - d1 / 10)).toBeLessThanOrEqual(1 / HZ + 1e-9);
    }
    expect(busyFast.filter((m) => m.ev === 'LIFE_DEATH')).toEqual(fast.filter((m) => m.ev === 'LIFE_DEATH'));
  });

  it('倍率只压生命、不压动作：×10 下热情型成长段的呼吸周期仍是表里的值（不跟着快 10 倍）', () => {
    const e = new BehaviorEngine({ seed: 41, order: first('A'), lifeRate: 10 });
    const period: number[] = [];
    let phi = e.state.phi;
    drive(e, () => undefined, (LIFE.birth + LIFE.grow) / 10, (eng) => {
      const s = eng.state;
      if (s.phase === 'GROW' && s.phi < phi && !s.sighNow) period.push(s.period);
      phi = s.phi;
    });
    expect(period.length).toBeGreaterThan(5);
    expect(Math.abs(mean(period) / PERSONAS.A.breathPeriod[0] - 1)).toBeLessThan(0.06);
  });

  it('诞生的两道门按生命秒折算：×10 下真实 2 秒前的刺激记 muted、之后回应；4 秒起才有自发动作', () => {
    // 跑到 12 s：2.5 s 那一下的回应程序要做好几秒，做完才轮到自发
    const { log } = runSession({
      seed: 3,
      lifeRate: 10,
      until: 12,
      inputs: [
        at(1.5, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }),
        at(2.5, { kind: 'SHELL_STROKE', half: 'R', touch: 'stroke' }),
      ],
    });
    const strokes = evs(log, 'SHELL_STROKE');
    expect(strokes.map((r) => r.out)).toEqual(['muted', 'respond']);
    const sp = evs(log, 'SPONTANEOUS');
    expect(sp.length).toBeGreaterThan(0);
    expect(sp[0].t).toBeGreaterThanOrEqual(4 - 1e-9);
  });

  it('中途改档：记一条操作记录；诞生剩下的部分与那道自发门按新倍率改到正确的真实时刻', () => {
    const e = new BehaviorEngine({ seed: 9 });
    const log = drive(e, () => undefined, 10);
    e.setLifeRate(10);
    e.setLifeRate(10); // 同值不重复记
    log.push(...drive(e, () => undefined, 20));
    const rate = log.filter((r) => r.src === 'operator');
    expect(rate).toHaveLength(1);
    expect(rate[0]).toMatchObject({ ev: 'RATE', t: 10, p: { rate: 10 } });
    // 诞生还剩 50 生命秒 = 5 真实秒；自发门在生命 40 秒 = 再过 3 真实秒
    expect(Math.abs(evs(log, 'LIFE_GROW')[0].t - 15)).toBeLessThanOrEqual(1 / HZ + 1e-9);
    const sp = evs(log, 'SPONTANEOUS');
    expect(sp[0].t).toBeGreaterThanOrEqual(13 - 1e-9);
    expect(sp[0].t).toBeLessThan(13.6);
    expect(() => e.setLifeRate(0)).toThrow();
    expect(() => new BehaviorEngine({ seed: 1, lifeRate: -2 })).toThrow();
  });

  it('跳段：记 SKIP，下一步就换段并照常记生命事件；诞生头 40 秒被跳过时自发门一并放开', () => {
    const e = new BehaviorEngine({ seed: 13 });
    const log = drive(e, () => undefined, 5);
    e.skip();
    log.push(...drive(e, () => undefined, 6));
    const skip = log.filter((r) => r.src === 'operator');
    expect(skip).toHaveLength(1);
    expect(skip[0]).toMatchObject({ ev: 'SKIP', t: 5, phase: 'BIRTH', p: { from: 'BIRTH' } });
    expect(evs(log, 'LIFE_GROW')[0].t).toBe(5);
    expect(evs(log, 'SPONTANEOUS')[0].t).toBeLessThan(5.1);
    // 跳过的是这一段，下一段照常走满
    const g = drive(e, () => undefined, 5 + LIFE.grow + 1);
    expect(Math.abs(evs(g, 'LIFE_AGE')[0].t - (5 + LIFE.grow))).toBeLessThanOrEqual(1 / HZ + 1e-9);
  });

  it('会话头只在倍率 ≠ 1 时记开场倍率；快照带着倍率走；旧版快照拒收', () => {
    expect(new BehaviorEngine({ seed: 2 }).header()).not.toHaveProperty('lifeRate');
    const e = new BehaviorEngine({ seed: 2, lifeRate: 5 });
    e.advance(3, 1000);
    e.setLifeRate(20);
    expect(e.header().lifeRate).toBe(5);
    e.drain(); // 日志缓冲不在状态里：快照前取走，两边从同一处开始比
    const snap = JSON.parse(JSON.stringify(e.snapshot()));
    const back = BehaviorEngine.restore(snap);
    expect(back.status().lifeRate).toBe(20);
    const whole = drive(e, () => undefined, 60);
    expect(toJsonl(drive(back, () => undefined, 60))).toBe(toJsonl(whole));
    expect(() => BehaviorEngine.restore({ ...snap, v: 1 })).toThrow();
  });
});

describe('⑬ 对人的趋避（2026-10-14 人格重分类）', () => {
  /** 成长段开头起放一个人在 bearing 处（远 → 中 → 近），跑 sec 秒，逐帧记下朝向夹角、呼吸、臂、声 */
  function visit(k: PersonaKey, seed: number, bearing: number, sec: number, extra: ScheduledInput[] = []) {
    const t0 = LIFE.birth + 1;
    const inputs = [
      at(t0, { kind: 'PRESENCE', band: 'far', bearing }),
      at(t0 + 2, { kind: 'PRESENCE', band: 'mid', bearing }),
      at(t0 + 4, { kind: 'PRESENCE', band: 'near', bearing }),
      ...extra,
    ];
    const e = new BehaviorEngine({ seed, order: first(k) });
    const rows: { t: number; face: number; s: number; bend: number; up: number; duty: number; social: number; feeler: number }[] = [];
    const log = drive(e, feeder(inputs), t0 + sec, (eng) => {
      if (eng.time < t0 + 6) return;
      const tg = eng.targets();
      rows.push({
        t: eng.time,
        face: Math.cos(tg.yaw - bearing),
        s: tg.breath.s,
        bend: tg.arm.bend,
        up: tg.arm.bend * Math.cos(tg.arm.dir),
        duty: tg.sound.duty,
        social: eng.state.social,
        feeler: tg.feelers[1].base - tg.feelers[0].base,
      });
    });
    return { rows, log, e };
  }

  it('没有人时一切照旧：姿态恒为 0（这一层不碰没有人的会话）', () => {
    for (const k of PERSONA_KEYS) {
      const e = new BehaviorEngine({ seed: 301, order: first(k) });
      let worst = 0;
      drive(e, () => undefined, LIFE.birth + 60, (eng) => {
        worst = Math.max(worst, Math.abs(eng.state.social));
      });
      expect(worst, k).toBe(0);
    }
  });

  it('人站在旁边 30 s：回避背过身去、热情一直朝着人、沉静不在乎（姿态恒 0）', () => {
    for (const seed of [311, 312, 313]) {
      const c = visit('C', seed, 0.6, 30);
      const a = visit('A', seed, 0.6, 30);
      const b = visit('B', seed, 0.6, 30);
      // 后 20 s（转身用掉头几秒）
      const late = (rows: typeof c.rows) => rows.filter((r) => r.t > rows[0].t + 10);
      expect(mean(late(c.rows).map((r) => r.face)), `C ${seed}`).toBeLessThan(-0.6);
      expect(mean(late(a.rows).map((r) => r.face)), `A ${seed}`).toBeGreaterThan(0.6);
      expect(Math.max(...b.rows.map((r) => Math.abs(r.social))), `B ${seed}`).toBe(0);
    }
  });

  it('回避：人近了就收拢——呼吸往收拢端沉、变浅变快、臂往下缩紧、触须收起、几乎不出声；热情：张开、臂抬、出声多', () => {
    const c = visit('C', 321, 0.6, 30);
    const a = visit('A', 321, 0.6, 30);
    const none = runSession({ seed: 321, order: first('C'), until: LIFE.birth + 37, frameEvery: 1 / HZ }).frames.filter((f) => f.t > LIFE.birth + 7);
    const sC = mean(c.rows.map((r) => r.s));
    const s0 = mean(none.map((f) => f.targets.breath.s));
    expect(sC - s0).toBeGreaterThan(0.15);
    // 变浅：起伏比同一段没有人时小三成以上（2026-10-20 四种人格平时的呼吸收拢后改成与自己比）
    const swing = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(swing(c.rows.map((r) => r.s))).toBeLessThan(0.7 * swing(none.map((f) => f.targets.breath.s)));
    expect(mean(c.rows.map((r) => r.up))).toBeLessThan(-0.3);
    expect(mean(c.rows.map((r) => r.bend))).toBeGreaterThan(0.45);
    expect(mean(c.rows.map((r) => r.feeler))).toBeGreaterThan(0.5);
    expect(Math.max(...c.rows.map((r) => r.duty))).toBeLessThan(0.03);
    expect(Math.min(...c.rows.map((r) => r.social))).toBeLessThan(-0.95);
    // 热情
    expect(mean(a.rows.map((r) => r.up))).toBeGreaterThan(0.1);
    expect(Math.min(...a.rows.map((r) => r.duty))).toBeGreaterThan(PERSONAS.A.voiceDuty[0] * 1.2);
    expect(Math.max(...a.rows.map((r) => r.social))).toBeGreaterThan(0.95);
  });

  it('人走以后：姿态回落到 0（2026-10-19 删掉了 ⑭ 另一套回落时间，变强、回落同一个时间常数）', () => {
    const leave = LIFE.birth + 1 + 20;
    const tail = (k: PersonaKey) => {
      const { rows } = visit(k, 331, 0.4, 40, [at(leave, { kind: 'PRESENCE', band: 'gone' })]);
      const at0 = rows.find((r) => r.t >= leave + 0.05)!;
      const at15 = rows.find((r) => r.t >= leave + 15)!;
      return at15.social / at0.social;
    };
    expect(Math.abs(tail('C'))).toBeLessThan(0.01);
    expect(Math.abs(tail('A'))).toBeLessThan(0.01);
  });

  it('乱序随机：每次重新决定朝向时姿态跟着翻——朝人的回合张开、背人的回合收拢，两种都会出现', () => {
    let pos = 0;
    let neg = 0;
    for (const seed of [361, 362, 363, 364]) {
      const { rows, log } = visit('D', seed, 0.6, 80);
      for (const o of evs(log, 'ORIENT').filter((r) => r.p!.mode !== 'random')) {
        const later = rows.find((r) => r.t >= o.t + 3);
        if (!later) continue;
        if (o.p!.mode === 'toward' && later.social > 0.2) pos++;
        if (o.p!.mode === 'away' && later.social < -0.2) neg++;
      }
    }
    expect(pos).toBeGreaterThan(0);
    expect(neg).toBeGreaterThan(0);
  });
});
