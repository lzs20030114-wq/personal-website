import {
  createSkinUnit,
  type SkinSpec,
  type SkinTerminalState,
  type SkinUnitOpts,
} from './skin-unit';

/** 一条独立引擎及其在全场时间轴上的起步延迟。 */
export interface SkinTerminalInput {
  spec: SkinSpec;
  opts?: SkinUnitOpts;
  delay?: number;
}

export interface SkinTerminalResult {
  tick: number;
  states: SkinTerminalState[];
}

/**
 * 发布前生成资源与守门测试使用：完整重放既有物理，直到全场终态。
 * 浏览器的跳过路径只读生成的文件；不插值、不放宽迭代，也不制造“近似终态”。
 */
export function solveSkinTerminal(inputs: readonly SkinTerminalInput[]): SkinTerminalResult {
  const units = inputs.map(({ spec, opts }) => createSkinUnit(spec, opts));
  let tick = 0;
  while (units.some((unit) => !unit.done)) {
    tick++;
    for (let i = 0; i < units.length; i++)
      if (tick > (inputs[i].delay ?? 0)) units[i].advance();
  }
  return { tick, states: units.map((unit) => unit.terminalState()) };
}
