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
 * `FRAMES.retract` 帧；每条带按自己的两个数取帧（`pickUnitBands`）——程度在涨就查正向那条，在退就查回程那条；
 * 给人让路的带另走一段（2026-10-30）：成形态 fork 出来的收直回程 `retractStep(1.0)`，取 `FRAMES.door` 帧，多出来的布卷进上夹环。
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
import { SQUARE, buildSquareOrder, buildSquareUnits, squareHalfSide, squareStructureAt, SQUARE_REACH } from './skin-square';
import { SKIN, buildUnit, createSkinUnit, renderSmooth, type SkinUnit } from './skin-unit';
import { MECH, bandKeyMesh, bondSides, concatParts, hangerMesh, unitMechMesh, type MeshPart } from './unit-mechanism';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts, membranePanel, offsetProfile, rotateVertsY, type SolidTopology } from './skin-solid';
import { bakeIndexed } from '../linkage/gl3d';
import { bandTriIndex, bandVerts } from '../linkage/skin';
import type { Vec3 } from '../linkage/solver3d';
import { MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, RING_GRID_FIT, RING_GRID_PIVOT_Y, ROOM, roomBoxesBySpan, viewFitBySpan, type RingGridView } from './skin-grid';
import type { PlanLayout } from './unit-activation';
import { COHABIT, SQUARE_SCALE, bandAngle, type FurnRect } from './cohabit';
import type { CatPose, CatTail, SeatSpec } from './figure';

/** 一米 = 多少世界单位（由「人 = 1.70 m = 215 单位」定） */
export const UNITS_PER_M = 1000 / MM_PER_UNIT;

/**
 * 关键帧数（2026-10-27 加密：32 / 24 / 16 时相邻两帧差 4–9 cm，台架上读得出一格一格跳）：正向 48、回程 36、升降 32（直带子按长度
 * 比例压向顶端，纯几何）、过渡 8（直垂 → 正向第一帧的插值，纯几何：引擎初始摆位比自然松弛还直，两者差 7–11 cm，不补就是一下跳）、
 * 让路 24（2026-10-30：成形态 fork 出来走引擎的收直回程 `retractStep(1.0)`，见 `pickUnitBands`）。
 */
export const FRAMES = { form: 48, retract: 36, hoist: 32, bridge: 8, door: 24 } as const;
export type FrameCounts = { form: number; retract: number; hoist: number; bridge?: number; door?: number };

/** 让路回程跑多少步：900 步 r 从 0.30 线性走到 1.0（`retractStep` 的节奏），再静置 100 步把最后一点松弛拉平（实测第 1000 步挑出 0.0 px） */
export const DOOR_STEPS = 1000;

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
  /** 正向里形状还在变的最后一帧（成形在协议约六成处就到位，后面几十帧逐位相同；取帧只映射到会动的那段，免得先猛动再干等） */
  formActive: number;
  /** 让路回程里形状还在变的最后一帧（相对让路段起点；0 = 没有让路段） */
  doorActive: number;
  /**
   * 键（2026-10-30 网页模型细化，画键座与撑杆用）：bonds = 这张谱所有的键 [i0, j0, i1, j1, …]；sides = 各键两端的键座朝布的哪一面；
   * locks[帧] = 这一帧每颗键扣没扣（1 / 0），升降帧（布压成一团）为 null = 不画键。
   */
  bonds: Int32Array;
  sides: Int8Array;
  locks: (Uint8Array | null)[];
  /**
   * 结构段（带键的那段）中心的节点序号与半长（节）。带间的膜按它对位（`membraneVerts`）：结构贴底的排法
   * （2026-10-30）里三档的结构中心序号不同，按同一序号配对会把面档的台尖接到角档台面以下的布上。
   */
  mid: number;
  midHalf: number;
}

/**
 * 轨迹烘焙：分片跑（`work` 按时间预算推进），好让台架在挂载后的头几帧里把它算完而不卡住主线程。
 * 一条 202 节的带全程 3000 步在桌面上约 1.5 s（方台现用 169 节）。
 */
export class TrajectoryBaker {
  readonly n: number;
  private readonly unit;
  private readonly smoothW: number;
  private readonly smoothP: number;
  private readonly formAt: number[];
  private readonly retractAt: number[];
  private readonly hoistN: number;
  private readonly bridgeN: number;
  private readonly doorAt: number[];
  private readonly frames: Float64Array[] = [];
  /** 让路回程：成形那一刻 fork 出来的另一份引擎，与它的关键帧（烘完时排在过渡帧后面） */
  private doorUnit: SkinUnit | null = null;
  private readonly doorFrames: Float64Array[] = [];
  private readonly bonds: Int32Array;
  private readonly bondOf = new Map<number, number>();
  private readonly locks: (Uint8Array | null)[] = [];
  private readonly doorLocks: (Uint8Array | null)[] = [];
  private step = 0;
  private phase: 'form' | 'retract' | 'door' | 'done' = 'form';
  private result: BandTrajectory | null = null;

  private readonly mid: number;
  private readonly midHalf: number;

  constructor(def: RingUnitDef, frames: FrameCounts = FRAMES) {
    this.unit = createSkinUnit(def.spec, def.opts);
    this.n = this.unit.n;
    const st = squareStructureAt(def.spec);
    this.mid = st ? st.start + (st.fs - 1) / 2 : (this.n - 1) / 2;
    this.midHalf = st ? (st.fs - 1) / 2 : (this.n - 1) / 2;
    [this.smoothW, this.smoothP] = def.smooth;
    const spread = (k: number, total: number): number[] => Array.from({ length: k }, (_, i) => Math.round((i / (k - 1)) * total));
    this.formAt = spread(frames.form, SKIN.STEPS);
    this.retractAt = spread(frames.retract, SKIN.STEPS);
    this.hoistN = frames.hoist;
    this.bridgeN = frames.bridge ?? 0;
    this.doorAt = (frames.door ?? 0) > 1 ? spread(frames.door as number, DOOR_STEPS) : [];
    const bonds: number[] = [];
    for (const ch of buildUnit(def.spec).chains)
      for (const [i, j] of ch)
        if (!this.bondOf.has(i * 1024 + j)) {
          this.bondOf.set(i * 1024 + j, bonds.length / 2);
          bonds.push(i, j);
        }
    this.bonds = Int32Array.from(bonds);
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
    const total = 2 * SKIN.STEPS + (this.doorAt.length ? DOOR_STEPS : 0);
    const done = this.phase === 'form' ? this.step : this.phase === 'retract' ? SKIN.STEPS + this.step : 2 * SKIN.STEPS + this.step;
    return this.phase === 'done' ? 1 : done / total;
  }

