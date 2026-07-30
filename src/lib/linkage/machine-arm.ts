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

// -------------------------------------------------------------- 待机摆动

/**
 * 待机摆动参数（用户 2026-07-29：「待机状态下三条肌腱交替稍微收缩，展示摆动舒卷，
 * 不要直挺挺伸着」）。
 *
 * 三腱在截面上相隔 120°，故让差动量按 120° 相位差走余弦、**负值截零**，
 * 合成的弯向就是一个缓慢回转的向量——臂梢画圈，读作「摆动」。
 * 截零不是凑数：肌腱只能拉不能推，负的差动没有物理意义；截零后任意时刻
 * 至少有一根停在基线（三个相隔 120° 的余弦恒和为零，不可能同时为正）。
 *
 * 再叠一层更慢的整体幅度调制 = 「舒卷」：整条臂缓缓卷紧又松开。
 * 两个周期取不可约的值（≈15s 与 ≈27s），合起来长时间不重复，免得看出循环。
 */
export const ARM_IDLE = {
  /**
   * 三腱共同的**基线预张力**。这一项不是审美，是必需的：
   * 肌腱有松弛量，实测收缩率 **0.28 以下拉的全是空行程**——单腱 c=0.10 / 0.15 / 0.22
   * 的梢端侧移都是 **0.0mm**，臂一动不动（c=0.30 才 15.9mm、0.40 是 74.2mm）。
   * 首版没有基线、峰值只有 0.22，于是待机摆动**对触手完全无效**（跑起来在动的是五环）。
   * 三腱同时施加基线只把松弛吃掉、不产生弯向（三个方向恒和为零），弯向由其上的差动给。
   */
  base: 0.34,
  /** 差动幅度：叠在基线之上，峰值收缩 = base + span = 0.68 */
  span: 0.34,
  /** 弯向回转角速度 rad/s（2π/0.42 ≈ 15s 一圈） */
  sway: 0.42,
  /** 整体舒卷角速度 rad/s（2π/0.23 ≈ 27s 一轮） */
  curl: 0.23,
  /** 舒卷下限：差动幅度在 [floor, 1] × span 之间起伏（越低，卷与舒的对比越大） */
  floor: 0.45,
  /**
   * 差动的起步缓入时长（秒）。用户 2026-07-29：「第一下的收缩有点猛」。
   *
   * **缓入只加在差动上，不加在基线上**——这是关键，首版加在整体上没解决问题：
   * 松弛门槛（≈0.28）以下臂完全不动，若整体从 0 缓入，前几秒是纯粹的空等，
   * 等驱动腱越过门槛时缓入已走了大半，于是一越过就直奔大变形，照样是「一下子」。
   * 基线本身几乎不产生弯曲（三腱共缩 0.34 实测侧移仅 3.2mm，臂长 357/358mm，
   * 不压屈），所以它可以早早给足；把弯曲量从零拉起来的是差动，缓的就该是它。
   */
  easeIn: 5,
  /** 基线自身的缓入（秒）：只为避开 t=0 的阶跃，短即可 */
  easeBase: 1.5,
} as const;

const smoothstep = (x: number): number => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

/** 基线缓入系数 ∈ [0,1] */
export function idleBaseEase(t: number): number {
  return smoothstep(t / ARM_IDLE.easeBase);
}
/** 差动缓入系数 ∈ [0,1]，从基线就位后才开始 */
export function idleEase(t: number): number {
  return smoothstep((t - ARM_IDLE.easeBase) / ARM_IDLE.easeIn);
}

/**
 * 弯向的回转角。**回转速率与幅度同步缓入**——用 idleEase 的积分做时钟，
 * 而不是直接拿 t 乘 sway。
 *
 * 为什么必须这样（用户 2026-07-29：「第一下活动往上移动…现在是往左下」）：
 * 腱 0 的收缩把臂梢推向世界 **+Z（正上）**，腱 1 推向左下，腱 2 推向右下（实测单位向量
 * 分别是 (0.23,0.09,0.97) / (0.23,−0.85,−0.48) / (0.22,0.81,−0.54)）。
 * 波形从腱 0 起本来是对的，但缓入那 5 秒里回转会走满 0.42×5 = 2.1 rad = **120°**,
 * 恰好把主导权交给腱 1——等幅度终于起来，方向已经变成左下了。
 * 让回转跟着幅度一起从零加速，头几秒方向几乎不动，于是「第一下」是干净的往上抬。
 *
 * 稳态下 τ(t) = t − easeBase − easeIn/2，即只相当于一个固定相移，周期不变。
 */
export function idleSwayAngle(t: number): number {
  const a = ARM_IDLE.easeBase;
  const L = ARM_IDLE.easeIn;
  if (t <= a) return 0;
  if (t >= a + L) return ARM_IDLE.sway * (t - a - L / 2);
  // ∫₀ᵘ smoothstep = u³ − u⁴/2（u = 归一化进度），乘回 L 得已积累的「有效时间」
  const u = (t - a) / L;
  return ARM_IDLE.sway * L * (u * u * u - (u * u * u * u) / 2);
}

/**
 * 待机时第 k 根肌腱在时刻 t（秒）的目标收缩率 ∈ [base, base + span]。
 *
 * 实测效果（跑完整波形、量梢端相对基座的侧向偏移）：**43–150mm**，臂长 358mm 的
 * 12%–42%——始终带弧、从不回到笔直，卷与舒之间有三倍多的落差。
 * 幅度是用户 2026-07-29 第二轮上调的（首版峰值 0.42 → 侧移 18–78mm，「不明显」）。
 * 开场另有缓入（见常量注释）：基线 1.5s 到位，差动再用 easeIn 秒从零拉起。
 *
 * 残差说明：收缩越大残差越大，且**是稳态量不是收敛滞后**——把波形放慢 2.6 倍
 * （15s→39s 一圈）残差纹丝不动（6.44→6.63mm）。这是该肌腱模型的固有量。
 * 标尺：Lab.03 已上线并经用户真机拍板的 c=1 全螺旋，残差 9.19mm；
 * 本波形峰值 0.68 的残差约 7.8mm，仍在其下。
 *
 * 全是手感常量，待用户真机拍板。
 */
export function idleContraction(t: number, k: number): number {
  const dir = Math.cos(idleSwayAngle(t) - (2 * Math.PI * k) / 3);
  const curl = ARM_IDLE.floor + (1 - ARM_IDLE.floor) * (0.5 + 0.5 * Math.sin(ARM_IDLE.curl * t));
  const diff = dir > 0 ? ARM_IDLE.span * curl * dir * idleEase(t) : 0;
  return ARM_IDLE.base * idleBaseEase(t) + diff;
}
