import { describe, expect, it } from 'vitest';
import {
  ARCH_APEX,
  ARCH_CENTER,
  ARCH_CRANK_RADIUS,
  ARCH_DRAG_SWEEPS,
  ARCH_DRIVER,
  ARCH_FEET,
  ARCH_FOOT_SLOTS,
  ARCH_PIN,
  ARCH_SPIN_SWEEPS,
  ARCH_STEP_DT,
  ARCH_THETA0,
  archStopPass,
  archTriSigns,
  apexHeightMM,
  createArch,
} from './arch';
import { ARCH_DEF, ARCH_TRI_SIGNS } from './arch-data';

/** 曲柄位置驱动一步（controller.frame 的 spin 路径，SPEC §4.2）。 */
function spinStep(s: ReturnType<typeof createArch>, theta: number, sweeps: number): void {
  const a = s.nodes[ARCH_CENTER];
  s.setFixed(ARCH_PIN, true);
  s.setNode(
    ARCH_PIN,
    a.x + ARCH_CRANK_RADIUS * Math.cos(theta),
    a.y + ARCH_CRANK_RADIUS * Math.sin(theta),
  );
  s.iterate(sweeps);
  s.setFixed(ARCH_PIN, false);
}

describe('拱环装配（图纸姿态）', () => {
  it('初始化收敛：残差 < 0.5px，且全部板在图纸解支上（createArch 内部断言不抛）', () => {
    const s = createArch();
    expect(s.maxError()).toBeLessThan(0.5);
    expect(archTriSigns(s)).toEqual([...ARCH_TRI_SIGNS]);
  });

  it('导轨模拟精度：拱顶贴 x=350、四脚贴 y=430（偏差 < 0.05px）', () => {
    const s = createArch();
    expect(Math.abs(s.nodes[ARCH_APEX].x - 350)).toBeLessThan(0.05);
    for (const f of ARCH_FEET) {
      expect(Math.abs(s.nodes[f].y - 430)).toBeLessThan(0.05);
    }
  });

  it('锚点严格不动（轮心与全部远锚点）', () => {
    const s = createArch();
    const before = s.nodes.map((n) => ({ x: n.x, y: n.y, fixed: n.fixed }));
    spinStep(s, ARCH_THETA0 + 0.3, ARCH_SPIN_SWEEPS);
    before.forEach((n, i) => {
      if (!n.fixed || i === ARCH_PIN) return;
      expect(s.nodes[i].x).toBe(n.x);
      expect(s.nodes[i].y).toBe(n.y);
    });
  });
});

describe('整周呼吸（曲柄 360°，144 步 warm start）', () => {
  it('残差有界、无 NaN、板解支恒定、导轨全程贴合、行程 = 2R', () => {
    const s = createArch();
    let apexMin = Infinity;
    let apexMax = -Infinity;
    for (let k = 0; k <= 144; k++) {
      const theta = ARCH_THETA0 + (k * 2 * Math.PI) / 144;
      spinStep(s, theta, ARCH_SPIN_SWEEPS);
      for (const n of s.nodes) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      }
      // 瞬态残差上界：实测峰值 3.59px，出现在折叠死点附近（雅可比降秩、GS 收敛率
      // 下降——SPEC §3.4「变软」；本工况 2.5°/步是运行时步距的 ~5 倍，属苛刻测试；
      // 运行时步距（720 步/圈）实测峰值 2.08px）。遍数加倍只降 ~4%（48→96 遍：
      // 2.08→1.99px）——慢模态非预算问题，不追。
      expect(s.maxError()).toBeLessThan(4);
      expect(archTriSigns(s)).toEqual([...ARCH_TRI_SIGNS]);
      expect(Math.abs(s.nodes[ARCH_APEX].x - 350)).toBeLessThan(0.1);
      for (const f of ARCH_FEET) {
        expect(Math.abs(s.nodes[f].y - 430)).toBeLessThan(0.1);
      }
      apexMin = Math.min(apexMin, s.nodes[ARCH_APEX].y);
      apexMax = Math.max(apexMax, s.nodes[ARCH_APEX].y);
    }
    // 滑块行程 = 2R（曲柄滑块运动学；图纸位 203.49 = 全开，+2R = 折叠位）。
    // 容差放宽到死点瞬态量级。
    expect(Math.abs(apexMin - 203.49)).toBeLessThan(2);
    expect(Math.abs(apexMax - apexMin - 2 * ARCH_CRANK_RADIUS)).toBeLessThan(3);
    // 呼吸幅度换算回真机口径：行程 ≈ 2 × R* = 56.2mm
    expect(apexHeightMM(s)).toBeGreaterThan(0);
  });

  it('确定性：同一调用序列两次运行逐位相同（SPEC §4.1 契约 3）', () => {
    const run = () => {
      const s = createArch();
      for (let k = 0; k <= 36; k++) {
        spinStep(s, ARCH_THETA0 + (k * 2 * Math.PI) / 36, ARCH_SPIN_SWEEPS);
      }
      return s.nodes.map((n) => [n.x, n.y]);
    };
    expect(run()).toEqual(run());
  });
});

