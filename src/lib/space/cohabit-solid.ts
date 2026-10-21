/**
 * 项目二 · 人猫同台的立体演示（Lab 2-15，2026-10-21 立项：作者「老师也说我们缺一个直接演示立体空间里
 * 单元改变空间和其中的动物的直观演示」+「立体演示用 8×8」）——纯数学，零 DOM。
 *
 * 这一台不解新的物理：驱动它的是 Lab 2-14 那套仿真（`CohabitSim`，「走 · 站 · 坐」规则 · 只收挡路的带 ·
 * 访客有身体 · 猫能下地 · 猫按 Mertens & Turner 1988 标定），画的是 Lab 2-8 那间房（`skin-grid`）里的 8×8
 * 个单元，单元用 Lab 2-8 那只圆筒环（`buildRingUnits()[RING_DEFAULT_FORM]`，二十条带绕芯一圈）。
 *
 * ## 带子的形状从哪来
 *
 * 64 个单元 × 20 条带 = 1280 条带，各自都在落下、收回、开门。真跑 1280 条引擎做不到（一条带 1500 步
 * 的协议在浏览器里要 0.7 s），而 Lab 2-14 的平面模型也只给每条带两个数：所在单元的成形程度
 * （`act.degree`，跟随档，0–1）和这条带收回了几成（`bandOpen`）。于是**只跑一条引擎、把轨迹烘成关键帧**：
 * 正向协议（直带子 → 成形）取 `FRAMES.form` 帧，引擎的回程（`retractStep`，成形 → 松键回直）取
 * `FRAMES.retract` 帧；每条带按自己的两个数取帧（`bandFrame`）——程度在涨就查正向那条，在退就查回程那条。
 * 这是**必要的承认**：带子的形状逐帧是引擎算出来的，但「这一条带此刻该是哪一帧」是平面模型的两个标量定的，
 * 不是 1280 条布各自解出来的；两条轨迹之间切换的那一帧会有一点跳（回程不是正向的逐位倒放）。
 *
 * ## 尺度
 *
 * 房间与人取 Lab 2-8 的世界尺度（`MM_PER_UNIT`：1.70 m 的人 = 215 单位）；8×8 的单元按格距等比缩小
 * （`planLayout` 的 pitchM / pitch4，与 Lab 2-10 以来的平面台架同一条规则），装置的下缘仍钉在离地 1.08 m
 * （`RIG_ANCHOR_Y`）——平面模型里「平台底比坐着的头顶低」那条账就是按它算的。
 */
import { RING, RING_DEFAULT_FORM, buildRingUnits, type RingUnitDef } from './skin-ring';
import { SKIN, createSkinUnit, renderSmooth } from './skin-unit';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts, ringPlateVerts, rotateVertsY, type SolidTopology } from './skin-solid';
import { bakeIndexed } from '../linkage/gl3d';
import { MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, RING_GRID_FIT, RING_GRID_PIVOT_Y, ROOM, roomBoxesBySpan, viewFitBySpan, type RingGridView } from './skin-grid';
import type { PlanLayout } from './unit-activation';
import { bandAngle, type FurnRect } from './cohabit';

/** 一米 = 多少世界单位（由「人 = 1.70 m = 215 单位」定） */
export const UNITS_PER_M = 1000 / MM_PER_UNIT;

/** 关键帧数：正向 0.67 s（跟随档 1.5/s）、回程 2 s（0.5/s）——按 60 fps 下不重帧的量级取 */
export const FRAMES = { form: 32, retract: 24 } as const;

/** 演示的场面：六位访客两只猫 = 对照研究的中档（案例页对照图的三档之一） */
export const SCENE = { people: 6, cats: 2, seed: 11 } as const;

export interface BandTrajectory {
  n: number;
  /** 关键帧（正向在前、回程在后），每帧 = [px…, py…]（引擎单位，已做绘图平滑） */
  frames: Float64Array[];
  /** 带子钉住的那一端在装置自身坐标系里的高度（世界 Y 向下为正；注册在底端 ⇒ 全程不变） */
  footY: number;
  /** 成形后平台顶面的高度（装置自身坐标系） */
  platformTopY: number;
  /** 成形后挑出最远的半径（装置自身坐标系，从芯心量） */
  reach: number;
  /**
   * 回程里形状还在变的最后一帧（相对回程起点的下标）：回程 = 900 步回到 R0 + 600 步静置，
   * 静置段的帧逐位相同，取帧时退的那段只映射到会动的部分，免得门开到一半就不再动了。
   */
  retractActive: number;
}

