/** 原始截面逐帧绕轴扫掠。缺口由截面编制决定，不用目标几何插值冒充成形。
 * 倾斜是明确独立的空间装配映射；不反馈给二维引擎，也不代表三维力学验证。 */
import { buildLayerProfiles, LAYER_PROFILE_KINDS, type LayerProfileKind } from './skin-layers-forming';
import { layerAngles, layerCovers, layerRadius, layersJoin, LAYERS, type LayerStudy, type LayerMaterial, type LayerLine } from './skin-layers';
import { ringPlateVerts } from './skin-solid';

export const LAYER_COLORS = {
  upper: { dark: [0.08, 0.18, 0.14], light: [0.48, 0.77, 0.61], svg: '#8bc5a1' },
  lower: { dark: [0.16, 0.13, 0.23], light: [0.69, 0.63, 0.84], svg: '#b5a8d5' },
  join: { dark: [0.23, 0.17, 0.1], light: [0.83, 0.70, 0.47], svg: '#d4b278' },
} satisfies Record<LayerMaterial, { dark: [number, number, number]; light: [number, number, number]; svg: string }>;
export interface LayerFrame { px: Float64Array; py: Float64Array; locked: readonly (readonly [number, number, number])[] }
const PROFILES = buildLayerProfiles();
const rad = (a: number) => a * Math.PI / 180;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function layerProfileAt(s: LayerStudy, angle: number): LayerProfileKind | null {
  if (layersJoin(s, angle)) return 'solid';
  const u = layerCovers(s.upper, angle), l = layerCovers(s.lower, angle);
  return u && l ? 'double' : u ? 'upper' : l ? 'lower' : null;
}

/** 共用于截面表面和独立条带的姿态预览；不修改实际节点或键谱。 */
export function layerPoseOffset(s: LayerStudy, f: LayerFrame, k: number, i: number, r: number, angle: number) {
  const b = PROFILES[k], m = b.marks, kind = LAYER_PROFILE_KINDS[k];
  const lo = kind === 'double' ? m.mouthA : m.faceA;
  const hi = kind === 'double' ? m.mouthB : m.faceB;
  const t = kind === 'upper' ? 0 : kind === 'lower' ? 1 : clamp((f.py[lo] - f.py[i]) / Math.max(1e-8, f.py[lo] - f.py[hi]));
  const slope = (key: 'upper' | 'lower') => Math.tan(rad(s[key].tilt)) * Math.cos(rad(angle - s[key].direction));
  const weight = i < m.outA ? clamp((i - b.lead) / (m.outA - b.lead)) : i > m.outB ? clamp((b.lead + b.free - 1 - i) / (b.lead + b.free - 1 - m.outB)) : 1;
  return weight * r * ((1 - t) * slope('upper') + t * slope('lower'));
}

/** 逐层外缘尺寸的装配预览；固定中轴，不改原始节点或终态缓存。 */
export function layerRadialOffset(s: LayerStudy, f: LayerFrame, k: number, i: number, angle = 0): number {
  if (s.morph === 0 && s.upper.radius === LAYERS.outer && s.lower.radius === LAYERS.outer) return 0;
  const m = PROFILES[k].marks, kind = LAYER_PROFILE_KINDS[k];
  const lo = kind === 'double' ? m.mouthA : m.faceA;
  const hi = kind === 'double' ? m.mouthB : m.faceB;
  let t = clamp((f.py[lo] - f.py[i]) / Math.max(1e-8, f.py[lo] - f.py[hi]));
  // 厚台上下各保留一个台面的厚度，变化集中在连接两层外缘的侧壁。
  if (kind === 'solid') t = clamp((t * (LAYERS.gap + 2 * LAYERS.thickness) - LAYERS.thickness) / LAYERS.gap);
  if (kind === 'upper') t = 0;
  if (kind === 'lower') t = 1;
  const reach = (1 - t) * (layerRadius(s, 0, angle) - LAYERS.inner) + t * (layerRadius(s, 2, angle) - LAYERS.inner);
  return f.px[i] * 100 * (reach / (LAYERS.outer - LAYERS.inner) - 1);
}

/** 简单凹多边形的耳切，用于真实截面的扇区端盖。不会将凹入的层间空间扇形填满。 */
function capTriangles(p: readonly (readonly [number, number])[]): number[] {
  const cross = (a: number, b: number, c: number) =>
    (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[a][0]);
  const ids = p.map((_, i) => i);
  const area = p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (area < 0) ids.reverse();
  const out: number[] = [];
  while (ids.length > 2) {
    let found = false;
    for (let j = 0; j < ids.length; j++) {
      const a = ids[(j + ids.length - 1) % ids.length], b = ids[j], c = ids[(j + 1) % ids.length];
      const turn = cross(a, b, c);
      // 共线点只影响端盖三角化；扫掠外表面仍保留每个原始节点。
      if (Math.abs(turn) < 1e-8) { ids.splice(j, 1); found = true; break; }
      if (turn < 0) continue;
      if (ids.some(k => k !== a && k !== b && k !== c && cross(a, b, k) > 1e-8 && cross(b, c, k) > 1e-8 && cross(c, a, k) > 1e-8)) continue;
      out.push(a, b, c); ids.splice(j, 1); found = true; break;
    }
    // 原始轮廓若暂时自交则保留已成立部分，不凭空跨过折痕补一个大扇面。
    if (!found) break;
  }
  return out;
}

