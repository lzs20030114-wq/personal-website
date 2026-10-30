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
 * 此前这台默认用了 Lab 2-8 那只圆筒环。现在每台 = Lab 2-7 方形环平档的做法（`buildSquareUnits`：面 / 边 / 角
 * 三档挑出，二十条带按方位分档 `buildSquareOrder`），俯视是方的；芯仍是圆的，没成形时（收起、直筒）还是一圈带子。
 * 2026-10-29 起台面 6.5 cm 厚（`UNIT_SHAPE`，此前是方形环原样的 0.15 m）；布按最长的预裁 338 节，平台铺出去 176 节，
 * 余下的收在单元顶端（`UNIT_CUT` / `UNIT_STORED`、`withStore`）。
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
 * 第二阶段「成什么」现在有两种（2026-10-30 按用途定形，形态方案 §11）：平台（方形环平档那只方箱，桌子与引猫的台都是它），
 * 与坐着的人身边那台的上下两层（DUAL / SHELTER / shelterToward：上台只盖背向那个人的半圈，下台给猫）。
 */
import type { RingUnitDef } from './skin-ring';
import { SQUARE, SQUARE_TIERS, buildSquareOrder, buildSquareUnits, squareBuffer, squareFree, squareFreeTotal, squareHalfSide, squareLadder, squarePw, SQUARE_REACH } from './skin-square';
import { SKIN, createSkinUnit, renderSmooth, type SkinSeg, type SkinSpec } from './skin-unit';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts, membranePanel, rotateVertsY, type SolidTopology } from './skin-solid';
import { bakeIndexed } from '../linkage/gl3d';
import { MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, RING_GRID_FIT, RING_GRID_PIVOT_Y, ROOM, roomBoxesBySpan, viewFitBySpan, type RingGridView } from './skin-grid';
import type { PlanLayout } from './unit-activation';
import { COHABIT, SQUARE_SCALE, bandAngle, platformClear, type FurnRect } from './cohabit';
import type { CatPose, CatTail, SeatSpec } from './figure';

/** 一米 = 多少世界单位（由「人 = 1.70 m = 215 单位」定） */
export const UNITS_PER_M = 1000 / MM_PER_UNIT;

/**
 * 关键帧数（2026-10-27 加密：32 / 24 / 16 时相邻两帧差 4–9 cm，台架上读得出一格一格跳）：正向 48、回程 36、升降 32（直带子按长度
 * 比例压向顶端，纯几何）、过渡 8（直垂 → 正向第一帧的插值，纯几何：引擎初始摆位比自然松弛还直，两者差 7–11 cm，不补就是一下跳）。
 */
export const FRAMES = { form: 48, retract: 36, hoist: 32, bridge: 8 } as const;
export type FrameCounts = { form: number; retract: number; hoist: number; bridge?: number };

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

/**
 * 收着的布（2026-10-29 作者「多出来的布可以继续往上延伸……用不到很长的话，就把那些布存起来」）：布按最长的预裁，
 * 铺出去的只有这一形要用的那段，余下的接在顶端、往上收成一团，画成一圈褶（`pleats` 道，每道外鼓 `amp`，引擎单位；
 * 高度 = 那段布拉直的长度 × HOIST.stowed，与收起时整束布同一个比例）。它不铺出去、不参与成形，引擎只解铺出去的那段。
 * 褶数与外鼓是演示值。
 */
export const STORE = { pleats: 6, amp: 0.04 } as const;

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
  /** 收在顶端的那团布的高度（与 footY 同一坐标；没有收着的布 = 0 或省略）：升降时它不跟着伸缩，见 unitFootY */
  storeY?: number;
}

/**
 * 轨迹烘焙：分片跑（`work` 按时间预算推进），好让台架在挂载后的头几帧里把它算完而不卡住主线程。
 * 一条带全程 3000 步（正向 1500 + 回程 1500）。
 */