/**
 * 轨迹烘焙：分片跑（`work` 按时间预算推进），好让台架在挂载后的头几帧里把它算完而不卡住主线程。
 * 一条 202 节的带全程 3000 步在桌面上约 1.5 s。
 */
export class TrajectoryBaker {
  readonly n: number;
  private readonly unit;
  private readonly smoothW: number;
  private readonly smoothP: number;
  private readonly formAt: number[];
  private readonly retractAt: number[];
  private readonly frames: Float64Array[] = [];
  private step = 0;
  private phase: 'form' | 'retract' | 'done' = 'form';
  private result: BandTrajectory | null = null;

  constructor(def: RingUnitDef = buildRingUnits()[RING_DEFAULT_FORM], frames = FRAMES) {
    this.unit = createSkinUnit(def.spec, def.opts);
    this.n = this.unit.n;
    [this.smoothW, this.smoothP] = def.smooth;
    const spread = (k: number, total: number): number[] => Array.from({ length: k }, (_, i) => Math.round((i / (k - 1)) * total));
    this.formAt = spread(frames.form, SKIN.STEPS);
    this.retractAt = spread(frames.retract, SKIN.STEPS);
    this.capture(); // 正向第 0 帧 = 直带子
  }

  get done(): boolean {
    return this.phase === 'done';
  }
  get trajectory(): BandTrajectory | null {
    return this.result;
  }
  /** 0–1 的进度（HUD 用） */
  get progress(): number {
    return this.phase === 'done' ? 1 : (this.phase === 'form' ? this.step : SKIN.STEPS + this.step) / (2 * SKIN.STEPS);
  }

  private capture(): void {
    const u = this.unit;
    const p = renderSmooth(u.px, u.py, this.smoothW, this.smoothP);
    const f = new Float64Array(2 * u.n);
    f.set(p.x, 0);
    f.set(p.y, u.n);
    this.frames.push(f);
  }

  /** 在 budgetMs 内尽量推进；返回是否已经烘完 */
  work(budgetMs: number, now: () => number = () => performance.now()): boolean {
    const t0 = now();
    while (this.phase !== 'done') {
      if (this.phase === 'form') {
        this.unit.advance();
        this.step++;
        if (this.formAt.includes(this.step)) this.capture();
        if (this.step >= SKIN.STEPS) {
          this.phase = 'retract';
          this.step = 0;
          this.capture(); // 回程第 0 帧 = 成形态（与正向末帧同一刻）
        }
      } else {
        this.unit.retractStep();
        this.step++;
        if (this.retractAt.includes(this.step)) this.capture();
        if (this.step >= SKIN.STEPS) this.finish();
      }
      if (now() - t0 > budgetMs) break;
    }
    return this.phase === 'done';
  }

  /**
   * 烘完之前先给一份「预览」：只有正向第 0 帧（引擎的初始摆位）。钉住端的高度它已经给得出
   * （注册在底端，全程不变），台架据此先把立杆、圆环板和闲着的带子画出来，不用等轨迹烘完才有画面；
   * 平台顶面与回程段烘完才有（此时仿真还没开始跑，没有单元会去用它们）。
   */
  preview(): BandTrajectory {
    const n = this.n;
    const f0 = this.frames[0];
    return { n, frames: [f0], footY: -f0[2 * n - 1] * SOLID.SCALE, platformTopY: -f0[2 * n - 1] * SOLID.SCALE, reach: RING.RADIUS_DEF, retractActive: 0 };
  }

  /** 一口气烘完（守门与线稿用） */
  runAll(): BandTrajectory {
    while (!this.work(Infinity, () => 0)) { /* 直到烘完 */ }
    return this.result as BandTrajectory;
  }