  private capture(u: SkinUnit = this.unit, into: Float64Array[] = this.frames, locks: (Uint8Array | null)[] = this.locks): void {
    const p = renderSmooth(u.px, u.py, this.smoothW, this.smoothP);
    const f = new Float64Array(2 * u.n);
    f.set(p.x, 0);
    f.set(p.y, u.n);
    into.push(f);
    const l = new Uint8Array(this.bonds.length / 2);
    for (const [i, j] of u.locked) {
      const b = this.bondOf.get(i * 1024 + j);
      if (b !== undefined) l[b] = 1;
    }
    locks.push(l);
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
          if (this.doorAt.length) {
            this.doorUnit = this.unit.fork();
            this.capture(this.doorUnit, this.doorFrames, this.doorLocks); // 让路第 0 帧 = 成形态
          }
          this.capture(); // 回程第 0 帧 = 成形态（与正向末帧同一刻）
        }
      } else if (this.phase === 'retract') {
        this.unit.retractStep();
        this.step++;
        if (this.retractAt.includes(this.step)) this.capture();
        if (this.step >= SKIN.STEPS) {
          this.step = 0;
          if (this.doorUnit) this.phase = 'door';
          else this.finish();
        }
      } else {
        const d = this.doorUnit as SkinUnit;
        d.retractStep(1.0);
        this.step++;
        if (this.doorAt.includes(this.step)) this.capture(d, this.doorFrames, this.doorLocks);
        if (this.step >= DOOR_STEPS) this.finish();
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
    return { n, frames: [f0, hoistProfile(f0, n, HOIST.stowed)], footY: -f0[2 * n - 1] * SOLID.SCALE, platformTopY: -f0[2 * n - 1] * SOLID.SCALE, reach: SQUARE.RADIUS, retractActive: 0, formActive: 0, doorActive: 0, mid: this.mid, midHalf: this.midHalf, bonds: new Int32Array(0), sides: new Int8Array(0), locks: [null, null] };
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
    let formActive = 1;
    for (let k = F - 1; k > 1; k--) {
      const a = this.frames[k];
      const b = this.frames[k - 1];
      let d = 0;
      for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      if (d > 1e-6) {
        formActive = k;
        break;
      }
    }
    // 升降帧：由回程末帧（闲着的直带子）压向顶端，第 0 帧 = 收起态、末帧 = 直带子逐位相同
    const straight = this.frames[F + this.retractAt.length - 1];
    for (let j = 0; j < this.hoistN; j++) {
      this.frames.push(hoistProfile(straight, n, HOIST.stowed + (1 - HOIST.stowed) * (j / (this.hoistN - 1))));
      this.locks.push(null); // 升降帧：布压成一团，不画键
    }
    // 过渡帧：直垂 → 正向第 1 帧逐点线性插值（第 0 帧是引擎的初始摆位，比自然松弛还直，跳过）
    const entry = this.frames[1];
    for (let j = 0; j < this.bridgeN; j++) {
      const t = (j + 1) / (this.bridgeN + 1);
      const f = new Float64Array(2 * n);
      for (let i = 0; i < 2 * n; i++) f[i] = straight[i] + (entry[i] - straight[i]) * t;
      this.frames.push(f);
      this.locks.push(new Uint8Array(this.bonds.length / 2)); // 过渡帧：键都没扣，键座与外套照画
    }
    // 让路帧：排在最后（前面各段的下标逐位不变）
    let doorActive = 0;
    for (let k = this.doorFrames.length - 1; k > 0; k--) {
      const a = this.doorFrames[k];
      const b = this.doorFrames[k - 1];
      let d = 0;
      for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      if (d > 1e-6) {
        doorActive = k;
        break;
      }
    }
    for (const f of this.doorFrames) this.frames.push(f);
    for (const l of this.doorLocks) this.locks.push(l);
    this.doorUnit = null;
    // 键座朝哪一面：取成形态（所有键都扣着）
    const sides = bondSides(formed.subarray(0, n), formed.subarray(n, 2 * n), n, this.bonds, SQUARE.RADIUS);
    this.result = {
      n,
      frames: this.frames,
      footY: -this.frames[0][2 * n - 1] * SOLID.SCALE,
      platformTopY: top,
      reach: SQUARE.RADIUS + reach * SOLID.SCALE,
      retractActive: active,
      formActive,
      doorActive,
      mid: this.mid,
      midHalf: this.midHalf,
      bonds: this.bonds,
      sides,
      locks: this.locks,
    };
  }
}

/**
 * 方形单元那条带的节数。2026-10-25 起用 Lab 2-7 方形环立项时的 202 节（lead 22）：方形环现行的 305 节是 2026-09-02
 * 为捏分编制加长的，多出来的全在上半截贴芯的素管里（形状逐点相同），立在方台上方会是一根一米来高的布筒。
 * 2026-10-30 结构改贴底（见 UNIT_TIERS）后再缩到 169 节：最上面那段贴合只留到下限（面档 lead = SQUARE.LEAD_MIN = 8，
 * 边 10、角 31），三档的垫与结构一节没动，成形的形状与锁定逐点相同（实测偏差 0）。成形后台面以上的带 97 → 83 px、
 * 台面以下 118 → 65 px（台面到钉住端），整台短了约三成。
 */
export const UNIT_BAND = 169;
/**
 * 方形单元的三档引擎定义（面 / 边 / 角，Lab 2-7 方形环平档的键谱）与二十条带的档位编制（下标 = 带序 j）。
 * 2026-10-30 改为结构贴底的排法（skin-square `squareWrapLow`，作者「每一次机构成型之后它的底面下面直接接这个单元的
 * 最底端，而不是还要再支出来一段圆柱形的东西」）：键谱一颗没改，配平垫从结构上下各一半挪到结构上方，结构底下只接一段
 * 短尾。成形的形状与锁定逐点相同；台底到钉住端 0.33 → 0.12 m（房间尺度）。
 */
export const UNIT_TIERS: readonly RingUnitDef[] = buildSquareUnits(undefined, UNIT_BAND, 'bottom');
export const UNIT_ORDER: readonly number[] = buildSquareOrder();

