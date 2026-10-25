/**
 * 项目二 · 人猫同台的立体演示（Lab 2-15，2026-10-21 立项：作者「老师也说我们缺一个直接演示立体空间里
 * 单元改变空间和其中的动物的直观演示」+「立体演示用 8×8」）——纯数学，零 DOM。
 *
 * 这一台不解新的物理：驱动它的是 Lab 2-14 那套仿真（`CohabitSim`，「走 · 站 · 坐」规则 · 只收挡路的带 ·
 * 访客有身体 · 猫能下地 · 猫按 Mertens & Turner 1988 标定），画的是 Lab 2-8 那间房（`skin-grid`）里的 8×8
 * 个单元。
 *
 * ## 单元是方形的（2026-10-25 作者纠正）
 *
 * 「我们采用的单元形态是方形的……圆形只做过程推演，拿来给观众演示造型过程；方形才是拿来具体使用的东西。」
 * 此前这台默认用了 Lab 2-8 那只圆筒环。现在每台 = Lab 2-7 方形环平档那三张键谱（`buildSquareUnits`：面 / 边 / 角
 * 三档挑出，二十条带按方位分档 `buildSquareOrder`），俯视是方的；芯仍是圆的，没成形时（收起、直筒）还是一圈带子。
 * 尺寸取「方形峰值时的半边长 = 圆台的峰值半径」（cohabit `SQUARE_SCALE`）：平面模型的平台圆（platR）是方形的内切圆，
 * 猫卧着的那一圈台面与圆台时一样宽，多出来的是四个角；平面模型凡是问「平台会不会碰到人」的地方都改按方形每条带
 * 的长度算（`unit: 'square'` → `squarePlanLayout`）。
 *
 * ## 带子的形状从哪来
 *
 * 64 个单元 × 20 条带 = 1280 条带，各自都在落下、收回、开门。真跑 1280 条引擎做不到（一条带 1500 步
 * 的协议在浏览器里要 0.7 s），而 Lab 2-14 的平面模型也只给每条带两个数：所在单元的成形程度
 * （`act.degree`，跟随档，0–1）和这条带收回了几成（`bandOpen`）。于是**每档只跑一条引擎、把轨迹烘成关键帧**
 * （三档共三条）：正向协议（直带子 → 成形）取 `FRAMES.form` 帧，引擎的回程（`retractStep`，成形 → 松键回直）取
 * `FRAMES.retract` 帧；每条带按自己的两个数取帧（`bandFrame`）——程度在涨就查正向那条，在退就查回程那条。
 * 这是**必要的承认**：带子的形状逐帧是引擎算出来的，但「这一条带此刻该是哪一帧」是平面模型的两个标量定的，
 * 不是 1280 条布各自解出来的；两条轨迹之间切换的那一帧会有一点跳（回程不是正向的逐位倒放）。
 *
 * ## 尺度
 *
 * 房间与人取 Lab 2-8 的世界尺度（`MM_PER_UNIT`：1.70 m 的人 = 215 单位）；8×8 的单元按格距等比缩小
 * （`planLayout` 的 pitchM / pitch4，与 Lab 2-10 以来的平面台架同一条规则）再乘 `SQUARE_SCALE`，装置的下缘仍钉在
 * 离地 1.08 m（`RIG_ANCHOR_Y`）——平面模型里「平台底比坐着的头顶低」那条账就是按它算的。
 *
 * ## 两段触发（2026-10-23 作者纠偏）
 *
 * 首版把「闲着」画成直带子挂在工位上——整间房六十四个单元全垂着，等于全都触发了。作者纠偏：非触发的单元
 * 是**收在上端**的（蒙皮、可折叠的布、台子缩成一团贴着天花），只有被确认触发才垂下来、外皮再压缩成形；
 * 触发分两个阶段——先是上下（存在上面还是挪到了下边），再是挪下来之后变成什么性质的台子（通道 / 平台 /
 * 可停留的空间，待定）。这台此刻只分两种触发态：**收起**（整束布贴着天花板）与**落下成形**。
 * 平面模型的程度 0–1 在这里拆成两段（`HOIST.dropAt` 分界）：之下是升降段——整束布沿立杆从天花下滑到
 * 工位、边下边放长（`hoistProfile`，直带子按长度比例压向顶端）；之上是成形段——引擎的正向协议与回程照旧。
 * 分界取平面模型「对人成墙」那条线（`COHABIT.WALL_AT`）：落到位的直筒已经挡人，两边口径一致。
 * 立杆也随单元伸缩（作者同日补「中间这根棍子也得缩上去」）：下端跟着布束底走（`unitFootY`），收起时只剩
 * 天花下一小截；天花上的方板仍是静件。
 * 第二阶段「成什么」仍只有一种形（方形环平档那只方箱），待作者定词汇表后再分。
 */
