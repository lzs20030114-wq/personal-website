/**
 * 人与猫的比例模型——纯几何，零 DOM、零依赖（底层件在 mesh-shell.ts）。
 *
 * 2026-08-25 首版是十四块长方体的「比例小人」（用户手绘布景里那个站在地上的人）；2026-10-21 人猫同台立体台架
 * 加了坐姿与四档体块猫。2026-10-25 作者要求「更精细并确保建模的正确性」，整件重做。旧版的建模错误：
 *   - 迈步那条后腿连脚一起取反，**后脚脚尖朝后**；
 *   - 坐姿大腿只伸到座面前缘以内 0.16 m，**小腿直直插进 0.8 m 深的座面**，垂着的手也插进座面；
 *   - 小腿与脚的侧面共面（会闪）；猫 0.68 m 长，在 Lab 2-15 那圈 16 cm 宽的平台上沿径向摆，**后半身穿过中间的立杆**。
 * 同日作者又定「猫不够可爱……学习 Minecraft 的就行」「人也改成方块风，和猫统一风格」：两者都是**原创的方块风**
 * （不搬 Minecraft 的模型与贴图——版权在 Mojang / 微软，作品集里放游戏素材也说不清原创），只学它让角色显得可爱的办法：
 * 全是长方体、尺寸落在像素格上、扁平的脸、低位大眼睛带一颗白色高光、分块上色。总尺寸仍是真人 / 家猫，它们在这里是比例参考。
 *
 * 做法：先有骨架（关节点），再在骨架上摆零件；改姿态只转关节，**骨长与零件尺寸一个数不变**。
 *   - 人：节段比例取 Drillis & Contini (1966)，转引自 Winter《Biomechanics and Motor Control of Human Movement》
 *     图 4.1（肩 0.818H、肘 0.630H、腕 0.485H、髋 0.530H、膝 0.285H、踝 0.039H、足长 0.152H…）。
 *     三种姿态：站、走（步态周期按常见的正常步行矢状面关节角曲线插值）、坐（按座面尺寸解出来：大腿平放在座面上、
 *     小腿让开座面前缘、脚尖正好点地）；头单独成件，可随视线转（限 ±75°）。
 *   - 猫：五种姿态：站、走、坐、卧（揣手）、蜷；`bend` 让零件整块地绕一根竖直轴排开——在环形平台上它就顺着环
 *     坐 / 蜷，不再穿杆。
 * 零件按颜色分组（`Rig.parts`，各带一个 tone），台架按组上色：人的衣服颜色可以每个人不同。
 *
 * 坐标：模型系 x 横、y 向上、z 向前（面朝 +z），落到世界时 y 翻成向下（世界 Y 向下为正），绕 Y 的 yaw 与
 * skin-solid.rotateVertsY / gl3d.MeshPlace 同一约定（yaw 0 = 面朝 +Z）。
 */
import { ShellBuilder, add, cross, len, lerp3, mergeParts, norm, ortho, partBox, placePart, scale, sub, type PartMesh, type V3 } from './mesh-shell';

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const deg = (d: number): number => (d * Math.PI) / 180;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 绕 x 轴转 θ（y' = y·cos − z·sin，z' = y·sin + z·cos）：θ > 0 把 +y 转向 +z、+z 转向 −y（低头 / 向前弯） */
const rotX = (v: V3, t: number): V3 => [v[0], v[1] * Math.cos(t) - v[2] * Math.sin(t), v[1] * Math.sin(t) + v[2] * Math.cos(t)];
/** 绕 y 轴转 θ（与 rotateVertsY 同式：x' = x·cos − z·sin，z' = x·sin + z·cos） */
const rotY = (v: V3, t: number): V3 => [v[0] * Math.cos(t) - v[2] * Math.sin(t), v[1], v[0] * Math.sin(t) + v[2] * Math.cos(t)];
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * 两节骨的反向运动学：根 a、目标 t、两节长 l1 / l2、关节朝 pole 那一侧弯。返回关节点；目标够不着时整条伸直
 * 指向目标（骨长永远不变——调用方用 `reach` 求末端，而不是直接拿目标当末端）。
 */
function ik2(a: V3, t: V3, l1: number, l2: number, pole: V3): V3 {
  const d0 = sub(t, a);
  const dir = norm(d0);
  const d = clamp(len(d0), Math.abs(l1 - l2) + 1e-6, l1 + l2 - 1e-6);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return add(add(a, scale(dir, x)), scale(ortho(pole, dir), h));
}
/** 从关节朝目标走一节骨长（目标够不着时停在骨长处） */
const reach = (j: V3, t: V3, l: number): V3 => add(j, scale(norm(sub(t, j)), l));

/** 周期曲线：关键帧 (t ∈ [0,1), 值) 做非均匀 Catmull-Rom，首尾相接（步态曲线用） */
function periodic(keys: readonly (readonly [number, number])[]): (t: number) => number {
  const n = keys.length;
  return (t0: number): number => {
    const t = t0 - Math.floor(t0);
    let i = n - 1;
    for (let k = 0; k < n; k++) if (keys[k][0] <= t) i = k;
    const at = (k: number): [number, number] => {
      const w = Math.floor(k / n);
      const [kt, kv] = keys[((k % n) + n) % n];
      return [kt + w, kv];
    };
    const [t0k, p0] = at(i - 1);
    const [t1, p1] = at(i);
    const [t2, p2] = at(i + 1);
    const [t3, p3] = at(i + 2);
    const h = t2 - t1;
    const s = (t - t1) / h;
    const m1 = (p2 - p0) / (t2 - t0k);
    const m2 = (p3 - p1) / (t3 - t1);
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p1 + (s3 - 2 * s2 + s) * h * m1 + (-2 * s3 + 3 * s2) * p2 + (s3 - s2) * h * m2;
  };
}

// ── 分色：每种颜色一个壳组，台架按组上色 ────────────────────────────────────────

/** 零件的颜色类别（颜色本身由台架给：几何不管颜色，同一类可以每个人一个颜色） */
export type Tone = 'skin' | 'hair' | 'shirt' | 'pants' | 'shoe' | 'fur' | 'muzzle' | 'eye' | 'shine' | 'nose' | 'stripe';

/** 一组同色零件：挂在身子上还是头上（头单独绕枢轴转） */
export interface RigPart {
  tone: Tone;
  on: 'body' | 'head';
  mesh: PartMesh;
}

