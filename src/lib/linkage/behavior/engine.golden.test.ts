import { describe, expect, it } from 'vitest';
import { runSession } from './engine';
import golden from './engine.golden.json';
import { GOLDEN_CASES, fnv64, goldenDigest } from './golden';

/**
 * 没有手时，引擎与改动前（基准取自 d06bc0a，Lab 1-6 加手之前）逐位相同：日志全等、执行器指令全等
 * （arm.wrap 是新加的、没有手恒为 0，不进哈希、单独断言）。基准怎么生成见 golden.ts 头注。
 * 以后改引擎时这道红了：先确认是不是有意改了没有手的路径，是的话按 scripts/behavior/engine-golden.mjs 重生成，
 * 并在提交说明里写清楚哪里变了。
 */
describe('没有手的路径逐位不变（golden）', () => {
  it('哈希函数本身稳定', () => {
    expect(fnv64('')).toBe('811c9dc59f37782a');
    expect(fnv64('abc')).not.toBe(fnv64('abd'));
  });

  for (const c of GOLDEN_CASES) {
    it(`种子 ${c.seed} · ×${c.lifeRate} · ${c.order.join('')}`, () => {
      const want = golden.cases.find((g) => g.seed === c.seed && g.lifeRate === c.lifeRate);
      expect(want).toBeDefined();
      const d = goldenDigest(runSession as unknown as Parameters<typeof goldenDigest>[0], c);
      expect(d.log).toBe(want!.log);
      expect(d.frames).toBe(want!.frames);
      expect(d.wrapMax).toBe(0);
    });
  }
});