import type { RingUnitDef } from './skin-ring';
import { SQUARE, buildSquareOrder, buildSquareUnits, squareHalfSide, SQUARE_REACH } from './skin-square';
import { SKIN, createSkinUnit, renderSmooth } from './skin-unit';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts, membranePanel, rotateVertsY, type SolidTopology } from './skin-solid';
import { bakeIndexed } from '../linkage/gl3d';
import { MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, RING_GRID_FIT, RING_GRID_PIVOT_Y, ROOM, roomBoxesBySpan, viewFitBySpan, type RingGridView } from './skin-grid';
import type { PlanLayout } from './unit-activation';
import { COHABIT, SQUARE_SCALE, bandAngle, type FurnRect } from './cohabit';
import type { CatPose, CatTail, SeatSpec } from './figure';

/** 一米 = 多少世界单位（由「人 = 1.70 m = 215 单位」定） */
export const UNITS_PER_M = 1000 / MM_PER_UNIT;

/** 关键帧数：正向 0.67 s（跟随档 1.5/s）、回程 2 s（0.5/s）——按 60 fps 下不重帧的量级取；升降 16 帧（直带子按长度比例压向顶端，纯几何） */
export const FRAMES = { form: 32, retract: 24, hoist: 16 } as const;

/**
 * 升降段（两段触发，见头注）。`dropAt` 之下程度全给升降：0 = 收在天花下，dropAt = 落到工位的直筒；
 * 之上才是成形。`stowed` = 收起时布束保留的长度比例（折叠的布与台子缩成一团，演示值，待作者真机看）；
 * `ceilGap` = 收起时带子顶端离天花方板下表面的净距（世界单位）。
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

  constructor(def: RingUnitDef, frames = FRAMES) {
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
   * （注册在底端，全程不变），台架据此先把立杆、天花方板和收着的单元画出来，不用等轨迹烘完才有画面；
   * 平台顶面与回程段烘完才有（此时仿真还没开始跑，没有单元会去用它们）。
   */
  preview(): BandTrajectory {
    const n = this.n;
    const f0 = this.frames[0];
    // frames[1] = 收起态（初始摆位压向顶端）：烘完之前满场都是收着的单元，台架拿它烘整环
    return { n, frames: [f0, hoistProfile(f0, n, HOIST.stowed)], footY: -f0[2 * n - 1] * SOLID.SCALE, platformTopY: -f0[2 * n - 1] * SOLID.SCALE, reach: SQUARE.RADIUS, retractActive: 0 };
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
      reach: SQUARE.RADIUS + reach * SOLID.SCALE,
      retractActive: active,
    };
  }
}

/**
 * 方形单元那条带的节数：Lab 2-7 方形环立项时的 202 节（lead 22），与原来圆台的带一样长。方形环现行的 305 节是
 * 2026-09-02 为捏分编制加长的，多出来的全在上半截贴芯的素管里（形状逐点相同），立在方台上方会是一根一米来高的布筒。
 */
export const UNIT_BAND = 202;
/** 方形单元的三档引擎定义（面 / 边 / 角，Lab 2-7 方形环平档的键谱）与二十条带的档位编制（下标 = 带序 j） */
export const UNIT_TIERS: readonly RingUnitDef[] = buildSquareUnits(undefined, UNIT_BAND);
export const UNIT_ORDER: readonly number[] = buildSquareOrder();

/** 已经烘好的三档轨迹（同一页面里换路由、重挂台架时直接拿，不重烘） */
const BAKED = new Map<string, BandTrajectory[]>();

