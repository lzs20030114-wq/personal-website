import type { CellFrame } from './gl3d';
import { ARM_PLACEMENT } from './machine-shape';
import type { Vec3 } from './solver3d';

/**
 * 大触手在整机世界系里的落位（Lab.05 §3.4）。
 *
 * 这条触手**就是 Lab.03 那条**——729新参考.3dm 里它的椎节沿臂位置与
 * `tentacle3d-shape.ts` 的 STATIONS 逐位吻合（生成期残差闸门 ≤1mm），
 * 所以运动学整套复用 tentacle3d，本模块只负责「摆到机器上」。
 *
 * 实测滚转 ≈ 0（梢端三根绑线柱的方位与 TIES 逐一对上，残差 2.6°，
 * 属零件质心的测量噪声）。于是 sim → 世界是**绕世界 z 轴 90° + 平移**：
 *
 *   world = ( ox − sy ,  oy + sx ,  oz + sz )
 *
 * 即 sim x̂ → 世界 +Y、sim ŷ（沿臂）→ 世界 −X、sim ẑ → 世界 +Z。
 * 行列式 +1（右手系保持），故网格法向不会翻。
 *
 * 落位参数由 `gen_machine.py` 实测生成（machine-shape.ts 的 ARM_PLACEMENT），
 * **不手写**——改模型重跑脚本即可。
 */

const [OX, OY, OZ] = ARM_PLACEMENT.origin;

/** 点：sim → 整机世界 */
export function armPoint(p: Vec3): Vec3 {
  return { x: OX - p.y, y: OY + p.x, z: OZ + p.z };
}

/** 方向向量：同一旋转，不带平移 */
export function armDir(x: number, y: number, z: number): [number, number, number] {
  return [-y, x, z];
}

/**
 * 刚架：sim 系的 CellFrame → 世界系。
 * world' = R·(F·local + o) + t = (R·F)·local + (R·o + t)
 * ——三列各自转一次，原点整点转一次。
 */
export function armFrame(f: CellFrame): CellFrame {
  const [ux, uy, uz] = armDir(f.ux, f.uy, f.uz);
  const [ex, ey, ez] = armDir(f.ex, f.ey, f.ez);
  const [fx, fy, fz] = armDir(f.fx, f.fy, f.fz);
  return { o: armPoint(f.o), ux, uy, uz, ex, ey, ez, fx, fy, fz };
}

/** 折线：sim → 世界（肌腱走线的可视化用） */
export function armPolyline(pts: ReadonlyArray<Vec3>): Vec3[] {
  return pts.map(armPoint);
}
