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
 *
 * ## 两段触发（2026-10-23 作者纠偏）
 *
 * 首版把「闲着」画成直带子挂在工位上——整间房六十四个单元全垂着，等于全都触发了。作者纠偏：非触发的单元
 * 是**收在上端**的（蒙皮、可折叠的布、台子缩成一团贴着天花），只有被确认触发才垂下来、外皮再压缩成形；
 * 触发分两个阶段——先是上下（存在上面还是挪到了下边），再是挪下来之后变成什么性质的台子（通道 / 平台 /
 * 可停留的空间，待定）。这台此刻只分两种触发态：**收起**（整束布贴着天花圆环板）与**落下成形**。
 * 平面模型的程度 0–1 在这里拆成两段（`HOIST.dropAt` 分界）：之下是升降段——整束布沿立杆从天花下滑到
 * 工位、边下边放长（`hoistProfile`，直带子按长度比例压向顶端）；之上是成形段——引擎的正向协议与回程照旧。
 * 分界取平面模型「对人成墙」那条线（`COHABIT.WALL_AT`）：落到位的直筒已经挡人，两边口径一致。
 * 立杆也随单元伸缩（作者同日补「中间这根棍子也得缩上去」）：下端跟着布束底走（`unitFootY`），收起时只剩
 * 天花下一小截；圆环板仍是天花上的静件。
 * 第二阶段「成什么」仍只有一种形（Lab 2-8 那只阶梯方箱），待作者定词汇表后再分。
 */
import { RING, RING_DEFAULT_FORM, buildRingUnits, type RingUnitDef } from './skin-ring';
import { SKIN, createSkinUnit, renderSmooth } from './skin-unit';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts, ringPlateVerts, rotateVertsY, type SolidTopology } from './skin-solid';
import { bakeIndexed } from '../linkage/gl3d';
import { MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, RING_GRID_FIT, RING_GRID_PIVOT_Y, ROOM, roomBoxesBySpan, viewFitBySpan, type RingGridView } from './skin-grid';
import type { PlanLayout } from './unit-activation';
import { COHABIT, bandAngle, type FurnRect } from './cohabit';

/** 一米 = 多少世界单位（由「人 = 1.70 m = 215 单位」定） */
export const UNITS_PER_M = 1000 / MM_PER_UNIT;

/** 关键帧数：正向 0.67 s（跟随档 1.5/s）、回程 2 s（0.5/s）——按 60 fps 下不重帧的量级取；升降 16 帧（直带子按长度比例压向顶端，纯几何） */
export const FRAMES = { form: 32, retract: 24, hoist: 16 } as const;

/**
 * 升降段（两段触发，见头注）。`dropAt` 之下程度全给升降：0 = 收在天花下，dropAt = 落到工位的直筒；
 * 之上才是成形。`stowed` = 收起时布束保留的长度比例（折叠的布与台子缩成一团，演示值，待作者真机看）；
 * `ceilGap` = 收起时带子顶端离圆环板下表面的净距（世界单位）。
 */
export const HOIST = {
  dropAt: COHABIT.WALL_AT,
  stowed: 0.15,
  ceilGap: 2,
} as const;

/** 演示的场面：六位访客两只猫 = 对照研究的中档（案例页对照图的三档之一） */
export const SCENE = { people: 6, cats: 2, seed: 11 } as const;

