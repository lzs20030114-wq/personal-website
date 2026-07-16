import { describe, expect, it } from 'vitest';
import {
  SHELL_OMEGA,
  SHELL_RINGS,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringPoint,
  shellMaxError,
  stepRing,
} from './shell3d';

// 单位注意：本模块坐标 = 环局部 mm（非 2D 台架的 viewBox px；1px = 1/1.9mm）。

describe('五环装配（图纸姿态）', () => {
  it('S1–S5 全部初始化收敛（残差 < 0.3mm）且板解支正确（makeSolver 内断言不抛）', () => {
    const rings = createShell();
    expect(rings).toHaveLength(5);
    for (const r of rings) {
      expect(r.solver.maxError()).toBeLessThan(0.3);
    }
  });

  it('站位与 roll 对表（85mm 等距、盘点 §7 roll——2026-07-17 用户拍板）', () => {
    expect(SHELL_RINGS.map((d) => d.station)).toEqual([-170, -85, 0, 85, 170]);
    expect(SHELL_RINGS.map((d) => d.rollDeg)).toEqual([-14, -6, 2, 9, 15]);
  });

  it('每环四脚共地线（|y| < 0.05mm）、左右镜像、槽端外端 = 全开位', () => {
    const rings = createShell();
    for (const r of rings) {
      const d = r.data;
      expect(d.feet).toHaveLength(4);
      for (const f of d.feet) {
        expect(Math.abs(r.solver.nodes[f].y)).toBeLessThan(0.05);
      }
      // 左右镜像（脚按 x 排序：0,1 左 / 2,3 右）
      expect(Math.abs(d.def.nodes[d.feet[0]].x + d.def.nodes[d.feet[3]].x)).toBeLessThan(0.01);
      expect(Math.abs(d.def.nodes[d.feet[1]].x + d.def.nodes[d.feet[2]].x)).toBeLessThan(0.01);
      for (const s of r.slots) {
        expect(s.lo).toBeLessThan(s.hi);
        const x0 = d.def.nodes[s.node].x;
        expect(Math.abs(x0 - (x0 < 0 ? s.lo : s.hi))).toBeLessThan(1e-6);
      }
    }
  });

  it('roll 是环面内旋转：环平面 x = station 不变，apex 横向斜漂', () => {
    for (const d of SHELL_RINGS) {
      const apex = d.def.nodes[d.apex];
      const p = ringPoint(d, apex.x, apex.y);
      expect(p.x).toBe(d.station);
      if (d.rollDeg !== 0) expect(Math.abs(p.y)).toBeGreaterThan(1);
    }
  });
});

describe('同相呼吸（定步 + 槽端止程，S4 定案同款）', () => {
  it('整圈：残差有界、四脚恒在槽内、同侧脚距不塌（S3 豁免）', () => {
    const rings = createShell();
    const steps = Math.round((2 * Math.PI) / SHELL_OMEGA / SHELL_STEP_DT);
    const dTheta = SHELL_OMEGA * SHELL_STEP_DT;
    let peakErr = 0;
    const gap0 = rings.map((r) =>
      Math.abs(r.solver.nodes[r.data.feet[0]].x - r.solver.nodes[r.data.feet[1]].x),
    );
    let minGapRatio = Infinity;
    for (let k = 1; k <= steps; k++) {
      for (const r of rings) stepRing(r, dTheta);
      peakErr = Math.max(peakErr, shellMaxError(rings));
      rings.forEach((r, i) => {
        // S3（M5 变体）折叠是「卷起」不是「收脚」：同侧两脚在折叠中天然并拢
        //（实测三种步密度残差全程 0.00）——脚距检查对它不适用。
        if (r.data.name.startsWith('S3')) return;
        const g = Math.hypot(
          r.solver.nodes[r.data.feet[0]].x - r.solver.nodes[r.data.feet[1]].x,
          r.solver.nodes[r.data.feet[0]].y - r.solver.nodes[r.data.feet[1]].y,
        );
        minGapRatio = Math.min(minGapRatio, g / gap0[i]);
      });
      if (k % 40 === 0) {
        for (const r of rings) {
          for (const s of r.slots) {
            expect(r.solver.nodes[s.node].x).toBeGreaterThanOrEqual(s.lo - 1e-9);
            expect(r.solver.nodes[s.node].x).toBeLessThanOrEqual(s.hi + 1e-9);
          }
        }
      }
    }
    // mm 口径实测（1/120 定步）：S1 0.34 / S2 0.42 / S3 1.12（慢模态瞬态）/
    // S4 0.30 / S5 0.24——上界 1.5 留余量
    expect(peakErr).toBeLessThan(1.5);
    // 并拢塌缩（自由模态病）时同侧脚距 → 0；健康折叠中四常规环脚距只会张开
    expect(minGapRatio).toBeGreaterThan(0.6);
  });

  it('定步不变性：子步怎么按渲染帧切分不影响轨迹（逐位相同）', () => {
    const run = (batch: (k: number) => number) => {
      const rings = createShell();
      const dTheta = SHELL_OMEGA * SHELL_STEP_DT;
      let done = 0;
      const total = 180;
      while (done < total) {
        const n = Math.min(batch(done), total - done);
        for (let i = 0; i < n; i++) {
          done++;
          for (const r of rings) stepRing(r, dTheta);
        }
      }
      return rings.map((r) => r.solver.nodes.map((n) => [n.x, n.y]));
    };
    expect(run(() => 2)).toEqual(run((k) => 1 + (k % 3)));
  });

  it('同相：五环曲柄相位始终一致', () => {
    const rings = createShell();
    for (let k = 0; k < 60; k++) {
      for (const r of rings) stepRing(r, SHELL_OMEGA * SHELL_STEP_DT);
    }
    const th0 = rings[0].theta;
    for (const r of rings) expect(r.theta).toBe(th0);
    expect(th0).toBeCloseTo(SHELL_THETA0 + 60 * SHELL_OMEGA * SHELL_STEP_DT, 10);
  });
});