/** 一件东西（身子或头）的分色壳组：同一套变换作用在所有颜色上 */
class Toned {
  private readonly groups = new Map<Tone, ShellBuilder>();
  b(tone: Tone): ShellBuilder {
    let g = this.groups.get(tone);
    if (!g) this.groups.set(tone, (g = new ShellBuilder()));
    return g;
  }
  get builders(): ShellBuilder[] {
    return [...this.groups.values()];
  }
  map(fn: (p: V3) => V3): void {
    for (const g of this.builders) g.map(fn);
  }
  minY(): number {
    let m = Infinity;
    for (const g of this.builders) for (let k = 1; k < g.pos.length; k += 3) m = Math.min(m, g.pos[k]);
    return m;
  }
  /** 模型系（y 向上）→ 世界（y 向下）：均匀放缩 k，y 取反（镜像 ⇒ build(true) 翻绕向） */
  toWorld(k: number, dy: number, on: RigPart['on']): RigPart[] {
    return [...this.groups].map(([tone, g]) => {
      g.map((p) => [p[0] * k, -(p[1] + dy) * k, p[2] * k]);
      return { tone, on, mesh: g.build(true) };
    });
  }
}

/** 一块长方体零件：中心 + 三条半轴（不必与坐标轴对齐） */
type Box3 = { c: V3; axes: [V3, V3, V3] };
const putBox = (b: ShellBuilder, name: string, x: Box3): void => void b.box(name, x.c, ...x.axes);
const axisBox = (c: V3, h: V3): Box3 => ({ c, axes: [[h[0], 0, 0], [0, h[1], 0], [0, 0, h[2]]] });

/**
 * 两个关节之间的一节方块：沿 a → c，两端各多伸出 extA / extC 插进相邻那节（关节处不露缝）；
 * 横向半宽 hw 沿 X 去掉沿节分量，前后半厚 hd 沿与两者垂直的方向。
 */
