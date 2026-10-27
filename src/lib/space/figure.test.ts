import { describe, expect, it } from 'vitest';
import {
  CAT_COATS,
  CAT_HEAD_YAW_MAX,
  HEAD_YAW_MAX,
  HUMAN,
  HUMAN_STYLE_DEFAULT,
  catMesh,
  catParts,
  catRig,
  catSkeleton,
  clampHeadYaw,
  defaultSeat,
  figureBox,
  figureMesh,
  figureParts,
  humanRig,
  humanSkeleton,
  styleKey,
  type CatCoat,
  type CatPose,
  type FigureSpec,
  type HumanStyle,
  type SeatSpec,
} from './figure';
import { COATS, OUTFITS } from '../../../components/lab/figurePalette';
import { partBox, signedVolume, type PartMesh, type V3 } from './mesh-shell';

/**
 * 守门：人与猫的比例模型（2026-10-25 重做，作者「确保建模的正确性不要出现建模错误」；同日两者都改方块风）。
 * 旧版的错都不报错、只是看着「差不多」：后脚脚尖朝后、坐着的小腿插进座面、块与块共面闪烁、猫穿杆。
 * 这里把「正确」写成能算的条件：
 *   ① 每个零件是闭合、绕向一致、法向朝外的长方体；任何两个零件没有同朝向又共面重叠的面（不闪）；
 *   ② 身高与关节高度对得上人体测量表，骨长与零件尺寸在所有姿态下不变；
 *   ③ 着地：最低点恰好在地面、没有东西在地面以下，走路时支撑脚着地、摆动脚不蹭地；④ 脚尖永远朝前；
 *   ⑤ 坐着大腿平放在座面上、脚尖点地、不插进座面与靠背；⑥ 头转有上限；⑦ 猫是家猫的尺寸、着地、零件不变。
 * 环形平台上的猫不碰杆、坐着的人不插进家具，在 cohabit-solid.test.ts 里按 Lab 2-15 的实际尺寸卡。
 */
const H = 215;
const BASE: FigureSpec = { x: 0, z: 0, footY: 473, height: H };
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const WALK = Array.from({ length: 24 }, (_, k) => k / 24);

