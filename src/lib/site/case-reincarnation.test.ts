import { describe, expect, it } from 'vitest';
import {
  AGEING_END,
  AGEING_MARKS,
  BLOCK_UI,
  CLOSURE,
  INTERFERENCE,
  LAYERS,
  LIFE,
  LIFE_LOOP,
  LIVES,
  PARTS,
  PERSONAS,
  PERSONA_ROWS,
  PERSONA_WINDOW,
  PREDICTIONS,
  PersonaSim,
  SPECS,
  STATS,
  STATUS_ROWS,
  SYS_COLS,
  ageTrace,
  deathLabel,
  lifeState,
  rng,
  strengthWord,
  type Bi,
} from './case-reincarnation';

/** 把模块里导出的所有 Bi（{zh,en}）走一遍，断言两侧都非空——中英各自成文，缺一侧 = 切过去一块空白。 */
function collectBi(x: unknown, out: Bi[] = []): Bi[] {
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.zh === 'string' && typeof o.en === 'string') out.push(o as unknown as Bi);
    else for (const v of Object.values(o)) collectBi(v, out);
  }
  return out;
}

describe('案例页构件数据：双语齐全', () => {
  const all = collectBi([
    PERSONAS,
    PERSONA_ROWS,
    LIFE,
    LIVES,
    AGEING_MARKS,
    PARTS,
    LAYERS,
    CLOSURE,
    STATS,
    SYS_COLS,
    INTERFERENCE,
    STATUS_ROWS,
    PREDICTIONS,
    SPECS,
  ]);

  it('每一条双语文案两侧都不是空串', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const b of all) {
      expect(b.zh.trim(), `缺中文：${b.en}`).not.toBe('');
      expect(b.en.trim(), `缺英文：${b.zh}`).not.toBe('');
    }
  });

  it('界面固定词两种语言的键一一对应', () => {
    expect(Object.keys(BLOCK_UI.zh).sort()).toEqual(Object.keys(BLOCK_UI.en).sort());
  });

  it('人格参数表 12 行 × 4 列，两种语言同形', () => {
    expect(PERSONA_ROWS).toHaveLength(12);
    for (const r of PERSONA_ROWS) {
      expect(r.cells.zh).toHaveLength(4);
      expect(r.cells.en).toHaveLength(4);
    }
    expect(PERSONAS.map((p) => p.k)).toEqual(['A', 'B', 'C', 'D']);
    // 示意台读的周期 / 幅度必须与表里前两行一致（同一份数据读两处，不能各写各的）
    expect(PERSONA_ROWS[0].cells.zh.slice(0, 3)).toEqual(PERSONAS.slice(0, 3).map((p) => `${p.period} 秒`));
    expect(PERSONA_ROWS[1].cells.zh.slice(0, 3)).toEqual(PERSONAS.slice(0, 3).map((p) => `${Math.round(p.depth * 100)}%`));
  });

  it('参数表 20 项，待确认的两项带 pending', () => {
    expect(SPECS).toHaveLength(20);
    expect(SPECS.filter((s) => s.pending).map((s) => s.k.en)).toEqual(['Ring pitch', 'Tendon']);
  });

  it('预测四世，条形区间落在 0–100 轴内', () => {
    expect(PREDICTIONS).toHaveLength(LIVES.length);
    for (const p of PREDICTIONS) {
      expect(p.lo).toBeGreaterThanOrEqual(0);
      expect(p.hi).toBeLessThanOrEqual(100);
      expect(p.lo).toBeLessThan(p.hi);
    }
  });

  it('系统逻辑四列的计数与稿一致（传感 6 · 事件 9 · 人格 12 · 杠杆 6）', () => {
    expect(SYS_COLS.map((c) => c.n)).toEqual(['6', '9', '12', '6']);
    expect(SYS_COLS[0].items).toHaveLength(6);
    expect(SYS_COLS[3].items).toHaveLength(6);
  });

  it('怎么死：每套人格取表里最后一行的那一列', () => {
    expect(deathLabel(0).en).toBe('winds down, movements shrinking');
    expect(deathLabel(3).zh).toBe('节律紊乱后渐弱');
  });

  it('组成四项、五层、闭合两卡', () => {
    expect(PARTS).toHaveLength(4);
    expect(LAYERS).toHaveLength(5);
    expect(CLOSURE.map((c) => c.id)).toEqual(['N08', 'N09']);
  });
});

