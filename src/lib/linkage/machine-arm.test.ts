import { describe, expect, it } from 'vitest';
import type { CellFrame } from './gl3d';
import { ARM_IDLE, armDir, armFrame, armPoint, armPolyline, idleContraction } from './machine-arm';
import { ARM_PLACEMENT } from './machine-shape';
import { STATIONS, TIES } from './tentacle3d-shape';

const [OX, OY, OZ] = ARM_PLACEMENT.origin;

describe('大触手落位（sim → 整机世界）', () => {
  it('原点落到实测落位上', () => {
    expect(armPoint({ x: 0, y: 0, z: 0 })).toEqual({ x: OX, y: OY, z: OZ });
  });

  it('沿臂（sim +y）映射到世界 −X：臂从机器伸出去', () => {
    const tip = armPoint({ x: 0, y: 100, z: 0 });
    expect(tip.x).toBeCloseTo(OX - 100, 9);
    expect(tip.y).toBeCloseTo(OY, 9);
    expect(tip.z).toBeCloseTo(OZ, 9);
  });

  it('sim x̂ → 世界 +Y、sim ŷ → 世界 −X、sim ẑ → 世界 +Z', () => {
    // 逐分量数值比较：armDir 的首项是 −y，y=0 时得 −0，深比较会判它 ≠ +0
    const near = (got: readonly number[], want: readonly number[]): void =>
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 12));
    near(armDir(1, 0, 0), [0, 1, 0]);
    near(armDir(0, 1, 0), [-1, 0, 0]);
    near(armDir(0, 0, 1), [0, 0, 1]);
  });

  it('是刚体变换：保长、保角、右手系（行列式 +1，法向不翻）', () => {
    const a = armDir(0.3, -0.5, 0.8);
    const b = armDir(-0.7, 0.2, 0.1);
    expect(Math.hypot(...a)).toBeCloseTo(Math.hypot(0.3, -0.5, 0.8), 12);
    // 点积保持
    const dotBefore = 0.3 * -0.7 + -0.5 * 0.2 + 0.8 * 0.1;
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(dotBefore, 12);
    // 行列式：三个基向量的像构成右手系
    const [e1, e2, e3] = [armDir(1, 0, 0), armDir(0, 1, 0), armDir(0, 0, 1)];
    const det =
      e1[0] * (e2[1] * e3[2] - e2[2] * e3[1]) -
      e1[1] * (e2[0] * e3[2] - e2[2] * e3[0]) +
      e1[2] * (e2[0] * e3[1] - e2[1] * e3[0]);
    expect(det).toBeCloseTo(1, 12);
  });

  it('两点距离不变（刚体的定义）', () => {
    const p = { x: 3, y: 40, z: -7 };
    const q = { x: -11, y: 95, z: 2 };
    const d0 = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    const P = armPoint(p);
    const Q = armPoint(q);
    expect(Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z)).toBeCloseTo(d0, 9);
  });
});

describe('刚架搬运', () => {
  const F: CellFrame = {
    o: { x: 1, y: 2, z: 3 },
    ux: 1, uy: 0, uz: 0,
    ex: 0, ey: 1, ez: 0,
    fx: 0, fy: 0, fz: 1,
  };

  it('原点按点变换、三列按方向变换', () => {
    const g = armFrame(F);
    expect(g.o).toEqual(armPoint(F.o));
    const near = (got: readonly number[], want: readonly number[]): void =>
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 12));
    near([g.ux, g.uy, g.uz], armDir(1, 0, 0));
    near([g.ex, g.ey, g.ez], armDir(0, 1, 0));
    near([g.fx, g.fy, g.fz], armDir(0, 0, 1));
  });

  it('搬运后仍是正交单位标架（否则网格会被拉歪）', () => {
    const g = armFrame({
      o: { x: 0, y: 0, z: 0 },
      ux: 0.6, uy: 0.8, uz: 0,
      ex: -0.8, ey: 0.6, ez: 0,
      fx: 0, fy: 0, fz: 1,
    });
    const cols = [
      [g.ux, g.uy, g.uz],
      [g.ex, g.ey, g.ez],
      [g.fx, g.fy, g.fz],
    ];
    for (const c of cols) expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 12);
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        expect(cols[a][0] * cols[b][0] + cols[a][1] * cols[b][1] + cols[a][2] * cols[b][2]).toBeCloseTo(0, 12);
      }
    }
  });

  it('局部点经刚架映射后 = 先算世界再搬运（两条路等价）', () => {
    const local = { x: 5, y: -3, z: 2 };
    const viaSim = armPoint({
      x: F.o.x + local.x * F.ux + local.y * F.ex + local.z * F.fx,
      y: F.o.y + local.x * F.uy + local.y * F.ey + local.z * F.fy,
      z: F.o.z + local.x * F.uz + local.y * F.ez + local.z * F.fz,
    });
    const g = armFrame(F);
    const viaWorld = {
      x: g.o.x + local.x * g.ux + local.y * g.ex + local.z * g.fx,
      y: g.o.y + local.x * g.uy + local.y * g.ey + local.z * g.fy,
      z: g.o.z + local.x * g.uz + local.y * g.ez + local.z * g.fz,
    };
    expect(viaWorld.x).toBeCloseTo(viaSim.x, 9);
    expect(viaWorld.y).toBeCloseTo(viaSim.y, 9);
    expect(viaWorld.z).toBeCloseTo(viaSim.z, 9);
  });
});