  private finish(): void {
    this.phase = 'done';
    const n = this.n;
    const formed = this.frames[this.formAt.length - 1];
    let reach = 0;
    for (let i = 0; i < n; i++) reach = Math.max(reach, formed[i]);
    // 平台顶面：折叠体里离芯超过一半挑出的节点中最高的那个（世界 Y 向下为正 ⇒ 取最小）
    let top = Infinity;
    for (let i = 0; i < n; i++) if (formed[i] > reach * 0.5) top = Math.min(top, -formed[n + i] * SOLID.SCALE);
    const F = this.formAt.length;
    let active = this.retractAt.length - 1;
    for (let k = this.retractAt.length - 1; k > 0; k--) {
      const a = this.frames[F + k];
      const b = this.frames[F + k - 1];
      let d = 0;
      for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      if (d > 1e-6) {
        active = k;
        break;
      }
    }
    this.result = {
      n,
      frames: this.frames,
      footY: -this.frames[0][2 * n - 1] * SOLID.SCALE,
      platformTopY: top,
      reach: RING.RADIUS_DEF + reach * SOLID.SCALE,
      retractActive: active,
    };
  }
}

/**
 * 一条带该用哪一帧。f = 成形程度 × (1 − 收回几成)，rising = f 在涨。
 * 涨：正向第 round(f·(form−1)) 帧（第 0 帧是引擎的初始摆位，比自然松弛还直，跳过它）；
 * 退：回程第 round((1−f)·retractActive) 帧（回程第 0 帧 = 成形态，末帧 = r 回到 R0 后的自然松弛形）。
 * 两端钉死：f ≤ 0 一律「闲着的带子」= 回程末帧（一条从没落过的带挂在 r = R0 也是这个形，不是一条直线），
 * f ≥ 1 一律成形态——静止态不随方向变，好让台架把一整个环当一份网格摆
 * （绝大多数单元绝大多数时间停在这两个态上）。
 */
export function bandFrame(
  f: number,
  rising: boolean,
  frames: { form: number; retract: number } = FRAMES,
  retractActive: number = frames.retract - 1,
): number {
  if (f <= 1e-4) return frames.form + frames.retract - 1;
  if (f >= 1 - 1e-4) return frames.form - 1;
  if (rising) return Math.max(1, Math.round(f * (frames.form - 1)));
  return frames.form + Math.round((1 - f) * retractActive);
}

/** 闲着 / 成形态这两帧的下标（整环共用一份网格的两个静止态） */
export const STEADY = { straight: FRAMES.form + FRAMES.retract - 1, formed: FRAMES.form - 1 } as const;

/** 装置的摆放：缩放、整体下移、格子的世界坐标 */
export interface Rig {
  /** 装置自身坐标系 → 世界的均匀缩放（4×4 = RIG_SCALE，8×8 再按格距等比缩） */
  s: number;
  /** 整体下移，使钉住端停在 RIG_ANCHOR_Y */
  y: number;
  /** 每个单元芯心的世界坐标（plan x → X、plan y → Z） */
  cells: { x: number; z: number }[];
  /** 平台顶面的世界高度 */
  platformY: number;
}

export function rigFor(layout: PlanLayout, traj: Pick<BandTrajectory, 'footY' | 'platformTopY'>): Rig {
  const s = (RIG_SCALE * layout.pitchM) / layout.pitch4;
  const y = RIG_ANCHOR_Y - s * traj.footY;
  return {
    s,
    y,
    cells: layout.units.map((u) => ({ x: u.x * UNITS_PER_M, z: u.y * UNITS_PER_M })),
    platformY: y + s * traj.platformTopY,
  };
}

/** 一条带在装置自身坐标系里的顶点（沿本地 +X 放在芯半径处，再由摆放表转到各方位角） */
export function bandVertsAt(traj: BandTrajectory, frame: number, topo: SolidTopology, out?: Float32Array): Float32Array {
  const f = traj.frames[frame];
  const n = traj.n;
  return fillSolidVerts(f.subarray(0, n), f.subarray(n, 2 * n), n, RING.RADIUS_DEF, RING.DEPTH, RING.THICK, SOLID.SCALE, out && out.length === topo.vertCount * 3 ? out : undefined, 0, 0, null);
}