function segBox(a: V3, c: V3, hw: number, hd: number, extA: number, extC: number): Box3 {
  const along = norm(sub(c, a));
  const lat = Math.abs(along[0]) > 0.95 ? ortho(Z, along) : ortho(X, along);
  const dep = norm(cross(along, lat));
  const L = len(sub(c, a)) + extA + extC;
  return { c: add(a, scale(along, L / 2 - extA)), axes: [scale(lat, hw), scale(along, L / 2), scale(dep, hd)] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 人
// ═══════════════════════════════════════════════════════════════════════════

/** 节段端点高度与长度（占身高 H）：Drillis & Contini 1966（Winter 图 4.1） */
export const HUMAN = {
  SHOULDER: 0.818,
  ELBOW: 0.63,
  WRIST: 0.485,
  HIP: 0.53,
  KNEE: 0.285,
  ANKLE: 0.039,
  CHIN: 0.87,
  UPPER_ARM: 0.186,
  FOREARM: 0.146,
  HAND: 0.108,
  THIGH: 0.245,
  SHANK: 0.246,
  SHOULDER_W: 0.259,
  CHEST_W: 0.174,
  HIP_W: 0.191,
  FOOT_L: 0.152,
  FOOT_W: 0.055,
} as const;

/** 不在 Drillis 表里、由它推出的几个量（占 H） */
const HB = {
  /** 髋关节离中线（两髋关节间距 ≈ 0.10H ≈ 17 cm） */
  hipX: 0.05,
  /** 肩关节离中线、在躯干上的位置：方块上臂贴在胸块外侧（胸块半宽 0.1 + 上臂半宽 0.0195，再往里压 1 mm） */
  shoulderX: 0.1185,
  shoulderS: 0.276,
  /** 头的枢轴到头顶（发顶）：头块中心 0.062 之上、发帽顶面 0.1315 */
  headTop: 0.1315,
  /** 一步长（同侧脚两次落地之间）≈ 0.82H：1.70 m 的人约 1.4 m */
  stride: 0.82,
} as const;

/**
 * 方块人的零件尺寸（半边长，占 H；1.70 m 的人 0.01H ≈ 1.7 cm）。相邻零件一大一小套在一起，侧面不共面：
 * 胸块比胯块宽、大腿比小腿粗、上臂比前臂粗；鞋比小腿宽。
 */
export const HUMAN_BOX = {
  /** 胯（裤）：沿脊柱 s −0.005 … 0.10 */
  PELVIS: [0.094, 0.0525, 0.05] as V3,
  /** 胸（衣）：沿脊柱 s 0.09 … 0.305 */
  CHEST: [0.1, 0.1075, 0.056] as V3,
  /** [横半宽, 前后半厚] */
  THIGH: [0.042, 0.04] as const,
  SHIN: [0.037, 0.036] as const,
  UPPER_ARM: [0.0195, 0.0205] as const,
  FOREARM: [0.0175, 0.0185] as const,
  /** 手：[沿手指半长, 掌宽半宽, 掌厚半厚] */
  HAND: [0.045, 0.021, 0.0125] as const,
  NECK: [0.028, 0.027] as const,
  /** 鞋（脚的局部系，原点 = 踝）：中心与半边长；鞋底在踝下 0.039、鞋尖在踝前 0.107、鞋跟在踝后 0.045 */
  SHOE_C: [0, -0.0115, 0.031] as V3,
  SHOE: [0.04, 0.0275, 0.076] as V3,
  /** 头块（头的局部系，原点 = 枢轴） */
  HEAD_C: [0, 0.062, 0.006] as V3,
  HEAD: [0.0575, 0.0675, 0.06] as V3,
} as const;

export type HumanPose = 'stand' | 'walk' | 'sit';

/** 座面（相对坐着的人的站点 = 平面模型的座位点，沿他的朝向量；单位与 height 相同） */
export interface SeatSpec {
  /** 座面顶离地 */
  top: number;
  /** 站点到座面前缘 */
  front: number;
  /** 站点到靠背前面（站点身后） */
  back: number;
  /** 座面板厚 */
  thick: number;
  /** 靠背顶离地 */
  backTop: number;
}

/** 标准座面（米，1.70 m 的人）：cohabit-solid.FURN 的沙发——离地 0.45、板厚 0.08、靠背高 0.85，座位点在前缘后 0.55、靠背前 0.15 */
const SEAT_M = { top: 0.45, front: 0.55, back: 0.15, thick: 0.08, backTop: 0.85 } as const;
const STATURE_M = 1.7;

interface LegJ {
  hip: V3;
  knee: V3;
  ankle: V3;
  /** 脚的俯仰（脚尖向上为正）与外撇（向外为正） */
  pitch: number;
  out: number;
}
interface ArmJ {
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  hand: V3;
  palm: V3;
}
interface HumanJ {
  pelvis: V3;
  pelvisPitch: number;
  trunkPitch: number;
  legs: [LegJ, LegJ];
  arms: [ArmJ, ArmJ];
  /** 头的绝对俯仰（抬头为正，与躯干无关） */
  headPitch: number;
}

/** 脊柱：骨盆段与胸廓段的倾角在 s 0.03–0.14 之间平滑过渡；返回 s 处的中心与「上 / 前」方向 */
function spineAt(j: Pick<HumanJ, 'pelvis' | 'pelvisPitch' | 'trunkPitch'>, s: number): { c: V3; up: V3; fwd: V3 } {
  const ang = (q: number): number => j.pelvisPitch + (j.trunkPitch - j.pelvisPitch) * smoothstep(0.03, 0.14, q);
  const n = Math.max(1, Math.ceil(Math.abs(s) / 0.002));
  const h = s / n;
  let c = j.pelvis;
  for (let k = 0; k < n; k++) {
    const a = ang((k + 0.5) * h);
    c = add(c, [0, Math.cos(a) * h, Math.sin(a) * h]);
  }
  const a = ang(s);
  return { c, up: [0, Math.cos(a), Math.sin(a)], fwd: [0, -Math.sin(a), Math.cos(a)] };
}

const shoulderOf = (j: Pick<HumanJ, 'pelvis' | 'pelvisPitch' | 'trunkPitch'>, side: number): V3 => {
  const sp = spineAt(j, HB.shoulderS);
  return add(add(sp.c, [side * HB.shoulderX, 0, 0]), scale(sp.fwd, -0.006));
};

/** 颈：从躯干顶（s 0.285）往前倾 0.18 rad 伸出，长度在模块加载时按站姿标定，使站着的头顶（发顶）恰好 = 1.000H */
let NECK_LEN = 0.06;
function neckOf(j: Pick<HumanJ, 'pelvis' | 'pelvisPitch' | 'trunkPitch'>): { base: V3; pivot: V3 } {
  const sp = spineAt(j, 0.285);
  const base = add(sp.c, scale(sp.fwd, -0.006));
  const a = j.trunkPitch + 0.18;
  return { base, pivot: add(base, scale([0, Math.cos(a), Math.sin(a)], NECK_LEN)) };
}

/** 手掌：手指方向 hand、掌心法向 palm（与 hand 正交） */
function handOf(dir: V3, palm: V3): { hand: V3; palm: V3 } {
  const hand = norm(dir);
  return { hand, palm: ortho(palm, hand) };
}

/** 一条腿的正向运动学（髋屈 / 膝屈 / 踝背屈，弧度）；外展 ab 只给大腿 */
function legFK(hip: V3, side: number, hipFlex: number, kneeFlex: number, ankle: number, ab: number, out: number): LegJ {
  const knee = add(hip, scale(norm([side * Math.sin(ab), -Math.cos(hipFlex), Math.sin(hipFlex)]), HUMAN.THIGH));
  const sig = hipFlex - kneeFlex;
  const ank = add(knee, scale([0, -Math.cos(sig), Math.sin(sig)], HUMAN.SHANK));
  // 小腿远端在膝前 sig 时，踝中立的脚尖就抬起 sig；再加踝背屈
  return { hip, knee, ankle: ank, pitch: sig + ankle, out };
}

/** 一条臂的正向运动学：上臂外展 / 前屈，肘屈（向前弯）；手顺着前臂、掌心朝腿 */
function armFK(S: V3, side: number, abd: number, flex: number, elbowFlex: number): ArmJ {
  const d1 = norm([side * Math.sin(abd), -Math.cos(abd) * Math.cos(flex), Math.cos(abd) * Math.sin(flex)]);
  const elbow = add(S, scale(d1, HUMAN.UPPER_ARM));
  const d2 = rotX(d1, -elbowFlex);
  const wrist = add(elbow, scale(d2, HUMAN.FOREARM));
  const h = handOf(d2, [-side, 0, 0]);
  return { shoulder: S, elbow, wrist, hand: h.hand, palm: h.palm };
}

/** 站姿：两腿直立略外展、脚尖外撇 7°、两臂垂在身侧（方块人：外展 3°、肘微屈 6°） */
function standJ(): HumanJ {
  const ab = deg(2.6);
  // 髋高按「踝恰好落在 0.039H」反推：大腿外展后竖向投影略短于骨长
  const hipY = HUMAN.ANKLE + HUMAN.THIGH / Math.hypot(1, Math.tan(ab)) + HUMAN.SHANK;
  const base = { pelvis: [0, hipY, 0] as V3, pelvisPitch: 0, trunkPitch: 0.02 };
  const legs = [1, -1].map((s) => {
    const hip: V3 = [s * HB.hipX, hipY, 0];
    const knee = add(hip, scale(norm([s * Math.tan(ab), -1, 0]), HUMAN.THIGH));
    return { hip, knee, ankle: add(knee, [0, -HUMAN.SHANK, 0]), pitch: 0, out: deg(7) };
  }) as [LegJ, LegJ];
  const arms = [1, -1].map((s) => armFK(shoulderOf(base, s), s, deg(3), deg(1), deg(6))) as [ArmJ, ArmJ];
  return { ...base, legs, arms, headPitch: 0 };
}

/** 正常步行矢状面关节角（度；周期从本侧脚跟着地起算）：常见的成人步态曲线（Perry / Winter 量级） */
const GAIT = {
  hip: periodic([[0, 20], [0.1, 18], [0.3, 4], [0.5, -15], [0.6, -8], [0.73, 12], [0.87, 22]]),
  knee: periodic([[0, 3], [0.15, 17], [0.3, 7], [0.42, 5], [0.5, 14], [0.56, 28], [0.62, 42], [0.72, 62], [0.82, 45], [0.92, 12]]),
  ankle: periodic([[0, 0], [0.08, -6], [0.3, 6], [0.45, 12], [0.5, 14], [0.58, 0], [0.65, -12], [0.72, -4], [0.8, 6], [0.92, 2]]),
} as const;

/** 走：左腿相位 phase、右腿错半个周期；躯干前倾 3°；手臂与同侧腿反向摆，向前摆时肘屈得多一些 */
function walkJ(phase: number): HumanJ {
  const base = { pelvis: [0, HUMAN.HIP, 0] as V3, pelvisPitch: 0.03, trunkPitch: 0.05 };
  const legs = [1, -1].map((s) => {
    const p = phase + (s > 0 ? 0 : 0.5);
    return legFK([s * HB.hipX, HUMAN.HIP, 0], s, deg(GAIT.hip(p)), deg(GAIT.knee(p)), deg(GAIT.ankle(p)), deg(1.5), deg(6));
  }) as [LegJ, LegJ];
  const arms = [1, -1].map((s) => {
    const p = phase + (s > 0 ? 0 : 0.5);
    const flex = -0.6 * (GAIT.hip(p) - 3);
    return armFK(shoulderOf(base, s), s, deg(3), deg(flex), deg(12 + 0.6 * Math.max(0, flex)));
  }) as [ArmJ, ArmJ];
  return { ...base, legs, arms, headPitch: 0.02 };
}

/** 鞋尖下沿离踝（脚的局部系） */
const TOE_Z = HUMAN_BOX.SHOE_C[2] + HUMAN_BOX.SHOE[2];
const SOLE_Y = HUMAN_BOX.SHOE_C[1] - HUMAN_BOX.SHOE[1];

/** 脚尖往下压多少（弧度）踝高 a 时鞋尖下沿正好碰地：|SOLE_Y|·cos q + TOE_Z·sin q = a（踝不比鞋底高时为 0） */
function toeDown(a: number): number {
  if (a <= -SOLE_Y) return 0;
  let lo = 0, hi = 1.2;
  for (let k = 0; k < 60; k++) {
    const q = (lo + hi) / 2;
    if (-SOLE_Y * Math.cos(q) + TOE_Z * Math.sin(q) < a) lo = q;
    else hi = q;
  }
  return (lo + hi) / 2;
}

/**
 * 坐：按座面解出来（全部占 H）。方块不能像软组织那样压扁在座面上，故**大腿整块平放**：
 *   ① 髋关节高 = 座面 + 大腿半厚 ⇒ 大腿块下面正好落在座面上；
 *   ② 膝关节在座面前缘前 0.045H ⇒ 小腿块（半厚 0.036H）整段让开座面板前缘；
 *   ③ 小腿竖直往下一节骨长；1.70 m 的人坐 0.45 m 的座面，踝离地比鞋底高一点 ⇒ 脚尖往下压，**鞋尖正好点地**；
 *   ④ 大腿按骨长从膝倒推到髋 ⇒ 人坐在座面的前半（0.8 m 深的沙发，脚着地就靠不到靠背）。
 * lean = 前倾看猫：躯干前屈、两手垂在两膝之间；不前倾 = 坐直略后仰、两手平放在大腿上。
 */
function sitJ(seat: SeatSpec, lean: boolean): HumanJ {
  const yHip = seat.top + HUMAN_BOX.THIGH[1];
  const zKnee = seat.front + 0.045;
  const legs = [1, -1].map((s) => {
    const xh = s * HB.hipX, xk = s * 0.054, xa = s * 0.056;
    const hip: V3 = [xh, yHip, zKnee - Math.sqrt(HUMAN.THIGH ** 2 - (xk - xh) ** 2)];
    const knee: V3 = [xk, yHip, zKnee];
    const ankle: V3 = [xa, yHip - Math.sqrt(HUMAN.SHANK ** 2 - (xa - xk) ** 2), zKnee];
    return { hip, knee, ankle, pitch: -toeDown(ankle[1]), out: deg(8) };
  }) as [LegJ, LegJ];
  const hipZ = legs[0].hip[2];
  const base = { pelvis: [0, yHip, hipZ] as V3, pelvisPitch: lean ? 0.06 : 0, trunkPitch: lean ? 0.42 : -0.05 };
  const arms = [1, -1].map((s, i) => {
    const S = shoulderOf(base, s);
    const L = legs[i];
    if (lean) {
      // 两手垂在两膝前面之间，肘朝外后
      const wrist: V3 = [s * 0.03, yHip + 0.085, zKnee + 0.05];
      const elbow = ik2(S, wrist, HUMAN.UPPER_ARM, HUMAN.FOREARM, [s * 0.8, -0.3, -0.4]);
      const h = handOf([-s * 0.2, -0.85, 0.45], [-s, 0, 0]);
      return { shoulder: S, elbow, wrist: reach(elbow, wrist, HUMAN.FOREARM), hand: h.hand, palm: h.palm };
    }
    // 手平放在大腿块顶面上（隔 2 mm），手指朝膝
    const onThigh: V3 = [s * 0.052, yHip + HUMAN_BOX.THIGH[1] + HUMAN_BOX.HAND[2] + 0.002, L.hip[2] + 0.4 * (zKnee - L.hip[2])];
    const elbow = ik2(S, onThigh, HUMAN.UPPER_ARM, HUMAN.FOREARM, [s * 0.7, -0.2, -1]);
    const h = handOf(Z, [0, -1, 0]);
    return { shoulder: S, elbow, wrist: reach(elbow, onThigh, HUMAN.FOREARM), hand: h.hand, palm: h.palm };
  }) as [ArmJ, ArmJ];
  return { ...base, legs, arms, headPitch: lean ? 0.12 : 0.05 };
}

/** 身子：胯（裤）、胸（衣）、颈（肤）、两臂（袖 + 手）、两腿（裤 + 鞋） */
function buildHumanBody(t: Toned, j: HumanJ): void {
  const B = HUMAN_BOX;
  const sp0 = spineAt(j, 0.0475);
  putBox(t.b('pants'), 'pelvis', { c: sp0.c, axes: [[B.PELVIS[0], 0, 0], scale(sp0.up, B.PELVIS[1]), scale(sp0.fwd, B.PELVIS[2])] });
  const sp1 = spineAt(j, 0.1975);
  putBox(t.b('shirt'), 'chest', { c: add(sp1.c, scale(sp1.fwd, 0.002)), axes: [[B.CHEST[0], 0, 0], scale(sp1.up, B.CHEST[1]), scale(sp1.fwd, B.CHEST[2])] });
  const nk = neckOf(j);
  putBox(t.b('skin'), 'neck', segBox(nk.base, nk.pivot, B.NECK[0], B.NECK[1], 0.02, 0.012));
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const tag = i === 0 ? 'l' : 'r';
    const L = j.legs[i];
    const A = j.arms[i];
    putBox(t.b('pants'), `thigh-${tag}`, segBox(L.hip, L.knee, B.THIGH[0], B.THIGH[1], 0.052, 0.015));
    putBox(t.b('pants'), `shin-${tag}`, segBox(L.knee, L.ankle, B.SHIN[0], B.SHIN[1], 0.015, 0.008));
    // 鞋：在脚的局部系里摆好，再按俯仰、外撇转到踝上
    const R = (v: V3): V3 => rotY(rotX(v, -L.pitch), -s * L.out);
    putBox(t.b('shoe'), `shoe-${tag}`, { c: add(L.ankle, R(B.SHOE_C)), axes: [R([B.SHOE[0], 0, 0]), R([0, B.SHOE[1], 0]), R([0, 0, B.SHOE[2]])] });
    putBox(t.b('shirt'), `upperarm-${tag}`, segBox(A.shoulder, A.elbow, B.UPPER_ARM[0], B.UPPER_ARM[1], 0.024, 0.012));
    putBox(t.b('shirt'), `forearm-${tag}`, segBox(A.elbow, A.wrist, B.FOREARM[0], B.FOREARM[1], 0.012, 0.006));
    const [hl, hw, ht] = B.HAND;
    const across = norm(cross(A.hand, A.palm));
    putBox(t.b('skin'), `hand-${tag}`, { c: add(A.wrist, scale(A.hand, hl - 0.006)), axes: [scale(across, hw), scale(A.hand, hl), scale(A.palm, ht)] });
  }
}

/**
 * 头（局部系：原点 = 枢轴，y 向上，z 朝前）：头块（肤）、发帽与后脑头发（发；刘海比额头凸出 2.5 mm）、
 * 两只眼睛（深色，位置偏低）与高光（白）。点缀件都比所贴的面凸出一两毫米，不共面。
 */
function buildHumanHead(t: Toned, pitch: number): void {
  const B = HUMAN_BOX;
  putBox(t.b('skin'), 'head', axisBox(B.HEAD_C, B.HEAD));
  putBox(t.b('hair'), 'hair-cap', axisBox([0, 0.1125, 0.0065], [0.0595, 0.019, 0.062]));
  putBox(t.b('hair'), 'hair-back', axisBox([0, 0.07, -0.0555], [0.0588, 0.03, 0.006]));
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'l' : 'r';
    // 眼睛大、位置偏低（可爱的办法，与猫同一套）；高光在外上角
    putBox(t.b('eye'), `eye-${tag}`, axisBox([s * 0.025, 0.054, 0.0675], [0.0105, 0.0125, 0.002]));
    putBox(t.b('shine'), `shine-${tag}`, axisBox([s * 0.0295, 0.0605, 0.07], [0.0038, 0.0038, 0.0012]));
  }
  if (pitch) t.map((p) => rotX(p, -pitch));
}