export class TrajectoryBaker {
  /** 画出来的节点数 = 引擎解的节点数 + 收着的那团布的节点（2 × STORE.pleats，没有收着的布时为 0） */
  readonly n: number;
  /** 引擎解的节点数（铺出去的那段布） */
  private readonly m: number;
  /** 收着的那团布的高度（引擎单位，0 = 没有） */
  private readonly storeH: number;
  private readonly unit;
  private readonly smoothW: number;
  private readonly smoothP: number;
  private readonly formAt: number[];
  private readonly retractAt: number[];
  private readonly hoistN: number;
  private readonly bridgeN: number;
  private readonly frames: Float64Array[] = [];
  private step = 0;
  private phase: 'form' | 'retract' | 'done' = 'form';
  private result: BandTrajectory | null = null;

  /** 台面高度按哪一段量（引擎节点下标 [i0, i1)；省略 = 整条带上离芯超过一半挑出的节点）：两层台按下面那块量 */
  private readonly ref: readonly [number, number] | undefined;

  /** store = 收在顶端、不铺出去的节数（0 = 整条布都铺出去，与 2026-10-29 之前逐位相同）；ref 见同名字段 */
  constructor(def: RingUnitDef, frames: FrameCounts = FRAMES, store = 0, ref?: readonly [number, number]) {
    this.unit = createSkinUnit(def.spec, def.opts);
    this.m = this.unit.n;
    this.n = this.m + (store > 0 ? 2 * STORE.pleats : 0);
    this.ref = ref;
    // 直带子的节距（初始摆位贴着芯）× 节数 × 收起时的压缩比 = 那团布的高度；与收起态整束布同一个比例
    const py = this.unit.py;
    this.storeH = store > 0 ? HOIST.stowed * store * ((py[0] - py[this.m - 1]) / (this.m - 1)) : 0;
    [this.smoothW, this.smoothP] = def.smooth;
    const spread = (k: number, total: number): number[] => Array.from({ length: k }, (_, i) => Math.round((i / (k - 1)) * total));
    this.formAt = spread(frames.form, SKIN.STEPS);
    this.retractAt = spread(frames.retract, SKIN.STEPS);
    this.hoistN = frames.hoist;
    this.bridgeN = frames.bridge ?? 0;
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
    const raw = this.frames[0];
    // frames[1] = 收起态（初始摆位压向顶端）：烘完之前满场都是收着的单元，台架拿它烘整环
    const frames = [raw, hoistProfile(raw, this.m, HOIST.stowed)].map((f) => this.stored(f));
    const footY = -frames[0][2 * n - 1] * SOLID.SCALE;
    return { n, frames, footY, platformTopY: footY, reach: SQUARE.RADIUS, retractActive: 0, formActive: 0, storeY: this.storeH * SOLID.SCALE };
  }

  private stored(f: Float64Array): Float64Array {
    return this.storeH > 0 ? withStore(f, this.m, this.storeH) : f;
  }

  /** 一口气烘完（守门与线稿用） */
  runAll(): BandTrajectory {
    while (!this.work(Infinity, () => 0)) { /* 直到烘完 */ }
    return this.result as BandTrajectory;
  }

