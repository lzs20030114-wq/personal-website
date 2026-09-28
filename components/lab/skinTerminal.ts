import { SKIN } from '../../src/lib/space/skin-unit';
import type { SkinTerminalInput, SkinTerminalResult } from '../../src/lib/space/skin-terminal';
import { skinTerminalSignature, restoreSkinTerminal } from '../../src/lib/space/skin-terminal-format';
import bundled from '../../src/lib/space/skin-terminal.generated.json';

/**
 * 终态随台架代码一起到达。点击只读内存，不请求清单/JSON、不调用 Web Crypto，
 * 也不在访客设备上求解。保留 Promise 接口及台架已有的换档/取消请求代次保护。
 */
export function createSkinTerminalLoader(data: Readonly<Record<string, unknown>> = bundled) {
  const states = new Map<string, SkinTerminalResult['states'][number]>();
  return async (inputs: readonly SkinTerminalInput[]): Promise<SkinTerminalResult> => {
    if (!inputs.length) return { tick: 0, states: [] };
    const loaded = inputs.map((input) => {
      const signature = skinTerminalSignature(input);
      const hit = states.get(signature);
      if (hit) return hit;
      const nodes = input.spec.reduce((n, seg) => n + seg[1], 0);
      const state = restoreSkinTerminal(data[signature], nodes, SKIN.STEPS);
      states.set(signature, state);
      return state;
    });
    // delay 只改变全场时间；每条带按本地 step 推进，终态可共用。
    const tick = Math.max(...loaded.map((s, i) => s.step + Math.max(0, Math.floor(inputs[i].delay ?? 0))));
    return { tick, states: loaded };
  };
}

export const requestSkinTerminal = createSkinTerminalLoader();