function humanJoints(pose: HumanPose, phase: number, seat: SeatSpec, lean: boolean): HumanJ {
  if (pose === 'walk') return walkJ(phase);
  if (pose === 'sit') return sitJ(seat, lean);
  return standJ();
}

/** 身子建好、着地：返回分色壳组与着地抬了多少（占 H；站 / 坐 = 0，走 = 支撑脚着地） */
function groundedBody(j: HumanJ): { t: Toned; lift: number } {
  const t = new Toned();
  buildHumanBody(t, j);
  return { t, lift: -t.minY() };
}

/**
 * 骨架（占 H，模型系 y 向上、已着地）：守门用——关节高度对不对得上 Drillis 表、各姿态骨长是不是一个数没变、
 * 脚尖是不是朝前。台架不用它。
 */
export function humanSkeleton(pose: HumanPose, opts: { phase?: number; seat?: SeatSpec; lean?: boolean } = {}): {
  legs: { hip: V3; knee: V3; ankle: V3; pitch: number; out: number }[];
  arms: { shoulder: V3; elbow: V3; wrist: V3 }[];
} {
  const j = humanJoints(pose, opts.phase ?? 0, opts.seat ?? defaultSeat(1), opts.lean ?? false);
  const lift = groundedBody(j).lift;
  const up = (p: V3): V3 => [p[0], p[1] + lift, p[2]];
  return {
    legs: j.legs.map((l) => ({ ...l, hip: up(l.hip), knee: up(l.knee), ankle: up(l.ankle) })),
    arms: j.arms.map((a) => ({ shoulder: up(a.shoulder), elbow: up(a.elbow), wrist: up(a.wrist) })),
  };
}