/** 已经烘好的三档轨迹（同一页面里换路由、重挂台架时直接拿，不重烘） */
const BAKED = new Map<string, BandTrajectory[]>();

/**
 * 三档轨迹一起烘：三条引擎依次推进（分片，`work` 按时间预算），全部烘完才算完。三档的节点数相同（同一条
 * 169 节的带），钉住端高度相同（注册在底端）、平台面高度相同（方形环的对位构造），台架拿第 0 档定摆放。
 */
export class UnitBaker {
  readonly n: number;
  private readonly key: string;
  private readonly bakers: TrajectoryBaker[];
  private result: BandTrajectory[] | null;

  constructor(defs: readonly RingUnitDef[] = UNIT_TIERS, frames: FrameCounts = FRAMES) {
    this.key = `${defs.map((d) => d.key).join('|')}#${frames.form}/${frames.retract}/${frames.hoist}/${frames.bridge ?? 0}`;
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
 * 一条带该用哪一帧（f = 这条带的程度，0–1；台架经 `pickUnitBands` 调，让路的带另有一段），rising = f 在涨。两段：
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
  frames: FrameCounts = FRAMES,
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

/** 过渡帧的起始下标（排在升降帧后面） */
export const BRIDGE_BASE = FRAMES.form + FRAMES.retract + FRAMES.hoist;

/**
 * 一档带子成形段的两条路（2026-10-27，修台架上「运动不对劲、单元破裂」）。按程度直接换算帧号（`bandFrame`）有三处跳：
 * ① 进成形段的第一帧从直垂跳到正向第 1 帧（差 7–11 cm）；② 正向后四成的帧逐位相同，程度涨到六成形就到位、之后干等；
 * ③ 程度一反向就从正向第 i 帧跳到回程第 (1−g) 帧，两条轨迹在中途形状不同（最多差 35 cm）。
 * 这里把成形段拆成两条路——正向 = 直垂 → 过渡帧 → 正向第 1…formActive 帧；回程 = 回程第 0…retractActive 帧 → 直垂——
 * 并给每帧在另一条路上找形状最接近的那一格（`toRet` / `toFwd`），反向时跳到那里接着走（`stepBandCursor`）。
 */
export interface BandPaths {
  fwd: number[];
  ret: number[];
  /** 正向路第 i 格在回程路上形状最近的那一格；toFwd 反之 */
  toRet: Int16Array;
  toFwd: Int16Array;
}

export function bandPaths(traj: BandTrajectory, frames: FrameCounts = FRAMES): BandPaths {
  const straight = frames.form + frames.retract - 1;
  const base = frames.form + frames.retract + frames.hoist;
  const bridge = frames.bridge ?? 0;
  const fwd = [straight];
  for (let j = 0; j < bridge; j++) fwd.push(base + j);
  for (let k = 1; k <= Math.max(1, traj.formActive); k++) fwd.push(k);
  const ret: number[] = [];
  for (let r = 0; r <= traj.retractActive; r++) ret.push(frames.form + r);
  ret.push(straight);
  const n = traj.n;
  const dist = (a: number, b: number): number => {
    const A = traj.frames[a];
    const B = traj.frames[b];
    let d = 0;
    for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(A[i] - B[i]));
    return d;
  };
  const nearest = (from: number[], to: number[]): Int16Array =>
    Int16Array.from(from, (a) => {
      let best = 0;
      let bd = Infinity;
      to.forEach((b, i) => {
        const d = dist(a, b);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
  return { fwd, ret, toRet: nearest(fwd, ret), toFwd: nearest(ret, fwd) };
}

/** 反向的迟滞（成形段程度 g 的单位）：程度掉回最高点以下这么多才算真的在退，免得每帧一翻 */
export const CURSOR_HYST = 0.03;

/** 每条带的游标：mode 1 = 走正向路、0 = 走回程路；ext = 这一程程度的极值；ga / pa = 这一程起点的程度与路上的格 */
export interface BandCursors {
  mode: Uint8Array;
  ext: Float32Array;
  ga: Float32Array;
  pa: Float32Array;
  /** 此刻在路上的格（反向时按它找另一条路上最近的格） */
  pos: Float32Array;
}

export function bandCursors(count: number): BandCursors {
  const c = { mode: new Uint8Array(count), ext: new Float32Array(count), ga: new Float32Array(count), pa: new Float32Array(count), pos: new Float32Array(count) };
  resetBandCursors(c);
  return c;
}

export function resetBandCursors(c: BandCursors): void {
  c.mode.fill(1);
  c.ext.fill(0);
  c.ga.fill(0);
  c.pa.fill(0);
  c.pos.fill(0);
}

/**
 * 推进第 i 条带的游标，返回这一帧用哪一帧（帧号含义同 `bandFrame`）。升降段与三个静止态与 `bandFrame` 逐位相同，
 * 只有成形段改走路径：程度 g 从这一程起点 ga 线性映射到路尽头，反向（越过迟滞）时跳到另一条路上形状最近的格。
 */
export function stepBandCursor(
  c: BandCursors,
  i: number,
  f: number,
  paths: BandPaths,
  frames: FrameCounts = FRAMES,
  dropAt: number = HOIST.dropAt,
  hyst: number = CURSOR_HYST,
): number {
  const g = f >= 1 - 1e-4 ? 1 : f < dropAt ? 0 : (f - dropAt) / (1 - dropAt);
  if (f < dropAt || g <= 1e-4) {
    // 升降段 / 直垂：下一次进成形段从直垂沿正向路走
    c.mode[i] = 1;
    c.ext[i] = 0;
    c.ga[i] = 0;
    c.pa[i] = 0;
    c.pos[i] = 0;
    return bandFrame(f, true, frames, 0, dropAt);
  }
  if (g >= 1) {
    // 成形态：一退就从回程第 0 格（= 成形态）走
    c.mode[i] = 0;
    c.ext[i] = 1;
    c.ga[i] = 1;
    c.pa[i] = 0;
    c.pos[i] = 0;
    return frames.form - 1;
  }
  if (c.mode[i] === 1) {
    if (g < c.ext[i] - hyst) {
      const p = paths.toRet[Math.round(c.pos[i])];
      c.mode[i] = 0;
      c.ga[i] = g;
      c.pa[i] = p;
      c.ext[i] = g;
    } else c.ext[i] = Math.max(c.ext[i], g);
  } else if (g > c.ext[i] + hyst) {
    const p = paths.toFwd[Math.round(c.pos[i])];
    c.mode[i] = 1;
    c.ga[i] = g;
    c.pa[i] = p;
    c.ext[i] = g;
  } else c.ext[i] = Math.min(c.ext[i], g);
  const ga = c.ga[i];
  const pa = c.pa[i];
  let pos: number;
  let path: number[];
  if (c.mode[i] === 1) {
    path = paths.fwd;
    const end = path.length - 1;
    pos = g <= ga ? pa : pa + ((g - ga) / Math.max(1e-6, 1 - ga)) * (end - pa);
  } else {
    path = paths.ret;
    const end = path.length - 1;
    pos = g >= ga ? pa : pa + ((ga - g) / Math.max(1e-6, ga)) * (end - pa);
  }
  pos = Math.max(0, Math.min(path.length - 1, pos));
  c.pos[i] = pos;
  return path[Math.round(pos)];
}

/** 让路段的第一帧（排在升降与过渡帧后面）与「这条带算在让路」的门槛（收回几成） */
export const DOOR_BASE = FRAMES.form + FRAMES.retract + FRAMES.hoist + FRAMES.bridge;
export const DOOR_EPS = 0.01;

export function isDoorFrame(k: number, frames: FrameCounts = FRAMES): boolean {
  return (frames.door ?? 0) > 0 && k >= frames.form + frames.retract + frames.hoist + (frames.bridge ?? 0);
}

/** 成形到底的单元里，一条带收回了 open（0–1）就取让路段的这一帧（可逆：收回、落回走同一段，落回 = 倒放） */
export function doorFrame(traj: Pick<BandTrajectory, 'doorActive'>, open: number, frames: FrameCounts = FRAMES): number {
  const base = frames.form + frames.retract + frames.hoist + (frames.bridge ?? 0);
  return base + Math.round(Math.max(0, Math.min(1, open)) * traj.doorActive);
}

/** 第 k 帧带子顶端（节点 0，贴在芯上）的高度（引擎 py，向上为正）。同一帧号各档相同：三档的贴合与自由节数总量一样，芯一样长 */
export function bandTop(traj: Pick<BandTrajectory, 'frames' | 'n'>, k: number): number {
  return traj.frames[k][traj.n];
}

/**
 * 一台单元此刻每条带用哪一帧（2026-10-30 修「让路的带碎在上面」）。写进 frameOf[u·B + j]，返回这台的上夹环落在哪一帧的顶端（帧号）。
 *
 * 原来每条带按 f = 程度 × (1 − 收回) 取帧：一条带收回到底 f 就落到 0，取的是「整台收在天花下」的升降帧——整条带往它自己的
 * 顶端压成一小团，下端离开钉住端，漂在半空；收回途中走的回程那条路顶端又往上走，比旁边成形的带高出 0.7 m。一台单元碎成上下两截。
 * 平面模型（cohabit `FACES`）定的本来是「挡路的带各自走引擎的收直回程 `retractStep(1.0)`，布沿杆收直、挑出回到芯半径」
 * （作者 2026-10-07），立体一直没照做。现在：
 * - 单元在升降段（程度 < dropAt）：整台一起走，收回不起作用（直筒本来就不挑出）；
 * - 单元成形到底：收回的带走让路段——成形态 fork 出来的引擎收直回程（`TrajectoryBaker` 的 door 段），收回几成取第几帧，可逆；
 * - 单元成形到一半：收回的带沿原来成形段的两条路退，但只退到直带子为止，不进升降段。
 * 顶端：所有带共用一个上夹环，夹环在这台最低的那个带顶（= 没收回的带的顶）。收回的带顶端本来要往上走，
 * 读成**多出来的布从上夹环卷进去**（`clipToReel`）——作者 10-07「松键之后多余的布可以往上去」，往上去的是布、不是夹持点。
 * 于是一台单元的二十条带始终上接同一个夹环、下接同一个钉住端，让路的带平贴在芯上，旁边成形的照旧。
 */
export function pickUnitBands(
  u: number,
  deg: number,
  open: ArrayLike<number>,
  trajs: readonly BandTrajectory[],
  paths: readonly BandPaths[],
  cursors: BandCursors,
  frameOf: Int32Array,
  order: readonly number[] = UNIT_ORDER,
  frames: FrameCounts = FRAMES,
  dropAt: number = HOIST.dropAt,
): number {
  const B = order.length;
  const formed = deg >= 1 - 1e-4;
  let reel = -1;
  let reelTop = Infinity;
  for (let j = 0; j < B; j++) {
    const i = u * B + j;
    const t = order[j];
    const o = open[i];
    let k: number;
    if (deg < dropAt) k = stepBandCursor(cursors, i, deg, paths[t], frames, dropAt);
    else if (formed && o > DOOR_EPS && trajs[t].doorActive > 0) {
      stepBandCursor(cursors, i, 1, paths[t], frames, dropAt); // 游标停在成形态：门一关就从成形态接着走
      k = doorFrame(trajs[t], o, frames);
    } else k = stepBandCursor(cursors, i, dropAt + (deg - dropAt) * (1 - o), paths[t], frames, dropAt);
    frameOf[i] = k;
    const top = bandTop(trajs[t], k);
    if (top < reelTop) {
      reelTop = top;
      reel = k;
    }
  }
  return reel;
}

/** 收进上夹环的那截按这个比例压在夹环上方（保留节点顺序与非零切向，画出来是零点几厘米、藏在夹环里） */
export const REEL_SQUASH = 0.01;

/** 比 reelPy 高的节点收进上夹环：高出的部分压到 1%、离芯的部分也压到 1%；不高过夹环的带逐位不变 */
export function clipToReel(src: Float64Array, n: number, reelPy: number): Float64Array {
  const out = Float64Array.from(src);
  for (let i = 0; i < n; i++)
    if (src[n + i] > reelPy) {
      out[n + i] = reelPy + (src[n + i] - reelPy) * REEL_SQUASH;
      out[i] = src[i] * REEL_SQUASH;
    }
  return out;
}

/**
 * 两条带的帧能不能用一块膜连：都在升降段、或都在成形段（开门的带收成一小截时，与旁边成形的带之间不拉膜——那里正是门）。
 * 2026-10-30 起让路的带不再收进升降段，改按「这条带是不是在让路」判：任一侧在让路（doorA / doorB，或取的是让路段的帧）就不拉膜。
 */
export function membraneJoins(ka: number, kb: number, frames: FrameCounts = FRAMES, doorA = false, doorB = false): boolean {
  if (doorA || doorB || isDoorFrame(ka, frames) || isDoorFrame(kb, frames)) return false;
  const s = frames.form + frames.retract;
  const hoistA = ka >= s && ka < s + frames.hoist;
  const hoistB = kb >= s && kb < s + frames.hoist;
  return hoistA === hoistB;
}

/**
 * 蒙皮的接缝片连不连（2026-10-30）：只在门的边上张开——一侧在让路、另一侧没在让路（拉了就是一片从台缘斜扯到平贴的带上的皮）。
 * 两侧都在让路时照连（两条都平贴在芯上，中间就是一道普通的带缝）；与膜一样，升降段与成形段之间不连。
 * 膜（membraneJoins）在门的两侧一律不拉，外皮若照搬，几条带一起让路时平贴的那一截会露出一道道竖缝。
 */
export function shellJoins(ka: number, kb: number, frames: FrameCounts = FRAMES, doorA = false, doorB = false): boolean {
  const da = doorA || isDoorFrame(ka, frames);
  const db = doorB || isDoorFrame(kb, frames);
  if (da !== db) return false;
  const s = frames.form + frames.retract;
  const hoistA = ka >= s && ka < s + frames.hoist;
  const hoistB = kb >= s && kb < s + frames.hoist;
  return hoistA === hoistB;
}

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

/**
 * 单元兼作桌子时的台面高度（米，离地；2026-10-27 作者「桌面高度参考人体工学数据」）。一个高度当不了所有桌子，按服务谁落：
 * - stand 1.05：站着用——站姿肘高附近（BIFMA G1 站立桌可调到 1.18；吧台桌通行 1.0–1.1）。不当桌子的单元都落到这里；
 * - chair 0.74：配餐椅（座面 0.45）——桌面比座面高 0.27–0.30 是通行的桌椅高差；台面 0.15 厚、台底 0.59，腿进不去，
 *   所以餐椅那台的台边按 COHABIT.TABLE 落在膝盖前面；
 * - sofaFront 0.49：沙发正前方当茶几——资料要与座面齐或略低（0.40–0.45）。定这个数时台面到吊带最下端有 0.48 m、0.49 是下限；
 *   2026-10-30 结构改贴底（UNIT_TIERS）后只剩约 0.27 m，已能落进资料范围，改不改待作者定。
 * 哪一台当谁的桌子、什么时候落由平面模型定（COHABIT.TABLE、CohabitSim.tableBy），这里只管高度。
 * 原来铺满时钉在 1.43 m（场地布局那个高度，接近站姿肩高），哪种桌子都不是。
 */
export const TABLE_TOP = { stand: 1.05, chair: 0.74, sofaFront: 0.49 } as const;

/**
 * 台面换高度的速度（m/s）：取市面上电动升降桌的快档 80 mm/s（常见 30–50 mm/s，见厂商参数；Lee 等 2019 用的 IKEA Bekant 是
 * 30 mm/s，受试者嫌它在坐站之间切换时太慢）。一台从站立高度落到茶几高度约 7 s、到餐桌高度约 4 s。收在天花下的单元直接
 * 落到目标高度（那一段走的是升降轨迹，不吃这个速度）。
 */
export const TABLE_MOVE = 0.08;

/** 台面落在 topM（米，离地）时装置原点的世界高度 */
export function rigYForTop(rig: Pick<Rig, 's'>, traj: Pick<BandTrajectory, 'platformTopY'>, topM: number): number {
  return ROOM.FLOOR_Y - topM * UNITS_PER_M - rig.s * traj.platformTopY;
}

/** 给坐在 r 上的人当桌子时落到多高：餐椅 → 餐桌高度，沙发 → 茶几高度 */
export function tableTopFor(r: Pick<FurnRect, 'kind'>): number {
  return r.kind === 'chair' ? TABLE_TOP.chair : TABLE_TOP.sofaFront;
}

/**
 * 单元铺满整间房（cover: 'room'，2026-10-27）时台子跟着格距放大约 1.37 倍；工位改按台面钉：默认台面在 TABLE_TOP.stand，
 * 给坐着的人用的那几台由台架另按 tableTopFor 落（rigYForTop）。场地布局照旧把钉住端钉在 RIG_ANCHOR_Y。
 */
export function rigFor(layout: PlanLayout, traj: Pick<BandTrajectory, 'footY' | 'platformTopY'>, scale: number = SQUARE_SCALE): Rig {
  const s = ((RIG_SCALE * layout.pitchM) / layout.pitch4) * scale;
  let y = RIG_ANCHOR_Y - s * traj.footY;
  if (layout.cover === 'room') y = rigYForTop({ s }, traj, TABLE_TOP.stand);
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
export function unitTopY(rig: Pick<Rig, 'y' | 'stowY'>, drop: number, workY: number = rig.y): number {
  return rig.stowY + (workY - rig.stowY) * drop;
}

/**
 * 单元此刻的钉住端世界高度 = 布束底 = 立杆下端：吊长按升降程度从 HOIST.stowed 倍放到全长，
 * 到工位时 = RIG_ANCHOR_Y。与 hoistProfile 的脚只差顶端节点那零点几个单位（压缩是绕顶端节点做的）。
 */
export function unitFootY(rig: Pick<Rig, 'y' | 'stowY' | 's'>, footY: number, drop: number, workY: number = rig.y): number {
  return unitTopY(rig, drop, workY) + rig.s * footY * (HOIST.stowed + (1 - HOIST.stowed) * drop);
}

/** 一条带在装置自身坐标系里的顶点（沿本地 +X 放在芯半径处，再由摆放表转到各方位角）；reelPy = 上夹环在哪（让路的带按它截） */
export function bandVertsAt(traj: BandTrajectory, frame: number, topo: SolidTopology, out?: Float32Array, reelPy?: number): Float32Array {
  const f = reelPy === undefined ? traj.frames[frame] : clipToReel(traj.frames[frame], traj.n, reelPy);
  const n = traj.n;
  return fillSolidVerts(f.subarray(0, n), f.subarray(n, 2 * n), n, SQUARE.RADIUS, SQUARE.DEPTH, SQUARE.THICK, SOLID.SCALE, out && out.length === topo.vertCount * 3 ? out : undefined, 0, 0, null);
}

/** 一条带的两组条纹网格（gl3d 静态缓冲用） */
export function bakeBand(traj: BandTrajectory, frame: number, topo: SolidTopology, reelPy?: number): { a: Float32Array; b: Float32Array } {
  const v = bandVertsAt(traj, frame, topo, undefined, reelPy);
  return { a: bakeIndexed(v, topo.idxA), b: bakeIndexed(v, topo.idxB), };
}

/** 一条带的键（键座与撑杆外套 = pad、扣上的内杆 = rod），装置自身系、带沿 +x；升降帧（locks 为 null）没有键；reelPy 同 bandVertsAt */
export function bandKeyParts(traj: BandTrajectory, frame: number, reelPy?: number): { pad: MeshPart; rod: MeshPart } | null {
  const locks = traj.locks[frame];
  if (!locks || !traj.bonds.length) return null;
  const n = traj.n;
  const f = reelPy === undefined ? traj.frames[frame] : clipToReel(traj.frames[frame], n, reelPy);
  return bandKeyMesh(f.subarray(0, n), f.subarray(n, 2 * n), n, traj.bonds, traj.sides, locks, SQUARE.RADIUS, SQUARE.THICK);
}

const EMPTY = new Float32Array(0);
const bakePart = (m: MeshPart | undefined): Float32Array => (m && m.idx.length ? bakeIndexed(m.verts, m.idx) : EMPTY);

/** 一条带的键，烘好（空的给长度 0 的数组，台架据此不画） */
export function bakeBandKeys(traj: BandTrajectory, frame: number, reelPy?: number): { pad: Float32Array; rod: Float32Array } {
  const k = bandKeyParts(traj, frame, reelPy);
  return { pad: bakePart(k?.pad), rod: bakePart(k?.rod) };
}

/** 整台（二十条带同一帧）的键，每条带转到自己的方位角后拼成一份（与 bakeUnit 同） */
export function bakeUnitKeys(trajs: readonly BandTrajectory[], frame: number, order: readonly number[] = UNIT_ORDER): { pad: Float32Array; rod: Float32Array } {
  const pads: MeshPart[] = [];
  const rods: MeshPart[] = [];
  const ones = trajs.map((t) => bandKeyParts(t, frame));
  for (let j = 0; j < order.length; j++) {
    const k = ones[order[j]];
    if (!k) continue;
    const ring = { radius: 0, angle: bandAngle(j) };
    pads.push({ verts: rotateVertsY(Float32Array.from(k.pad.verts), ring), idx: k.pad.idx });
    rods.push({ verts: rotateVertsY(Float32Array.from(k.rod.verts), ring), idx: k.rod.idx });
  }
  return { pad: bakePart(concatParts(pads)), rod: bakePart(concatParts(rods)) };
}

/**
 * 一台单元的上夹环、下夹环与芯（装置自身系）：上夹环在第 frame 帧的带顶（`pickUnitBands` 给的上夹环那一帧），下夹环在
 * 那一帧的钉住端。同一帧号各档的顶与钉住端相同，用第 0 档的轨迹即可。alu = 夹圈（浅），dark = 辐条、中心套、芯（深）。
 */
export function bakeUnitMech(traj: BandTrajectory, frame: number, frames: FrameCounts = FRAMES): { alu: Float32Array; dark: Float32Array } {
  const f = traj.frames[frame];
  const n = traj.n;
  // 升降帧（收在天花下、落下的路上）的夹环用低分段：收着时只在天花方板下露一圈
  const hoist = frame >= frames.form + frames.retract && frame < frames.form + frames.retract + frames.hoist;
  const m = unitMechMesh(SQUARE.RADIUS, SQUARE.THICK, -f[n] * SOLID.SCALE, -f[2 * n - 1] * SOLID.SCALE, hoist ? MECH.SEGS_LOW : MECH.SEGS);
  return { alu: bakePart(m.alu), dark: bakePart(m.dark) };
}

/** 吊杆（竖向归一化，摆放时按长度拉伸），烘好 */
export function bakeHanger(): Float32Array {
  return bakePart(hangerMesh());
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
  return { ...traj, n: m, frames, mid: traj.mid / stride, midHalf: traj.midHalf / stride, bonds: new Int32Array(0), sides: new Int8Array(0), locks: frames.map(() => null) };
}

/** 收起态整台网格的抽稀步长 */
export const STOWED_STRIDE = 8;

/**
 * 膜的 B 边在 A 边第 i 个节点对面取哪个（小数）序号：两档结构中心对齐，中心两侧各 w 节（两档结构半长取小）
 * 逐节对位（与七段谱时代按同一序号配对的读法相同：台面对台面），其余分段线性摊到带顶 / 带底。中心相同时恒等。
 */
export function membraneIndex(i: number, n: number, ma: number, mb: number, w: number): number {
  if (ma === mb) return i;
  const lo = ma - w;
  const hi = ma + w;
  if (i <= lo) return lo <= 0 ? mb - w : (i / lo) * (mb - w);
  if (i >= hi) return hi >= n - 1 ? mb + w : mb + w + ((i - hi) / (n - 1 - hi)) * (n - 1 - mb - w);
  return i - ma + mb;
}

/**
 * 带与带之间的膜（2026-10-25 随方形单元补上：没有它，方台俯视是一把放射状的窄带，读不出是一张方的台面；
 * 作者 10-23 讲收起态时也说的是「蒙皮、可折叠的布」）。几何 = Lab 2-5 / 2-7 那块织物膜（skin-solid `membranePanel`）：
 * A 边取带 j 的后剖口（它那一档、它那一帧），B 边取带 j+1 的前剖口；烘在方位角 0，摆放时转到 bandAngle(j)。
 * 两档结构中心序号不同时（结构贴底的排法），B 边按 `membraneIndex` 在节点之间插值取点。
 * 半透明，台架在实体之后画（gl3d 半透明的三条硬约束）。
 */
export function membraneVerts(a: BandTrajectory, fa: number, b: BandTrajectory, fb: number, count: number = SQUARE.COUNT): { verts: Float32Array; idx: Uint16Array } {
  const n = a.n;
  const A = a.frames[fa];
  let B = b.frames[fb];
  if (a.mid !== b.mid) {
    const w = Math.min(a.midHalf, b.midHalf);
    const R = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(n - 1, membraneIndex(i, n, a.mid, b.mid, w)));
      const k = Math.min(n - 2, Math.floor(t));
      const u = t - k;
      R[i] = B[k] + (B[k + 1] - B[k]) * u;
      R[n + i] = B[n + k] + (B[n + k + 1] - B[n + k]) * u;
    }
    B = R;
  }
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

/**
 * 单元的外皮（2026-10-30，作者「蒙皮和这个绿色的布只是设计阶段的临时状态，现在设计一个真正的蒙皮在上面作为单元的外表面，
 * 也是可以开可以关的」）。带子与带间的膜是结构与设计过程；外皮是做出来的东西给人看、给人摸的那一层。
 *
 * 一层连续、不透明的皮把整台包住，分两种片：每条带外侧一片**盖片**（跟着这条带走），相邻两条带之间一片**接缝片**
 * （跨过带缝，与膜同一种直纹面）——绕一圈正好闭合。几何 = 带子剖面沿外法向偏出 THICK/2 + GAP（skin-solid `offsetProfile`），
 * 两端各让出 END 节：外皮离芯心 RADIUS + 2.1，夹圈内壁在 RADIUS + 2.5，故外皮两头正好塞进上下夹环的外圈里面。
 * 让路时接缝片张开、盖片跟着它那条带平贴到芯上（与膜同一条规则 `membraneJoins`）：皮按带分片，能开门的是片与片之间那道缝。
 * 这是建模假设（外皮怎么分片、接缝怎么张开），与 项目二_单元建模.md §2 的机构读法同一性质，待作者确认。
 */
export const SHELL = {
  /** 外皮离带子外表面的间隙（装置单位，房间尺度 ≈ 2.4 mm）：比夹圈内壁的 GAP（1 单位）小，外皮两头才塞得进夹圈 */
  GAP: 0.6,
  /** 两端各让出的节数（藏进夹环；夹环夹住带子端头 MECH.CLAMP_N 节） */
  END: 2,
} as const;

/** 收起态那份抽稀轨迹上让出的节数（抽稀步长 8，一节就盖过夹环） */
export const SHELL_END_LOW = 1;

/** 外皮剖面：引擎帧（可按上夹环截）→ 装置系偏移线 [r…, y…] */
function shellProfile(traj: BandTrajectory, frame: number, reelPy?: number): Float64Array {
  const n = traj.n;
  const f = reelPy === undefined ? traj.frames[frame] : clipToReel(traj.frames[frame], n, reelPy);
  return offsetProfile(f.subarray(0, n), f.subarray(n, 2 * n), n, SQUARE.RADIUS, SOLID.SCALE, SQUARE.THICK / 2 + SHELL.GAP);
}

/** 盖片：一条带外侧那片（前剖口 +DEPTH/2 → 后剖口 −DEPTH/2），装置系、方位角 0；reelPy 同 bandVertsAt */
export function shellCoverVerts(traj: BandTrajectory, frame: number, reelPy?: number, end: number = SHELL.END): { verts: Float32Array; idx: Uint16Array } {
  const n = traj.n;
  const o = shellProfile(traj, frame, reelPy);
  const A: Vec3[] = [];
  const B: Vec3[] = [];
  for (let i = end; i < n - end; i++) {
    A.push({ x: o[i], y: o[n + i], z: SQUARE.DEPTH / 2 });
    B.push({ x: o[i], y: o[n + i], z: -SQUARE.DEPTH / 2 });
  }
  return { verts: bandVerts(A, B), idx: bandTriIndex(A.length) };
}

/**
 * 接缝片：带 a 的前剖口（+DEPTH/2，方位角朝带 b 那侧）→ 带 b 的后剖口（−DEPTH/2，转过一个角节距）——正好跨过两条带之间那道缝，
 * 与盖片首尾相接、不重叠。节点对位与膜（membraneVerts）相同：两档结构中心不同时，B 边按 membraneIndex 在节点之间插值；
 * 两边都按同一个上夹环截（clipToReel 对没高过夹环的带逐位不变）。
 * 注：膜的 A/B 取的是带 a 的后剖口与带 b 的前剖口，跨过的是两条带本身加中间的缝（半透明，看不出来）；外皮不透明，必须只跨缝。
 */
export function shellGoreVerts(
  a: BandTrajectory,
  fa: number,
  b: BandTrajectory,
  fb: number,
  count: number = SQUARE.COUNT,
  reelPy?: number,
  end: number = SHELL.END,
): { verts: Float32Array; idx: Uint16Array } {
  const n = a.n;
  const oa = shellProfile(a, fa, reelPy);
  let ob = shellProfile(b, fb, reelPy);
  if (a.mid !== b.mid) {
    const w = Math.min(a.midHalf, b.midHalf);
    const R = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(n - 1, membraneIndex(i, n, a.mid, b.mid, w)));
      const k = Math.min(n - 2, Math.floor(t));
      const u = t - k;
      R[i] = ob[k] + (ob[k + 1] - ob[k]) * u;
      R[n + i] = ob[n + k] + (ob[n + k + 1] - ob[n + k]) * u;
    }
    ob = R;
  }
  const dTheta = (2 * Math.PI) / count;
  const c = Math.cos(dTheta);
  const sn = Math.sin(dTheta);
  const t = SQUARE.DEPTH / 2;
  const A: Vec3[] = [];
  const B: Vec3[] = [];
  for (let i = end; i < n - end; i++) {
    A.push({ x: oa[i], y: oa[n + i], z: t });
    const r = ob[i];
    B.push({ x: r * c + t * sn, y: ob[n + i], z: r * sn - t * c });
  }
  return { verts: bandVerts(A, B), idx: bandTriIndex(A.length) };
}

const asParts = (m: { verts: Float32Array; idx: Uint16Array }, angle: number): { verts: Float32Array; idx: Uint32Array } => ({
  verts: rotateVertsY(Float32Array.from(m.verts), { radius: 0, angle }),
  idx: Uint32Array.from(m.idx),
});

/** 整台的外皮（二十片盖片 + 二十片接缝片，同一帧）：静止态用，盖片与接缝片各烘一份（台架分两个色调画） */
export function bakeUnitShell(
  trajs: readonly BandTrajectory[],
  frame: number,
  order: readonly number[] = UNIT_ORDER,
  end: number = SHELL.END,
): { cover: Float32Array; gore: Float32Array } {
  const covers = order.map((t, j) => asParts(shellCoverVerts(trajs[t], frame, undefined, end), bandAngle(j)));
  const gores = order.map((t, j) => asParts(shellGoreVerts(trajs[t], frame, trajs[order[(j + 1) % order.length]], frame, order.length, undefined, end), bandAngle(j)));
  const c = concatMeshes(covers);
  const g = concatMeshes(gores);
  return { cover: bakeIndexed(c.verts, c.idx), gore: bakeIndexed(g.verts, g.idx) };
}

/** 一片盖片烘好（逐条摆的带子用；键与带子网格同一个 key） */
export function bakeShellCover(traj: BandTrajectory, frame: number, reelPy?: number): Float32Array {
  const m = shellCoverVerts(traj, frame, reelPy);
  return bakeIndexed(m.verts, m.idx);
}

/** 一片接缝片烘好 */
export function bakeShellGore(a: BandTrajectory, fa: number, b: BandTrajectory, fb: number, reelPy?: number): Float32Array {
  const m = shellGoreVerts(a, fa, b, fb, SQUARE.COUNT, reelPy);
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

/**
 * 人体工学那套家具的立体尺寸（米，2026-10-27；平面占位与座位点见 cohabit COHABIT.SEATS.KINDS_ERGO）：
 * 沙发 = 实心底座（前脸比坐垫退进 5 cm，留脚跟位）+ 坐垫 + 靠背 + 两侧扶手——座面离地 0.43（QB/T 1952.1 座前高 0.37–0.48；国人小腿加足高女 P50 0.38、男 P50 0.41，
 *   加鞋约 2.5 cm）、坐垫 0.13 厚、靠背 0.20 厚顶高 0.80、扶手 0.12 宽顶高 0.62（座面上 0.19）。
 * 餐椅 = 四条腿 + 座板 + 薄靠背——座面离地 0.45（配 0.72–0.75 的桌面，高差 0.27–0.30）、座板 0.05、腿 0.04 见方、靠背 0.04 厚顶高 0.85。
 * 各块按「不重叠」切开摆（只在彼此看不见的内侧共面），免得共面闪烁。
 */
export const FURN_ERGO = {
  sofa: { seatH: 0.43, cushionT: 0.13, backT: 0.2, backH: 0.8, armW: 0.12, armH: 0.62, kick: 0.05 },
  chair: { seatH: 0.45, seatT: 0.05, backT: 0.04, backH: 0.85, legW: 0.04, legIn: 0.02 },
} as const;

/** 家具的一块：局部坐标（u 沿宽、v 沿进深从靠背边量起、z 离地高，米）→ 世界盒 */
function furnBlock(r: FurnRect, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, unit: number): Box {
  const [fx, fy] = r.face;
  const facesY = Math.abs(fy) > Math.abs(fx);
  const w = facesY ? r.x1 - r.x0 : r.y1 - r.y0;
  const d = facesY ? r.y1 - r.y0 : r.x1 - r.x0;
  // 宽向的单位向量（与朝向垂直）；进深向：从靠背边（-face 那侧）往前
  const tx = -fy;
  const ty = fx;
  const uc = (u0 + u1) / 2 - w / 2;
  const vc = (v0 + v1) / 2 - d / 2;
  const cx = r.cx + tx * uc + fx * vc;
  const cy = r.cy + ty * uc + fy * vc;
  const hu = (u1 - u0) / 2;
  const hv = (v1 - v0) / 2;
  return { cx: cx * unit, cy: ROOM.FLOOR_Y - ((z0 + z1) / 2) * unit, cz: cy * unit, hx: (facesY ? hu : hv) * unit, hy: ((z1 - z0) / 2) * unit, hz: (facesY ? hv : hu) * unit };
}

function ergoBoxes(r: FurnRect, unit: number): Box[] {
  const [fx, fy] = r.face;
  const facesY = Math.abs(fy) > Math.abs(fx);
  const w = facesY ? r.x1 - r.x0 : r.y1 - r.y0;
  const d = facesY ? r.y1 - r.y0 : r.x1 - r.x0;
  if (r.kind === 'sofa') {
    const S = FURN_ERGO.sofa;
    const base = S.seatH - S.cushionT;
    return [
      furnBlock(r, 0, w, 0, S.backT, 0, S.backH, unit), // 靠背（整宽）
      furnBlock(r, 0, S.armW, S.backT, d, 0, S.armH, unit), // 扶手
      furnBlock(r, w - S.armW, w, S.backT, d, 0, S.armH, unit),
      furnBlock(r, S.armW, w - S.armW, S.backT, d - S.kick, 0, base, unit), // 底座（前脸退进 kick，留脚跟位，坐垫伸到前缘）
      furnBlock(r, S.armW, w - S.armW, S.backT, d, base, S.seatH, unit), // 坐垫
    ];
  }
  const C = FURN_ERGO.chair;
  const under = C.seatH - C.seatT;
  const legs: Box[] = [];
  for (const u of [C.legIn, w - C.legIn - C.legW])
    for (const v of [C.legIn, d - C.legIn - C.legW]) legs.push(furnBlock(r, u, u + C.legW, v, v + C.legW, 0, under, unit));
  return [
    ...legs,
    furnBlock(r, 0, w, 0, d, under, C.seatH, unit), // 座板
    furnBlock(r, 0, w, 0, C.backT, C.seatH, C.backH, unit), // 靠背
  ];
}

export function furnitureBoxes(rects: readonly FurnRect[], unit: number = UNITS_PER_M): Box[] {
  const out: Box[] = [];
  for (const r of rects) {
    if (r.ergo) {
      out.push(...ergoBoxes(r, unit));
      continue;
    }
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
export function seatSpecOf(r: Pick<FurnRect, 'kind' | 'ergo' | 'cx' | 'cy' | 'x0' | 'x1' | 'y0' | 'y1' | 'face'>, seat: { x: number; y: number }): SeatSpec {
  const [fx, fy] = r.face;
  const depth = Math.abs(fy) > Math.abs(fx) ? r.y1 - r.y0 : r.x1 - r.x0;
  const along = (seat.x - r.cx) * fx + (seat.y - r.cy) * fy; // 座位点在家具中心前方多少
  if (r.ergo) {
    const e = r.kind === 'sofa' ? FURN_ERGO.sofa : FURN_ERGO.chair;
    return {
      top: e.seatH,
      front: depth / 2 - along,
      back: along - (-depth / 2 + e.backT),
      thick: r.kind === 'sofa' ? FURN_ERGO.sofa.cushionT : FURN_ERGO.chair.seatT,
      backTop: e.backH,
    };
  }
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
