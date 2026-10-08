import { describe, expect, it } from 'vitest';
import { tendonContractions } from '../machine-behavior';
import { CriticallyDamped } from '../motion';
import { TENTACLE3D, TIP3, applyContraction3, createTentacle3 } from '../tentacle3d-data';
import { obsForecast, obsStep } from './engine';

/**
 * 臂余振观测器（迎手链的「等臂停稳才进下一拍」）对 Lab 1-3 求解器：阶跃以后预测停稳的时刻与求解器实测相差
 * ≤ 0.5 s（臂在 1.45 s 的周期上振，阈值判停会在半个周期上跳，比这更紧做不到）。求解器的「停稳」= 之后梢端速度一直
 * < ε × 500 mm/s 且离终点 < 5 mm（实测 500–530 mm / 差动）。原先 1.42 s / 0.15 的常数在这里差 0.6–1.8 s。
 */
const DT = 1 / 60;
function solverSettle(D0: number, D1: number, dir: number, ev: number): number {
  const arm = createTentacle3();
  const mus = [0, 1, 2].map(() => new CriticallyDamped(5));
  const cmd = (D: number) => ({ tone: 1, bend: Math.min(1, D / 0.34), dir, wrap: Math.max(0, D - 0.34) / 0.16 });
  const step = (D: number): void => {
    const c = tendonContractions(cmd(D), { deep: true });
    for (let k = 0; k < 3; k++) {
      mus[k].target = c[k];
      if (mus[k].update(DT)) applyContraction3(arm.solver, arm.tendons[k], mus[k].value);
    }
    arm.solver.step(DT, TENTACLE3D.sweeps);
  };
  for (let i = 0; i < 900; i++) step(D0);
  const tips: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 60 * 7; i++) {
    step(D1);
    tips.push({ ...arm.solver.nodes[TIP3] });
  }
  const f = tips[tips.length - 1];
  for (let i = tips.length - 2; i > 0; i--) {
    const v = Math.hypot(tips[i + 1].x - tips[i].x, tips[i + 1].y - tips[i].y, tips[i + 1].z - tips[i].z) / DT;
    const d = Math.hypot(tips[i].x - f.x, tips[i].y - f.y, tips[i].z - f.z);
    if (v > ev * 500 || d > 5) return (i + 1) * DT;
  }
  return 0;
}

describe('臂余振观测器 vs 求解器', () => {
  // 求解器每个用例约 2 s，只留两档阶跃 × 两个 ε（全量扫描见研究笔记 §9.2）
  for (const [ev, D0, D1, dir] of [
    [0.05, 0.085, 0.2, 0.62],
    [0.03, 0.1, 0.32, 0],
  ]) {
    it(`ε ${ev} · ${D0} → ${D1} · 弯向 ${dir}`, { timeout: 30000 }, () => {
      const o = [0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 900; i++) obsStep(o, D0 * Math.cos(dir), D0 * Math.sin(dir), DT);
      const pred = obsForecast(o, D1 * Math.cos(dir), D1 * Math.sin(dir), ev, 7);
      expect(Math.abs(pred - solverSettle(D0, D1, dir, ev))).toBeLessThan(0.5);
    });
  }
});
