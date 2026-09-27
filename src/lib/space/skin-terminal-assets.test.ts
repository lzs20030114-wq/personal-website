import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSkinTerminalLoader } from '../../../components/lab/skinTerminal';
import { createSkinUnit, SkinUnit, SKIN } from './skin-unit';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { buildSplitLevels } from './skin-split';
import { buildSquareSplitUnits } from './skin-square-split';
import { skinTerminalCatalog } from './skin-terminal-catalog';
import { skinTerminalAssetKey, skinTerminalSignature } from './skin-terminal-format';
import type { SkinTerminalInput } from './skin-terminal';

const asset = (url: string) => JSON.parse(readFileSync(new URL(`../../../public${url}`, import.meta.url), 'utf8'));
const localFetch = vi.fn<typeof fetch>(async (url) => Response.json(asset(String(url))));
const base = { spec: SKIN_UNITS[0].spec, opts: skinSiteOpts(SKIN_UNITS[0]) };
afterEach(() => { vi.restoreAllMocks(); localFetch.mockClear(); });

describe('precomputed skin terminal assets', () => {
  it('全部在站档位都有合法快照；加载和装回不推进任何物理步', async () => {
    const unique = [...new Map(skinTerminalCatalog().map((i) => [skinTerminalSignature(i), i])).values()];
    const advance = vi.spyOn(SkinUnit.prototype, 'advance');
    const load = createSkinTerminalLoader(localFetch);
    const result = await load(unique);
    expect(result.states).toHaveLength(unique.length);
    for (const [i, input] of unique.entries()) {
      const sim = createSkinUnit(input.spec, input.opts);
      sim.applyTerminalState(result.states[i]);
      expect(sim.done).toBe(true);
      expect(sim.step).toBe(SKIN.STEPS);
    }
    expect(advance).not.toHaveBeenCalled();
    expect(localFetch).toHaveBeenCalledTimes(unique.length + 1);
  }, 60000); // 全套物理守门并行时共享 CPU；单独运行无需一秒。

  it.each([
    ['目录袋', base],
    ['捏分带', buildSplitLevels()[6]],
    ['方环捏分', buildSquareSplitUnits()[7]],
  ] as [string, SkinTerminalInput][])('%s 的文件终态与完整求解逐位相同', async (_, input) => {
    const direct = createSkinUnit(input.spec, input.opts);
    while (!direct.done) direct.advance();
    const { states } = await createSkinTerminalLoader(localFetch)([input]);
    const restored = createSkinUnit(input.spec, input.opts);
    restored.applyTerminalState(states[0]);
    expect(restored.px).toEqual(direct.px);
    expect(restored.py).toEqual(direct.py);
    expect(restored.locked).toEqual(direct.locked);
    expect(restored.coreTop).toBe(direct.coreTop);
    expect(restored.coreLen).toBe(direct.coreLen);
    expect(restored.r).toBe(direct.r);
  }, 60000);

  it('重建对象、重排选项、重复台架与错相共享文件，仍保留各自全场时间', async () => {
    const load = createSkinTerminalLoader(localFetch);
    const clone = JSON.parse(JSON.stringify(base)) as SkinTerminalInput;
    clone.opts = Object.fromEntries(Object.entries(clone.opts!).reverse());
    const [first, delayed] = await Promise.all([load([base]), load([{ ...clone, delay: 450 }, base])]);
    expect(first.tick).toBe(1500);
    expect(delayed.tick).toBe(1950);
    expect(delayed.states[0]).toBe(first.states[0]);
    await load([clone]);
    expect(localFetch).toHaveBeenCalledTimes(2); // 一个清单 + 一个形态
    const a = createSkinUnit(base.spec, base.opts);
    a.applyTerminalState(first.states[0]);
    a.px[0] = 123;
    expect(first.states[0].px[0]).not.toBe(123); // 实例不改坏共享快照
  });

  it('路径由实际键谱/全部物理选项及引擎版本决定，时序不误作新形态', async () => {
    const sig = skinTerminalSignature(base);
    expect(skinTerminalSignature({ ...base, delay: 30 })).toBe(sig);
    expect(skinTerminalSignature({ ...base, opts: { ...base.opts, warp: 1.2 } })).not.toBe(sig);
    const key = await skinTerminalAssetKey('revision', sig);
    expect(key).toBe(createHash('sha256').update(`revision\n${sig}`).digest('hex'));
    expect(await skinTerminalAssetKey('next-revision', sig)).not.toBe(key);
  });

  it('文件失败不会创建后台任务或现场求解，并可显式重试', async () => {
    let fail = true;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (!String(url).endsWith('manifest.json') && fail) return new Response('', { status: 503 });
      return Response.json(asset(String(url)));
    });
    const advance = vi.spyOn(SkinUnit.prototype, 'advance');
    const worker = vi.fn(() => { throw new Error('Worker must not be started'); });
    vi.stubGlobal('Worker', worker);
    try {
      const load = createSkinTerminalLoader(fetcher);
      await expect(load([base])).rejects.toThrow('503');
      fail = false;
      expect((await load([base])).states[0].step).toBe(SKIN.STEPS);
      expect(advance).not.toHaveBeenCalled();
      expect(worker).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally { vi.unstubAllGlobals(); }
  });

  it('截断或非有限坐标的资源被拒绝，不污染已存在的模型', async () => {
    const badFetch: typeof fetch = async (url) => {
      const data = asset(String(url));
      if (!String(url).endsWith('manifest.json')) data.px = [null];
      return Response.json(data);
    };
    await expect(createSkinTerminalLoader(badFetch)([base])).rejects.toThrow('Invalid precomputed');
  });
});
