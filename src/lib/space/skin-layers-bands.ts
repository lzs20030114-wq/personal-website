/** Lab 2-6 的成形读法：独立的窄织物带围成一圈，沿用 Lab 2-5 的挤出与条纹。 */
import { buildLayerProfiles, LAYER_PROFILE_KINDS } from './skin-layers-forming';
import { layerAngles, LAYERS, LAYER_MORPHS, type LayerStudy, type LayerLine } from './skin-layers';
import { capTriangles, layerPoseOffset, layerRadialOffset, layerProfileAt, type LayerFrame } from './skin-layers-surface';
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
  // 尖方角必须是膜的真实边界，不能在一块直纹膜中间被削成斜角。
  if (s.morph === LAYER_MORPHS.length - 1) for (const a of [45, 135, 225, 315]) edges.add(a);
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
  const endCaps: typeof membranes = [];
  const capIndices = new Map<number, Uint32Array>();
  const placements = layerBandPlan(s);
  const foot = -frames[0].py[frames[0].py.length - 1] * 100;
  for (const [slot, band] of placements.entries()) {
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
    // 固定带宽，按剖口真实方位取挑出。只按带中线取值会让方边出现锯齿。
    // 切向距离远小于半径，四次固定点更新足以把角度与径向位置对齐。
    const radialAt = (base: number, tangent: number, index: number) => {
      let r = base + layerRadialOffset(s, f, k, index, band.angle);
      if (s.morph > 0) for (let pass = 0; pass < 4; pass++)
        r = base + layerRadialOffset(s, f, k, index, band.angle + Math.atan2(tangent, r) / RAD);
      return r;
    };
    // 半径只改变平台向外的挑出；固定立杆、轴和带宽不跟着放大。
    for (let v = 0; v < 4 * n; v++) {
      const p = v * 3, d = layerRadialOffset(s, f, k, start + v % n, band.angle);
      if (s.morph === 0) { verts[p] += d * c; verts[p + 2] += d * sn; }
      else {
        const tangent = -verts[p] * sn + verts[p + 2] * c;
        const r = radialAt(verts[p] * c + verts[p + 2] * sn, tangent, start + v % n);
        verts[p] = r * c - tangent * sn; verts[p + 2] = r * sn + tangent * c;
      }
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
        // 沿边界自己的方位取轮廓，圆方档都与目标图同源；保留挤出厚度。
        const edgeAngle = s.morph === 0 ? band.angle : Math.atan2(z, x) / RAD;
        const boundaryR = r + layerRadialOffset(s, f, k, start + i, angle) - layerRadialOffset(s, f, k, start + i, edgeAngle);
        boundary.push({ x: boundaryR * Math.cos(a), y: y + (pose ? layerPoseOffset(s, f, k, start + i, boundaryR, angle) : 0), z: boundaryR * Math.sin(a) });
      }
      const center = [...edge, ...boundary].reduce((sum, p) => ({ x: sum.x + p.x / (2 * n), y: sum.y + p.y / (2 * n), z: sum.z + p.z / (2 * n) }), { x: 0, y: 0, z: 0 });
      membranes.push({ verts: bandVerts(edge, boundary), idx: Uint32Array.from(bandTriIndex(n)), center });
      // 厚台/双层/单层的交界，以及缺口边缘，都有暴露的径向截面。
      // 从同一片带间膜的边界直接封口，避免另画目标壳体或跨过轮廓缺口。
      const neighbor = placements[(slot + side + placements.length) % placements.length];
      if (neighbor.kind !== band.kind) {
        const inner = LAYERS.inner - RING.THICK / 2;
        const axisPoint = (i: number): Vec3 => ({ x: inner * Math.cos(a), z: inner * Math.sin(a),
          y: -f.py[i] * 100 + (pose ? layerPoseOffset(s, f, k, i, inner, angle) : 0) });
        const contour = [axisPoint(start), ...boundary, axisPoint(end - 1)];
        // 拓扑沿用原始截面的耳切；厚度偏移在急折处会自交，不能拿偏移线
        // 重新判拓扑，否则耳切提前退出，反而漏掉一大片侧面。顶点仍贴合膜边。
        if (!capIndices.has(k)) capIndices.set(k, Uint32Array.from(capTriangles([
          [inner, -f.py[start] * 100],
          ...Array.from({ length: n }, (_, j) => [LAYERS.inner + f.px[start + j] * 100, -f.py[start + j] * 100] as [number, number]),
          [inner, -f.py[end - 1] * 100],
        ])));
        const idx = capIndices.get(k)!;
        if (idx.length) endCaps.push({ verts: Float32Array.from(contour.flatMap(p => [p.x, p.y, p.z])),
          idx, center: contour.reduce((sum, p) => ({ x: sum.x + p.x / contour.length,
            y: sum.y + p.y / contour.length, z: sum.z + p.z / contour.length }), { x: 0, y: 0, z: 0 }) });
      }
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
          const p = placePoint(radialAt(LAYERS.inner + f.px[index] * 100, tangent, index), -f.py[index] * 100, tangent, ring);
          if (pose) p.y += layerPoseOffset(s, f, k, index, Math.hypot(p.x, p.z), Math.atan2(p.z, p.x) / RAD);
          return p;
        };
        bonds.push({ a: point(i), b: point(j) });
      }
    }
  }
  membranes.push(...endCaps);
  if (whole) meshes.push(mesh(ringPlateVerts(LAYERS.inner - 12, LAYERS.inner + 11, -3, 3, 72), RAIL));
  return { meshes, bonds, membranes };
}