describe('落位参数的出处', () => {
  it('滚转实测≈0（生成期闸门 >6° 拒绝出表）', () => {
    expect(Math.abs(ARM_PLACEMENT.rollDeg)).toBeLessThan(6);
  });

  it('臂在世界里向 −X 伸出，长度与 STATIONS 跨度一致', () => {
    const base = armPoint({ x: 0, y: STATIONS[0][1], z: 0 });
    const tip = armPoint({ x: 0, y: STATIONS[STATIONS.length - 1][1], z: 0 });
    expect(tip.x).toBeLessThan(base.x);
    expect(base.x - tip.x).toBeCloseTo(STATIONS[STATIONS.length - 1][1] - STATIONS[0][1], 9);
  });

  it('梢端三绑线柱搬到世界后仍两两等距（120° 布置不被变换破坏）', () => {
    const w = armPolyline(TIES.map(([x, y, z]) => ({ x, y, z })));
    const d = [0, 1, 2].map((i) => {
      const a = w[i];
      const b = w[(i + 1) % 3];
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    });
    // 三根柱在 sim 里的两两距离
    const d0 = [0, 1, 2].map((i) => {
      const a = TIES[i];
      const b = TIES[(i + 1) % 3];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    });
    d.forEach((v, i) => expect(v).toBeCloseTo(d0[i], 9));
  });
});

describe('待机摆动（三腱交替轻收）', () => {
  const T = [...Array(400).keys()].map((i) => i * 0.19);

  it('收缩率恒在 [base, base+span] 内——肌腱只能拉不能推', () => {
    for (const t of T) {
      for (let k = 0; k < 3; k++) {
        const c = idleContraction(t, k);
        expect(c).toBeGreaterThanOrEqual(ARM_IDLE.base);
        expect(c).toBeLessThanOrEqual(ARM_IDLE.base + ARM_IDLE.span + 1e-12);
      }
    }
  });

  it('峰值必须越过松弛门槛（≥0.30），否则待机摆动对触手完全无效', () => {
    // 实测：单腱 c=0.22 的梢端侧移是 0.0mm——0.28 以下拉的全是空行程。
    // 首版峰值 0.22 就栽在这里，看着「设了参数」其实什么也没发生。
    expect(ARM_IDLE.base + ARM_IDLE.span).toBeGreaterThanOrEqual(0.3);
  });

  it('任意时刻至少一根停在基线（三个 120° 余弦恒和为零，不可能同时为正）', () => {
    for (const t of T) {
      const atBase = [0, 1, 2].filter((k) => idleContraction(t, k) === ARM_IDLE.base).length;
      expect(atBase).toBeGreaterThanOrEqual(1);
    }
  });

  it('三根互为 120° 相位——各自的峰值时刻按 1/3 周期错开', () => {
    const period = (2 * Math.PI) / ARM_IDLE.sway;
    const peak = (k: number): number => {
      let best = 0;
      let bestV = -1;
      for (let i = 0; i < 4000; i++) {
        const t = (i / 4000) * period;
        // 只看方向项，避开基线与慢速舒卷调制对峰值时刻的微扰
        const v = Math.cos(ARM_IDLE.sway * t - (2 * Math.PI * k) / 3);
        if (v > bestV) {
          bestV = v;
          best = t;
        }
      }
      return best;
    };
    const gap = ((peak(1) - peak(0) + period) % period) / period;
    expect(gap).toBeCloseTo(1 / 3, 2);
  });

  it('合成弯向在转圈：三腱按 120° 方位加权求和，方位角单调推进且幅值不塌', () => {
    // 腱 k 的方位（截面内）= 120°·k；合成向量 = Σ c_k · (cos φ_k, sin φ_k)
    // 基线三向恒和为零，对合成向量无贡献——弯向完全由差动给，这正是分成
    // base + span 两项的意义。
    const vec = (t: number): [number, number] => {
      let x = 0;
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const c = idleContraction(t, k);
        const phi = (2 * Math.PI * k) / 3;
        x += c * Math.cos(phi);
        y += c * Math.sin(phi);
      }
      return [x, y];
    };
    const period = (2 * Math.PI) / ARM_IDLE.sway;
    let prev = Math.atan2(...(vec(0).reverse() as [number, number]));
    let turned = 0;
    let minMag = Infinity;
    for (let i = 1; i <= 720; i++) {
      const t = (i / 720) * period;
      const [x, y] = vec(t);
      minMag = Math.min(minMag, Math.hypot(x, y));
      const a = Math.atan2(y, x);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      turned += d;
      prev = a;
    }
    // 一个 sway 周期正好转一整圈
    expect(Math.abs(turned)).toBeCloseTo(2 * Math.PI, 1);
    // 幅值不塌到零（否则回转到某些方位时臂会「泄气」）
    expect(minMag).toBeGreaterThan(0.4 * ARM_IDLE.span);
  });

  it('幅度克制：峰值收缩低于 J 形卷曲（0.5）——要的是有生气，不是表演卷曲', () => {
    for (const t of T) {
      for (let k = 0; k < 3; k++) expect(idleContraction(t, k)).toBeLessThan(0.5);
    }
  });

  it('两个周期不可约：长时间不重复（sway 与 curl 之比非简单整数比）', () => {
    const ratio = ARM_IDLE.sway / ARM_IDLE.curl;
    for (const q of [1, 1.5, 2, 2.5, 3]) expect(Math.abs(ratio - q)).toBeGreaterThan(0.1);
  });
});
