import { describe, expect, it } from 'vitest';
import { runSession } from './engine';
import golden from './engine.golden.json';
import { GOLDEN_CASES, GOLDEN_HAND_CASES, fnv64, goldenDigest } from './golden';

/**
 * 逐位不变的三道基准（怎么生成见 golden.ts 头注与 scripts/behavior/engine-golden.mjs）：
 * - **没有手**（基准取自 d06bc0a，Lab 1-6 加手之前）：日志全等、执行器指令全等（arm.wrap 没有手恒为 0，不进哈希、单独断言）。
 * - **动作词汇 v2、没有手**（取自 74615e1，迎手链 v2 动工前）：迎手链只在有手时起作用，没有手的研究会话一个字不变。
 * - **现行、有手**（取自 74615e1）：迎手链 v2 的改动不许漏进现行（vocab 1）的手路径。
 * 以后改引擎时某道红了：先确认是不是有意改了那条路径，是的话只重生成那一组，并在提交说明里写清楚哪里变了。
 */
const run = runSession as unknown as Parameters<typeof goldenDigest>[0];

describe('逐位不变（golden）', () => {
  it('哈希函数本身稳定', () => {
    expect(fnv64('')).toBe('811c9dc59f37782a');
    expect(fnv64('abc')).not.toBe(fnv64('abd'));
  });

  for (const c of GOLDEN_CASES) {
    it(`没有手 · 种子 ${c.seed} · ×${c.lifeRate} · ${c.order.join('')}`, () => {
      const want = golden.cases.find((g) => g.seed === c.seed && g.lifeRate === c.lifeRate);
      expect(want).toBeDefined();
      const d = goldenDigest(run, c);
      expect(d.log).toBe(want!.log);
      expect(d.frames).toBe(want!.frames);
      expect(d.wrapMax).toBe(0);
    });
  }

  for (const c of GOLDEN_CASES) {
    it(`动作词汇 v2、没有手 · 种子 ${c.seed} · ×${c.lifeRate}`, () => {
      const want = golden.v2.cases.find((g) => g.seed === c.seed && g.lifeRate === c.lifeRate);
      expect(want).toBeDefined();
      const d = goldenDigest(run, c, 'v2');
      expect(d.log).toBe(want!.log);
      expect(d.frames).toBe(want!.frames);
      expect(d.wrapMax).toBe(0);
    });
  }

  for (const c of GOLDEN_HAND_CASES) {
    it(`现行、有手 · 种子 ${c.seed} · ×${c.lifeRate} · ${c.order.join('')}`, () => {
      const want = golden.hand.cases.find((g) => g.seed === c.seed && g.lifeRate === c.lifeRate);
      expect(want).toBeDefined();
      const d = goldenDigest(run, c, 'hand');
      expect(d.log).toBe(want!.log);
      expect(d.frames).toBe(want!.frames);
    });
  }
});