// 标定颈长：站姿下发顶恰好 = 1.000H（发顶在枢轴上 HB.headTop）
{
  const j = standJ();
  const nk0 = neckOf(j);
  const dir = norm(sub(nk0.pivot, nk0.base));
  NECK_LEN = (1 - HB.headTop - nk0.base[1]) / dir[1];
}

/** 一个人 / 一只猫拆成按颜色分组的零件（身子一组组、头一组组），各在自己的局部系里（世界尺寸、y 向下）；台架按件缓存、按处摆放 */
export interface Rig {
  parts: RigPart[];
  /** 身子（全部颜色并在一起）：脚底在 y 0、站点在原点、面朝 +Z（yaw 0） */
  body: PartMesh;
  /** 头（全部颜色并在一起）：原点 = 枢轴，面朝 +Z；摆的时候绕枢轴转 yaw */
  head: PartMesh;
  /** 枢轴在身子局部系里的位置 */
  pivot: V3;
  /** 头的基准朝向（相对身子；猫弯过去时脖子跟着转了这么多） */
  headYaw: number;
}

function rigOf(parts: RigPart[], pivot: V3, headYaw: number): Rig {
  const body = mergeParts(parts.filter((p) => p.on === 'body').map((p) => p.mesh));
  const head = mergeParts(parts.filter((p) => p.on === 'head').map((p) => p.mesh));
  return { parts, body, head, pivot, headYaw };
}

export interface HumanRigSpec {
  /** 身高（世界单位） */
  height: number;
  pose?: HumanPose;
  /** 步态相位（0–1，左脚跟着地 = 0；只对 walk 有用） */
  phase?: number;
  /** 座面（世界单位；只对 sit 有用，省略 = 标准沙发按身高等比） */
  seat?: SeatSpec;
  /** 坐着前倾（看猫） */
  lean?: boolean;
}

/** 头能转多远（相对身子；人颈部主动旋转约 70–80°） */
export const HEAD_YAW_MAX = deg(75);
export const clampHeadYaw = (rel: number, max: number = HEAD_YAW_MAX): number => clamp(wrapPi(rel), -max, max);

export function defaultSeat(height: number): SeatSpec {
  const k = height / STATURE_M;
  return { top: SEAT_M.top * k, front: SEAT_M.front * k, back: SEAT_M.back * k, thick: SEAT_M.thick * k, backTop: SEAT_M.backTop * k };
}