/**
 * 三档轨迹一起烘：三条引擎依次推进（分片，`work` 按时间预算），全部烘完才算完。三档的节点数相同（同一条
 * 202 节的带），钉住端高度相同（注册在底端）、平台面高度相同（方形环的对位构造），台架拿第 0 档定摆放。
 */
export class UnitBaker {
  readonly n: number;
  private readonly key: string;
  private readonly bakers: TrajectoryBaker[];
  private result: BandTrajectory[] | null;

  constructor(defs: readonly RingUnitDef[] = UNIT_TIERS, frames = FRAMES) {
    this.key = `${defs.map((d) => d.key).join('|')}#${frames.form}/${frames.retract}/${frames.hoist}`;
    this.bakers = defs.map((d) => new TrajectoryBaker(d, frames));
    this.n = this.bakers[0].n;
    if (this.bakers.some((b) => b.n !== this.n)) throw new Error('三档的带子节点数不同，整台网格拼不起来');
    this.result = BAKED.get(this.key) ?? null;
  }

  get done(): boolean {
    return this.result !== null;
  }
  get trajectories(): BandTrajectory[] | null {
    return this.result;
  }
  /** 0–1 的进度（HUD 用） */
  get progress(): number {
    if (this.result) return 1;
    return this.bakers.reduce((s, b) => s + b.progress, 0) / this.bakers.length;
  }

  /** 在 budgetMs 内尽量推进；返回是否三档都烘完 */
  work(budgetMs: number, now: () => number = () => performance.now()): boolean {
    if (this.result) return true;
    const t0 = now();
    for (const b of this.bakers) {
      if (b.done) continue;
      if (!b.work(Math.max(0, budgetMs - (now() - t0)), now)) return false;
    }
    this.result = this.bakers.map((b) => b.trajectory as BandTrajectory);
    BAKED.set(this.key, this.result);
    return true;
  }

  /** 烘完之前的预览：第 0 档的初始摆位与它的收起态（三档初始摆位相同，都是贴着芯的直带子） */
  preview(): BandTrajectory {
    return this.bakers[0].preview();
  }