export function buildLayerSurface(s: LayerStudy, frames: readonly LayerFrame[], pose = true, whole = false) {
  const raw = Object.fromEntries((['upper', 'lower', 'join'] as const).map(k => [k, { v: [] as number[], idx: [] as number[] }])) as Record<LayerMaterial, { v: number[]; idx: number[] }>;
  const lines: LayerLine[] = [], bonds: LayerLine[] = [];
  const aa = layerAngles(s), kinds = aa.slice(0, -1).map((a, i) => layerProfileAt(s, (a + aa[i + 1]) / 2));
  const caps = new Map<number, number[]>();
  const point = (k: number, i: number, angle: number, axis = false) => {
    const f = frames[k];
    const r = axis ? LAYERS.inner - 1 : LAYERS.inner + f.px[i] * 100 + layerRadialOffset(s, f, k, i, angle);
    const y = -f.py[i] * 100 + (pose ? layerPoseOffset(s, f, k, i, r, angle) : 0);
    return { x: r * Math.cos(rad(angle)), y, z: r * Math.sin(rad(angle)) };
  };
  const material = (k: number, i: number): LayerMaterial => k === 1 ? 'join' : k === 2 ? 'upper' : k === 3 ? 'lower' : i < PROFILES[k].marks.center ? 'upper' : 'lower';
  const triangle = (m: LayerMaterial, a: ReturnType<typeof point>, b: ReturnType<typeof point>, c: ReturnType<typeof point>) => {
    const q = raw[m], base = q.v.length / 3;
    for (const p of [a, b, c]) q.v.push(p.x, p.y, p.z);
    q.idx.push(base, base + 1, base + 2);
  };
  for (let j = 0; j < kinds.length; j++) {
    const kind = kinds[j];
    if (!kind) continue; // 缺口没有跨过去的膜；中轴单独绘制。
    const k = LAYER_PROFILE_KINDS.indexOf(kind), f = frames[k], b = PROFILES[k], a = aa[j], z = aa[j + 1];
    const start = whole ? 0 : b.lead, end = whole ? f.px.length - 1 : b.lead + b.free - 1, n = end - start + 1;
    for (let i = start; i < end; i++) {
      const p = point(k, i, a), q = point(k, i + 1, a), r = point(k, i + 1, z), t = point(k, i, z), m = material(k, i);
      triangle(m, p, q, r); triangle(m, p, r, t);
    }
    const close = (p: ReturnType<typeof point>, q: ReturnType<typeof point>, r: ReturnType<typeof point>, t: ReturnType<typeof point>) => {
      triangle(material(k, start), p, q, r); triangle(material(k, start), p, r, t);
    };
    close(point(k, start, a, true), point(k, start, a), point(k, start, z), point(k, start, z, true));
    close(point(k, end, a), point(k, end, a, true), point(k, end, z, true), point(k, end, z));
    close(point(k, end, a, true), point(k, start, a, true), point(k, start, z, true), point(k, end, z, true));
    // 环向边界是各自成形截面的端盖。相同截面内部不造隔墙；不同截面不强行拉齐节点。
    for (const [angle, neighbor] of [[a, (j + kinds.length - 1) % kinds.length], [z, (j + 1) % kinds.length]]) {
      if (kinds[neighbor] === kind) continue;
      if (!caps.has(k)) caps.set(k, capTriangles([
        [LAYERS.inner - 1, -f.py[start] * 100],
        ...Array.from({ length: n }, (_, j) => [LAYERS.inner + f.px[start + j] * 100, -f.py[start + j] * 100] as [number, number]),
        [LAYERS.inner - 1, -f.py[end] * 100],
      ]));
      const p = (i: number) => i === 0 ? point(k, start, angle, true) : i === n + 1 ? point(k, end, angle, true) : point(k, start + i - 1, angle);
      const cc = caps.get(k)!;
      for (let i = 0; i < cc.length; i += 3) triangle(material(k, start + Math.max(0, cc[i + 1] - 1)), p(cc[i]), p(cc[i + 1]), p(cc[i + 2]));
      for (let i = start; i < end; i++) lines.push({ a: point(k, i, angle), b: point(k, i + 1, angle) });
    }
    for (const i of [PROFILES[k].marks.faceA, PROFILES[k].marks.faceB]) lines.push({ a: point(k, i, a), b: point(k, i, z) });
    // 每 30° 展示一条真正锁定的键谱；外壳遮挡关系由深度缓冲处理。
    if (a % 30 === 0) for (const [i, h] of f.locked) {
      if (b.seam !== undefined && (i - b.seam) * (h - b.seam) < 0) continue;
      bonds.push({ a: point(k, i, a), b: point(k, h, a) });
    }
  }
  const foot = -frames[0].py[frames[0].py.length - 1] * 100;
  const core = ringPlateVerts(LAYERS.inner - 2, LAYERS.inner - 1, whole ? foot / 2 : 493, whole ? foot / 2 : 135, 72);
  return {
    meshes: [
      ...(['upper', 'lower', 'join'] as const).map(k => ({ verts: Float32Array.from(raw[k].v), idx: Uint32Array.from(raw[k].idx), dark: LAYER_COLORS[k].dark, light: LAYER_COLORS[k].light })),
      { ...core, dark: [0.065, 0.08, 0.085] as [number, number, number], light: [0.23, 0.28, 0.29] as [number, number, number] },
    ], lines, bonds,
  };
}