export function humanRig(spec: HumanRigSpec): Rig {
  const H = spec.height;
  const seatW = spec.seat ?? defaultSeat(H);
  const seat: SeatSpec = { top: seatW.top / H, front: seatW.front / H, back: seatW.back / H, thick: seatW.thick / H, backTop: seatW.backTop / H };
  const j = humanJoints(spec.pose ?? 'stand', spec.phase ?? 0, seat, spec.lean ?? false);
  const { t, lift } = groundedBody(j);
  const pivot0 = neckOf(j).pivot;
  const head = new Toned();
  buildHumanHead(head, j.headPitch);
  return rigOf([...t.toWorld(H, lift, 'body'), ...head.toWorld(H, 0, 'head')], [pivot0[0] * H, -(pivot0[1] + lift) * H, pivot0[2] * H], 0);
}

export interface FigureSpec {
  /** 站点（坐着 = 座位点）；脚底所在的地面高度 = footY（世界 Y 向下为正） */
  x: number;
  z: number;
  footY: number;
  /** 身高（世界单位） */
  height: number;
  /** 朝向：绕世界 Y，0 = 面朝 +Z */
  yaw?: number;
  pose?: HumanPose;
  phase?: number;
  seat?: SeatSpec;
  lean?: boolean;
  /** 头相对身子转多少（会被夹在 ±HEAD_YAW_MAX） */
  headYaw?: number;
}

/** 把一副 Rig 摆到世界、按颜色分组：身子 yaw + 平移，头绕枢轴再转 headYaw */
export function placeRigParts(r: Rig, x: number, y: number, z: number, yaw: number, headYaw: number): { tone: Tone; mesh: PartMesh }[] {
  const pc = Math.cos(yaw), ps = Math.sin(yaw);
  const pv: V3 = [r.pivot[0] * pc - r.pivot[2] * ps + x, r.pivot[1] + y, r.pivot[0] * ps + r.pivot[2] * pc + z];
  const hy = yaw + r.headYaw + headYaw;
  return r.parts.map((p) => ({ tone: p.tone, mesh: p.on === 'body' ? placePart(p.mesh, yaw, [x, y, z]) : placePart(p.mesh, hy, pv) }));
}

/** 摆好并成一块（守门、包围盒用） */
export function placeRig(r: Rig, x: number, y: number, z: number, yaw: number, headYaw: number): PartMesh {
  return mergeParts(placeRigParts(r, x, y, z, yaw, headYaw).map((p) => p.mesh));
}

/** 人在世界里按颜色分组的零件（布景用） */
export function figureParts(spec: FigureSpec): { tone: Tone; mesh: PartMesh }[] {
  return placeRigParts(humanRig(spec), spec.x, spec.footY, spec.z, spec.yaw ?? 0, clampHeadYaw(spec.headYaw ?? 0));
}

/** 人的完整网格（世界坐标）：守门与包围盒用；台架按件缓存走 humanRig */
export function figureMesh(spec: FigureSpec): PartMesh {
  return mergeParts(figureParts(spec).map((p) => p.mesh));
}

/** 旧接口：只要位置与索引 */
export function figureVerts(spec: FigureSpec): { verts: Float32Array; idx: Uint32Array } {
  const m = figureMesh(spec);
  return { verts: m.verts, idx: m.idx };
}

/** 小人的世界包围盒（取景与守门用） */
export function figureBox(spec: FigureSpec): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  return partBox(figureMesh(spec));
}

/** 一步长（世界单位）：台架按走过的路程推步态相位 */
export const strideOf = (height: number): number => HB.stride * height;
// ═══════════════════════════════════════════════════════════════════════════
// 猫（方块风，2026-10-25 作者「猫不够可爱……学习 Minecraft 的就行」）
// ═══════════════════════════════════════════════════════════════════════════
//
// 原创的方块猫，不搬 Minecraft 的模型与贴图（版权在 Mojang / 微软；作品集里放游戏素材也说不清原创），
// 只学它让小动物显得可爱的几条办法：
//   ① 全部是长方体，尺寸落在 2 cm 的「像素」格上（细节用半格）；
//   ② 大头：头比身子宽（7 格对 6 格），脸是平的，口鼻只凸出一格，鼻头一小块粉色；
//   ③ 大眼睛、位置偏低，每只右上角一颗白色高光像素；
//   ④ 短而粗的腿，走起来按对角两两前后摆（玩具式的步子）；
//   ⑤ 尾巴分三节：打招呼时竖起来、末节往前勾，坐下时贴地往后伸、末端翘起。
// 总尺寸仍是家猫（鼻到臀约 0.42 m、背高约 0.22 m、耳尖约 0.36 m），它在这里还是比例参考。
// 正确性：每个零件是闭合长方体、各姿态下尺寸一个数不变（只摆、不缩放），零件之间相接处要么插进去、要么错开一毫米以上，
// **没有两个同朝向的面落在同一平面上又互相重叠**（那就是旧模型闪烁的来源，守门在 figure.test.ts）。

/** 一格「像素」（米） */
const PX = 0.02;

/** 方块猫的零件尺寸（米，半边长）；所有姿态共用，只换摆法 */
export const CAT = {
  VOXEL: PX,
  /** 腿：2 × 5.5 × 2 格（上端半格插进身子） */
  LEG: [0.02, 0.055, 0.02] as V3,
  /** 后段（胯）比前段（胸）每边大一点点：并排时侧面、顶面不共面 */
  REAR: [0.065, 0.062, 0.07] as V3,
  FRONT: [0.06, 0.06, 0.07] as V3,
  /** 头：7 × 6 × 6 格，比身子宽 */
  HEAD: [0.07, 0.06, 0.06] as V3,
  /** 尾巴三节，粗细一节比一节细一点（相邻两节在关节处套在一起，不共面） */
  TAIL_HALF: [0.015, 0.0142, 0.0134] as const,
  /** 一步长（米）：走的时候按路程推相位 */
  STRIDE: 0.2,
} as const;

export type CatPose = 'stand' | 'walk' | 'sit' | 'lie' | 'curl';
export type CatTail = 'relaxed' | 'up';

/**
 * 头（局部系：原点 = 颈端枢轴，y 向上，z 朝前），按颜色分组：毛色（头块、两只耳朵——耳根 + 耳尖两级台阶）、
 * 眼睛（深色，2×2 格、位置偏低）、高光（白，外上角一颗）、口鼻（奶油色，只凸出一格——扁脸）、鼻头与耳内（粉）、
 * 额头三道虎斑（深姜黄）。点缀件都比所贴的面凸出一两毫米，不共面。
 */
