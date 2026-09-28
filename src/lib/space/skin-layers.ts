/** Lab 2-6 · 目标几何。只定义空间轮廓，不冒充皮肤求解终态。
 * 基准尺寸取既有双层台；保持俯视圆环足迹，台面为穿过中轴基准高度的斜平面。
 * 覆盖范围用角度区间，网格显式插入区间端点（240° 不量化成 20 位）。 */
import { RING } from './skin-ring';
import { SPLIT_RING_LOBE, SPLIT_RING_TARGET, SPLIT_RING_W_END } from './skin-split-ring';
import type { Vec3 } from '../linkage/solver3d';

export const LAYER_OUTLINES = [
  { key: 'full', label: '整圆', spans: [[0, 360]] },
  { key: 'half', label: '半圆', spans: [[0, 180]] },
  { key: 'quarter', label: '四分之一', spans: [[0, 90]] },
  { key: 'thirds', label: '三分之二', spans: [[0, 240]] },
  { key: 'opposed', label: '分离双扇', spans: [[0, 90], [180, 270]] },
] as const;
export type LayerOutline = (typeof LAYER_OUTLINES)[number]['key'];
export const LAYER_JOINS = [{ key: 'single', label: '单区' }, { key: 'opposed', label: '对向双区' }] as const;
export type LayerJoinMode = (typeof LAYER_JOINS)[number]['key'];
export interface LayerShape { outline: LayerOutline; rotation: number; tilt: number; direction: number }
export interface LayerStudy { upper: LayerShape; lower: LayerShape; joinMode: LayerJoinMode; joinStart: number; joinSweep: number }
export const LAYERS = { inner: RING.RADIUS_DEF, outer: RING.RADIUS_DEF + SPLIT_RING_TARGET,
  thickness: SPLIT_RING_LOBE, gap: SPLIT_RING_W_END, maxTilt: 20 } as const;