  private finish(): void {
    this.phase = 'done';
    const F = this.formAt.length;
    const m = this.m;
    // 升降帧：由回程末帧（闲着的直带子）压向顶端，第 0 帧 = 收起态、末帧 = 直带子逐位相同
    const straight = this.frames[F + this.retractAt.length - 1];
    for (let j = 0; j < this.hoistN; j++) this.frames.push(hoistProfile(straight, m, HOIST.stowed + (1 - HOIST.stowed) * (j / (this.hoistN - 1))));
    // 过渡帧：直垂 → 正向第 1 帧逐点线性插值（第 0 帧是引擎的初始摆位，比自然松弛还直，跳过）
    const entry = this.frames[1];
    for (let j = 0; j < this.bridgeN; j++) {
      const t = (j + 1) / (this.bridgeN + 1);
      const f = new Float64Array(2 * m);
      for (let i = 0; i < 2 * m; i++) f[i] = straight[i] + (entry[i] - straight[i]) * t;
      this.frames.push(f);
    }
    // 收着的布最后才接上：它跟着铺出去那段的顶端走，升降时不跟着伸缩
    for (let k = 0; k < this.frames.length; k++) this.frames[k] = this.stored(this.frames[k]);
    const n = this.n;
    const formed = this.frames[F - 1];
    let reach = 0;
    for (let i = 0; i < n; i++) reach = Math.max(reach, formed[i]);
    // 平台顶面：折叠体里离芯超过一半挑出的节点中最高的那个（世界 Y 向下为正 ⇒ 取最小）；给了 ref 就只在那一段里找
    const g = n - m; // 收着的那团布排在前面，引擎节点 i 在画出来的帧里是 g + i
    const [r0, r1] = this.ref ? [g + this.ref[0], g + this.ref[1]] : [0, n];
    let refReach = 0;
    for (let i = r0; i < r1; i++) refReach = Math.max(refReach, formed[i]);
    let top = Infinity;
    for (let i = r0; i < r1; i++) if (formed[i] > refReach * 0.5) top = Math.min(top, -formed[n + i] * SOLID.SCALE);
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
    this.result = {
      n,
      frames: this.frames,
      footY: -this.frames[0][2 * n - 1] * SOLID.SCALE,
      platformTopY: top,
      reach: SQUARE.RADIUS + reach * SOLID.SCALE,
      retractActive: active,
      formActive,
      storeY: this.storeH * SOLID.SCALE,
    };
  }
}

/**
 * 平台的台厚与布（2026-10-29 作者「单元作为桌面的话，那它其实也没必要那么厚」，形态方案第二轮第一步）：
 * - 箱高 h = 16 px（8×8 铺满时台厚 6.5 cm，此前 36 px = 0.15 m）。同样的键，台越薄挑得越远，所以三档键按方形重新标定成
 *   面 29 / 边 34 / 角 46：外缘点离理想正方形 面 0.2 · 边 0.9 · 角 0.0 px（原来的方台边档也差 0.9）。键全锁、成形途中
 *   最大自交环 4 节、全程不鼓出终态，峰值都小于 SQUARE_PEAK，平面模型按原峰值算碰人照旧够用，不改；
 * - 布按最长的预裁 338 节（作者 10-06），平台只铺出去这三档用得到的那段：lead 8、尾段 5（方形族的两个下限）、
 *   自由段 131（角档那一段）= 176 节，余下 162 节收在顶端（作者 10-29「用不到很长的话，就把那些布存起来」，STORE）。
 *   台面离钉住端 0.36 m，茶几落到 0.42 m 时钉住端仍离地 6 cm；台面以上贴芯的那截布 0.32 m（原来 0.40 m），再往上是收着的那团。
 *   不让 338 节整条铺出去：那样要落到茶几高度，多出来的布全贴着芯堆在台面上方，成一根 0.72 m 的布筒。
 *   引擎只解铺出去的那段：收着的布不贴芯、不跟着芯收缩，不参与成形（同一组键在长 26 节的带上解，形状逐点相同，守门核对）。
 * 原来的 202 节、箱高 36（Lab 2-7 方形环立项时那条带）只留在出图脚本里作对照。
 */
export const UNIT_SHAPE = { h: 16, tail: 5, lead: 8, k: [29, 34, 46] } as const;
const UNIT_SQUARE_TIERS = SQUARE_TIERS.map((t, i) => ({ ...t, k: UNIT_SHAPE.k[i] }));
/** 一条布预裁多长：词汇表里最长的那张（捏分，338 节；作者 10-06「布按最长的预裁」，与 skin-cycle 的 CYCLE_BAND 同一个数，守门核对） */
export const UNIT_CUT = 338;
/** 平台铺出去的节数（引擎解的就是这一段）：lead + 两段隔离 + 自由段（三档里最长的那个）+ 尾段 */
export const UNIT_BAND = UNIT_SHAPE.lead + 2 * SQUARE.ISO + squareFreeTotal(UNIT_SQUARE_TIERS, UNIT_SHAPE.h) + UNIT_SHAPE.tail;
/** 方形单元的三档引擎定义（面 / 边 / 角，Lab 2-7 方形环平档的做法，台厚与键按 UNIT_SHAPE）与二十条带的档位编制（下标 = 带序 j） */
export const UNIT_TIERS: readonly RingUnitDef[] = buildSquareUnits(UNIT_SQUARE_TIERS, UNIT_BAND, { h: UNIT_SHAPE.h, tail: UNIT_SHAPE.tail });
/** 平台用不到、收在顶端的节数（STORE、withStore） */
export const UNIT_STORED = UNIT_CUT - UNIT_BAND;
export const UNIT_ORDER: readonly number[] = buildSquareOrder();

