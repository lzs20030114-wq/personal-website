import { SKIN } from '../../src/lib/space/skin-unit';
import type { SkinTerminalInput, SkinTerminalResult } from '../../src/lib/space/skin-terminal';
import { skinTerminalSignature, restoreSkinTerminal } from '../../src/lib/space/skin-terminal-format';

type TerminalData = Readonly<Record<string, unknown>>;

let bundled: Promise<TerminalData> | undefined;

/**
 * 终态字典（约 2 MB，压缩后约 460 KB）。仍随站点代码打包、走同一条代码分块（§37 的做法不变：不另发 JSON 请求、
 * 不用 Web Crypto、不在访客设备上求解），只是改成第一次要用时才载入——原先任何挂了皮肤台架的页面
 * （/lab、项目二案例页的正文活件）一打开就连带下载它，而案例页里的台架根本没有「跳过成形」（2026-11-08，MAPPING §87）。
 * /lab 上带控制条的台架在挂上之后的空闲时间里先把它拉下来，勾选「跳过成形」时照旧只读内存。
 */
export function loadSkinTerminalData(): Promise<TerminalData> {
  bundled ??= import('../../src/lib/space/skin-terminal.generated.json')
    .then((m) => (m.default ?? m) as TerminalData)
    .catch((error: unknown) => {
      bundled = undefined; // 失败不缓存：下一次勾选重新取
      throw error;
    });
  return bundled;
}

/** 带控制条的台架挂上之后、浏览器空闲时预取终态字典；返回取消函数 */
export function warmSkinTerminal(): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => void loadSkinTerminalData().catch(() => {});
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(run, 1500);
  return () => clearTimeout(t);
}

/**
 * 点击只读内存，不在访客设备上求解。保留 Promise 接口及台架已有的换档/取消请求代次保护。
 * `data` 只给测试注入；省略时用上面那份按需载入的字典。
 */
export function createSkinTerminalLoader(data?: TerminalData) {
  const states = new Map<string, SkinTerminalResult['states'][number]>();
  return async (inputs: readonly SkinTerminalInput[]): Promise<SkinTerminalResult> => {
    if (!inputs.length) return { tick: 0, states: [] };
    const dict = data ?? (await loadSkinTerminalData());
    const loaded = inputs.map((input) => {
      const signature = skinTerminalSignature(input);
      const hit = states.get(signature);
      if (hit) return hit;
      const nodes = input.spec.reduce((n, seg) => n + seg[1], 0);
      const state = restoreSkinTerminal(dict[signature], nodes, SKIN.STEPS);
      states.set(signature, state);
      return state;
    });
    // delay 只改变全场时间；每条带按本地 step 推进，终态可共用。
    const tick = Math.max(...loaded.map((s, i) => s.step + Math.max(0, Math.floor(inputs[i].delay ?? 0))));
    return { tick, states: loaded };
  };
}

export const requestSkinTerminal = createSkinTerminalLoader();