export const layerBaseline = (): LayerStudy => ({
  upper: { outline: 'full', rotation: 0, tilt: 0, direction: 0 },
  lower: { outline: 'full', rotation: 0, tilt: 0, direction: 180 }, joinMode: 'single', joinStart: 20, joinSweep: 0,
});
export const LAYER_EXAMPLES = [
  { key: 'baseline', label: '双层基准' }, { key: 'tilt', label: '对向倾斜' },
  { key: 'sectors', label: '错位缺口' }, { key: 'join', label: '局部厚台' },
  { key: 'opposed', label: '对称厚台' },
] as const;
export function layerExample(key: string): LayerStudy {
  const s = layerBaseline();
  if (key === 'tilt') { s.upper.tilt = 14; s.lower.tilt = 14; }
  if (key === 'sectors') { s.upper.outline = 'half'; s.lower.outline = 'opposed'; s.lower.rotation = 45; }
  if (key === 'join') s.joinSweep = 60;
  if (key === 'opposed') { s.joinMode = 'opposed'; s.joinSweep = 60; }
  return s;
}
const rad = (a: number) => a * Math.PI / 180;
export const wrapAngle = (a: number) => ((a % 360) + 360) % 360;
export function layerCovers(layer: LayerShape, angle: number): boolean {
  const a = wrapAngle(angle - layer.rotation);
  return LAYER_OUTLINES.find(o => o.key === layer.outline)!.spans.some(([lo, hi]) => a >= lo && a < hi);
}
/** 两块等宽扇区共用方位，第二块固定相隔 180°；每块达到 180° 时并成整环。 */
export function layerJoinSpans(s: LayerStudy): { start: number; sweep: number }[] {
  const sweep = Math.max(0, Math.min(s.joinSweep, s.joinMode === 'opposed' ? 180 : 360));
  return (s.joinMode === 'opposed' ? [0, 180] : [0]).map(offset => ({ start: wrapAngle(s.joinStart + offset), sweep }));
}
export function layersJoin(s: LayerStudy, angle: number): boolean {
  return layerCovers(s.upper, angle) && layerCovers(s.lower, angle)
    && layerJoinSpans(s).some(span => wrapAngle(angle - span.start) < span.sweep);
}
/** Y 沿屏幕向下，方向表示下坡方向；厚度沿中轴方向量。 */
export function layerHeight(s: LayerStudy, surface: number, r: number, angle: number): number {
  const upper = surface < 2;
  const layer = upper ? s.upper : s.lower;
  const center = (upper ? -1 : 1) * (LAYERS.gap + LAYERS.thickness) / 2;
  return center + (surface % 2 === 0 ? -1 : 1) * LAYERS.thickness / 2
    + r * Math.tan(rad(layer.tilt)) * Math.cos(rad(angle - layer.direction));
}
export type LayerMaterial = 'upper' | 'lower' | 'join';
export interface LayerColumn { top: number; bottom: number; material: LayerMaterial }
export function layerColumns(s: LayerStudy, angle: number): LayerColumn[] {
  if (layersJoin(s, angle)) return [{ top: 0, bottom: 3, material: 'join' }];
  return [
    ...(layerCovers(s.upper, angle) ? [{ top: 0, bottom: 1, material: 'upper' as const }] : []),
    ...(layerCovers(s.lower, angle) ? [{ top: 2, bottom: 3, material: 'lower' as const }] : []),
  ];
}
/** 固定细分 + 所有实际边界。顺序不依赖所选扇区数量，首尾共用同一根接缝。 */
export function layerAngles(s: LayerStudy): number[] {
  const angles = new Set<number>(Array.from({ length: 121 }, (_, i) => i * 3));
  for (const layer of [s.upper, s.lower]) {
    for (const span of LAYER_OUTLINES.find(o => o.key === layer.outline)!.spans)
      for (const a of span) angles.add(wrapAngle(a + layer.rotation));
  }
  for (const span of layerJoinSpans(s)) {
    angles.add(span.start); angles.add(wrapAngle(span.start + span.sweep));
  }
  return [...angles].sort((a, b) => a - b);
}
export function layerStats(s: LayerStudy) {
  const angles = layerAngles(s);
  let joined = 0;
  for (let i = 0; i < angles.length - 1; i++)
    if (layersJoin(s, (angles[i] + angles[i + 1]) / 2)) joined += angles[i + 1] - angles[i];
  const a = Math.tan(rad(s.lower.tilt)), b = Math.tan(rad(s.upper.tilt));
  const dx = a * Math.cos(rad(s.lower.direction)) - b * Math.cos(rad(s.upper.direction));
  const dz = a * Math.sin(rad(s.lower.direction)) - b * Math.sin(rad(s.upper.direction));
  // 完整圆环上的保守净空；UI 量程保证任意方位不会相交。
  return { joined, clearance: LAYERS.gap - LAYERS.outer * Math.hypot(dx, dz) };
}
export interface LayerMesh { verts: Float32Array; idx: Uint32Array }
export interface LayerLine { a: Vec3; b: Vec3 }
export function buildLayerGeometry(s: LayerStudy): { meshes: Record<LayerMaterial, LayerMesh>; lines: LayerLine[] } {
  const raw = { upper: { v: [] as number[], i: [] as number[] }, lower: { v: [] as number[], i: [] as number[] }, join: { v: [] as number[], i: [] as number[] } };
  const lines: LayerLine[] = [];
  const point = (surface: number, r: number, angle: number): Vec3 => ({ x: r * Math.cos(rad(angle)), y: layerHeight(s, surface, r, angle), z: r * Math.sin(rad(angle)) });
  const quad = (m: LayerMaterial, a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    const q = raw[m], n = q.v.length / 3;
    for (const p of [a, b, c, d]) q.v.push(p.x, p.y, p.z);
    q.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const aa = layerAngles(s), ri = LAYERS.inner, ro = LAYERS.outer;
  const cols = aa.slice(0, -1).map((a, i) => layerColumns(s, (a + aa[i + 1]) / 2));
  for (let i = 0; i < cols.length; i++) {
    const a = aa[i], b = aa[i + 1];
    for (const col of cols[i]) {
      const { top: t, bottom: d, material: m } = col;
      for (const h of [t, d]) {
        quad(m, point(h, ri, a), point(h, ro, a), point(h, ro, b), point(h, ri, b));
        for (const r of [ri, ro]) lines.push({ a: point(h, r, a), b: point(h, r, b) });
      }
      // 直侧面仍在每层边界处分段，使厚台／双台相邻时没有 T 形网格接缝。
      for (const r of [ri, ro]) for (let h = t; h < d; h++)
        quad(m, point(h, r, a), point(h + 1, r, a), point(h + 1, r, b), point(h, r, b));
      // 仅封真实暴露的端面：相邻厚台／双台之间只封中间的间隙，避免内部重叠面。
      for (const [angle, neighbor] of [[a, (i + cols.length - 1) % cols.length], [b, (i + 1) % cols.length]]) {
        for (let h = t; h < d; h++) {
          if (cols[neighbor].some(n => n.top <= h && n.bottom >= h + 1)) continue;
          const ps = [point(h, ri, angle), point(h, ro, angle), point(h + 1, ro, angle), point(h + 1, ri, angle)];
          quad(m, ps[0], ps[1], ps[2], ps[3]);
          for (let k = 0; k < 4; k++) lines.push({ a: ps[k], b: ps[(k + 1) % 4] });
        }
      }
    }
  }
  return { meshes: Object.fromEntries(Object.entries(raw).map(([k, q]) => [k, { verts: Float32Array.from(q.v), idx: Uint32Array.from(q.i) }])) as Record<LayerMaterial, LayerMesh>, lines };
}