export interface BandTrajectory {
  n: number;
  /** 关键帧（正向、回程、升降依次排开），每帧 = [px…, py…]（引擎单位，已做绘图平滑）。
   *  升降帧由回程末帧（闲着的直带子）按长度比例压向顶端得来，第 0 帧 = 收起态、末帧 = 直带子本身 */
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
  private readonly hoistN: number;
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
    this.hoistN = frames.hoist;
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
   * 烘完之前先给一份「预览」：正向第 0 帧（引擎的初始摆位）加它的收起态。钉住端的高度它已经给得出
   * （注册在底端，全程不变），台架据此先把立杆、圆环板和收着的单元画出来，不用等轨迹烘完才有画面；
   * 平台顶面与回程段烘完才有（此时仿真还没开始跑，没有单元会去用它们）。
   */
  preview(): BandTrajectory {
    const n = this.n;
    const f0 = this.frames[0];
    // frames[1] = 收起态（初始摆位压向顶端）：烘完之前满场都是收着的单元，台架拿它烘整环
    return { n, frames: [f0, hoistProfile(f0, n, HOIST.stowed)], footY: -f0[2 * n - 1] * SOLID.SCALE, platformTopY: -f0[2 * n - 1] * SOLID.SCALE, reach: RING.RADIUS_DEF, retractActive: 0 };
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
    // 升降帧：由回程末帧（闲着的直带子）压向顶端，第 0 帧 = 收起态、末帧 = 直带子逐位相同
    const straight = this.frames[F + this.retractAt.length - 1];
    for (let j = 0; j < this.hoistN; j++) this.frames.push(hoistProfile(straight, n, HOIST.stowed + (1 - HOIST.stowed) * (j / (this.hoistN - 1))));
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
 * 直带子按长度比例压向顶端（升降段的几何）：k = 保留的长度比例，顶端节点不动、其余节点的高度向它靠拢，
 * 横向（挑出）不变。k = 1 逐位等于原帧。世界 Y 向下为正 ⇒ 引擎 py 最大的节点是顶端。
 */
export function hoistProfile(src: Float64Array, n: number, k: number): Float64Array {
  let top = -Infinity;
  for (let i = 0; i < n; i++) top = Math.max(top, src[n + i]);
  const out = Float64Array.from(src);
  for (let i = 0; i < n; i++) out[n + i] = top + (src[n + i] - top) * k;
  return out;
}

/**
 * 一条带该用哪一帧。f = 成形程度 × (1 − 收回几成)，rising = f 在涨。两段：
 * - f < dropAt 升降段：升降第 round(f/dropAt·(hoist−1)) 帧（第 0 帧 = 收起态；末帧就是直带子，直接给 STEADY.straight）；
 * - f ≥ dropAt 成形段，g = (f − dropAt)/(1 − dropAt)：
 *   涨：正向第 round(g·(form−1)) 帧（第 0 帧是引擎的初始摆位，比自然松弛还直，跳过它）；
 *   退：回程第 round((1−g)·retractActive) 帧（回程第 0 帧 = 成形态，末帧 = r 回到 R0 后的自然松弛形）。
 * 三个静止态钉死：f ≤ 0 一律收起态，f = dropAt 一律直带子（回程末帧：一条挂在 r = R0 的带也是这个形，不是一条直线），
 * f ≥ 1 一律成形态——静止态不随方向变，好让台架把一整个环当一份网格摆
 * （绝大多数单元绝大多数时间停在收起态上，其次是成形态）。
 */
export function bandFrame(
  f: number,
  rising: boolean,
  frames: { form: number; retract: number; hoist: number } = FRAMES,
  retractActive: number = frames.retract - 1,
  dropAt: number = HOIST.dropAt,
): number {
  const straight = frames.form + frames.retract - 1;
  if (f <= 1e-4) return straight + 1;
  if (f >= 1 - 1e-4) return frames.form - 1;
  if (f < dropAt) {
    const j = Math.round((f / dropAt) * (frames.hoist - 1));
    return j >= frames.hoist - 1 ? straight : straight + 1 + j;
  }
  const g = (f - dropAt) / (1 - dropAt);
  if (g <= 1e-4) return straight;
  if (rising) return Math.max(1, Math.round(g * (frames.form - 1)));
  return frames.form + Math.round((1 - g) * retractActive);
}

/** 收起 / 直带子 / 成形态三帧的下标（整环共用一份网格的三个静止态） */
export const STEADY = {
  straight: FRAMES.form + FRAMES.retract - 1,
  formed: FRAMES.form - 1,
  stowed: FRAMES.form + FRAMES.retract,
} as const;

/** 装置的摆放：缩放、整体下移、格子的世界坐标 */
export interface Rig {
  /** 装置自身坐标系 → 世界的均匀缩放（4×4 = RIG_SCALE，8×8 再按格距等比缩） */
  s: number;
  /** 工位：装置原点的世界高度（整体下移，使钉住端停在 RIG_ANCHOR_Y） */
  y: number;
  /** 收起位：装置原点贴着天花圆环板时的世界高度（升降段在它与 y 之间插值） */
  stowY: number;
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
    stowY: HOIST.ceilGap,
    cells: layout.units.map((u) => ({ x: u.x * UNITS_PER_M, z: u.y * UNITS_PER_M })),
    platformY: y + s * traj.platformTopY,
  };
}

/** 单元的升降程度：程度 < dropAt 时整束布还在路上（0 = 收在天花下，1 = 到工位，之后只成形不再动） */
export function unitDrop(degree: number, dropAt: number = HOIST.dropAt): number {
  return Math.max(0, Math.min(1, degree / dropAt));
}

/** 单元此刻的装置原点世界高度：收起位与工位之间按升降程度插值（带子与它一起摆，圆环板不动，立杆见 unitFootY） */
export function unitTopY(rig: Pick<Rig, 'y' | 'stowY'>, drop: number): number {
  return rig.stowY + (rig.y - rig.stowY) * drop;
}

/**
 * 单元此刻的钉住端世界高度 = 布束底 = 立杆下端：吊长按升降程度从 HOIST.stowed 倍放到全长，
 * 到工位时 = RIG_ANCHOR_Y。与 hoistProfile 的脚只差顶端节点那零点几个单位（压缩是绕顶端节点做的）。
 */
export function unitFootY(rig: Pick<Rig, 'y' | 'stowY' | 's'>, footY: number, drop: number): number {
  return unitTopY(rig, drop) + rig.s * footY * (HOIST.stowed + (1 - HOIST.stowed) * drop);
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
 * 立杆：每格一根方杆从天花（y 0）落到这个单元此刻的钉住端（`bottoms[u]`；不传 = 全在工位 RIG_ANCHOR_Y）。
 * 作者 2026-10-23「中间这根棍子也得缩上去」：杆是随单元伸缩的芯，收起时只剩天花下布束那一截，触发才伸下来——
 * 下端跟着布束底走（`unitFootY`），台架在它变了的那一帧重烘。立杆按**世界尺寸**建（平面模型的芯半径 mastR）。
 */
export function postsMesh(rig: Pick<Rig, 'cells'>, layout: Pick<PlanLayout, 'mastR'>, bottoms?: ArrayLike<number>, unit: number = UNITS_PER_M): { verts: Float32Array; idx: Uint32Array } {
  // 立杆比芯细一截（0.55 × 芯半径）：闲着的带子贴着芯挂，杆与带同粗会把六十四根读成一片柱林，人就看不见了
  const hm = Math.max(1.2, layout.mastR * unit * 0.55);
  return concatMeshes(
    rig.cells.map((c, u) => {
      const b = Math.max(1e-3, bottoms ? bottoms[u] : RIG_ANCHOR_Y);
      return boxVerts(c.x, b / 2, c.z, hm, b / 2, hm);
    }),
  );
}

/** 天花圆环板：每格一块挂在天花上（y 0 平面），板随装置缩；静件，烘一份 */
export function platesMesh(rig: Pick<Rig, 's' | 'cells'>): { verts: Float32Array; idx: Uint32Array } {
  const plate = ringPlateVerts(Math.max(2, (RING.RADIUS_DEF - PLATE.inner) * rig.s), (RING.RADIUS_DEF + PLATE.outer) * rig.s, PLATE.y, PLATE.halfT, PLATE.segs);
  return concatMeshes(
    rig.cells.map((c) => {
      const v = Float32Array.from(plate.verts);
      for (let k = 0; k < v.length; k += 3) {
        v[k] += c.x;
        v[k + 2] += c.z;
      }
      return { verts: v, idx: plate.idx };
    }),
  );
}

/** 房间（地板 + 两面墙，Lab 2-8 的画法）按平面模型的内净尺寸 */
export function roomMesh(roomM: number, unit: number = UNITS_PER_M): { verts: Float32Array; idx: Uint32Array } {
  return boxesMesh(roomBoxesBySpan(roomM * unit));
}
