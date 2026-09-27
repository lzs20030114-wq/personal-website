import type { SkinTerminalInput } from './skin-terminal';
import type { SkinTerminalState } from './skin-unit';

export const SKIN_TERMINAL_FORMAT = 1;

export interface SkinTerminalManifest {
  format: number;
  revision: string;
  count: number;
}

export interface StoredSkinTerminal {
  px: number[];
  py: number[];
  locked: [number, number, number][];
  step: number;
  r: number;
}

/** 输入按值匹配；同谱跨台架共享。延迟、排布、相机不改变独立引擎的终态。 */
export function skinTerminalSignature({ spec, opts = {} }: SkinTerminalInput): string {
  return JSON.stringify([spec, Object.fromEntries(
    Object.entries(opts).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)),
  )]);
}

export async function skinTerminalAssetKey(revision: string, signature: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${revision}\n${signature}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function storeSkinTerminal(state: SkinTerminalState): StoredSkinTerminal {
  return { ...state, px: Array.from(state.px), py: Array.from(state.py) };
}

/** 不四舍五入，JSON 数值往返保留 Float64；坏资源不装进活台架。 */
export function restoreSkinTerminal(value: unknown, nodes: number, steps: number): SkinTerminalState {
  const s = value as StoredSkinTerminal | null;
  const positions = (v: unknown): v is number[] =>
    Array.isArray(v) && v.length === nodes && v.every((x) => typeof x === 'number' && Number.isFinite(x));
  if (!s || !positions(s.px) || !positions(s.py) || s.step !== steps ||
      typeof s.r !== 'number' || !Number.isFinite(s.r) || !Array.isArray(s.locked) ||
      !s.locked.every((b) => Array.isArray(b) && b.length === 3 &&
        Number.isInteger(b[0]) && b[0] >= 0 && b[0] < nodes &&
        Number.isInteger(b[1]) && b[1] >= 0 && b[1] < nodes &&
        typeof b[2] === 'number' && Number.isFinite(b[2]) && b[2] >= 0))
    throw new Error('Invalid precomputed skin terminal state');
  return { ...s, px: Float64Array.from(s.px), py: Float64Array.from(s.py) };
}
