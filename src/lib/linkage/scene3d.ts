import type { Vec3 } from './solver3d';
import type { OrbitCamera, Projected } from './camera3d';

// 3D 场景投影（立体求解器 spec：公共装备）。零 DOM、纯函数：
// 台架页只负责把结果贴到自己的 SVG 元素上（key 对应）。

export interface Drawable3 {
  /** 台架页用来找回自己 SVG 元素的键 */
  key: string;
  /** 世界坐标点列（2 点 = 线段，≥3 = 多边形——语义由台架页决定） */
  points: Vec3[];
}

export interface ProjectedDrawable {
  key: string;
  pts: Projected[];
  /** 元素平均视深 */
  depth: number;
  /** 深度明暗：远淡近实 */
  opacity: number;
}

export interface SceneOpts {
  opacityMin?: number;
  opacityMax?: number;
}

/** 投影 + 画家排序（远 → 近）+ 深度明暗。确定性：同输入同输出。 */
export function projectScene(
  cam: OrbitCamera,
  items: ReadonlyArray<Drawable3>,
  opts: SceneOpts = {},
): ProjectedDrawable[] {
  const oMin = opts.opacityMin ?? 0.35;
  const oMax = opts.opacityMax ?? 1;
  const out: ProjectedDrawable[] = items.map((it) => {
    const pts = it.points.map((p) => cam.project(p));
    let d = 0;
    for (const p of pts) d += p.depth;
    return { key: it.key, pts, depth: d / (pts.length || 1), opacity: oMax };
  });
  out.sort((a, b) => a.depth - b.depth);
  const dMin = out[0]?.depth ?? 0;
  const dMax = out[out.length - 1]?.depth ?? 1;
  const span = dMax - dMin || 1;
  for (const o of out) o.opacity = oMin + (oMax - oMin) * ((o.depth - dMin) / span);
  return out;
}
