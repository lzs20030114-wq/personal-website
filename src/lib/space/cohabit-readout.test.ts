import { describe, expect, it } from 'vitest';
import { ruleReadout, type RuleHit, type RuleRow } from './cohabit-reasons';
import { READOUT_HIST, READOUT_PARTS, READOUT_REASONS, READOUT_ROWS, ReadoutLabels, ReadoutTracker, readoutSnapshot, unitCard, unitState } from './cohabit-readout';
import { standardSceneSim } from './cohabit-solid';

/** cohabit-reasons 的 RuleRow 全部（类型在运行时不存在，这里抄一份；少一行或多一行守门就红） */
const ALL_ROWS: RuleRow[] = ['pass', 'stand', 'seatFar', 'met', 'catMove', 'table', 'foot', 'overHead', 'press', 'r5', 'gapApproachOther', 'gapWatchedOther'];

const hit = (row: RuleRow, people: number[] = [], cats: number[] = [], units: number[] = []): RuleHit => ({ row, people, cats, units });

describe('cohabit-readout · 规则读数的数据', () => {
  it('每一个 RuleRow 恰好一行，中英两份齐全，节与类别对得上，字里没有分号与破折号', () => {
    expect(READOUT_ROWS.map((r) => r.row).sort()).toEqual([...ALL_ROWS].sort());
    for (const r of READOUT_ROWS) {
      for (const lang of ['zh', 'en'] as const) {
        const t = r[lang];
        expect(t.verdict && t.see && t.act && r.mark[lang], `${r.row} ${lang}`).toBeTruthy();
        for (const s of [t.verdict, t.tag ?? '', t.see, t.act]) {
          expect(s).not.toMatch(/[；;]|——|—/);
          if (lang === 'en') expect(s, `${r.row} 英文里混了中文`).not.toMatch(/[一-鿿]/);
        }
      }
      expect(r.part).toBe(r.kind === 'rel' ? 4 : r.kind === 'gap' ? 7 : 5);
    }
    // 判定相同的两行必须靠小字分开
    const seen = new Map<string, number>();
    for (const r of READOUT_ROWS) for (const lang of ['zh', 'en'] as const) {
      const k = `${lang}|${r[lang].verdict}|${r[lang].tag ?? ''}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    for (const p of [4, 5, 7] as const) expect(READOUT_PARTS[p].zh && READOUT_PARTS[p].en).toBeTruthy();
    for (const k of Object.keys(READOUT_REASONS) as (keyof typeof READOUT_REASONS)[]) expect(ALL_ROWS).toContain(READOUT_REASONS[k].row);
  });

  it('名字第一次出现时发号，删掉不回收，新来的排在后面', () => {
    const L = new ReadoutLabels();
    L.sync({ people: [{ id: 3 }, { id: 7 }], cats: [{ id: 4 }] } as never);
    expect(L.person(3, 'zh')).toBe('访客 1');
    expect(L.person(7, 'en')).toBe('Visitor 2');
    expect(L.cat(4, 'zh')).toBe('猫 A');
    // 访客 3 走了、新来一位：号不回收
    L.sync({ people: [{ id: 7 }, { id: 12 }], cats: [{ id: 4 }, { id: 9 }] } as never);
    expect(L.personNo(7)).toBe(2);
    expect(L.personNo(12)).toBe(3);
    expect(L.cat(9, 'en')).toBe('Cat B');
    // 第 27 只猫是 AA
    const M = new ReadoutLabels();
    M.sync({ people: [], cats: Array.from({ length: 28 }, (_, i) => ({ id: 100 + i })) } as never);
    expect(M.catLetter(100 + 25)).toBe('Z');
    expect(M.catLetter(100 + 26)).toBe('AA');
    expect(M.catLetter(999)).toBe('?');
  });

  it('累计次数只在一条新出现时加一，走势按仿真秒记、窗口封顶', () => {
    const T = new ReadoutTracker(0);
    const a = hit('seatFar', [1], [2], [5, 9]);
    T.account([a], 0.5);
    T.account([{ ...a, units: [6, 9] }], 0.9); // 换到下一步仍是同一条
    expect(T.totals.get('seatFar')).toBe(1);
    T.account([], 1.2);
    T.account([a], 1.6); // 断开后再出现 = 新的一条
    expect(T.totals.get('seatFar')).toBe(2);
    expect(T.hist.get('seatFar')).toEqual([0]); // 第 0 秒结束那一刻没有成立的
    T.account([a, hit('seatFar', [3], [4])], 2.1);
    expect(T.hist.get('seatFar')).toEqual([0, 2]);
    // 一帧跨过很多秒（高倍速）：每秒补一格，最多补满窗口
    T.account([], 500);
    expect(T.hist.get('seatFar')!.length).toBe(READOUT_HIST);
    expect(T.hist.get('table')!.every((v) => v === 0)).toBe(true);
  });

  it('标准场景跑 90 s：快照每行都有，谁对谁写的是发过号的名字，单元卡写得出理由', { timeout: 30_000 }, () => {
    const sim = standardSceneSim('live');
    const L = new ReadoutLabels();
    const T = new ReadoutTracker(sim.t);
    for (let k = 0; k < 90 * 30; k++) {
      sim.step(1 / 30);
      if (k % 15 === 0) T.account(ruleReadout(sim), sim.t);
    }
    L.sync(sim);
    const hits = ruleReadout(sim);
    T.account(hits, sim.t);
    for (const lang of ['zh', 'en'] as const) {
      const snap = readoutSnapshot(hits, T, sim, L, lang);
      expect(snap.rows.length).toBe(READOUT_ROWS.length);
      const lit = snap.rows.filter((r) => r.now > 0);
      expect(lit.length).toBeGreaterThan(0);
      for (const r of snap.rows) {
        expect(r.hist.length).toBeLessThanOrEqual(READOUT_HIST);
        for (const w of r.who) expect(w).not.toMatch(/\?|undefined|NaN/);
      }
      expect(snap.partOn[4] + snap.partOn[5] + snap.partOn[7]).toBe(lit.length);
    }
    const u = sim.layout.units.findIndex((_, i) => sim.act.degree[i] > 0.5);
    expect(u).toBeGreaterThanOrEqual(0);
    const card = unitCard(sim, hits, u, L, 'zh');
    expect(card.reasons.length + card.blocks.length).toBeGreaterThan(0);
    expect(unitState(1, 'zh')).toBe('落满');
    expect(unitState(0.42, 'en')).toBe('42% down');
    expect(unitState(0, 'en')).toBe('stowed');
  });
});