/**
 * 一条带两个结构（2026-10-30 按用途定形，形态方案 §11.2.1）：2-3 双结构带的做法放进 2-15 的布和方台。338 节全部铺出去：
 * `[贴合 lead | 垫 p | ISO | 上台 | 贴合 mid−ISO | 垫 2p | ISO | 下台 | ISO | 垫 p | 尾]`，两块 6.5 cm 方台各在自己的 131 节里居中
 * （面、边档用垫补到角档那么长，三档同高），键与平台同一组（UNIT_SHAPE.k）。上下两块之间贴合 mid = 31 节，超过 2-3 量出的
 * 逐位解耦下限 29（皮肤单元lab §15.5）：一块不扣键时另一块的形状与两块都成时逐点相同，所以一台里逐带可选「两块都成」或「只成
 * 下台」（下台那段键全留、上台那段不扣键，贴着芯）。下台离钉住端的高度与平台（UNIT_TIERS）相同；两块之间空 0.51 m。
 */
export const DUAL = { mid: 31 } as const;

/**
 * 一档两个结构的谱：upper / lower = 上 / 下那块扣不扣键；a0 / b0 = 上 / 下结构段的起点（引擎节点下标），fs = 结构段节数。
 * mid = 两块之间贴合多少节（省略 = DUAL.mid；少给的节数挪到顶端，线稿脚本拿它量两块之间能缩到多少）
 */
export function dualUnitSpec(k: number, upper: boolean, lower: boolean, mid: number = DUAL.mid): { spec: SkinSpec; a0: number; b0: number; fs: number } {
  const H = UNIT_SHAPE.h;
  const ISO = SQUARE.ISO;
  const slot = UNIT_BAND - UNIT_SHAPE.lead - UNIT_SHAPE.tail - 2 * ISO;
  const b = squareBuffer(k, H);
  const fs = squareFree(k, b);
  const c = (fs - 1) / 2;
  const pw = squarePw(H);
  // 两块各建一份（下面按对象认段落起点，同一个对象出现两次会认错）
  const seg = (on: boolean): SkinSeg => (on ? ['f', fs, squareLadder(k, pw).map((q) => [c - q, c + q, H / 100] as const), [[c - pw, c + pw]]] : ['f', fs, []]);
  const p = (slot - fs) / 2;
  const lead = UNIT_CUT - 2 * slot - mid - 2 * ISO - UNIT_SHAPE.tail;
  const A = seg(upper);
  const B = seg(lower);
  const raw: SkinSeg[] = [['g', lead], ['f', p, []], ['g', ISO], A, ['g', mid - ISO], ['f', 2 * p, []], ['g', ISO], B, ['g', ISO], ['f', p, []], ['g', UNIT_SHAPE.tail]];
  const spec: SkinSeg[] = [];
  let at = 0;
  let a0 = 0;
  let b0 = 0;
  for (const s of raw) {
    if (s[1] === 0) continue;
    if (s === A) a0 = at;
    if (s === B) b0 = at;
    spec.push(s);
    at += s[1];
  }
  if (at !== UNIT_CUT) throw new Error(`两个结构的带长 ${at} ≠ ${UNIT_CUT}`);
  return { spec, a0, b0, fs };
}