function buildCatHead(t: Toned): void {
  const [hx, hy, hz] = CAT.HEAD;
  const fur = t.b('fur');
  fur.box('head', [0, 0.045, 0.06], [hx, 0, 0], [0, hy, 0], [0, 0, hz]);
  for (const s of [1, -1]) {
    const k = s > 0 ? 'l' : 'r';
    // 耳根插进头顶半格；耳尖往外偏，外侧比耳根外侧多出 1.5 mm，不共面
    fur.box(`ear-${k}`, [s * 0.042, 0.118, 0.035], [0.02, 0, 0], [0, 0.018, 0], [0, 0, 0.012]);
    fur.box(`eartip-${k}`, [s * 0.0515, 0.146, 0.035], [0.0115, 0, 0], [0, 0.012, 0], [0, 0, 0.009]);
    t.b('eye').box(`eye-${k}`, [s * 0.034, 0.052, 0.1215], [0.016, 0, 0], [0, 0.018, 0], [0, 0, 0.0035]);
    t.b('shine').box(`shine-${k}`, [s * 0.041, 0.062, 0.1262], [0.006, 0, 0], [0, 0.006, 0], [0, 0, 0.0018]);
    t.b('nose').box(`inear-${k}`, [s * 0.042, 0.123, 0.0485], [0.01, 0, 0], [0, 0.011, 0], [0, 0, 0.0018]);
  }
  t.b('muzzle').box('muzzle', [0, 0.01, 0.13], [0.032, 0, 0], [0, 0.02, 0], [0, 0, 0.012]);
  t.b('nose').box('nose', [0, 0.024, 0.1445], [0.011, 0, 0], [0, 0.007, 0], [0, 0, 0.0045]);
  for (const x of [-0.016, 0, 0.016])
    t.b('stripe').box(`stripe-${x < 0 ? 'r' : x > 0 ? 'l' : 'c'}`, [x, 0.088, 0.1213], [0.005, 0, 0], [0, x === 0 ? 0.015 : 0.011, 0], [0, 0, 0.0016]);
}

interface CatJ {
  rear: Box3;
  front: Box3;
  legs: (Box3 & { name: string })[];
  /** 尾巴的折点（4 个点 = 3 节） */
  tail: V3[];
  /** 颈端枢轴（头绕它转） */
  pivot: V3;
}

const axes3 = (h: V3): [V3, V3, V3] => [[h[0], 0, 0], [0, h[1], 0], [0, 0, h[2]]];

/** 竖着的腿：腿根是转轴（在身子里），腿从根往下，上端多出半格插进身子；up = 从脚到根的方向 */
function hangLeg(name: string, pivot: V3, up: V3): Box3 & { name: string } {
  const [hx, hy, hz] = CAT.LEG;
  const u = norm(up);
  const d = norm(cross(X, u)); // 与 u 垂直、在矢状面里
  return { name, c: sub(pivot, scale(u, hy - 0.005)), axes: [[hx, 0, 0], scale(u, hy), scale(d, hz)] };
}
/** 折起来平放的腿：长轴沿 z（爪朝前） */
function foldLeg(name: string, c: V3): Box3 & { name: string } {
  const [hx, hy, hz] = CAT.LEG;
  return { name, c, axes: [[hx, 0, 0], [0, hz, 0], [0, 0, hy]] };
}

/** 尾巴：起点 + 三节的方向，每节 0.09 m（共 0.27 m）——各姿态节长不变，只改方向 */
const TAIL_LEN = 0.09;
const tailChain = (start: V3, dirs: readonly V3[]): V3[] => {
  const out: V3[] = [start];
  for (const d of dirs) out.push(add(out[out.length - 1], scale(norm(d), TAIL_LEN)));
  return out;
};
/** 放松：从臀上往后略垂，末端翘起 */
const TAIL_RELAXED = tailChain([0, 0.2, -0.135], [[0, -0.2, -0.98], [0, 0.45, -0.89], [0, 0.9, -0.44]]);
/** 打招呼：竖起来，末节往前勾 */
const TAIL_UP = tailChain([0, 0.2, -0.135], [[0, 0.97, -0.26], [0, 1, -0.09], [0, 0.7, 0.71]]);

function catStandJ(tail: CatTail, swing: (i: number) => number = () => 0): CatJ {
  const spots: [string, number, number][] = [['fl', 1, 0.095], ['fr', -1, 0.095], ['hl', 1, -0.095], ['hr', -1, -0.095]];
  return {
    rear: { c: [0, 0.16, -0.07], axes: axes3(CAT.REAR) },
    front: { c: [0, 0.16, 0.07], axes: axes3(CAT.FRONT) },
    legs: spots.map(([name, s, z], i) => {
      const th = swing(i);
      return hangLeg(name, [s * 0.035, 0.105, z], [0, Math.cos(th), -Math.sin(th)]);
    }),
    tail: tail === 'up' ? TAIL_UP : TAIL_RELAXED,
    pivot: [0, 0.2, 0.13],
  };
}

/** 走：对角两腿一组（左前 + 右后 / 右前 + 左后）前后摆 ±26°，尾巴左右轻摇 */
function catWalkJ(phase: number, tail: CatTail): CatJ {
  const off = [0, 0.5, 0.5, 0]; // fl fr hl hr
  const j = catStandJ(tail, (i) => 0.45 * Math.sin(2 * Math.PI * (phase + off[i])));
  const sway = 0.25 * Math.sin(2 * Math.PI * phase);
  const base = j.tail[0];
  return { ...j, tail: j.tail.map((p) => add(base, rotY(sub(p, base), sway))) };
}

/** 坐：胯坐在地上，胸竖起来，前腿直撑在胸前，后腿折起来平放在胯两侧（比胯宽出半厘米；前端缩在胯前面后 5 mm，不与它共面、也不碰前腿），尾巴贴地往后、末端翘起 */
function catSitJ(): CatJ {
  return {
    rear: { c: [0, 0.062, -0.045], axes: axes3(CAT.REAR) },
    // 胸段竖起来：长轴（0.07）朝上
    front: { c: [0, 0.174, 0], axes: [[CAT.FRONT[0], 0, 0], [0, 0, CAT.FRONT[1]], [0, CAT.FRONT[2], 0]] },
    legs: [hangLeg('fl', [0.03, 0.105, 0.045], Y), hangLeg('fr', [-0.03, 0.105, 0.045], Y), foldLeg('hl', [0.05, 0.021, -0.035]), foldLeg('hr', [-0.05, 0.021, -0.035])],
    tail: tailChain([0, 0.02, -0.1], [[0, -0.03, -1], [0, 0.76, -0.65], [0, 0.97, 0.24]]),
    pivot: [0, 0.22, 0.045],
  };
}