  /** 一口气烘完（守门与线稿用） */
  runAll(): BandTrajectory[] {
    while (!this.work(Infinity, () => 0)) { /* 直到烘完 */ }
    return this.result as BandTrajectory[];
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
  /** 装置自身坐标系 → 世界的均匀缩放（4×4 = RIG_SCALE，8×8 再按格距等比缩，方形单元再乘 SQUARE_SCALE） */
  s: number;
  /** 工位：装置原点的世界高度（整体下移，使钉住端停在 RIG_ANCHOR_Y） */
  y: number;
  /** 收起位：装置原点贴着天花方板时的世界高度（升降段在它与 y 之间插值） */
  stowY: number;
  /** 每个单元芯心的世界坐标（plan x → X、plan y → Z） */
  cells: { x: number; z: number }[];
  /** 平台顶面的世界高度 */
  platformY: number;
}

export function rigFor(layout: PlanLayout, traj: Pick<BandTrajectory, 'footY' | 'platformTopY'>, scale: number = SQUARE_SCALE): Rig {
  const s = ((RIG_SCALE * layout.pitchM) / layout.pitch4) * scale;
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

/** 单元此刻的装置原点世界高度：收起位与工位之间按升降程度插值（带子与它一起摆，天花方板不动，立杆见 unitFootY） */
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
  return fillSolidVerts(f.subarray(0, n), f.subarray(n, 2 * n), n, SQUARE.RADIUS, SQUARE.DEPTH, SQUARE.THICK, SOLID.SCALE, out && out.length === topo.vertCount * 3 ? out : undefined, 0, 0, null);
}

/** 一条带的两组条纹网格（gl3d 静态缓冲用） */
export function bakeBand(traj: BandTrajectory, frame: number, topo: SolidTopology): { a: Float32Array; b: Float32Array } {
  const v = bandVertsAt(traj, frame, topo);
  return { a: bakeIndexed(v, topo.idxA), b: bakeIndexed(v, topo.idxB), };
}

/**
 * 整台（二十条带同一帧）的两组条纹网格：每条带取它所在档的轨迹（`order[j]`），转到自己的方位角后拼成一份——
 * 静止态的单元整台只用一次摆放，不必二十条带各摆一遍（64 个单元 × 20 = 1280 次绘制，桌面上也吃力）。
 */
export function bakeUnit(trajs: readonly BandTrajectory[], frame: number, topo: SolidTopology, order: readonly number[] = UNIT_ORDER): { a: Float32Array; b: Float32Array } {
  const ones = trajs.map((t) => bandVertsAt(t, frame, topo));
  const per = topo.vertCount;
  const count = order.length;
  const len = ones[0].length;
  const verts = new Float32Array(len * count);
  const idxA = new Uint32Array(topo.idxA.length * count);
  const idxB = new Uint32Array(topo.idxB.length * count);
  for (let j = 0; j < count; j++) {
    const v = rotateVertsY(Float32Array.from(ones[order[j]]), { radius: 0, angle: bandAngle(j) });
    verts.set(v, j * len);
    for (let k = 0; k < topo.idxA.length; k++) idxA[j * topo.idxA.length + k] = topo.idxA[k] + j * per;
    for (let k = 0; k < topo.idxB.length; k++) idxB[j * topo.idxB.length + k] = topo.idxB[k] + j * per;
  }
  return { a: bakeIndexed(verts, idxA), b: bakeIndexed(verts, idxB) };
}

/**
 * 抽稀的轨迹：每隔 stride 个节点取一个（首尾必取）。收在天花下的那一小团（吊长只剩 15%）看不出细节，
 * 64 台全按 305 节画要三百多万个三角形；静止的收起态用抽稀的那份，过渡与成形照旧满分辨率。
 */
export function decimateTrajectory(traj: BandTrajectory, stride: number): BandTrajectory {
  const n = traj.n;
  const keep: number[] = [];
  for (let i = 0; i < n; i += stride) keep.push(i);
  if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  const m = keep.length;
  const frames = traj.frames.map((f) => {
    const out = new Float64Array(2 * m);
    keep.forEach((i, k) => {
      out[k] = f[i];
      out[m + k] = f[n + i];
    });
    return out;
  });
  return { ...traj, n: m, frames };
}

/** 收起态整台网格的抽稀步长 */
export const STOWED_STRIDE = 8;

/**
 * 带与带之间的膜（2026-10-25 随方形单元补上：没有它，方台俯视是一把放射状的窄带，读不出是一张方的台面；
 * 作者 10-23 讲收起态时也说的是「蒙皮、可折叠的布」）。几何 = Lab 2-5 / 2-7 那块织物膜（skin-solid `membranePanel`）：
 * A 边取带 j 的后剖口（它那一档、它那一帧），B 边取带 j+1 的前剖口；烘在方位角 0，摆放时转到 bandAngle(j)。
 * 半透明，台架在实体之后画（gl3d 半透明的三条硬约束）。
 */
export function membraneVerts(a: BandTrajectory, fa: number, b: BandTrajectory, fb: number, count: number = SQUARE.COUNT): { verts: Float32Array; idx: Uint16Array } {
  const n = a.n;
  const A = a.frames[fa];
  const B = b.frames[fb];
  return membranePanel(
    { px: A.subarray(0, n), py: A.subarray(n, 2 * n), offY: 0 },
    { px: B.subarray(0, n), py: B.subarray(n, 2 * n), offY: 0 },
    n,
    SQUARE.RADIUS,
    SQUARE.DEPTH,
    SOLID.SCALE,
    (2 * Math.PI) / count,
  );
}

/** 整台的膜（二十块，同一帧，各取两侧带子所在的档）：静止态用，烘成一份 */
export function bakeUnitSkin(trajs: readonly BandTrajectory[], frame: number, order: readonly number[] = UNIT_ORDER): Float32Array {
  const parts = order.map((t, j) => {
    const m = membraneVerts(trajs[t], frame, trajs[order[(j + 1) % order.length]], frame, order.length);
    return { verts: rotateVertsY(m.verts, { radius: 0, angle: bandAngle(j) }), idx: Uint32Array.from(m.idx) };
  });
  const all = concatMeshes(parts);
  return bakeIndexed(all.verts, all.idx);
}

/** 一块膜烘好（逐块摆的那些：相邻两条带帧不同的单元） */
export function bakeMembrane(a: BandTrajectory, fa: number, b: BandTrajectory, fb: number): Float32Array {
  const m = membraneVerts(a, fa, b, fb);
  return bakeIndexed(m.verts, m.idx);
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
 * 座面（米，相对座位点沿坐着的人的朝向量）：给 figure 的坐姿用——小人按它解出腿怎么放，保证小腿让开座面前缘、
 * 臀贴座面、背不进靠背。座位点 = 平面模型的 seat.x/y（坐下时人就摆在这里）。
 */
export function seatSpecOf(r: Pick<FurnRect, 'cx' | 'cy' | 'x0' | 'x1' | 'y0' | 'y1' | 'face'>, seat: { x: number; y: number }): SeatSpec {
  const [fx, fy] = r.face;
  const depth = Math.abs(fy) > Math.abs(fx) ? r.y1 - r.y0 : r.x1 - r.x0;
  const along = (seat.x - r.cx) * fx + (seat.y - r.cy) * fy; // 座位点在家具中心前方多少
  return {
    top: FURN.seatH,
    front: depth / 2 - along,
    back: along - (-depth / 2 + FURN.backT),
    thick: FURN.seatT,
    backTop: FURN.backH,
  };
}

/**
 * 猫能待的那一圈台面（米）：内 = 芯外缘（带子贴着芯挂，再加半个织物厚）；外 = 二十个平台外缘点连成的多边形的内切圆
 * ——方形的四个角不算，猫只在内切圆里待（方形尺寸就是按「内切圆 = 圆台」取的，这一圈与圆台时一样宽）；R = 猫身中线放在哪。
 */
export function platformBand(rig: Pick<Rig, 's'>, trajs: readonly Pick<BandTrajectory, 'reach'>[], order: readonly number[] = UNIT_ORDER): { rIn: number; rOut: number; R: number } {
  const half = ((SQUARE.THICK / 2) * rig.s) / UNITS_PER_M;
  const rIn = (SQUARE.RADIUS * rig.s) / UNITS_PER_M + half;
  let inR = Infinity;
  for (let j = 0; j < order.length; j++) {
    const a = bandAngle(j), b = bandAngle((j + 1) % order.length);
    const ra = trajs[order[j]].reach, rb = trajs[order[(j + 1) % order.length]].reach;
    const ax = Math.cos(a) * ra, ay = Math.sin(a) * ra, bx = Math.cos(b) * rb, by = Math.sin(b) * rb;
    inR = Math.min(inR, Math.abs(ax * by - ay * bx) / Math.hypot(bx - ax, by - ay));
  }
  const rOut = (inR * rig.s) / UNITS_PER_M + half;
  return { rIn, rOut, R: (rIn + rOut) / 2 };
}

/** 成形后方台的边长（米，名义值：方形环的终态半边长 × 2） */
export function platformSide(rig: Pick<Rig, 's'>): number {
  return (2 * squareHalfSide(SQUARE_REACH) * rig.s) / UNITS_PER_M;
}

/** 猫在立体里怎么摆：位置（平面坐标，米）、身子朝向、头转多少、姿态、尾巴、弯多少、在不在台上、离台面抬多高（跨台时跳过去） */
export interface CatPlace {
  x: number;
  y: number;
  heading: number;
  headTurn: number;
  pose: CatPose;
  tail: CatTail;
  /** 身子弯的半径（米，0 = 直的）：在台上绕着立杆 */
  bend: number;
  onPlatform: boolean;
  lift: number;
}

/** 台上的猫坐在环上什么方位：离「它要看的方向」绕回 55°，身子顺着环、头再转过去看（不必扭满 90°） */
const RING_SIDE = (55 * Math.PI) / 180;

/**
 * 猫站在哪、怎么摆（2026-10-25 人与猫重做时取代 catSpot）。平面模型把猫当一个点：坐着时在单元中心（芯心），
 * 靠近访客时挪到台边。立体里芯是根杆子、方台的内切圆里只有一圈 16 cm 宽的台面（Lab 2-15 的 8×8，`platformBand`），
 * 0.47 m 长的猫怎么摆都会穿杆——所以台上的猫**顺着这一圈坐 / 蜷 / 走**：身子绕着立杆弯过去（figure.ts 的 bend），中线在圈宽正中；
 * 跨台（transfer）时贴着两根芯连线的一侧跳过去，两根芯都不碰。
 *   - 台上、在芯心：身子朝向 = 平面模型的朝向（往回绕 55° 摆在环上，头转回来看那个方向）；
 *   - 台上、在台边（靠近访客）：摆在朝访客那一侧再往回绕 55° 的地方，头转过去看访客；
 *   - 卧 → 蜷（绕着杆一圈），走 / 退 → 沿环走，其余 → 坐；
 *   - 地面：照平面模型的位置与朝向，直的。
 */
export function catPlacement(
  c: { x: number; y: number; heading: number; state: string },
  support: readonly { x: number; y: number }[],
  formed: boolean,
  moving: boolean,
  layout: Pick<PlanLayout, 'mastR'>,
  ring: { R: number },
): CatPlace {
  const R = ring.R;
  const floorPose = (): CatPose => {
    if (c.state === 'lie') return 'lie';
    if (c.state === 'sit' || c.state === 'wait' || c.state === 'held') return 'sit';
    if (moving) return 'walk';
    return c.state === 'approach' ? 'sit' : 'stand';
  };
  const tail: CatTail = c.state === 'approach' || (moving && c.state === 'walk') ? 'up' : 'relaxed';
  if (formed && support.length >= 2) {
    // 跨台：沿 A→B 走，贴在连线一侧 R 处（芯在猫身的 −x 侧，与台上坐着时同一侧），中途离台面略抬起（跳过台间的缝）
    const [A, B] = support;
    const dx = B.x - A.x, dy = B.y - A.y;
    const L2 = dx * dx + dy * dy || 1;
    const p = Math.max(0, Math.min(1, ((c.x - A.x) * dx + (c.y - A.y) * dy) / L2));
    const h = Math.atan2(dy, dx);
    const px = Math.sin(h), py = -Math.cos(h);
    return { x: A.x + p * dx + px * R, y: A.y + p * dy + py * R, heading: h, headTurn: 0, pose: 'walk', tail: 'up', bend: 0, onPlatform: true, lift: 0.06 * Math.sin(Math.PI * p) };
  }
  if (formed && support.length === 1) {
    const u = support[0];
    const dx = c.x - u.x, dy = c.y - u.y;
    const atCore = Math.hypot(dx, dy) < layout.mastR + 0.02;
    const look = c.heading;
    const anchor = atCore ? look : Math.atan2(dy, dx);
    const th = anchor - RING_SIDE;
    const facing = th + Math.PI / 2;
    const pose: CatPose = c.state === 'lie' ? 'curl' : moving && (c.state === 'walk' || c.state === 'retreat') ? 'walk' : 'sit';
    const turn = Math.atan2(Math.sin(look - facing), Math.cos(look - facing));
    return { x: u.x + Math.cos(th) * R, y: u.y + Math.sin(th) * R, heading: facing, headTurn: pose === 'curl' ? 0 : turn, pose, tail, bend: R, onPlatform: true, lift: 0 };
  }
  return { x: c.x, y: c.y, heading: c.heading, headTurn: 0, pose: floorPose(), tail, bend: 0, onPlatform: false, lift: 0 };
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

/** 天花方板：半边长 = (芯半径 + outer) × 装置缩放（与 Lab 2-8 的圆环板外缘同一副数）；y 与 halfT 是世界单位（板贴着天花，不随装置缩） */
export const PLATE = { outer: 11, y: -3, halfT: 3 } as const;

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

/** 天花方板：每格一块挂在天花上（y 0 平面），边与房间轴对齐（与方台同向），板随装置缩；静件，烘一份 */
export function platesMesh(rig: Pick<Rig, 's' | 'cells'>): { verts: Float32Array; idx: Uint32Array } {
  const h = (SQUARE.RADIUS + PLATE.outer) * rig.s;
  return concatMeshes(rig.cells.map((c) => boxVerts(c.x, PLATE.y, c.z, h, PLATE.halfT, h)));
}

/** 房间（地板 + 两面墙，Lab 2-8 的画法）按平面模型的内净尺寸 */
export function roomMesh(roomM: number, unit: number = UNITS_PER_M): { verts: Float32Array; idx: Uint32Array } {
  return boxesMesh(roomBoxesBySpan(roomM * unit));
}