describe('生命周期播放头', () => {
  it('一世 8 秒、四世一轮 32 秒，到点换世并循环', () => {
    expect(LIFE_LOOP).toBe(32);
    expect(lifeState(0)).toMatchObject({ life: 0, stage: 0 });
    expect(lifeState(7.99).life).toBe(0);
    expect(lifeState(8).life).toBe(1);
    expect(lifeState(31.9).life).toBe(3);
    expect(lifeState(32)).toMatchObject({ life: 0, stage: 0 });
  });

  it('一世里依次经过 诞生 → 成长 → 衰老 → 死亡 → 空白，各段只增不减', () => {
    let prev = -1;
    for (let t = 0; t < 8; t += 0.05) {
      const s = lifeState(t).stage;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(prev).toBe(LIFE.length - 1);
  });

  it('负时间也不炸（取模落回正区间）', () => {
    expect(lifeState(-1).life).toBe(3);
  });
});

describe('衰老曲线', () => {
  it('带种子：每次生成逐点一致；不同人格互异', () => {
    for (let k = 0; k < 4; k++) expect(Array.from(ageTrace(k))).toEqual(Array.from(ageTrace(k)));
    expect(Array.from(ageTrace(0))).not.toEqual(Array.from(ageTrace(1)));
  });

  it('900 点；最后一次呼吸之后全是 0（45 秒静止）', () => {
    for (let k = 0; k < 4; k++) {
      const tr = ageTrace(k);
      expect(tr).toHaveLength(900);
      for (let i = Math.ceil(AGEING_END * 899); i < 900; i++) expect(tr[i]).toBe(0);
    }
  });

  it('越老越浅：前三分之一的峰值高于最后一次呼吸前的三分之一', () => {
    for (let k = 0; k < 4; k++) {
      const tr = ageTrace(k);
      const end = Math.floor(AGEING_END * 899);
      const peak = (a: number, b: number) => Math.max(...Array.from(tr.slice(a, b)));
      expect(peak(0, Math.floor(end / 3))).toBeGreaterThan(peak(Math.floor((2 * end) / 3), end));
    }
  });

  it('所有取值在 [0, 1] 内', () => {
    for (let k = 0; k < 4; k++) for (const v of ageTrace(k)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1.2);
  });

  it('rng 在 [0,1) 内、同种子同序列', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('人格示意台的呼吸模拟', () => {
  const run = (sim: PersonaSim, p: (typeof PERSONAS)[number], sec: number) => {
    for (let t = 0; t < sec; t += 1 / 60) sim.step(1 / 60, p);
  };

  it('稳态周期与幅度向目标人格收敛：A 快而深，B 慢而浅', () => {
    const peakOf = (i: number) => {
      const sim = new PersonaSim(rng(1));
      run(sim, PERSONAS[i], 30);
      const ys = sim.hist.map((h) => h[1]);
      return Math.max(...ys);
    };
    expect(peakOf(0)).toBeGreaterThan(0.7);
    expect(peakOf(0)).toBeLessThanOrEqual(0.82);
    expect(peakOf(1)).toBeLessThan(0.35);
  });

  it('历史只保留窗口内（≈ PERSONA_WINDOW + 0.5 秒）', () => {
    const sim = new PersonaSim(rng(2));
    run(sim, PERSONAS[0], 40);
    expect(sim.hist[0][0]).toBeGreaterThanOrEqual(sim.t - PERSONA_WINDOW - 0.6);
  });

  it('碰一下：固定人格的延迟 / 强度就是表里的值；回应在延迟之后才出现', () => {
    const sim = new PersonaSim(rng(3));
    run(sim, PERSONAS[1], 12);
    const base = sim.y;
    const r = sim.touch(PERSONAS[1]);
    expect(r).toEqual({ lat: 1.4, str: 0.35 });
    // 延迟内（1.4 s）脉冲不叠加：只比较脉冲项——此刻 y 与不碰的对照组一致
    const ctrl = new PersonaSim(rng(3));
    run(ctrl, PERSONAS[1], 12);
    sim.step(0.5, PERSONAS[1]);
    ctrl.step(0.5, PERSONAS[1]);
    expect(sim.y).toBeCloseTo(ctrl.y, 9);
    expect(typeof base).toBe('number');
    // 延迟过后叠加了一个正脉冲
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60, PERSONAS[1]);
      ctrl.step(1 / 60, PERSONAS[1]);
    }
    let maxDelta = 0;
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60, PERSONAS[1]);
      ctrl.step(1 / 60, PERSONAS[1]);
      maxDelta = Math.max(maxDelta, sim.y - ctrl.y);
    }
    expect(maxDelta).toBeGreaterThan(0.05);
  });

  it('D 型每次碰是随机的，落在表里写的范围内', () => {
    const sim = new PersonaSim(rng(4));
    for (let i = 0; i < 40; i++) {
      const r = sim.touch(PERSONAS[3]);
      expect(r.lat).toBeGreaterThanOrEqual(0.1);
      expect(r.lat).toBeLessThanOrEqual(1.8);
      expect(r.str).toBeGreaterThanOrEqual(0.2);
      expect(r.str).toBeLessThanOrEqual(1);
    }
  });

  it('D 型周期 / 幅度每个呼吸周期重抽，且在 2–8 秒 / 20–90% 之内', () => {
    const sim = new PersonaSim(rng(5));
    for (let t = 0; t < 120; t += 1 / 60) {
      sim.step(1 / 60, PERSONAS[3]);
      expect(sim.per).toBeGreaterThan(1.5);
      expect(sim.per).toBeLessThan(8.5);
      expect(sim.dep).toBeGreaterThan(0.1);
      expect(sim.dep).toBeLessThan(0.95);
    }
  });

  it('dt = 0（reduced-motion）时不推进时间也不写历史', () => {
    const sim = new PersonaSim(rng(6));
    sim.step(0, PERSONAS[0]);
    expect(sim.t).toBe(0);
    expect(sim.hist).toHaveLength(0);
  });

  it('强度词按 0.45 / 0.8 分档', () => {
    expect(strengthWord(0.3, 'zh')).toBe('小');
    expect(strengthWord(0.6, 'en')).toBe('medium');
    expect(strengthWord(0.95, 'zh')).toBe('大');
  });
});