/** 两个结构的三档引擎定义（同一张方箱整形选项）与「台面高度按下面那块量」的节点段 */
function dualTiers(upper: boolean, tag: string): { defs: RingUnitDef[]; refs: [number, number][] } {
  const defs: RingUnitDef[] = [];
  const refs: [number, number][] = [];
  UNIT_TIERS.forEach((t, i) => {
    const d = dualUnitSpec(UNIT_SHAPE.k[i], upper, true);
    defs.push({ ...t, key: `${t.key}-${tag}`, spec: d.spec });
    refs.push([d.b0, d.b0 + d.fs]);
  });
  return { defs, refs };
}
/** 两块都成（下台 + 上台）与只成下台：三档各一条，按这个顺序排（UNIT_DUAL_DEFS[0..2] = 两块，[3..5] = 只成下台） */
const DUAL_BOTH = dualTiers(true, 'dual');
const DUAL_LOWER = dualTiers(false, 'lower');
export const UNIT_DUAL_DEFS: readonly RingUnitDef[] = [...DUAL_BOTH.defs, ...DUAL_LOWER.defs];
export const UNIT_DUAL_REFS: readonly (readonly [number, number])[] = [...DUAL_BOTH.refs, ...DUAL_LOWER.refs];

/**
 * 有顶的一台（形态方案 §11.3；作者 10-30 让模型按建议定：两个结构、上台盖背向座位的那半圈）。落在哪见 shelterToward。
 * - lowerTop：下台台面离地 0.90 m = 站上比例模型坐在 0.43 m 的沙发上眼睛的高度（约 1.17 m）减去猫坐着时眼睛离台面的高度
 *   （约 0.27 m，figure.ts 的方块猫）：猫坐在下台上，眼睛与坐着的人齐平。上台顶 1.47 m，比站着的人的眼睛（约 1.57 m）低，
 *   路过的人从上面看下来，猫被上台挡住；
 * - under：下台底面离地（台面 6.5 cm 厚）；比它高的家具上方不落成有顶的（shelterToward）；
 * - catIn：猫坐在有顶那半边、离分界多深（弧度）：坐在敞开那半边的旁边，头转过去看座位，不隔着立杆。
 */
export const SHELTER = { lowerTop: 0.9, under: 0.9 - 0.065, catIn: (25 * Math.PI) / 180 } as const;

/** 有顶的一台二十条带各成什么：朝 toward（平面方位角，台心 → 座位）那半圈只成下台（0），背后那半圈两块都成（1） */
export function shelterBands(toward: number, count: number = SQUARE.COUNT): Uint8Array {
  return Uint8Array.from({ length: count }, (_, j) => (Math.cos(bandAngle(j) - toward) < 0 ? 1 : 0));
}

/**
 * 这一台落下时要不要落成有顶的一台（2026-10-30）：返回台心朝座位的平面方位角，不要就返回 null。
 * 「走 · 站 · 坐」规则下，不当桌子的单元只为猫落（引路的那几步、站定的人给的一步、猫脚下那台），所以落在一个**正坐着的人**
 * 的共温带里（台心离座位 ≤ COHABIT.BAND.far = 1.5 m）的那台，就是猫陪着那个人待的地方：上台盖背向他的那半圈。
 * 朝离得最近的那个坐着的人；压在比下台底面还高的家具上方的不要（下台底 0.83 m 会碰到椅背 0.85 m；沙发靠背 0.80 m 让得开）。
 * 只读平面模型已有的东西，规则一条不加。
 * 首版只认「引路的终点」，按 2-15 的配置跑 600 s 一次都没碰上（引猫的路线很少走到终点），改成现在这样，四个种子各 11–24 次。
 */
export function shelterToward(
  l: Pick<PlanLayout, 'platR'>,
  u: { x: number; y: number },
  seated: readonly { x: number; y: number }[],
  rects: readonly Pick<FurnRect, 'x0' | 'x1' | 'y0' | 'y1' | 'kind' | 'ergo'>[],
  far: number = COHABIT.BAND.far,
): number | null {
  let best: { x: number; y: number } | null = null;
  let bd = far + 1e-9;
  for (const s of seated) {
    const d = Math.hypot(s.x - u.x, s.y - u.y);
    if (d <= bd) {
      bd = d;
      best = s;
    }
  }
  if (!best) return null;
  if (!shelterClear(l, u, rects)) return null;
  return Math.atan2(best.y - u.y, best.x - u.x);
}