/** 每个壳：每条有向边恰好一次、它的反向边也恰好一次（闭合、无缝、绕向一致）；有向体积 > 0（朝外）；没有 NaN */
function expectSound(m: PartMesh, label: string): void {
  for (const v of m.verts) expect(Number.isFinite(v), `${label} 有 NaN`).toBe(true);
  for (const s of m.shells) {
    const edges = new Map<string, number>();
    for (let i = s.i0; i < s.i1; i += 3)
      for (let k = 0; k < 3; k++) {
        const key = `${m.idx[i + k]},${m.idx[i + ((k + 1) % 3)]}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    for (const [key, n] of edges) {
      const [a, b] = key.split(',');
      expect(n, `${label}/${s.name} 边 ${key} 用了 ${n} 次`).toBe(1);
      expect(edges.get(`${b},${a}`), `${label}/${s.name} 边 ${key} 没有反向边（有缝或绕向不一致）`).toBe(1);
    }
    expect(signedVolume(m.verts, m.idx, s), `${label}/${s.name} 体积不为正（法向朝里）`).toBeGreaterThan(0);
    for (let v = s.v0; v < s.v1; v++) expect(m.idx.slice(s.i0, s.i1).includes(v), `${label}/${s.name} 有孤立顶点`).toBe(true);
  }
}

/** 某个壳在世界 y（向下为正）上的最低点（= 最大 y） */
function lowest(m: PartMesh, name: string): number {
  const s = m.shells.find((q) => q.name === name);
  if (!s) throw new Error(`没有壳 ${name}`);
  let y = -Infinity;
  for (let v = s.v0; v < s.v1; v++) y = Math.max(y, m.verts[v * 3 + 1]);
  return y;
}

function shellVerts(m: PartMesh, prefix: string): V3[] {
  const out: V3[] = [];
  for (const s of m.shells) if (s.name.startsWith(prefix)) for (let v = s.v0; v < s.v1; v++) out.push([m.verts[v * 3], m.verts[v * 3 + 1], m.verts[v * 3 + 2]]);
  return out;
}

/** 每个零件的「尺寸指纹」：八个角两两距离排序——零件只摆不缩放时它不变 */
function sizeSig(m: PartMesh): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of m.shells) {
    const vs: V3[] = [];
    for (let v = s.v0; v < s.v1; v++) vs.push([m.verts[v * 3], m.verts[v * 3 + 1], m.verts[v * 3 + 2]]);
    const d: number[] = [];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) d.push(dist(vs[i], vs[j]));
    out.set(s.name, d.sort((a, b) => a - b));
  }
  return out;
}
function expectSameSizes(ref: PartMesh, variants: { label: string; m: PartMesh }[]): void {
  const r = sizeSig(ref);
  expect(r.size).toBeGreaterThan(15);
  for (const { label, m } of variants)
    for (const [name, d] of sizeSig(m)) {
      const r0 = r.get(name);
      expect(r0, `${label} 多出零件 ${name}`).toBeDefined();
      d.forEach((x, i) => expect(x, `${label} ${name} 变了尺寸`).toBeCloseTo(r0![i], 4)); // 世界坐标是 float32
    }
}

/**
 * 两个不同的壳里，有没有「同朝向、同一平面、又互相重叠」的三角——有就会 z 冲突闪烁（旧模型小腿与脚之间就是这样）。
 * 朝向相反的重合面（两块零件正好贴着）在零件内部、看不见，不算。返回出问题的壳对。
 */
function coplanarClashes(m: PartMesh): string[] {
  type Tri = { s: string; p: V3[]; n: V3; lo: V3; hi: V3 };
  const tris: Tri[] = [];
  const V = (i: number): V3 => [m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]];
  for (const sh of m.shells)
    for (let i = sh.i0; i < sh.i1; i += 3) {
      const p = [V(m.idx[i]), V(m.idx[i + 1]), V(m.idx[i + 2])];
      const u: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const v: V3 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const c: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...c);
      if (l < 1e-12) continue;
      tris.push({ s: sh.name, p, n: [c[0] / l, c[1] / l, c[2] / l], lo: [0, 1, 2].map((k) => Math.min(...p.map((q) => q[k]))) as unknown as V3, hi: [0, 1, 2].map((k) => Math.max(...p.map((q) => q[k]))) as unknown as V3 });
    }
  /** 凸多边形裁剪（二维）后的面积 */
  const clipArea = (subj: [number, number][], clip: [number, number][]): number => {
    let out = subj;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length];
      const side = (q: [number, number]): number => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      const inp = out;
      out = [];
      for (let k = 0; k < inp.length; k++) {
        const P = inp[k], Q = inp[(k + 1) % inp.length];
        const sp = side(P), sq = side(Q);
        if (sp >= 0) out.push(P);
        if (sp * sq < 0) {
          const t = sp / (sp - sq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
      }
    }
    let A = 0;
    for (let k = 0; k < out.length; k++) A += out[k][0] * out[(k + 1) % out.length][1] - out[(k + 1) % out.length][0] * out[k][1];
    return Math.abs(A) / 2;
  };
  // 贴在支撑面上（地面 / 台面）、朝下的面是接触面：永远被支撑面挡住，不算
  const ground = Math.max(...tris.flatMap((t) => t.p.map((q) => q[1])));
  const onGround = (t: Tri): boolean => t.n[1] > 1 - 1e-9 && t.p.every((q) => Math.abs(q[1] - ground) < 1e-9);
  // 只有法向几乎相同的三角才可能同朝向共面：按法向分桶（每分量取到 1e-3），只比同桶与相邻桶——
  // 判据「点积 ≥ 1 − 1e-7」要求各分量相差 < 4.5e-4，一定落在相邻桶以内，筛掉的都是不可能出问题的对
  const bucketOf = (n: V3): number[] => n.map((q) => Math.round(q * 1000));
  const buckets = new Map<string, number[]>();
  tris.forEach((t, i) => {
    const k = bucketOf(t.n).join(',');
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  });
  const bad = new Set<string>();
  for (let i = 0; i < tris.length; i++) {
    const [bx, by, bz] = bucketOf(tris[i].n);
    const near: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of buckets.get(`${bx + dx},${by + dy},${bz + dz}`) ?? []) if (j > i) near.push(j);
    for (const j of near) {
      const A = tris[i], B = tris[j];
      if (A.s === B.s || (onGround(A) && onGround(B))) continue;
      if (A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2] < 1 - 1e-7) continue;
      if ([0, 1, 2].some((k) => A.hi[k] < B.lo[k] - 1e-9 || B.hi[k] < A.lo[k] - 1e-9)) continue;
      const d = (q: V3): number => A.n[0] * (q[0] - A.p[0][0]) + A.n[1] * (q[1] - A.p[0][1]) + A.n[2] * (q[2] - A.p[0][2]);
      if (B.p.some((q) => Math.abs(d(q)) > 1e-7)) continue;
      // 同一平面：投到面内二维坐标，看两三角形重叠的面积
      const e0 = [A.p[1][0] - A.p[0][0], A.p[1][1] - A.p[0][1], A.p[1][2] - A.p[0][2]];
      const el = Math.hypot(...e0);
      const ux: V3 = [e0[0] / el, e0[1] / el, e0[2] / el];
      const vy: V3 = [A.n[1] * ux[2] - A.n[2] * ux[1], A.n[2] * ux[0] - A.n[0] * ux[2], A.n[0] * ux[1] - A.n[1] * ux[0]];
      const to2 = (q: V3): [number, number] => [ux[0] * q[0] + ux[1] * q[1] + ux[2] * q[2], vy[0] * q[0] + vy[1] * q[1] + vy[2] * q[2]];
      const ccw = (t: [number, number][]): [number, number][] => ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) < 0 ? [t[0], t[2], t[1]] : t);
      if (clipArea(ccw(B.p.map(to2)), ccw(A.p.map(to2))) > 1e-9) bad.add(`${A.s} × ${B.s}`);
    }
  }
  return [...bad];
}


describe('人 · 方块比例模型', () => {
  const variants = (): { label: string; spec: FigureSpec }[] => [
    { label: 'stand', spec: BASE },
    ...WALK.filter((_, i) => i % 3 === 0).map((p) => ({ label: `walk ${p}`, spec: { ...BASE, pose: 'walk' as const, phase: p } })),
    { label: 'sit', spec: { ...BASE, pose: 'sit' } },
    { label: 'sit lean', spec: { ...BASE, pose: 'sit', lean: true } },
    { label: 'head turned', spec: { ...BASE, headYaw: 1 } },
  ];

  it('每个零件都是闭合、朝外的长方体（含头发、眼睛、高光），站 / 走 / 坐直 / 前倾坐 / 转头', () => {
    for (const { label, spec } of variants()) expectSound(figureMesh(spec), label);
    for (const p of WALK) expectSound(figureMesh({ ...BASE, pose: 'walk', phase: p }), `walk ${p}`);
  });

  it('不闪：任何两个零件都没有同朝向又落在同一平面上互相重叠的面', () => {
    for (const { label, spec } of variants()) expect(coplanarClashes(figureMesh({ ...spec, footY: 0, height: 1.7 })), label).toEqual([]);
  });

  it('分色零件凑起来就是整个人：衣、裤、鞋、肤、发、眼睛、高光各一组', () => {
    const parts = figureParts(BASE);
    expect(new Set(parts.map((p) => p.tone))).toEqual(new Set(['skin', 'hair', 'shirt', 'pants', 'shoe', 'eye', 'shine']));
    const total = parts.reduce((n, p) => n + p.mesh.shells.length, 0);
    expect(total).toBe(figureMesh(BASE).shells.length);
  });

  it('身高精确：站着发顶 = 给定身高，鞋底恰好在地面上（三种身高）', () => {
    for (const h of [120, 215, 400]) {
      const b = figureBox({ ...BASE, height: h });
      expect(b.y1).toBeCloseTo(BASE.footY, 6); // 世界 Y 向下为正 ⇒ 脚是最大 y
      expect(b.y0).toBeCloseTo(BASE.footY - h, 6);
    }
  });

  it('关节高度对得上 Drillis & Contini 1966（站姿；占身高）', () => {
    const sk = humanSkeleton('stand');
    for (const L of sk.legs) {
      expect(L.hip[1]).toBeCloseTo(HUMAN.HIP, 2);
      expect(L.knee[1]).toBeCloseTo(HUMAN.KNEE, 2);
      expect(L.ankle[1]).toBeCloseTo(HUMAN.ANKLE, 9);
    }
    for (const A of sk.arms) {
      expect(Math.abs(A.shoulder[1] - HUMAN.SHOULDER)).toBeLessThan(0.02); // 盂肱关节比肩峰低一点
      expect(Math.abs(A.elbow[1] - HUMAN.ELBOW)).toBeLessThan(0.02);
      expect(Math.abs(A.wrist[1] - HUMAN.WRIST)).toBeLessThan(0.03);
    }
  });

  it('骨长在所有姿态下一个数不变（换姿态只转关节，不拉长缩短肢体）', () => {
    const poses = [humanSkeleton('stand'), ...WALK.map((p) => humanSkeleton('walk', { phase: p })), humanSkeleton('sit'), humanSkeleton('sit', { lean: true })];
    for (const sk of poses) {
      for (const L of sk.legs) {
        expect(dist(L.hip, L.knee)).toBeCloseTo(HUMAN.THIGH, 9);
        expect(dist(L.knee, L.ankle)).toBeCloseTo(HUMAN.SHANK, 9);
      }
      for (const A of sk.arms) {
        expect(dist(A.shoulder, A.elbow)).toBeCloseTo(HUMAN.UPPER_ARM, 9);
        expect(dist(A.elbow, A.wrist)).toBeCloseTo(HUMAN.FOREARM, 9);
      }
    }
  });

  it('零件尺寸在所有姿态下一个数不变（只摆、不缩放）', () => {
    expectSameSizes(
      figureMesh(BASE),
      variants().map(({ label, spec }) => ({ label, m: figureMesh(spec) })),
    );
  });

  it('脚尖永远朝前：走一周每一格、站、坐，两只鞋都是鞋尖在踝前、鞋跟在踝后（旧模型的后脚是反的）', () => {
    const cases: [string, FigureSpec, ReturnType<typeof humanSkeleton>][] = [
      ['stand', BASE, humanSkeleton('stand')],
      ['sit', { ...BASE, pose: 'sit' }, humanSkeleton('sit')],
      ...WALK.map((p): [string, FigureSpec, ReturnType<typeof humanSkeleton>] => [`walk ${p}`, { ...BASE, pose: 'walk', phase: p }, humanSkeleton('walk', { phase: p })]),
    ];
    for (const [label, spec, sk] of cases) {
      const m = figureMesh(spec);
      sk.legs.forEach((L, i) => {
        const vs = shellVerts(m, i === 0 ? 'shoe-l' : 'shoe-r');
        const ank: V3 = [L.ankle[0] * H, spec.footY - L.ankle[1] * H, L.ankle[2] * H];
        const az = ank[2];
        // 鞋上离踝最远的那一点是鞋尖（踝前 0.107H，鞋跟只在踝后 0.045H）：它必须在踝的前方。
        // 离地前一刻脚几乎竖着（脚尖朝下），前后投影只剩一点，故只要求在前 0.01H 以上；脚反了会是 −0.1H 左右
        const toe = vs.reduce((p, q) => (dist(q, ank) > dist(p, ank) ? q : p));
        expect((toe[2] - az) / H, `${label} 脚 ${i} 脚尖不在前（脚反了）`).toBeGreaterThan(0.01);
        expect(Math.min(...vs.map((v) => v[2] - az)) / H, `${label} 脚 ${i} 脚跟不在后`).toBeLessThan(-0.01);
      });
    }
  });

  it('走一周：最低点恰好在地面、地面以下什么都没有；单支撑期那只脚着地，摆动脚离地（不蹭地）', () => {
    for (const p of WALK) {
      const r = humanRig({ height: 1, pose: 'walk', phase: p });
      const b = partBox(r.body);
      expect(b.y1, `phase ${p} 有东西在地面以下或悬空`).toBeCloseTo(0, 9);
      for (const [name, off] of [['shoe-l', 0], ['shoe-r', 0.5]] as const) {
        const q = (((p + off) % 1) + 1) % 1;
        const gap = -lowest(r.body, name);
        if (q >= 0.14 && q <= 0.48) expect(gap, `phase ${p} ${name} 单支撑却没着地`).toBeCloseTo(0, 9);
        if (q >= 0.66 && q <= 0.94) expect(gap, `phase ${p} ${name} 摆动时蹭地`).toBeGreaterThan(0.003);
        expect(gap, `phase ${p} ${name} 落地时离地太高`).toBeLessThan(0.03);
      }
    }
  });

  it('头随视线转但有上限 ±75°；转头只绕颈上的枢轴，身子一点不动、身高不变', () => {
    expect(clampHeadYaw(2)).toBeCloseTo(HEAD_YAW_MAX, 12);
    expect(clampHeadYaw(-2)).toBeCloseTo(-HEAD_YAW_MAX, 12);
    expect(clampHeadYaw(2 * Math.PI + 0.3)).toBeCloseTo(0.3, 12); // 绕过一圈的角先折回
    const a = figureMesh(BASE);
    const b = figureMesh({ ...BASE, headYaw: 1.2 });
    expect(Array.from(shellVerts(b, 'chest').flat())).toEqual(Array.from(shellVerts(a, 'chest').flat()));
    expect(partBox(b).y0).toBeCloseTo(partBox(a).y0, 6);
    // 转过去的是脸：两只眼睛的中点从 +Z 正前方转向 −X 一侧（yaw 约定同 rotateVertsY）
    const eyes = (m: PartMesh): number => {
      const vs = shellVerts(m, 'eye-');
      return vs.reduce((s, v) => s + v[0], 0) / vs.length;
    };
    expect(eyes(a)).toBeCloseTo(0, 6);
    expect(eyes(b)).toBeLessThan(-0.03 * H);
  });

  const seats: [string, SeatSpec][] = [
    ['沙发', defaultSeat(H)],
    // 椅子：进深 0.75、座位点在前缘后 0.525、靠背前 0.125（cohabit COHABIT.SEATS.KINDS.chair）
    ['椅子', { ...defaultSeat(H), front: (0.525 / 1.7) * H, back: (0.125 / 1.7) * H }],
  ];
  for (const [kind, seat] of seats)
    for (const lean of [false, true])
      it(`坐（${kind}${lean ? '，前倾看猫' : '，坐直'}）：大腿平放在座面上、鞋尖正好点地、没有一处插进座面板或靠背`, () => {
        const m = figureMesh({ ...BASE, footY: 0, pose: 'sit', seat, lean });
        expectSound(m, `sit ${kind}`);
        const top = seat.top, bot = seat.top - seat.thick;
        const tol = 1e-6 * H;
        for (let k = 0; k < m.verts.length; k += 3) {
          const y = -m.verts[k + 1], z = m.verts[k + 2];
          const inSlab = z > -seat.back + tol && z < seat.front - tol && y < top - tol && y > bot + tol;
          expect(inSlab, `${kind} 有顶点插进座面板 (z ${(z / H).toFixed(3)}, y ${(y / H).toFixed(3)})`).toBe(false);
          const inBack = z < -seat.back - tol && y < seat.backTop - tol;
          expect(inBack, `${kind} 有顶点插进靠背`).toBe(false);
        }
        // 坐在座面上：大腿块的下面就是座面顶（不悬空、不下陷）
        for (const t of ['thigh-l', 'thigh-r']) expect(-lowest(m, t) / H).toBeCloseTo(top / H, 6);
        // 鞋尖点地：最低点恰好是地面
        expect(lowest(m, 'shoe-l')).toBeCloseTo(0, 6);
        expect(lowest(m, 'shoe-r')).toBeCloseTo(0, 6);
      });

  it('横向身量在人的范围里（布景取景与「人不撞环」守门用 figureBox）', () => {
    const b = figureBox(BASE);
    const w = (b.x1 - b.x0) / H;
    const d = (b.z1 - b.z0) / H;
    expect(w).toBeGreaterThan(0.26); // 肩宽 0.259H，方块手臂贴在胸块外侧
    expect(w).toBeLessThan(0.36);
    expect(d).toBeGreaterThan(0.15); // 足长 0.152H 起
    expect(d).toBeLessThan(0.3);
  });

  it('站位与朝向：平移到位、转向只转不缩', () => {
    const at0 = figureBox(BASE);
    const moved = figureBox({ ...BASE, x: 300, z: -120 });
    expect(moved.x0 - at0.x0).toBeCloseTo(300, 4);
    expect(moved.z0 - at0.z0).toBeCloseTo(-120, 4);
    const turned = figureBox({ ...BASE, yaw: Math.PI / 2 });
    expect(turned.x1 - turned.x0).toBeCloseTo(at0.z1 - at0.z0, 3);
    expect(turned.z1 - turned.z0).toBeCloseTo(at0.x1 - at0.x0, 3);
    expect(turned.y1 - turned.y0).toBeCloseTo(H, 6);
  });
});

describe('人 · 穿着（2026-10-27 作者「看得出他们穿不同的衣服」）', () => {
  /** 每一个选项至少出现一次：台架那十二套 + 几套把衣片叠到最满的组合 */
  const STYLES: { label: string; style: HumanStyle }[] = [
    ...OUTFITS.map((o) => ({ label: o.name, style: o.style })),
    { label: '条纹长袖 · 短裤 · 白袜 · 丸子头 · 眼镜 · 双肩包', style: { top: 'long', stripes: true, bottom: 'shorts', socks: true, hair: 'bun', glasses: true, backpack: true } },
    { label: '卫衣 · 裙 · 长发 · 棒球帽 · 双肩包', style: { top: 'hoodie', bottom: 'skirt', hair: 'long', hat: 'cap', backpack: true } },
    { label: '外套 · 短裤 · 马尾 · 毛线帽 · 眼镜 · 双肩包', style: { top: 'jacket', bottom: 'shorts', socks: true, hair: 'ponytail', hat: 'beanie', glasses: true, backpack: true } },
  ];
  const poses = (style: HumanStyle): { label: string; spec: FigureSpec }[] => [
    { label: 'stand', spec: { ...BASE, style } },
    ...[0, 0.25, 0.5, 0.75, 0.875].map((p) => ({ label: `walk ${p}`, spec: { ...BASE, pose: 'walk' as const, phase: p, style } })),
    { label: 'sit', spec: { ...BASE, pose: 'sit', style } },
    { label: 'sit lean', spec: { ...BASE, pose: 'sit', lean: true, style } },
    { label: 'head turned', spec: { ...BASE, headYaw: 1.2, style } },
  ];

  it('默认穿着 = 2026-10-25 那个人，逐位不变（布景里的小人不受影响）；十二套的几何各不相同', () => {
    const a = figureMesh(BASE);
    for (const style of [{}, { ...HUMAN_STYLE_DEFAULT }]) {
      const b = figureMesh({ ...BASE, style });
      expect(Array.from(b.verts)).toEqual(Array.from(a.verts));
      expect(b.shells.map((q) => q.name)).toEqual(a.shells.map((q) => q.name));
    }
    expect(styleKey(OUTFITS[0].style)).toBe(styleKey(undefined));
    expect(new Set(OUTFITS.map((o) => styleKey(o.style))).size).toBe(OUTFITS.length);
  });

  for (const { label, style } of STYLES)
    describe(label, () => {
      it('每个零件（含衣片、帽、包、眼镜）都是闭合、朝外的长方体；不闪：没有同朝向共面又重叠的面', () => {
        for (const v of poses(style)) {
          expectSound(figureMesh(v.spec), v.label);
          expect(coplanarClashes(figureMesh({ ...v.spec, footY: 0, height: 1.7 })), v.label).toEqual([]);
        }
      });

      it('零件尺寸在站 / 走 / 转头之间、坐直 / 前倾之间一个数不变；坐下时只少了双肩包、裙摆换成平铺在腿上的一片', () => {
        const ps = poses(style);
        const stand = ps.filter((v) => v.spec.pose !== 'sit');
        const sit = ps.filter((v) => v.spec.pose === 'sit');
        // 放在原点附近量（离原点 400 个单位时 float32 的末位误差就有 6e-5，薄的衣片量不准）
        const at0 = (spec: FigureSpec): PartMesh => figureMesh({ ...spec, footY: 0 });
        expectSameSizes(at0(stand[0].spec), stand.map((v) => ({ label: v.label, m: at0(v.spec) })));
        expectSameSizes(at0(sit[0].spec), sit.map((v) => ({ label: v.label, m: at0(v.spec) })));
        const names = (m: PartMesh): Set<string> => new Set(m.shells.map((q) => q.name));
        const a = names(figureMesh(stand[0].spec)), b = names(figureMesh(sit[0].spec));
        const onlyStand = [...a].filter((n) => !b.has(n)).sort();
        const onlySit = [...b].filter((n) => !a.has(n)).sort();
        for (const n of onlyStand) expect(n.startsWith('pack') || n.startsWith('strap') || n === 'skirt-hem', `站着才有 ${n}`).toBe(true);
        expect(onlySit, '坐着才有').toEqual(style.bottom === 'skirt' ? ['skirt-lap'] : []);
      });

      it('站着、走一周：最低点恰好在地面、地面以下什么都没有（衣片不拖地）；头顶不超过身高 + 5 cm（帽子、丸子头）', () => {
        for (const v of poses(style).filter((q) => q.spec.pose !== 'sit')) {
          const b = figureBox(v.spec);
          expect(b.y1, v.label).toBeCloseTo(BASE.footY, 6);
          expect((BASE.footY - b.y0) / H, v.label).toBeLessThan(1 + 0.05 / 1.7);
        }
      });

      for (const [kind, seat] of [
        ['沙发', defaultSeat(H)],
        ['椅子', { ...defaultSeat(H), front: (0.525 / 1.7) * H, back: (0.125 / 1.7) * H }],
      ] as [string, SeatSpec][])
        it(`坐（${kind}）：坐直与前倾都没有一处插进座面板或靠背（含裙摆、外套下摆、卫衣帽子），鞋尖点地`, () => {
          for (const lean of [false, true]) {
            const m = figureMesh({ ...BASE, footY: 0, pose: 'sit', seat, lean, style });
            const top = seat.top, bot = seat.top - seat.thick;
            const tol = 1e-6 * H;
            for (let k = 0; k < m.verts.length; k += 3) {
              const y = -m.verts[k + 1], z = m.verts[k + 2];
              expect(z > -seat.back + tol && z < seat.front - tol && y < top - tol && y > bot + tol, `${kind} 插进座面板`).toBe(false);
              expect(z < -seat.back - tol && y < seat.backTop - tol, `${kind} 插进靠背`).toBe(false);
            }
            for (const t of ['thigh-l', 'thigh-r']) expect(-lowest(m, t) / H).toBeCloseTo(top / H, 6);
            expect(lowest(m, 'shoe-l')).toBeCloseTo(0, 6);
          }
        });
    });

  it('各套穿着的颜色类别：短袖前臂露肤、外套露出内搭、裙子与短裤小腿露肤、帽子 / 包 / 镜框只在戴的时候出现', () => {
    const tonesOf = (style: HumanStyle, pose: 'stand' | 'sit' = 'stand'): Map<string, string> => {
      const out = new Map<string, string>();
      for (const p of figureParts({ ...BASE, pose, style })) for (const q of p.mesh.shells) out.set(q.name, p.tone);
      return out;
    };
    expect(tonesOf({ top: 'tee' }).get('forearm-l')).toBe('skin');
    expect(tonesOf({ top: 'long' }).get('forearm-l')).toBe('shirt');
    const j = tonesOf({ top: 'jacket' });
    expect(j.get('chest')).toBe('inner');
    expect(j.get('jacket-l')).toBe('shirt');
    for (const b of ['shorts', 'skirt'] as const) expect(tonesOf({ bottom: b }).get('shin-l'), b).toBe('skin');
    expect(tonesOf({ bottom: 'skirt' }).get('thigh-l')).toBe('skin');
    expect(tonesOf({ bottom: 'shorts' }).get('thigh-l')).toBe('pants');
    const plain = new Set(tonesOf({}).values());
    for (const t of ['hat', 'bag', 'frame', 'inner', 'sock']) expect(plain.has(t), t).toBe(false);
    expect(new Set(tonesOf({ hat: 'cap', backpack: true, glasses: true }).values())).toEqual(new Set([...plain, 'hat', 'bag', 'frame']));
    expect(tonesOf({ backpack: true }, 'sit').has('pack')).toBe(false);
  });
});

describe('猫 · 方块比例模型', () => {
  const POSES: CatPose[] = ['stand', 'walk', 'sit', 'lie', 'curl'];
  const R = 0.1425; // Lab 2-15 环形平台的猫身中线半径（芯外缘 0.063 与平台外缘 0.222 的中点）
  const variants = (coat: CatCoat): { label: string; spec: Parameters<typeof catMesh>[0] }[] => [
    ...POSES.map((pose) => ({ label: pose, spec: { x: 0, z: 0, footY: 0, unit: 1, pose, coat } })),
    ...Array.from({ length: 8 }, (_, k) => ({ label: `walk ${k}/8`, spec: { x: 0, z: 0, footY: 0, unit: 1, pose: 'walk' as const, phase: k / 8, tail: 'up' as const, coat } })),
    ...(['sit', 'curl', 'walk', 'lie'] as const).map((pose) => ({ label: `${pose} 绕杆`, spec: { x: 0, z: 0, footY: 0, unit: 1, pose, bend: R, headYaw: -0.6, coat } })),
    { label: '转头', spec: { x: 0, z: 0, footY: 0, unit: 1, pose: 'sit', headYaw: 1.2, coat } },
  ];
  const PAWS = ['paw-fl', 'paw-fr', 'paw-hl', 'paw-hr'];

  it('七种花色都在、台架的配色表一种不缺', () => {
    expect([...CAT_COATS].sort()).toEqual(['black', 'calico', 'cow', 'ginger', 'tabby', 'tuxedo', 'white']);
    expect(COATS.map((c) => c.coat).sort()).toEqual([...CAT_COATS].sort());
  });

  for (const coat of CAT_COATS) {
    describe(coat, () => {
      it('每个零件都是闭合、朝外的长方体（含花纹、爪子、眼睛、高光、鼻头），五种姿态、走一周、绕杆、转头', () => {
        for (const { label, spec } of variants(coat)) expectSound(catMesh(spec), label);
      });

      it('不闪：任何两个零件（含花纹块）都没有同朝向又落在同一平面上互相重叠的面（各姿态、绕杆、转头）', () => {
        for (const { label, spec } of variants(coat)) expect(coplanarClashes(catMesh(spec)), label).toEqual([]);
      });

      it('零件（含花纹块）在所有姿态下尺寸一个数不变（只摆、不缩放、不拉长）', () => {
        expectSameSizes(catMesh(variants(coat)[0].spec), variants(coat).map(({ label, spec }) => ({ label, m: catMesh(spec) })));
      });

      it('着地：每种姿态最低点恰好在脚下的面上；站着四只爪都踩地；走一周任何时刻至少两只爪着地', () => {
        for (const { label, spec } of variants(coat)) expect(partBox(catMesh(spec)).y1, label).toBeCloseTo(0, 9);
        const stand = catRig({ unit: 1, pose: 'stand', coat }).body;
        for (const l of PAWS) expect(lowest(stand, l), l).toBeCloseTo(0, 9);
        for (let k = 0; k < 16; k++) {
          const m = catRig({ unit: 1, pose: 'walk', phase: k / 16, coat }).body;
          expect(PAWS.filter((l) => -lowest(m, l) < 0.001).length, `walk ${k}`).toBeGreaterThanOrEqual(2);
        }
      });

      it('花纹贴着身子：每块花纹离它所贴零件的表面不到 3 mm（不飘、不缩进去看不见），绕杆时跟着零件一起转', () => {
        for (const spec of [{ x: 0, z: 0, footY: 0, unit: 1, pose: 'stand' as const, coat }, { x: 0, z: 0, footY: 0, unit: 1, pose: 'curl' as const, bend: R, coat }]) {
          const m = catMesh(spec);
          const marks = m.shells.filter((q) => q.name.startsWith('mark-') && !q.name.startsWith('mark-head'));
          for (const mk of marks) {
            const on = mk.name.replace(/^mark-/, '').replace(/-\d+$/, '');
            const pv = shellVerts(m, on).filter((_, i, a) => a.findIndex((q) => dist(q, a[i]) < 1e-12) === i);
            const mv = shellVerts(m, mk.name);
            // 花纹块的每个角：要么在父件里面，要么离父件的包围（同一组轴）不到 3 mm——绕杆后父件斜了，用父件自己的轴量
            const c = pv.reduce((a, q) => [a[0] + q[0] / pv.length, a[1] + q[1] / pv.length, a[2] + q[2] / pv.length] as V3, [0, 0, 0] as V3);
            const axes = [pv[1], pv[2], pv[4]].map((q) => [q[0] - pv[0][0], q[1] - pv[0][1], q[2] - pv[0][2]] as V3);
            for (const v of mv)
              for (const a of axes) {
                const L = Math.hypot(...a);
                const u = [a[0] / L, a[1] / L, a[2] / L];
                const d = Math.abs((v[0] - c[0]) * u[0] + (v[1] - c[1]) * u[1] + (v[2] - c[2]) * u[2]);
                expect(d - L / 2, `${coat} ${spec.pose} ${mk.name}`).toBeLessThan(0.003);
              }
          }
        }
      });
    });
  }

  it('各花色用到的颜色类别：虎斑有虎斑、奶牛与燕尾服有第二色、三花三色、深色脸的眼睛是有色虹膜、白猫两只眼睛不同色', () => {
    const tones = (coat: CatCoat): Set<string> => new Set(catParts({ x: 0, z: 0, footY: 0, unit: 1, coat }).map((p) => p.tone));
    for (const c of ['ginger', 'tabby'] as const) expect(tones(c).has('stripe'), c).toBe(true);
    for (const c of ['cow', 'tuxedo', 'black', 'white', 'calico'] as const) expect(tones(c).has('stripe'), c).toBe(false);
    for (const c of ['cow', 'tuxedo', 'calico'] as const) expect(tones(c).has('patch'), c).toBe(true);
    expect(tones('calico').has('patch2')).toBe(true);
    for (const c of ['black', 'tuxedo'] as const) expect(tones(c).has('iris'), c).toBe(true);
    expect(tones('white').has('iris') && tones('white').has('iris2')).toBe(true);
    for (const c of ['ginger', 'tabby', 'cow', 'calico'] as const) expect(tones(c).has('iris'), c).toBe(false);
    // 燕尾服的爪子是白的（第二色），其余花色的爪子与腿同色
    const paw = (coat: CatCoat): string | undefined => catParts({ x: 0, z: 0, footY: 0, unit: 1, coat }).find((p) => p.mesh.shells.some((q) => q.name === 'paw-fl'))?.tone;
    expect(paw('tuxedo')).toBe('patch');
    expect(paw('tabby')).toBe('fur');
  });

  it('总尺寸仍是家猫：鼻到臀 0.38–0.48 m、背高 0.20–0.26 m、耳尖 0.30–0.38 m、尾长 0.24–0.32 m；头比身子宽（可爱）', () => {
    const m = catMesh({ x: 0, z: 0, footY: 0, unit: 1, pose: 'stand' });
    let z0 = Infinity, z1 = -Infinity;
    for (const s of m.shells)
      if (!s.name.startsWith('tail') && !s.name.startsWith('mark-tail'))
        for (let v = s.v0; v < s.v1; v++) {
          z0 = Math.min(z0, m.verts[v * 3 + 2]);
          z1 = Math.max(z1, m.verts[v * 3 + 2]);
        }
    expect(z1 - z0).toBeGreaterThan(0.38);
    expect(z1 - z0).toBeLessThan(0.48);
    const back = Math.max(...shellVerts(m, 'rear').concat(shellVerts(m, 'front')).map((v) => -v[1]));
    expect(back).toBeGreaterThan(0.2);
    expect(back).toBeLessThan(0.26);
    const ears = Math.max(...shellVerts(m, 'eartip').map((v) => -v[1]));
    expect(ears).toBeGreaterThan(0.3);
    expect(ears).toBeLessThan(0.38);
    for (const tail of ['relaxed', 'up'] as const) {
      const t = catSkeleton('stand', { tail }).tail;
      let L = 0;
      for (let i = 1; i < t.length; i++) L += dist(t[i - 1], t[i]);
      expect(L, tail).toBeGreaterThan(0.24);
      expect(L, tail).toBeLessThan(0.32);
    }
    const width = (name: string): number => {
      const xs = shellVerts(m, name).map((v) => v[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width('head')).toBeGreaterThan(width('rear'));
  });

  it('五官在脸上：眼睛、瞳孔、高光、鼻头都贴在头 / 口鼻的前面上，凸出不到 1 cm（深色大眼与有色虹膜两种）', () => {
    for (const coat of ['ginger', 'black', 'white'] as const) {
      const m = catMesh({ x: 0, z: 0, footY: 0, unit: 1, pose: 'stand', coat });
      const front = (name: string): number => Math.max(...shellVerts(m, name).map((v) => v[2]));
      const faces = ['eye-l', 'eye-r', 'shine-l', 'shine-r', ...(coat === 'ginger' ? [] : ['pupil-l', 'pupil-r'])];
      for (const s of faces) {
        expect(front(s) - front('head'), `${coat} ${s}`).toBeGreaterThan(0);
        expect(front(s) - front('head'), `${coat} ${s}`).toBeLessThan(0.01);
      }
      if (coat !== 'ginger') expect(front('pupil-l')).toBeGreaterThan(front('eye-l')); // 瞳孔压在虹膜前面
      expect(front('shine-l')).toBeGreaterThan(front('eye-l'));
      expect(front('nose') - front('muzzle')).toBeGreaterThan(0);
      expect(front('nose') - front('muzzle')).toBeLessThan(0.01);
    }
  });

  it('头转有上限 ±90°，只绕颈端枢轴转（身子不动、高度不变），五官跟着头一起转', () => {
    expect(clampHeadYaw(3, CAT_HEAD_YAW_MAX)).toBeCloseTo(CAT_HEAD_YAW_MAX, 12);
    const a = catMesh({ x: 0, z: 0, footY: 0, unit: 1, pose: 'sit' });
    const b = catMesh({ x: 0, z: 0, footY: 0, unit: 1, pose: 'sit', headYaw: 0.9 });
    expect(Array.from(shellVerts(b, 'rear').flat())).toEqual(Array.from(shellVerts(a, 'rear').flat()));
    expect(partBox(b).y0).toBeCloseTo(partBox(a).y0, 9);
    // 眼睛与头之间的相对位置不变（跟着转了）
    const rel = (m: PartMesh): number => dist(shellVerts(m, 'eye-l')[0], shellVerts(m, 'head')[0]);
    expect(rel(b)).toBeCloseTo(rel(a), 6);
  });

  it('绕杆排开：零件（含花纹、爪子）整块地顺着环，立杆那一侧收紧，没有一处越过轴、离轴都在 0.068 m 以外（七种花色）', () => {
    for (const coat of CAT_COATS)
      for (const pose of ['sit', 'curl', 'walk'] as const)
        for (const phase of pose === 'walk' ? [0, 0.25, 0.5, 0.75] : [0]) {
          const m = catMesh({ x: 0, z: 0, footY: 0, unit: 1, pose, phase, bend: R, coat });
          let rMin = Infinity;
          for (let k = 0; k < m.verts.length; k += 3) rMin = Math.min(rMin, Math.hypot(m.verts[k] + R, m.verts[k + 2]));
          expect(rMin, `${coat} ${pose} ${phase}`).toBeGreaterThan(0.068);
        }
  });
});
