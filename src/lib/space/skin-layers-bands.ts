/** Lab 2-6 的成形读法：独立的窄织物带围成一圈，沿用 Lab 2-5 的挤出与条纹。 */
import { buildLayerProfiles, LAYER_PROFILE_KINDS } from './skin-layers-forming';
import { layerAngles, LAYERS, type LayerStudy, type LayerLine } from './skin-layers';
import { layerPoseOffset, layerRadialOffset, layerProfileAt, type LayerFrame } from './skin-layers-surface';
import { bandVerts, bandTriIndex } from '../linkage/skin';
import type { Vec3 } from '../linkage/solver3d';
import { RING } from './skin-ring';
import { SKIN } from './skin-unit';
import { buildSolidTopology, fillSolidVerts, placePoint, boxVerts, rotateVertsY, ringPlateVerts } from './skin-solid';

const PROFILES = buildLayerProfiles();
const RAD = Math.PI / 180;
const GREEN = { dark: [0.075, 0.16, 0.12], light: [0.42, 0.76, 0.58] } as const;
const PALE = { dark: [0.11, 0.12, 0.12], light: [0.62, 0.66, 0.63] } as const;
const RAIL = { dark: [0.08, 0.09, 0.1], light: [0.4, 0.43, 0.46] } as const;
type Mesh = { verts: Float32Array; idx: Uint32Array; dark: [number, number, number]; light: [number, number, number] };
const mesh = (g: { verts: Float32Array; idx: Uint32Array }, c: typeof GREEN | typeof PALE | typeof RAIL): Mesh => ({ ...g, dark: [...c.dark], light: [...c.light] });

/** 20 等分为基准；真实轮廓/连接边界落在槽内时分开该槽，防止 5° 独占区消失。 */
export function layerBandPlan(s: LayerStudy) {
  const edges = new Set(Array.from({ length: RING.COUNT + 1 }, (_, i) => i * 360 / RING.COUNT));
  const aa = layerAngles(s), kinds = aa.slice(0, -1).map((a, i) => layerProfileAt(s, (a + aa[i + 1]) / 2));
  for (let i = 0; i < kinds.length; i++) if (kinds[i] !== kinds[(i + kinds.length - 1) % kinds.length]) edges.add(aa[i]);
  const sorted = [...edges].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1], angle = (start + end) / 2;
    return { start, end, angle, kind: layerProfileAt(s, angle),
      // 独立的等宽挤出带；窄边界槽减宽，保留间隙并且不伸进隔壁扇区。
      depth: Math.min(RING.DEPTH, 2 * (LAYERS.inner - RING.THICK / 2) * Math.tan((end - start) * RAD / 2) * .82) };
  });
}

const topology = new Map<number, ReturnType<typeof buildSolidTopology>>();
export function buildLayerBands(s: LayerStudy, frames: readonly LayerFrame[], pose = true, whole = true) {
  const meshes: Mesh[] = [], bonds: LayerLine[] = [];
  const membranes: { verts: Float32Array; idx: Uint32Array; center: Vec3 }[] = [];
  const placements = layerBandPlan(s);
  const foot = -frames[0].py[frames[0].py.length - 1] * 100;
  for (const band of placements) {
    const ring = { radius: LAYERS.inner, angle: band.angle * RAD };
    const railTop = whole ? -3 : 358, railBottom = whole ? foot : 628;
    const rail = boxVerts(LAYERS.inner - 3.4, (railTop + railBottom) / 2, 0, 2.4, (railBottom - railTop) / 2, Math.min(6, band.depth / 4));
    rotateVertsY(rail.verts, ring); meshes.push(mesh(rail, RAIL));
    if (!band.kind) continue;
    const k = LAYER_PROFILE_KINDS.indexOf(band.kind), f = frames[k], def = PROFILES[k];
    const start = whole ? 0 : def.lead, end = whole ? f.px.length : def.lead + def.free, n = end - start;
    if (!topology.has(n)) topology.set(n, buildSolidTopology(n, SKIN.STRIPE));
    const topo = topology.get(n)!;
    const verts = fillSolidVerts(f.px.subarray(start, end), f.py.subarray(start, end), n, 0, band.depth, RING.THICK, 100, undefined, 0, 0, ring);
    const c = Math.cos(ring.angle), sn = Math.sin(ring.angle);
    // 半径只改变平台向外的挑出；固定立杆、轴和带宽不跟着放大。
    for (let v = 0; v < 4 * n; v++) {
      const p = v * 3, d = layerRadialOffset(s, f, k, start + v % n);
      verts[p] += d * c; verts[p + 2] += d * sn;
    }
    // 两片直纹膜从本带的外侧剖口伸到各自扇区边界。只填带间缝；遇轮廓
    // 缺口立即停止，不将不同截面的节点强行配对，也不跨过被切掉的台面。
    for (const side of [-1, 1]) {
      const edge: Vec3[] = [], boundary: Vec3[] = [];
      const angle = side < 0 ? band.start : band.end, a = angle * RAD;
      for (let i = 0; i < n; i++) {
        const p = ((side < 0 ? n : 0) + i) * 3;
        const x = verts[p], y = verts[p + 1], z = verts[p + 2], r = x * c + z * sn;
        edge.push({ x, y: y + (pose ? layerPoseOffset(s, f, k, start + i, Math.hypot(x, z), Math.atan2(z, x) / RAD) : 0), z });
        boundary.push({ x: r * Math.cos(a), y: y + (pose ? layerPoseOffset(s, f, k, start + i, r, angle) : 0), z: r * Math.sin(a) });
      }
      const center = [...edge, ...boundary].reduce((sum, p) => ({ x: sum.x + p.x / (2 * n), y: sum.y + p.y / (2 * n), z: sum.z + p.z / (2 * n) }), { x: 0, y: 0, z: 0 });
      membranes.push({ verts: bandVerts(edge, boundary), idx: Uint32Array.from(bandTriIndex(n)), center });
    }
    // 姿态仍是可关闭的装配映射；每个角点取自己的方位，带宽方向也遵循同一坡度。
    if (pose) for (let v = 0; v < 4 * n; v++) {
      const p = v * 3, r = Math.hypot(verts[p], verts[p + 2]), angle = Math.atan2(verts[p + 2], verts[p]) / RAD;
      verts[p + 1] += layerPoseOffset(s, f, k, start + v % n, r, angle);
    }
    meshes.push(mesh({ verts, idx: topo.idxA }, GREEN), mesh({ verts, idx: topo.idxB }, PALE));
    // 与 Lab 2-5 一样把每条带的键画在前后剖口，而不是隔着整块实体画一条中线。
    for (const [i, j] of f.locked) {
      if (i < start || j >= end || (def.seam !== undefined && (i - def.seam) * (j - def.seam) < 0)) continue;
      for (const tangent of [-band.depth / 2, band.depth / 2]) {
        const point = (index: number) => {
          const p = placePoint(LAYERS.inner + f.px[index] * 100 + layerRadialOffset(s, f, k, index), -f.py[index] * 100, tangent, ring);
          if (pose) p.y += layerPoseOffset(s, f, k, index, Math.hypot(p.x, p.z), Math.atan2(p.z, p.x) / RAD);
          return p;
        };
        bonds.push({ a: point(i), b: point(j) });
      }
    }
  }
  if (whole) meshes.push(mesh(ringPlateVerts(LAYERS.inner - 12, LAYERS.inner + 11, -3, 3, 72), RAIL));
  return { meshes, bonds, membranes };
}