/** 一条带的两组条纹网格（gl3d 静态缓冲用） */
export function bakeBand(traj: BandTrajectory, frame: number, topo: SolidTopology): { a: Float32Array; b: Float32Array } {
  const v = bandVertsAt(traj, frame, topo);
  return { a: bakeIndexed(v, topo.idxA), b: bakeIndexed(v, topo.idxB), };
}

/**
 * 整环（二十条带同一帧）的两组条纹网格：二十份带子顶点各转到自己的方位角后拼成一份——
 * 静止态的单元整环只用一次摆放，不必二十条带各摆一遍（64 个单元 × 20 = 1280 次绘制，桌面上也吃力）。
 */
export function bakeRing(traj: BandTrajectory, frame: number, topo: SolidTopology, count = RING.COUNT): { a: Float32Array; b: Float32Array } {
  const one = bandVertsAt(traj, frame, topo);
  const per = topo.vertCount;
  const verts = new Float32Array(one.length * count);
  const idxA = new Uint32Array(topo.idxA.length * count);
  const idxB = new Uint32Array(topo.idxB.length * count);
  for (let j = 0; j < count; j++) {
    const v = rotateVertsY(Float32Array.from(one), { radius: 0, angle: bandAngle(j) });
    verts.set(v, j * one.length);
    for (let k = 0; k < topo.idxA.length; k++) idxA[j * topo.idxA.length + k] = topo.idxA[k] + j * per;
    for (let k = 0; k < topo.idxB.length; k++) idxB[j * topo.idxB.length + k] = topo.idxB[k] + j * per;
  }
  return { a: bakeIndexed(verts, idxA), b: bakeIndexed(verts, idxB) };
}

export function bandTopology(n: number): SolidTopology {
  return buildSolidTopology(n, SKIN.STRIPE);
}

/** 一块长方体（中心 + 半尺寸，世界单位） */
export interface Box {
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
}

/** 家具（米 → 世界）：座面一块（离地 0.45 m、厚 0.08）+ 靠背一块（在人背后那条边上，高 0.85 m、厚 0.1） */
export const FURN = { seatH: 0.45, seatT: 0.08, backH: 0.85, backT: 0.1 } as const;

export function furnitureBoxes(rects: readonly FurnRect[], unit: number = UNITS_PER_M): Box[] {
  const out: Box[] = [];
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.y1 - r.y0;
    const seatTop = ROOM.FLOOR_Y - FURN.seatH * unit;
    out.push({ cx: r.cx * unit, cy: seatTop + (FURN.seatT / 2) * unit, cz: r.cy * unit, hx: (w / 2) * unit, hy: (FURN.seatT / 2) * unit, hz: (d / 2) * unit });
    // 靠背：与 face 反向的那条边；face 是单位向量（0,±1）或（±1,0）
    const [fx, fy] = r.face;
    const along = Math.abs(fy) > Math.abs(fx) ? d : w;
    const bx = r.cx - fx * (along / 2 - FURN.backT / 2);
    const by = r.cy - fy * (along / 2 - FURN.backT / 2);
    const hx = Math.abs(fy) > Math.abs(fx) ? w / 2 : FURN.backT / 2;
    const hz = Math.abs(fy) > Math.abs(fx) ? FURN.backT / 2 : d / 2;
    out.push({ cx: bx * unit, cy: ROOM.FLOOR_Y - (FURN.backH / 2) * unit, cz: by * unit, hx: hx * unit, hy: (FURN.backH / 2) * unit, hz: hz * unit });
  }
  return out;
}

/** 人 / 猫朝向：平面模型的 heading（x 向右、y 向下，0 = +x）→ 小人的 yaw（0 = 面朝 +Z） */
export function figureYaw(heading: number): number {
  return heading - Math.PI / 2;
}

/**
 * 猫站在哪：台上的猫落在它脚下那台的平台面上。平面模型把坐着的猫放在单元中心（芯心），立体里
 * 芯是根杆子，猫得坐在环形平台上——离芯心不到芯半径时沿它的朝向挪到平台中带；走到台边的
 * （靠近访客时）按它实际的位置画，但不出平台外缘。
 */