describe('脚槽止程（ARCH_FOOT_SLOTS + archStopPass + 定步积分，2026-07-17 转正）', () => {
  it('槽表几何：外端 = 图纸全开位、lo<hi、左右镜像对称', () => {
    for (const { node, lo, hi } of ARCH_FOOT_SLOTS) {
      expect(lo).toBeLessThan(hi);
      const x0 = ARCH_DEF.nodes[node].x;
      // 全开位 = 槽外端（左侧外端是 lo，右侧是 hi）
      expect(Math.abs(x0 - (x0 < 350 ? lo : hi))).toBeLessThan(1e-6);
    }
    const byNode = new Map(ARCH_FOOT_SLOTS.map((s) => [s.node, s]));
    for (const [a, b] of [
      [16, 19],
      [18, 21],
    ] as const) {
      const sa = byNode.get(a)!;
      const sb = byNode.get(b)!;
      expect(Math.abs(sa.lo + sb.hi - 700)).toBeLessThan(0.02);
      expect(Math.abs(sa.hi + sb.lo - 700)).toBeLessThan(0.02);
    }
  });

  it('定步自旋 3 圈：脚恒在槽内、无并拢塌缩、残差有界、板解支恒定', () => {
    // 回归 2026-07-17 跨设备事故：无止程时四脚零刚度滑移模态在首圈内并拢
    // （gap 20.4→0、整环压扁、残差仍 ≈0——合法解不是算错，形态随设备帧历史分岔）。
    const s = createArch();
    const steps = Math.round(((2 * Math.PI) / ARCH_DRIVER.omega / ARCH_STEP_DT) * 3);
    let peakErr = 0;
    let minGap = Infinity;
    for (let k = 1; k <= steps; k++) {
      spinStep(s, ARCH_THETA0 + k * ARCH_DRIVER.omega * ARCH_STEP_DT, ARCH_SPIN_SWEEPS);
      archStopPass(s);
      peakErr = Math.max(peakErr, s.maxError());
      minGap = Math.min(
        minGap,
        Math.hypot(s.nodes[16].x - s.nodes[18].x, s.nodes[16].y - s.nodes[18].y),
      );
      if (k % 24 === 0) {
        for (const { node, lo, hi } of ARCH_FOOT_SLOTS) {
          expect(s.nodes[node].x).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(s.nodes[node].x).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    }
    // 实测（120fps 定步 + 8×6 交错钳制）峰值 ≈0.5px；上界留死点瞬态余量
    expect(peakErr).toBeLessThan(1.5);
    // 名义脚距 20.37px（同侧两脚欧氏距），并拢塌缩时 → 0
    expect(minGap).toBeGreaterThan(15);
    expect(archTriSigns(s)).toEqual([...ARCH_TRI_SIGNS]);
  });

  it('定步积分：渲染帧率（累加器切分方式）不影响轨迹——逐位相同', () => {
    // 分岔源是「每帧 Δθ = ω·dt 随设备帧率变化」；定步后设备帧率只决定
    // 一次 rAF 里跑几个子步，子步序列本身与设备无关。
    const run = (batch: (k: number) => number) => {
      const s = createArch();
      let done = 0;
      const total = 360;
      while (done < total) {
        const n = Math.min(batch(done), total - done);
        for (let i = 0; i < n; i++) {
          done++;
          spinStep(s, ARCH_THETA0 + done * ARCH_DRIVER.omega * ARCH_STEP_DT, ARCH_SPIN_SWEEPS);
          archStopPass(s);
        }
      }
      return s.nodes.map((n) => [n.x, n.y]);
    };
    const perFrame60 = run(() => 2); // 60Hz 渲染：每帧 2 子步
    const jittery = run((k) => 1 + (k % 3)); // 抖动设备：1–3 子步不等
    expect(perFrame60).toEqual(jittery);
  });
});

describe('拖拽（软目标 + 按帧限步，SPEC §3.3）', () => {
  it('拖拽拱顶向下：跟随呼吸自由度、无 NaN；松手后恢复刚性 < 0.5px', () => {
    const s = createArch();
    const y0 = s.nodes[ARCH_APEX].y;
    s.beginDrag(ARCH_APEX);
    // 分帧下压 60px（每帧一次 iterate = 一帧预算，SPEC §5 条 6b）
    for (let f = 1; f <= 10; f++) {
      s.dragTo(350, y0 + f * 6);
      s.iterate(ARCH_DRAG_SWEEPS);
    }
    for (const n of s.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    // 呼吸自由度被驱动：拱顶确实下行了
    expect(s.nodes[ARCH_APEX].y).toBeGreaterThan(y0 + 30);
    s.endDrag();
    // 恢复以帧计（SPEC §5 条 5 同理）：长链 + 扁板慢模态，实测 64 遍/帧 ×17 帧到
    // <0.5px——上界取 24 帧。视觉刚性阈值 ~1px 在第 ~12 帧（0.2s）已达到。
    let recovered = false;
    for (let f = 0; f < 24 && !recovered; f++) {
      s.iterate(ARCH_DRAG_SWEEPS);
      recovered = s.maxError() < 0.5;
    }
    expect(recovered).toBe(true);
    expect(archTriSigns(s)).toEqual([...ARCH_TRI_SIGNS]);
  });

  it('不可达目标（横拉拱顶——导轨顶住）：机构不发散，松手恢复', () => {
    const s = createArch();
    s.beginDrag(ARCH_APEX);
    for (let f = 0; f < 12; f++) {
      s.dragTo(10_000, s.nodes[ARCH_APEX].y);
      s.iterate(ARCH_DRAG_SWEEPS);
    }
    for (const n of s.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    s.endDrag();
    for (let f = 0; f < 12; f++) s.iterate(ARCH_DRAG_SWEEPS);
    expect(s.maxError()).toBeLessThan(0.5);
  });
});
