import type { SkinTerminalInput } from './skin-terminal';
import { skinTerminalSignature } from './skin-terminal-format';

/** 活的独立引擎身份：终态相同还不够，起步延迟也决定当前的物理状态。 */
export function skinSimulationSignature(input: SkinTerminalInput): string {
  return JSON.stringify([skinTerminalSignature(input), input.delay ?? 0]);
}

/** 保留逻辑槽位顺序；换间距/机位不换引擎，换 lead/选项/延迟必须更新。 */
export function skinSimulationInputsKey(inputs: readonly SkinTerminalInput[]): string {
  return JSON.stringify(inputs.map(skinSimulationSignature));
}

/** 同一步序的独立输入共享一份解，逻辑槽位仍由 slotToUnit 保留。
 * 调用方目前把绘图参数也存放在引擎条目上，故它们不同时保守地不合并。 */
export function shareSkinSimulationInputs<T extends SkinTerminalInput & {
  smooth?: readonly [number, number]; seam?: number;
}>(inputs: readonly T[]): { units: T[]; slotToUnit: number[] } {
  const seen = new Map<string, number>();
  const units: T[] = [];
  const slotToUnit = inputs.map(input => {
    const key = JSON.stringify([skinSimulationSignature(input), input.smooth, input.seam]);
    let index = seen.get(key);
    if (index === undefined) {
      index = units.length;
      seen.set(key, index);
      units.push(input);
    }
    return index;
  });
  return { units, slotToUnit };
}
