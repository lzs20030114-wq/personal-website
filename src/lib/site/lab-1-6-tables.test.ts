import { describe, expect, it } from 'vitest';
import { BehaviorEngine } from '../linkage/behavior/engine';
import type { SensorInput } from '../linkage/behavior/events';
import { LIFE } from '../linkage/behavior/life';
import type { LogRecord } from '../linkage/behavior/log';
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '../linkage/behavior/persona';
import { LAB_1_6_TABLES, STIMULI, judge } from './lab-1-6-tables';
import { LogTableBlockSchema, type LogCell } from './log-schema';

/**
 * Lab 1-6 附件（交互机制表）的守门。表是从引擎模块现算的，最可能的事故有三种：
 * ① 形状不合日志表格块的 schema（页面上的卡片与展开视图吃的就是它）；
 * ② 英文那一边混进中文（/lab 的英文 SSR 守门会挂，读者看到半中半英的表）；
 * ③ 表里写的「哪种刺激、哪种人格会惊跳」与引擎实跑对不上——表只是把引擎的规矩抄成字，
 *    规矩一改表就该跟着变，这里拿引擎实跑核对，免得表悄悄说错。
 */

const CJK = /[　-〿㐀-鿿＀-￯]/;
const cells = (c: LogCell): { en: string; zh: string } => (typeof c === 'string' ? { en: c, zh: c } : c);

describe('Lab 1-6 交互机制表', () => {
  const { blocks, title } = LAB_1_6_TABLES;

  it('每张表都合日志表格块的 schema，每行与表头同宽', () => {
    // 2026-10-19 交互机制整合：14 张收成 5 张
    expect(blocks.length).toBe(5);
    for (const [i, b] of blocks.entries()) {
      const parsed = LogTableBlockSchema.safeParse(b);
      expect(parsed.success, `表 ${i + 1}：${parsed.success ? '' : parsed.error.message}`).toBe(true);
      for (const [j, row] of b.rows.entries()) expect(row.length, `表 ${i + 1} 第 ${j + 1} 行`).toBe(b.head.length);
      expect(b.caption, `表 ${i + 1} 要有说明（卡片上显示的就是它）`).toBeTruthy();
    }
  });

  it('英文一边没有中文、中文一边有中文；没算出来的数（NaN / undefined）不出现', () => {
    expect(CJK.test(title.en)).toBe(false);
    for (const [i, b] of blocks.entries()) {
      const all = [...b.head, ...b.rows.flat(), ...(b.caption ? [b.caption] : [])].map(cells);
      for (const c of all) {
        expect(CJK.test(c.en), `表 ${i + 1} 英文：${c.en}`).toBe(false);
        expect(/NaN|undefined|Infinity/.test(c.en + c.zh), `表 ${i + 1}：${c.en}`).toBe(false);
      }
      expect(CJK.test(cells(b.caption!).zh), `表 ${i + 1} 的中文说明`).toBe(true);
    }
  });

  it('表 02 的人格参数与 persona.ts 逐格一致（抽两行核对）', () => {
    const t02 = blocks[1];
    const row = (no: string) => t02.rows.find((r) => r[0] === no)!;
    expect(row('11').slice(2).map((c) => cells(c).en)).toEqual(PERSONA_KEYS.map((k) => {
      const [lo, hi] = PERSONAS[k].startle;
      return lo === hi ? String(lo) : `${lo}–${hi}`;
    }));
    expect(row('10').slice(2).map((c) => cells(c).en)).toEqual(PERSONA_KEYS.map((k) => String(PERSONAS[k].toward)));
  });

  /** 引擎实跑：这一种人格先活到能回应，然后只来这一个刺激，看它怎么判（惊跳 / 回应） */
  function trial(k: PersonaKey, e: SensorInput): string | undefined {
    const order = [k, ...PERSONA_KEYS.filter((x) => x !== k)];
    const eng = new BehaviorEngine({ seed: 11, order });
    const t0 = LIFE.respondAt + 5;
    while (eng.time < t0) eng.tick();
    eng.drain();
    eng.push(e);
    const log: LogRecord[] = [];
    while (eng.time < t0 + 8) {
      eng.tick();
      log.push(...eng.drain());
    }
    return log.find((r) => r.src === 'sensor' && r.ev === e.kind)?.out;
  }
  const INPUT: Record<string, (I: number) => SensorInput> = {
    PRESENCE: () => ({ kind: 'PRESENCE', band: 'far', bearing: 0.6 }),
    SHELL_STROKE: (I) => ({ kind: 'SHELL_STROKE', half: 'L', touch: I === 0.1 ? 'stroke' : I === 0.3 ? 'pat' : 'poke' }),
    SHELL_HOLD: () => ({ kind: 'SHELL_HOLD', half: 'L', on: true }),
    FEELER_TOUCH: () => ({ kind: 'FEELER_TOUCH', feeler: 0, side: 'L' }),
    ARM_TOUCH: (I) => (I < 0.2 ? { kind: 'ARM_TOUCH', on: true, by: 'arm' } : { kind: 'ARM_TOUCH', on: true }),
    LIFT: () => ({ kind: 'LIFT', lifted: true }),
    KNOCK: (I) => ({ kind: 'KNOCK', intensity: I }),
    SOUND: (I) => ({ kind: 'SOUND', level: I }),
  };

  it('表 01 / 03 的判定与引擎实跑一致：A、B、C 对每个刺激惊跳还是回应', () => {
    for (const s of STIMULI) {
      for (const k of ['A', 'B', 'C'] as const) {
        const want = judge(s.I, PERSONAS[k].startle[0]);
        expect(trial(k, INPUT[s.kind](s.I)), `${k} · ${s.label.en}`).toBe(want);
      }
    }
  }, 30_000);
});
