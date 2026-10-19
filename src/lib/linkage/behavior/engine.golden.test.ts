import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSession } from './engine';
import golden from './engine.golden.json';
import { GOLDEN_CASES, GOLDEN_HAND_CASES, fnv64, goldenDigest } from './golden';

/**
 * 逐位不变的两道基准（怎么生成见 golden.ts 头注与 scripts/behavior/engine-golden.mjs）：
 * - **没有手**：日志全等、执行器指令全等（arm.wrap 没有手恒为 0，不进哈希、单独断言）。
 * - **有手**：同一组访客脚本再加一段写死的手（出现、停住、慢挪、碰臂、卡住、抽手、绕到背后……）。
 * 以后改引擎时某道红了：先确认是不是有意改了那条路径，是的话只重生成那一组，并在提交说明里写清楚哪里变了。
 *
 * 沿革：2026-10-07 立「没有手」（现行动作），10-08 加「动作词汇 v2、没有手」与「现行、有手」，10-14 人格重分类三组全部重生成；
 * **2026-10-17 删掉现行动作**：现行那两组退役，v2 两组改名为现在这两组——「有手」那组是删现行之前（ee26dbe）用 v2 生成的，
 * 删现行这一步本身两组都逐位通过（来源标记见 engine.golden.json）。
 * **2026-10-19 引擎里的乘方改连乘 / exp·log**（Vercel 用 Node 24 构建、乘方末位与 Node 22 不同，金样本连着几次在部署时红）：
 * 两组的事件日志一条没变，「有手」两个用例的逐帧哈希末位变了，按新写法重生成；现在 Node 20 / 22 / 24 生成的基准逐字节相同。
 * 同日：热情型看见手以后一路跟着手走、不再一跳一停（作者），「有手」那组重生成（没有手那组不受影响）。
 */
const run = runSession as unknown as Parameters<typeof goldenDigest>[0];

describe('逐位不变（golden）', () => {
  // 金样本要在任何机器上逐位相同：Node 24 起 V8 换了乘方的实现，`**` / Math.pow 约一成的输入末位与 Node 22 不同
  // （2026-10-19 Vercel 用 Node 24 构建、这里红了，连着几次部署失败）。sin / cos / exp / log / hypot / atan2 / sqrt 在 20 / 22 / 24 上逐位相同。
  it('引擎源码里不用乘方（跨 Node 版本逐位相同的前提）', () => {
    const dir = resolve(__dirname);
    const files = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => resolve(dir, f)),
      resolve(dir, '../motion.ts'),
      resolve(dir, '../fixed-step.ts'),
    ];
    const hits = files.flatMap((f) => {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /\*\*|Math\.pow\b/.test(code) ? [f] : [];
    });
    expect(hits).toEqual([]);
  });

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

  for (const c of GOLDEN_HAND_CASES) {
    it(`有手 · 种子 ${c.seed} · ×${c.lifeRate} · ${c.order.join('')}`, () => {
      const want = golden.hand.cases.find((g) => g.seed === c.seed && g.lifeRate === c.lifeRate);
      expect(want).toBeDefined();
      const d = goldenDigest(run, c, 'hand');
      expect(d.log).toBe(want!.log);
      expect(d.frames).toBe(want!.frames);
    });
  }
});
