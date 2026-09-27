import { SKIN } from '../../src/lib/space/skin-unit';
import type { SkinTerminalInput, SkinTerminalResult } from '../../src/lib/space/skin-terminal';
import {
  SKIN_TERMINAL_FORMAT, skinTerminalSignature, skinTerminalAssetKey, restoreSkinTerminal,
  type SkinTerminalManifest,
} from '../../src/lib/space/skin-terminal-format';

/** 只读发布前算好的终态；失败也不在访客设备上重算。独立工厂供加载/去重守门使用。 */
export function createSkinTerminalLoader(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let manifest: Promise<SkinTerminalManifest> | null = null;
  const states = new Map<string, Promise<SkinTerminalResult['states'][number]>>();

  async function readJson(url: string, cache: RequestCache): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(url, { cache, signal: controller.signal });
      if (!response.ok) throw new Error(`Skin terminal asset failed: ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function getManifest(): Promise<SkinTerminalManifest> {
    if (manifest) return manifest;
    manifest = readJson('/skin-terminal/manifest.json', 'no-cache').then((data) => {
      const m = data as SkinTerminalManifest;
      if (!m || m.format !== SKIN_TERMINAL_FORMAT || !/^[a-f0-9]{64}$/.test(m.revision))
        throw new Error('Invalid skin terminal manifest');
      return m;
    });
    manifest.catch(() => { manifest = null; });
    return manifest;
  }

  return async (inputs: readonly SkinTerminalInput[]): Promise<SkinTerminalResult> => {
    if (!inputs.length) return { tick: 0, states: [] };
    const m = await getManifest();
    const loaded = await Promise.all(inputs.map((input) => {
      const signature = skinTerminalSignature(input);
      const hit = states.get(signature);
      if (hit) return hit;
      const task = skinTerminalAssetKey(m.revision, signature).then(async (key) => {
        const data = await readJson(`/skin-terminal/${key}.json`, 'force-cache');
        const nodes = input.spec.reduce((n, seg) => n + seg[1], 0);
        return restoreSkinTerminal(data, nodes, SKIN.STEPS);
      });
      states.set(signature, task);
      task.catch(() => { states.delete(signature); });
      return task;
    }));
    // delay 只改变全场时间；每条带按本地 step 推进，终态可共用。
    const tick = Math.max(...loaded.map((s, i) => s.step + Math.max(0, Math.floor(inputs[i].delay ?? 0))));
    return { tick, states: loaded };
  };
}

export const requestSkinTerminal = createSkinTerminalLoader();
