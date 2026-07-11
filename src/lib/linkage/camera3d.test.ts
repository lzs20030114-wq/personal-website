import { describe, expect, it } from 'vitest';
import { OrbitCamera } from './camera3d';
import { projectScene } from './scene3d';
import { CriticallyDamped } from './motion';
import { bakeSkinned } from './gl3d';

// 3D 台架公共装备（立体求解器 spec）：相机 / 场景投影 / 肌肉缓动。

const cam0 = (over: Partial<ConstructorParameters<typeof OrbitCamera>[0]> = {}): OrbitCamera =>
  new OrbitCamera({ cx: 0, cy: 0, pivot: { x: 0, y: 0, z: 0 }, ...over });

describe('OrbitCamera', () => {
  it('零姿态正交投影：x→x，y→y，z→depth', () => {
    const p = cam0().project({ x: 1, y: 2, z: 3 });
    expect(p.x).toBeCloseTo(1, 12);
    expect(p.y).toBeCloseTo(2, 12);
    expect(p.depth).toBeCloseTo(3, 12);
  });

  it('yaw=90°：世界 x 轴转入深度方向', () => {
    const c = cam0({ yaw0: Math.PI / 2 });
    const p = c.project({ x: 1, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(-1, 12);
  });

  it('roll0=−90°：世界 y 轴放倒到屏幕 +x（臂轴机构横躺机位）', () => {
    const c = cam0({ roll0: -Math.PI / 2 });
    const p = c.project({ x: 0, y: 1, z: 0 });
    expect(p.x).toBeCloseTo(1, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(0, 12);
  });

  it('空闲自转绕屏幕竖轴 = 整体横向环视：横躺臂沿水平线扫入深度、不竖漂', () => {
    const c = cam0({ roll0: -Math.PI / 2, autoYaw: 1 });
    c.tick(0.5); // 环视 0.5 rad
    const arm = c.project({ x: 0, y: 1, z: 0 });
    expect(arm.x).toBeCloseTo(Math.cos(0.5), 12); // 横向收短（整体在转）
    expect(arm.y).toBeCloseTo(0, 12); // 始终在水平线上
    expect(Math.abs(arm.depth)).toBeCloseTo(Math.sin(0.5), 12); // 扫入深度
  });

  it('单指横拖 = 绕屏幕竖轴（trackball）：拖 90° 后世界 x 轴转入深度', () => {
    const c = cam0();
    c.pointerDown(1, 0, 0);
    c.pointerMove(1, Math.PI / 2 / 0.008, 0);
    const p = c.project({ x: 1, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(Math.abs(p.depth)).toBeCloseTo(1, 9);
    c.pointerUp(1);
  });

  it('竖拖无俯仰锁：拖满 180° 可翻转到倒置（左右上下全自由）', () => {
    const c = cam0();
    c.pointerDown(1, 0, 0);
    c.pointerMove(1, 0, Math.PI / 0.006); // 竖拖 180°
    const p = c.project({ x: 0, y: 1, z: 0 });
    expect(p.y).toBeCloseTo(-1, 9); // 倒置——v1 的 ±86° 钳位已废除
    c.pointerUp(1);
  });

  it('双指捏合 = 缩放（比值驱动，有上限）；wheel 同样钳位', () => {
    const c = cam0();
    c.pointerDown(1, 0, 0);
    c.pointerDown(2, 100, 0); // 初始指距 100
    c.pointerMove(2, 200, 0); // 指距 ×2
    expect(c.zoom).toBeCloseTo(2, 12);
    c.pointerMove(2, 10000, 0);
    expect(c.zoom).toBe(3); // 上限
    c.pointerUp(1);
    c.pointerUp(2);
    const w = cam0();
    for (let i = 0; i < 100; i++) w.wheel(1000);
    expect(w.zoom).toBe(0.5); // 下限
  });

  it('空闲自转：用户首次接管后永久停止；reset 复位姿态不复活自转', () => {
    const c = cam0({ autoYaw: 1 });
    c.tick(0.5);
    expect(c.project({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(Math.cos(0.5), 12);
    c.pointerDown(1, 0, 0);
    c.pointerUp(1);
    c.tick(0.5);
    expect(c.project({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(Math.cos(0.5), 12); // 不再自转
    c.reset();
    expect(c.project({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(1, 12);
    expect(c.zoom).toBe(1);
    c.tick(0.5);
    expect(c.project({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(1, 12); // 主权已交出
  });
});

describe('projectScene', () => {
  it('画家排序（远 → 近）+ 深度明暗（远淡近实）', () => {
    const c = cam0();
    const out = projectScene(c, [
      { key: 'near', points: [{ x: 0, y: 0, z: 10 }] },
      { key: 'far', points: [{ x: 0, y: 0, z: -10 }] },
    ]);
    expect(out.map((o) => o.key)).toEqual(['far', 'near']);
    expect(out[0].opacity).toBeCloseTo(0.35, 12);
    expect(out[1].opacity).toBeCloseTo(1, 12);
  });

  it('确定性：同输入两次投影逐位一致', () => {
    const c = cam0({ yaw0: 0.7, pitch0: -0.3 });
    const items = [
      { key: 'a', points: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }] },
      { key: 'b', points: [{ x: -2, y: 0, z: 1 }] },
    ];
    const A = projectScene(c, items);
    const B = projectScene(c, items);
    expect(JSON.stringify(A)).toBe(JSON.stringify(B));
  });
});

describe('bakeSkinned（TPU 连接件双骨蒙皮烘焙）', () => {
  const smooth = (ax: number, b0: number, b1: number): number => {
    const s = Math.min(1, Math.max(0, (ax - b0) / (b1 - b0)));
    return s * s * (3 - 2 * s);
  };

  it('插接段三角原样通过（w 恒 0 = 随盒刚动），法向单位', () => {
    const verts = new Float32Array([0, 0, 0, 2, 3, 0, 4, 0, 4]); // 全在 b0=5 之前
    const out = bakeSkinned(verts, new Uint16Array([0, 1, 2]), 5, 15);
    expect(out.length).toBe(3 * 7); // 不细分
    for (const o of [0, 7, 14]) {
      expect(out[o + 6]).toBe(0);
      expect(Math.hypot(out[o + 3], out[o + 4], out[o + 5])).toBeCloseTo(1, 6);
    }
  });

  it('跨裸露带的通长大面被沿臂细分（GPU 三角内线性插值——不细分弯不出弧），' +
     '每顶点 w = smoothstep(自身 ax)', () => {
    // 源网格故意只有两端顶点（模拟通长侧壁）：ax = 0 与 20，带 [5,15]
    const verts = new Float32Array([0, 0, 0, 20, 0, 0, 20, 5, 0, 0, 5, 0]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const out = bakeSkinned(verts, idx, 5, 15);
    const nTri = out.length / 21;
    expect(nTri).toBeGreaterThan(8); // 细分发生
    for (let t = 0; t < nTri; t++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let v = 0; v < 3; v++) {
        const o = t * 21 + v * 7;
        lo = Math.min(lo, out[o]);
        hi = Math.max(hi, out[o]);
        expect(out[o + 6]).toBeCloseTo(smooth(out[o], 5, 15), 12); // w 严格随顶点 ax
      }
      // 带内边 ax 跨度 ≤ 1/8 带宽（弯曲有网格可落）
      if (hi > 5 && lo < 15) expect(hi - lo).toBeLessThanOrEqual(10 / 8 + 1e-9);
    }
  });
});

describe('CriticallyDamped（肌肉缓动）', () => {
  it('零速起步：首帧位移远小于恒速版', () => {
    const m = new CriticallyDamped(5);
    m.target = 1;
    m.update(1 / 60);
    expect(m.value).toBeLessThan(0.01); // 恒速 1.2/s 版首帧 = 0.02
    expect(m.value).toBeGreaterThan(0);
  });

  it('无过冲，最终静定（update 返回 false）', () => {
    const m = new CriticallyDamped(5);
    m.target = 1;
    for (let f = 0; f < 300; f++) {
      m.update(1 / 60);
      expect(m.value).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(m.value).toBe(1);
    expect(m.update(1 / 60)).toBe(false);
  });

  it('jumpTo 硬复位：值/目标/速度全清（归位语义）', () => {
    const m = new CriticallyDamped(5);
    m.target = 1;
    for (let f = 0; f < 30; f++) m.update(1 / 60);
    m.jumpTo(0);
    expect(m.value).toBe(0);
    expect(m.update(1 / 60)).toBe(false);
  });
});
