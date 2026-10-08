import { describe, expect, it } from 'vitest';
import { HAND_STAGE_TEXT, describeRecord, phaseName } from './describe';
import { runSession } from './engine';
import { ENGINE_EVENTS, OPERATOR_EVENTS, SENSOR_KINDS } from './events';
import type { Phase } from './life';
import type { LogRecord } from './log';

const CJK = /[一-鿿]/;
/** 写行为不写感受（HUD 不替机器宣布情绪）；内部名「手链」不给观众看 */
const BANNED = /害怕|开心|想要|喜欢|泄气|犹豫|松一口气|手链|afraid|happy|wants|likes|deflates|hesitates|relaxes|hand chain/;

describe('日志 → HUD 一句话', () => {
  it('九类传感、全部引擎事件、两种台架操作都有中英两句，英文里不夹中文、不漏成事件名', () => {
    const base: Omit<LogRecord, 'ev'> = { id: 0, t: 1, life: 1, persona: 'C', phase: 'GROW', src: 'engine' };
    for (const ev of [...SENSOR_KINDS, ...ENGINE_EVENTS, ...OPERATOR_EVENTS]) {
      const r: LogRecord = { ...base, ev, p: {} };
      const zh = describeRecord(r, 'zh');
      const en = describeRecord(r, 'en');
      expect(zh, ev).not.toBe(ev);
      expect(en, ev).not.toBe(ev);
      expect(CJK.test(zh), ev).toBe(true);
      expect(CJK.test(en), ev).toBe(false);
    }
    for (const p of ['BIRTH', 'GROW', 'AGE', 'DEATH', 'BLANK', 'END'] as Phase[]) {
      expect(CJK.test(phaseName(p, 'en'))).toBe(false);
    }
  });

  it('真跑一场的每条记录都读得成句：传感事件带去向，措辞只写行为', () => {
    const { log } = runSession({
      seed: 7,
      lifeRate: 10,
      inputs: [
        { t: 2.5, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } },
        { t: 9, input: { kind: 'KNOCK', intensity: 0.95 } },
        { t: 12, input: { kind: 'PRESENCE', band: 'near', bearing: 0.4 } },
      ],
    });
    for (const r of log) {
      for (const lang of ['zh', 'en'] as const) {
        const s = describeRecord(r, lang);
        expect(s.length).toBeGreaterThan(0);
        if (r.src === 'sensor' && r.out && r.out !== 'none') expect(s).toContain('→');
        expect(s).not.toMatch(BANNED);
      }
    }
    // 迎手链的每个阶段 × 每一拍
    const base: Omit<LogRecord, 'ev' | 'p'> = { id: 0, t: 1, life: 1, persona: 'C', phase: 'GROW', src: 'engine' };
    for (const stage of [...Object.keys(HAND_STAGE_TEXT.stage), 'nonexistent']) {
      for (const beat of ['', ...Object.keys(HAND_STAGE_TEXT.beat)]) {
        const r: LogRecord = { ...base, ev: 'HAND_STAGE', p: beat ? { stage, beat } : { stage } };
        for (const lang of ['zh', 'en'] as const) expect(describeRecord(r, lang), `${stage} ${beat}`).not.toMatch(BANNED);
      }
    }
    const stroke = log.find((r) => r.ev === 'SHELL_STROKE');
    expect(describeRecord(stroke!, 'zh')).toBe('轻拍壳（左） → 回应');
    expect(describeRecord(stroke!, 'en')).toBe('shell pat (L) → responds');
  });
});
