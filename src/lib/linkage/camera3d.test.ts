import { describe, expect, it } from 'vitest';
import { OrbitCamera } from './camera3d';
import { CriticallyDamped } from './motion';
import { bakeSkinned, jointScrew, type CellFrame, type ScrewParams } from './gl3d';

// 3D 台架公共装备（立体求解器 spec）：相机 / WebGL 几何变换 / 肌肉缓动。

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

  it('右键平移：屏幕坐标平移、姿态不动；视角归位清零', () => {
    const c = cam0();
    c.pointerDown(1, 100, 100, true); // pan = true
    c.pointerMove(1, 130, 80);
    c.pointerUp(1);
    const p = c.project({ x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(30, 12);
    expect(p.y).toBeCloseTo(-20, 12);
    expect(c.pan).toEqual({ x: 30, y: -20 });
    expect(c.project({ x: 0, y: 0, z: 1 }).depth).toBeCloseTo(1, 12); // 姿态未变
    c.reset();
    expect(c.pan).toEqual({ x: 0, y: 0 });
    expect(c.project({ x: 0, y: 0, z: 0 }).x).toBeCloseTo(0, 12);
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

  it('retarget 换枢轴/基础缩放：姿态、zoom、pan 全不动（Lab.08 排列切换机位连续）', () => {
    const c = cam0({ scale: 2 });
    c.pointerDown(1, 100, 100, true); // 先积累一段 pan
    c.pointerMove(1, 130, 80);
    c.pointerUp(1);
    c.retarget({ x: 10, y: 0, z: 0 }, 0.5);
    expect(c.pivotPoint).toEqual({ x: 10, y: 0, z: 0 });
    expect(c.viewScale).toBe(0.5); // zoom 仍 1，基础缩放已换
    expect(c.pan).toEqual({ x: 30, y: -20 }); // pan 保留（reset 才清）
    const p = c.project({ x: 10, y: 0, z: 0 }); // 新枢轴投到屏幕中心 + pan
    expect(p.x).toBeCloseTo(30, 12);
    expect(p.y).toBeCloseTo(-20, 12);
    c.retarget({ x: 0, y: 0, z: 0 }); // 省略 scale = 只换枢轴
    expect(c.viewScale).toBe(0.5);
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

describe('OrbitCamera · 转盘模式（2026-08-20 用户拍板「模仿 Rhino，怎么拖都是正的」）', () => {
  it('y 轴世界：任意斜拖序列后世界竖直轴仍投影为屏幕竖直（零侧倾）', () => {
    const c = cam0({ mode: 'turntable', pitch0: -0.34, yaw0: -0.62 });
    c.pointerDown(1, 0, 0);
    for (const [x, y] of [[37, -21], [90, 40], [-55, 66], [140, -80]]) c.pointerMove(1, x, y);
    c.pointerUp(1);
    const p = c.project({ x: 0, y: 1, z: 0 });
    expect(p.x).toBeCloseTo(0, 12); // 水平分量恒 0——歪的状态在参数化里不存在
    expect(p.y).toBeGreaterThan(0); // 没有翻倒
  });

  it('俯仰钳位：狂竖拖不过顶、不倒置（trackball 那条守的是「能翻」，此处相反）', () => {
    const c = cam0({ mode: 'turntable' });
    c.pointerDown(1, 0, 0);
    c.pointerMove(1, 0, 10000);
    c.pointerUp(1);
    expect(c.project({ x: 0, y: 1, z: 0 }).y).toBeGreaterThanOrEqual(0);
    c.pointerDown(2, 0, 0);
    c.pointerMove(2, 0, -20000);
    c.pointerUp(2);
    expect(c.project({ x: 0, y: 1, z: 0 }).y).toBeGreaterThanOrEqual(0);
  });

  it('z 轴世界（图纸系）：五环轴测三元组吸附后严格无侧倾，拖拽后 Z 仍屏幕竖直', () => {
    const c = cam0({
      mode: 'turntable', upAxis: 'z',
      roll0: -1.053336, pitch0: 0.735843, yaw0: 0.867459, // RingsBench 实际机位
    });
    expect(c.project({ x: 0, y: 0, z: 1 }).x).toBeCloseTo(0, 12); // 吸附即无侧倾
    c.pointerDown(1, 0, 0);
    c.pointerMove(1, 77, 33);
    c.pointerUp(1);
    const up = c.project({ x: 0, y: 0, z: 1 });
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeLessThan(0); // Z 朝上 = 屏幕上方（y 负）
  });

  it('setOrientation 吸附：带侧倾的姿态被投到最近无侧倾姿态（预设 slerp 过渡路径）', () => {
    const rolled = cam0({ roll0: 0.3, pitch0: 0.5, yaw0: 0.7 }).matrix; // trackball 原样出带 roll 矩阵
    const c = cam0({ mode: 'turntable' });
    c.setOrientation(rolled);
    expect(c.project({ x: 0, y: 1, z: 0 }).x).toBeCloseTo(0, 12);
    // 无侧倾输入则落点精确：环绕/俯仰角还原
    const clean = cam0({ pitch0: 0.5, yaw0: 0.7 }).matrix;
    c.setOrientation(clean);
    for (let i = 0; i < 9; i++) expect(c.matrix[i]).toBeCloseTo(clean[i], 12);
  });
});

describe('bakeSkinned（TPU 连接件双骨蒙皮烘焙）', () => {
  const lin = (ax: number, b0: number, b1: number): number =>
    Math.min(1, Math.max(0, (ax - b0) / (b1 - b0)));

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
     '每顶点 w 沿 ax 线性（等曲率）', () => {
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
        expect(out[o + 6]).toBeCloseTo(lin(out[o], 5, 15), 12); // w 严格随顶点 ax
      }
      // 带内边 ax 跨度 ≤ 1/8 带宽（弯曲有网格可落）
      if (hi > 5 && lo < 15) expect(hi - lo).toBeLessThanOrEqual(10 / 8 + 1e-9);
    }
  });
});

describe('jointScrew（相对运动螺旋分解——截面刚性插值 = 等曲率弧）', () => {
  const applyScrew = (s: ScrewParams, p: readonly number[], w: number): number[] => {
    const ang = s.theta * w;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const k = s.axis;
    const d = [p[0] - s.cen[0], p[1] - s.cen[1], p[2] - s.cen[2]];
    const cr = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
    const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
    return [0, 1, 2].map(
      (i) => s.cen[i] + d[i] * c + cr[i] * sn + k[i] * (kd * (1 - c) + s.pitch * w),
    );
  };
  const frI: CellFrame = {
    o: { x: 0, y: 0, z: 0 },
    ux: 1, uy: 0, uz: 0, ex: 0, ey: 1, ez: 0, fx: 0, fy: 0, fz: 1,
  };

  it('静息（B = A 平移 dy）：恒等——连接件零形变', () => {
    const frB: CellFrame = { ...frI, o: { x: 10, y: 0, z: 0 } };
    const s = jointScrew(frI, frB, 10);
    expect(s.theta).toBe(0);
    expect(s.pitch).toBeCloseTo(0, 12);
    for (const w of [0, 0.5, 1]) {
      expect(applyScrew(s, [7, 2, -1], w)).toEqual([7, 2, -1]);
    }
  });

  it('弯转：w=1 精确重现骨 B 映射，w=0 恒等，中截面转角 = θ/2', () => {
    const phi = 0.5; // B 相对 A 绕 z 弯 0.5 rad
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const frB: CellFrame = {
      o: { x: 9.5, y: 2.0, z: 0.3 },
      ux: cp, uy: sp, uz: 0, ex: -sp, ey: cp, ez: 0, fx: 0, fy: 0, fz: 1,
    };
    const dy = 10;
    const s = jointScrew(frI, frB, dy);
    expect(s.theta).toBeCloseTo(phi, 12);
    expect([s.axis[0], s.axis[1]]).toEqual([0, 0]);
    expect(s.axis[2]).toBeCloseTo(1, 12);
    for (const p of [[12, 3, -2], [10, 0, 0], [8, -4, 5]] as const) {
      // 骨 B 期望：world = RB·(p − dy·x̂) + oB（frA = 恒等系 → world 即 A 局部）
      const bl = [p[0] - dy, p[1], p[2]];
      const want = [
        cp * bl[0] - sp * bl[1] + 9.5,
        sp * bl[0] + cp * bl[1] + 2.0,
        bl[2] + 0.3,
      ];
      const got1 = applyScrew(s, p, 1);
      got1.forEach((v, i) => expect(v).toBeCloseTo(want[i], 10));
      const got0 = applyScrew(s, p, 0);
      got0.forEach((v, i) => expect(v).toBeCloseTo(p[i], 12));
    }
  });

  it('纯平移（拉伸不弯）：θ=0，位移随 w 线性', () => {
    const frB: CellFrame = { ...frI, o: { x: 12, y: 1, z: 0 } };
    const s = jointScrew(frI, frB, 10);
    expect(s.theta).toBe(0);
    expect(s.pitch).toBeCloseTo(Math.hypot(2, 1), 12);
    const got = applyScrew(s, [5, 5, 5], 0.5);
    expect(got[0]).toBeCloseTo(6, 12);
    expect(got[1]).toBeCloseTo(5.5, 12);
    expect(got[2]).toBeCloseTo(5, 12);
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