/** 卧（揣手）：两段身子都趴在地上，前爪收在胸前、只露爪尖，后腿收在胯两侧；curl = 同一副，尾巴向后伸直（弯过去就绕成一圈） */
function catLieJ(curl: boolean): CatJ {
  return {
    rear: { c: [0, 0.062, -0.07], axes: axes3(CAT.REAR) },
    front: { c: [0, 0.06, 0.07], axes: axes3(CAT.FRONT) },
    legs: [foldLeg('fl', [0.028, 0.021, 0.12]), foldLeg('fr', [-0.028, 0.021, 0.12]), foldLeg('hl', [0.048, 0.021, -0.08]), foldLeg('hr', [-0.048, 0.021, -0.08])],
    tail: curl
      ? tailChain([0, 0.018, -0.13], [[0, 0, -1], [0, 0, -1], [0, 0, -1]])
      : tailChain([0.02, 0.018, -0.13], [[0.77, 0, -0.64], [0.2, 0, 0.98], [-0.03, 0, 1]]),
    pivot: [0, 0.115, 0.13],
  };
}

function catJoints(pose: CatPose, phase: number, tail: CatTail): CatJ {
  switch (pose) {
    case 'walk':
      return catWalkJ(phase, tail);
    case 'sit':
      return catSitJ();
    case 'lie':
      return catLieJ(false);
    case 'curl':
      return catLieJ(true);
    default:
      return catStandJ(tail);
  }
}

function buildCatBody(b: ShellBuilder, j: CatJ): void {
  b.box('rear', j.rear.c, ...j.rear.axes);
  b.box('front', j.front.c, ...j.front.axes);
  for (const L of j.legs) b.box(`leg-${L.name}`, L.c, ...L.axes);
  // 尾巴：每节一个长方体，两端各多出 8 mm 插进相邻那节（关节处不露缝）
  for (let i = 0; i + 1 < j.tail.length; i++) {
    const a = j.tail[i], c = j.tail[i + 1];
    const dir = norm(sub(c, a));
    // 横轴必须与这一节垂直：竖着的节用 X 去掉沿节的分量（走路时尾巴左右摇，节就不再在矢状面里）
    const side = Math.abs(dir[1]) > 0.95 ? ortho(X, dir) : norm(cross(Y, dir));
    const up = norm(cross(dir, side));
    const h = CAT.TAIL_HALF[i];
    b.box(`tail-${i}`, lerp3(a, c, 0.5), scale(side, h), scale(up, h), scale(dir, len(sub(c, a)) / 2 + 0.008));
  }
}

/** 骨架（米，模型系、着地前、弯之前）：守门用——尾巴折点、颈端枢轴 */
export function catSkeleton(pose: CatPose, opts: { phase?: number; tail?: CatTail } = {}): { tail: V3[]; pivot: V3 } {
  const j = catJoints(pose, opts.phase ?? 0, opts.tail ?? 'relaxed');
  return { tail: j.tail, pivot: j.pivot };
}

/**
 * 绕竖直轴弯：轴在模型系 x = −R 处（猫的右侧；在环形平台上就是立杆）。方块不能弯成弧，故**每个零件整块地转**——
 * 按它的中心沿 z 的距离算出转角，绕轴转过去（零件形状一个数不变），身子、腿、尾巴各节就顺着环排开。
 */
function bendRigid(b: ShellBuilder, R: number): void {
  for (const s of b.shells) {
    let cz = 0;
    for (let v = s.v0; v < s.v1; v++) cz += b.pos[v * 3 + 2];
    cz /= s.v1 - s.v0;
    const a = cz / R;
    const c = Math.cos(a), sn = Math.sin(a);
    for (let v = s.v0; v < s.v1; v++) {
      const x = b.pos[v * 3] + R, z = b.pos[v * 3 + 2] - cz;
      b.pos[v * 3] = x * c - z * sn - R;
      b.pos[v * 3 + 2] = x * sn + z * c;
    }
  }
}

export interface CatRigSpec {
  /** 一米 = 多少世界单位 */
  unit: number;
  pose?: CatPose;
  phase?: number;
  tail?: CatTail;
  /** 弯的半径（米；0 / 省略 = 直的）：猫身中线绕着身体右侧 R 处的竖直轴 */
  bend?: number;
}

/** 猫头能转多远（相对身子） */
export const CAT_HEAD_YAW_MAX = deg(90);

export function catRig(spec: CatRigSpec): Rig {
  const U = spec.unit;
  const j = catJoints(spec.pose ?? 'stand', spec.phase ?? 0, spec.tail ?? 'relaxed');
  const body = new Toned();
  buildCatBody(body.b('fur'), j);
  const R = spec.bend ?? 0;
  let pivot = j.pivot;
  let headYaw = 0;
  if (R > 0) {
    for (const b of body.builders) bendRigid(b, R);
    const a = j.pivot[2] / R;
    pivot = [-R + (j.pivot[0] + R) * Math.cos(a), j.pivot[1], (j.pivot[0] + R) * Math.sin(a)];
    headYaw = a;
  }
  const head = new Toned();
  buildCatHead(head);
  // 着地：身子与头（头只绕竖轴转，最低点不随它变）一起，最低点恰好贴在脚下那个面上
  const lift = -Math.min(body.minY(), head.minY() + pivot[1]);
  return rigOf([...body.toWorld(U, lift, 'body'), ...head.toWorld(U, 0, 'head')], [pivot[0] * U, -(pivot[1] + lift) * U, pivot[2] * U], headYaw);
}

export interface CatSpec {
  x: number;
  z: number;
  /** 脚底（或趴着的肚子）所在的面：地面或平台面的世界 Y */
  footY: number;
  /** 一米 = 多少世界单位 */
  unit: number;
  /** 朝向：绕世界 Y，0 = 面朝 +Z（与小人同） */
  yaw?: number;
  pose?: CatPose;
  phase?: number;
  tail?: CatTail;
  bend?: number;
  /** 头相对身子转多少（夹在 ±CAT_HEAD_YAW_MAX） */
  headYaw?: number;
}

export function catMesh(spec: CatSpec): PartMesh {
  const r = catRig(spec);
  return placeRig(r, spec.x, spec.footY, spec.z, spec.yaw ?? 0, clampHeadYaw(spec.headYaw ?? 0, CAT_HEAD_YAW_MAX));
}

/** 旧接口：只要位置与索引 */
export function catVerts(spec: CatSpec): { verts: Float32Array; idx: Uint32Array } {
  const m = catMesh(spec);
  return { verts: m.verts, idx: m.idx };
}