/** 这一台下面放得下上下两层吗：下台底 SHELTER.under 不碰下面的家具（椅背 0.85 m 碰，沙发靠背 0.80 m 让得开） */
export function shelterClear(
  l: Pick<PlanLayout, 'platR'>,
  u: { x: number; y: number },
  rects: readonly Pick<FurnRect, 'x0' | 'x1' | 'y0' | 'y1' | 'kind' | 'ergo'>[],
): boolean {
  return platformClear(
    l,
    u,
    rects.filter((r) => furnitureTop(r) > SHELTER.under - 0.02),
  );
}

/**
 * 给猫落的那台成哪种形（2026-10-30 第二轮，作者「随机出现各种形态也 ok，不需要精确的设计好每一种的出现」→「你自己 review，觉得 ok 就做」）。
 * 规则管这台给谁用，随机管成哪种：
 *   - 当桌子的那台（任何一个座位的 Seat.table）不随机，照旧按家具定高的平台（茶几 0.42 / 餐桌 0.74 是按人体尺寸定的，抽了就用不了；
 *     排除整个座位的桌子那台，不只此刻的：有人后来坐下，那台要当桌子，而一台落下后形不换）；
 *   - 下面的家具比下台底面高的不成两层（shelterClear）；
 *   - 其余给猫落的台在 平台 / 有顶的一台（上台盖半圈）/ 整圈两层 里抽一种。落在正坐着的人共温带里的（shelterToward 给得出方位），
 *     抽中有顶的几率高、敞开那半圈朝那个人；别处有顶的那半圈朝方台四条边之一随机（沿一条中线分，正好十条带对十条带）。
 * 几率是演示值（资料里没有对应的数），写在 UNIT_FORM_ODDS。用仿真的种子 + 第几台 + 这台第几次落下抽（不动仿真自己的随机数流，
 * 平面模型逐位不变；同一个种子画面一样，案例页截图对得上）。两层的下台都在 SHELTER.lowerTop（上台顶 1.47 m 比站着的人的眼睛低）。
 */
export type UnitForm = 'flat' | 'half' | 'full';
export const UNIT_FORM_ODDS = {
  /** 落在正坐着的人的共温带里 */
  near: { half: 0.6, full: 0.15 },
  /** 其余给猫落的台 */
  other: { half: 0.2, full: 0.1 },
} as const;

export interface UnitFormPlan {
  form: UnitForm;
  /** 有顶的一台：敞开那半圈朝的平面方位角（猫坐进有顶那半边、头转向它）；其余 null */
  toward: number | null;
  /** 二十条带各成什么：1 = 两块都成、0 = 只成下台；平台为 null */
  bands: Uint8Array | null;
}