export function catSpot(
  c: { x: number; y: number; heading: number },
  unit: { x: number; y: number } | null,
  layout: Pick<PlanLayout, 'mastR' | 'platR'>,
): { x: number; y: number; onPlatform: boolean } {
  if (!unit) return { x: c.x, y: c.y, onPlatform: false };
  const dx = c.x - unit.x;
  const dy = c.y - unit.y;
  const d = Math.hypot(dx, dy);
  const bodyR = 0.14;
  const rMid = (layout.mastR + layout.platR) / 2;
  if (d > layout.platR + bodyR) return { x: c.x, y: c.y, onPlatform: false };
  if (d < layout.mastR + 0.02) return { x: unit.x + Math.cos(c.heading) * rMid, y: unit.y + Math.sin(c.heading) * rMid, onPlatform: true };
  const rr = Math.min(d, layout.platR - bodyR * 0.5);
  return { x: unit.x + (dx / d) * rr, y: unit.y + (dy / d) * rr, onPlatform: true };
}

/** 取景：框住整间房（与 Lab 2-8 同一套解析式），枢轴与它同 */
export function cohabitCamScale(roomM: number, view: RingGridView): number {
  return viewFitBySpan(roomM * UNITS_PER_M, view) * RING_GRID_FIT;
}
export const COHABIT_PIVOT = { x: 0, y: RING_GRID_PIVOT_Y, z: 0 } as const;

/** 几块长方体拼成一份网格（房间 / 家具 / 立杆：静件，烘一次） */
export function boxesMesh(boxes: readonly Box[]): { verts: Float32Array; idx: Uint32Array } {
  const parts = boxes.map((b) => boxVerts(b.cx, b.cy, b.cz, b.hx, b.hy, b.hz));
  return concatMeshes(parts);
}

export function concatMeshes(parts: readonly { verts: Float32Array; idx: Uint32Array }[]): { verts: Float32Array; idx: Uint32Array } {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.verts.length;
    ni += p.idx.length;
  }
  const verts = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    verts.set(p.verts, ov);
    const base = ov / 3;
    for (let k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + base;
    ov += p.verts.length;
    oi += p.idx.length;
  }
  return { verts, idx };
}

/** 天花圆环板的尺寸（装置自身坐标系；与 Lab 2-8 同一副数） */
export const PLATE = { inner: 12, outer: 11, y: -3, halfT: 3, segs: 40 } as const;

/**
 * 立杆 + 天花圆环板：每格一根方杆从天花（y 0）落到钉住点（RIG_ANCHOR_Y），一块圆环板挂在天花上。
 * 立杆按**世界尺寸**建（平面模型的芯半径 mastR），板随装置缩。全部静件，烘成一份。
 */
export function postsMesh(rig: Rig, layout: Pick<PlanLayout, 'mastR'>, unit: number = UNITS_PER_M): { verts: Float32Array; idx: Uint32Array } {
  const parts: { verts: Float32Array; idx: Uint32Array }[] = [];
  // 立杆比芯细一截（0.55 × 芯半径）：闲着的带子贴着芯挂，杆与带同粗会把六十四根读成一片柱林，人就看不见了
  const hm = Math.max(1.2, layout.mastR * unit * 0.55);
  const plate = ringPlateVerts(Math.max(2, (RING.RADIUS_DEF - PLATE.inner) * rig.s), (RING.RADIUS_DEF + PLATE.outer) * rig.s, PLATE.y, PLATE.halfT, PLATE.segs);
  for (const c of rig.cells) {
    parts.push(boxVerts(c.x, RIG_ANCHOR_Y / 2, c.z, hm, RIG_ANCHOR_Y / 2, hm));
    const v = Float32Array.from(plate.verts);
    for (let k = 0; k < v.length; k += 3) {
      v[k] += c.x;
      v[k + 2] += c.z;
    }
    parts.push({ verts: v, idx: plate.idx });
  }
  return concatMeshes(parts);
}

/** 房间（地板 + 两面墙，Lab 2-8 的画法）按平面模型的内净尺寸 */
export function roomMesh(roomM: number, unit: number = UNITS_PER_M): { verts: Float32Array; idx: Uint32Array } {
  return boxesMesh(roomBoxesBySpan(roomM * unit));
}