/** 整数混合（Math.imul + 无符号移位，各版本 Node 逐位相同） → [0, 1) */
function formDraw(seed: number, unit: number, serial: number, salt: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(unit + 1, 0x85ebca77) ^ Math.imul(serial + 1, 0xc2b2ae3d) ^ Math.imul(salt + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function unitFormPlan(o: {
  seed: number;
  /** 第几台 */
  unit: number;
  /** 这台第几次落下（从 0 数） */
  serial: number;
  layout: Pick<PlanLayout, 'platR'>;
  at: { x: number; y: number };
  /** 正坐着的人的座位点 */
  seated: readonly { x: number; y: number }[];
  rects: readonly Pick<FurnRect, 'x0' | 'x1' | 'y0' | 'y1' | 'kind' | 'ergo'>[];
  /** 这台是某个座位的桌子那台 */
  tableUnit: boolean;
  count?: number;
}): UnitFormPlan {
  const flat: UnitFormPlan = { form: 'flat', toward: null, bands: null };
  if (o.tableUnit || !shelterClear(o.layout, o.at, o.rects)) return flat;
  const toward = shelterToward(o.layout, o.at, o.seated, o.rects);
  const odds = toward !== null ? UNIT_FORM_ODDS.near : UNIT_FORM_ODDS.other;
  const r = formDraw(o.seed, o.unit, o.serial, 0);
  const n = o.count ?? SQUARE.COUNT;
  if (r < odds.half) {
    const dir = toward ?? (Math.floor(formDraw(o.seed, o.unit, o.serial, 1) * 4) * Math.PI) / 2;
    return { form: 'half', toward: dir, bands: shelterBands(dir, n) };
  }
  if (r < odds.half + odds.full) return { form: 'full', toward: null, bands: new Uint8Array(n).fill(1) };
  return flat;
}

/** 已经烘好的三档轨迹（同一页面里换路由、重挂台架时直接拿，不重烘） */
const BAKED = new Map<string, BandTrajectory[]>();

/** 交给后台线程烘的一份活（cohabit-bake.worker.ts）与它的回话 */
export interface BakeJob {
  defs: RingUnitDef[];
  frames: FrameCounts;
  store: number;
  refs: (readonly [number, number] | undefined)[];
}
export type BakeReply = { kind: 'track'; i: number; traj: BandTrajectory } | { kind: 'done' } | { kind: 'error'; message: string };

/** 一组轨迹的缓存键（键名 + 帧数 + 收着的节数；refs 由键名决定，不另记） */
export function bakedKey(defs: readonly RingUnitDef[], frames: FrameCounts = FRAMES, store = 0): string {
  return `${defs.map((d) => d.key).join('|')}#${frames.form}/${frames.retract}/${frames.hoist}/${frames.bridge ?? 0}#s${store}`;
}
/** 取缓存（别处烘好的，比如后台线程烘的那组） */
export function bakedGet(key: string): BandTrajectory[] | null {
  return BAKED.get(key) ?? null;
}
export function bakedPut(key: string, trajs: BandTrajectory[]): void {
  BAKED.set(key, trajs);
}

/**
 * 三档轨迹一起烘：三条引擎依次推进（分片，`work` 按时间预算），全部烘完才算完。三档的节点数相同（同一条
 * 338 节的布，铺出去 176 节），钉住端高度相同（注册在底端）、平台面高度相同（方形环的对位构造），台架拿第 0 档定摆放。
 */
export class UnitBaker {
  readonly n: number;
  private readonly key: string;
  private readonly bakers: TrajectoryBaker[];
  private result: BandTrajectory[] | null;

  /** store = 每条带收在顶端的节数（默认 = 平台用不到的那段，UNIT_STORED）；refs = 每条按哪一段量台面（TrajectoryBaker 的 ref） */
  constructor(defs: readonly RingUnitDef[] = UNIT_TIERS, frames: FrameCounts = FRAMES, store: number = UNIT_STORED, refs?: readonly (readonly [number, number] | undefined)[]) {
    this.key = bakedKey(defs, frames, store);
    this.bakers = defs.map((d, i) => new TrajectoryBaker(d, frames, store, refs?.[i]));
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
 * 在一帧上接上收着的那团布：铺出去的那段（m 个节点）整体往下让出 height，空出来的地方从它的顶端往上画一圈褶
 * （2 × pleats 个节点，奇数格外鼓 amp）。收着的布顶 = 原来带子顶端的位置，所以收起态的整束布仍从同一处挂下来。
 */
export function withStore(src: Float64Array, m: number, height: number, pleats: number = STORE.pleats, amp: number = STORE.amp): Float64Array {
  const g = 2 * pleats;
  const n = m + g;
  const out = new Float64Array(2 * n);
  for (let i = 0; i < m; i++) {
    out[g + i] = src[i];
    out[n + g + i] = src[m + i] - height;
  }
  const x0 = src[0];
  const y0 = src[m] - height;
  for (let k = 0; k < g; k++) {
    const q = g - k; // 离铺出去那段顶端隔几格（顶上那个节点 q = g）
    out[k] = x0 + (q % 2 ? amp : 0);
    out[n + k] = y0 + (height * q) / g;
  }
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

/** 两条带的帧能不能用一块膜连：都在升降段、或都在成形段（开门的带收成一小截时，与旁边成形的带之间不拉膜——那里正是门） */
export function membraneJoins(ka: number, kb: number, frames: FrameCounts = FRAMES): boolean {
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
 * - chair 0.74：配餐椅（座面 0.45）——桌面比座面高 0.27–0.30 是通行的桌椅高差。台面 6.5 cm 厚、台底 0.67，比座面高 0.22，
 *   腿伸得进去；餐椅那台的台边仍按 COHABIT.TABLE 落在膝盖前面（那条是台面 0.15 厚、腿进不去时定的，改不改成盖住大腿由作者定，
 *   见形态方案 §9）；
 * - sofaFront 0.42：沙发正前方当茶几——资料要与座面齐或略低（0.40–0.45），座面 0.43。台面 0.15 厚、布 202 节时
 *   台面下吊着 0.48 m 的布，只能落到 0.49；换成 6.5 cm 的台面与 176 节的布（UNIT_SHAPE）以后落得下来，钉住端还离地 6 cm。
 * 哪一台当谁的桌子、什么时候落由平面模型定（COHABIT.TABLE、CohabitSim.tableBy），这里只管高度。
 * 原来铺满时钉在 1.43 m（场地布局那个高度，接近站姿肩高），哪种桌子都不是。
 */
export const TABLE_TOP = { stand: 1.05, chair: 0.74, sofaFront: 0.42 } as const;

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
 * 单元此刻的钉住端世界高度 = 布束底 = 立杆下端：铺出去那段的吊长按升降程度从 HOIST.stowed 倍放到全长（收在顶端的那团
 * `storeY` 不跟着伸缩），到工位时 = RIG_ANCHOR_Y。与 hoistProfile 的脚只差顶端节点那零点几个单位（压缩是绕顶端节点做的）。
 */
export function unitFootY(rig: Pick<Rig, 'y' | 'stowY' | 's'>, footY: number, drop: number, workY: number = rig.y, storeY: number = 0): number {
  return unitTopY(rig, drop, workY) + rig.s * (storeY + (footY - storeY) * (HOIST.stowed + (1 - HOIST.stowed) * drop));
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

/** 家具最高处离地（米）：人体工学那套按 FURN_ERGO 的靠背高，旧那套按 FURN.backH */
export function furnitureTop(r: Pick<FurnRect, 'kind' | 'ergo'>): number {
  if (!r.ergo) return FURN.backH;
  return r.kind === 'sofa' ? FURN_ERGO.sofa.backH : FURN_ERGO.chair.backH;
}

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
  /** 跨台时走到两台之间的几成（0 = 起跳那台、1 = 落下那台）；不在跨台时省略 */
  t?: number;
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
 *   - 台上、这台是有顶的一台（`roofToward` = 台心朝座位的方位角，2026-10-30）：坐在有顶那半边、离分界 SHELTER.catIn 的地方，
 *     头转过去看座位（不隔着立杆）；
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
  roofToward?: number,
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
    return { x: A.x + p * dx + px * R, y: A.y + p * dy + py * R, heading: h, headTurn: 0, pose: 'walk', tail: 'up', bend: 0, onPlatform: true, lift: 0.06 * Math.sin(Math.PI * p), t: p };
  }
  if (formed && support.length === 1) {
    const u = support[0];
    const dx = c.x - u.x, dy = c.y - u.y;
    const atCore = Math.hypot(dx, dy) < layout.mastR + 0.02;
    const look = roofToward ?? c.heading;
    const anchor = atCore ? look : Math.atan2(dy, dx);
    // 有顶的一台：绕过敞开那半圈的分界再往里 catIn（离座位方向 90° + catIn）
    const th = roofToward !== undefined ? roofToward - Math.PI / 2 - SHELTER.catIn : anchor - RING_SIDE;
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
