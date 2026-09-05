/**
 * 项目二 · 一个人走过（Lab.14，2026-09-04 用户立项：「这一次的 lab 可以先做平面，就是研究
 * 一个人在空间中运动时，这些单元哪些被激活」；同轮纠偏「每一个单元其实都要再小一些，触发一群
 * 单元围绕着人形成空间，为了空间的多样性数量要大于 4×4，甚至 8×8」「空间的变化要围绕人的行为
 * （不是字面意思的围绕）」）——纯数据 + 纯模型，零 DOM。
 *
 * ## 这台与前面十三台的差别
 *
 * Lab.06–13 全部只有空间层：一个单元长什么样、排成一排一圈一间房、几个单元之间什么关系，
 * 输入全是编排。这台**第一次把行为层接进来**——一个人在房间平面里走动，地面留下痕迹，
 * 每个单元读自己那片地面的痕迹，读够了就「激活」（= 从天花板收缩下来、在交叠带里扣出平台）。
 * 问的只有一个问题：**人这样走一遍，哪一群单元被激活、这群单元连成什么形。**
 *
 * 平面、不做立面：单元在这里是俯视的圆——芯（立杆）一个点、平台一个圈。激活程度用平台圈
 * 从芯长到满半径来画；立面上「收缩多少 ⇒ 挑出多远」另有台架（Lab.10–13），这里不复述。
 *
 * ## 单元要小、要多（用户纠偏）
 *
 * 场地钉死 = Lab.12 那块 4.74 m 见方的阵列占宽，房间也钉死 = Lab.12 那间；在同一块场地上摆
 * N×N（4 / 6 / 8），格距 = 场地宽 ÷ (N − 1 + 0.84)，平台外缘与芯按 Lab.12 的比例随格距缩
 * （平台 ⌀ = 0.84 格距、芯 ⌀ = 0.19 格距）。N = 4 时与 Lab.12 逐位相同（守门卡这条）；
 * N = 8 时格距 0.60 m、平台 ⌀ 0.51 m——比一个人的肩宽略宽，一个人站着就压在三四个单元上。
 * **平面上的「小单元」只是等比缩**：真做小的结构单元（带数 / RIG_SCALE / 键谱）是另一轮的事。
 *
 * ## 三条机制来自作者 2026-07-20 的原型，不是站方发明
 *
 * 作者的第一个脚本（项目二_工作日志原稿.md）：点每拍在落到的格子上加一份痕迹，所有痕迹每拍
 * 衰减 2%，某格痕迹超过 15 就固化、从此不可逆。这台照搬这三件事，只给它尺度：
 *   - **痕迹** = 存在·秒：人在场的每一秒，脚下**影响半径**（reach）以内的每块地面各记 1 秒——
 *     原型里是「落到的那一格 +1」，这里把「那一格」放大成一个圆：人的存在能被多远的地面感到，
 *     是行为的量（Hall 的近体距离：亲密 0.45 / 个人 1.2 m），做成旋钮；
 *   - **衰减** = 每秒 2%（原型 tick 当 1 秒读；半衰期 ≈ 34 s）；
 *   - **阈值** = 15 秒（原型的 15）：一个单元脚下的地面平均记满 15 秒的存在即成形。
 * 读数取**均值**不取和 ⇒ 阈值不随单元大小变：整个脚下都在人的影响圈里站 20 s 就成形，
 * 只有一半在圈里就只到一半——一群单元围着人一起长，边上的浅、中间的深。
 * 成形**不回退**（键锁定永久 = 滞回，交接件冻结决定 4）：这里用棘轮近似——激活程度只升不降，
 * 痕迹随后衰减、单元照旧留在那儿。**真引擎的锁定是逐键的**，连续棘轮是这一层的简化。
 *
 * ## 「读法」——一个单元读哪片地面
 *
 *   - `nearest` 按格：整片地面按最近的芯归片（规则网格的 Voronoi = 过道正中的格线），
 *              每块地都归且只归一个单元——默认；
 *   - `disk`   脚下：只读平台正下方（半径 = 平台外缘）——平台之间的缝是盲区。
 * 行为矩阵 → 键谱/ℓ 的翻译规则由作者手写（交接件明令），这里止于「激活程度」，不选形态。
 *
 * ## 人有朝向、有身体（2026-09-05 用户三问，全部做成可选项，**默认关 = 旧行为逐位不变**）
 *
 * 用户：「人是有朝向的……人的视线范围只有约 180°，激发人身后的结构意义也不大」「一味激发眼前的结构
 * 似乎也会影响行进」「人自身是有体积的……现在会触发一些激发起来会打到人的单元，我们应该留出空间」。
 * 两个量、三件机制：
 *   - **视野**（`fov`）：痕迹只落在朝向前方的扇形里（全角 π = 前方半圆）。朝向 = 最近一次走的方向
 *     （站着时沿用），作者的行为层另有「视线方向」变量，这里先让视线 = 朝向。
 *   - **让位距离 D**（`clearance`）：平台外缘离身体至少留 `clearance`（默认一肘 0.15 m）⇒
 *     **D = platR + BODY_R + clearance**（芯到人的距离；8×8 时 0.62 m、4×4 时 1.14 m——单元越大，
 *     人得离它越远才安全）。同一个 D 用在三处：
 *       ① **闸**：芯到某个在场的人 < D 的单元不许下来（跟随档退回去、锁定档不升）——平台会打到人；
 *       ② **洞**：离人 < D 的地面不落痕迹（那片地上方的平台都会打到人，不该由它来招结构）；
 *       ③ **走廊**（`lane`）：走动时前方 |侧向| < D 的一条道也不落痕迹（与洞连成一个胶囊）——
 *          人正要走进去的地方不能长东西；站着时走廊收掉，只剩洞。
 *     单靠①：人一走脚下就长出来（锁定档），站过的地方永远堵死；单靠②：按格读的一片地大半在洞外，
 *     单元照样读到七八成、平台照样下来打到人。①②一起才是「给身体留出空间」。
 * 三个都开时：站着 ⇒ 前方半圆减去 D 以内 = 一道朝前的弧（影响半径必须 > D 才有东西可招——
 * 4×4 下 D 已超过默认的 1.0 m）；走着 ⇒ 前方两侧各一瓣，正前方留道。
 * 已成形的单元是障碍物，人绕不绕开它是作者行为层的规则，这里的行走不避让（局限，如实带着）。
 *
 * ## 视线 ≠ 朝向（2026-09-05 第二轮，用户「站着时头会转，现在扇面钉在最后一步的方向上，站久了那道弧只在一个方向」）
 *
 * 朝向 = 身体（`heading`，走的方向；走廊沿它开），视线 = 头（`gaze`；视野扇形沿它转）。走着时视线跟着朝向；
 * 站着时**转头**（`lookAround`）：每隔 1.5–6 s 挑一个新的看向（身体前方 ±110° 以内——头加眼睛能转到的范围，
 * 再远身体就得跟着转；三成几率回看正前方），头以 3 rad/s 转过去。带种子的随机数，同种子逐位可复现（守门靠它）。
 * **这是演示装置不是行为规则**（作者行为层的「视线方向」变量取自实证，这里只给它一个会动的壳）；默认关 ⇒ 视线 = 朝向。
 */
import { RING } from './skin-ring';
import { MM_PER_UNIT, RIG_SCALE, RING_GRID, ringCellPitch, ringGridSpan, ringOuter, roomSpan } from './skin-grid';

// ── 尺度换算 ───────────────────────────────────────────────────────────────

/** 世界单位 → 米 */
export const M_PER_UNIT = MM_PER_UNIT / 1000;
/** 2D px（装置自身坐标系，已含 ×RIG_SCALE 摆放缩放）→ 米 */
export function px2m(px2d: number): number {
  return px2d * RIG_SCALE * M_PER_UNIT;
}
/** 世界单位 → 米 */
export function w2m(w: number): number {
  return w * M_PER_UNIT;
}

// ── 常量（默认值 = 作者原型的三个数 + 人体尺度）──────────────────────────────

export const PLAN = {
  /** 地面网格边长（m）。原型是 20×20 的抽象格，这里给它尺度：0.1 m 一格 */
  CELL: 0.1,
  /** 人的身体半径（m，肩宽约 0.45 m）——画人用；痕迹按 reach 落 */
  BODY_R: 0.22,
  /** 影响半径（m）：人的存在能被多远的地面感到。下限 = 身体；上限原是 Hall 个人距离外沿 1.2，
   *  2026-09-05 放到 2.0（Hall 社交距离近相 1.2–2.1）——让位一开，这个量的含义变成「看到多远」，
   *  1.0 只剩 D 外一道窄环、什么也招不到。**模块默认仍 1.0**（原型口径，守门与旧线稿钉在它上面）；
   *  台架用 ATTENTION.reach */
  REACH: { min: 0.22, max: 2.0, def: 1.0 },
  /** 步速量程与默认（m/s）——1.2 m/s 是作者人类层「密度约 1.2 人/m² 之后开始下降」那条规则的基准步速 */
  SPEED: { min: 0.3, max: 1.5, def: 1.2 },
  /** 痕迹每秒衰减比例（原型「每拍衰减 2%」，tick 当 1 s） */
  DECAY: 0.02,
  /** 成形阈值（秒；原型「超过 15 就固化」）——**这是原型值，也是模块默认值**；台架用下面的演示值 */
  THRESHOLD: 15,
  /**
   * 台架的演示默认（2026-09-04 用户两轮：「作为演示，单元触发得太慢了、没有视觉效果」→「改成 2 秒触发
   * 6 秒散掉」）：**触发 2 s**（站两秒单元就下来）· **散掉 6 s**（人一走，六秒退光）。
   *
   * 这两个数能各管各的，靠的是台架把痕迹改成**封顶 + 线性褪去**：每格最多记满阈值（`TraceField.cap`），
   * 人不在的格子每秒退 cap/fade（`relax`），人站着的格子当步不退。原型的**指数衰减没有封顶也没有零点**，
   * 人走后读数要先从稳态跌回阈值、程度才动，长尾拖到几十秒——「6 秒散掉」在那套里做不到。
   * **原型的三件（阈值 15 s · 每秒 2% · 不封顶）仍是模块默认**，守门与线稿跑的是原型值。
   */
  DEMO: { threshold: 2, fade: 6 },
  /**
   * 机构追读数的速度（程度 / 秒）——绞盘收放需要时间，不是瞬间到位。只在「跟随」模式下生效。
   * 取值让它**不成为瓶颈**：节奏由痕迹的涨落定（触发 2 s / 散掉 6 s），这两个数只负责把每帧的跳变磨平。
   */
  RESPONSE: { rise: 1.5, fall: 0.5 },
  /** 可选的格数（每边）；4 = Lab.12 原样，用来对照 */
  GRIDS: [4, 6, 8] as readonly number[],
  GRID_DEF: 8,
  /** 门宽（m）：左右两墙正中各一扇，人从这里进出 */
  DOOR_W: 0.9,
  /** 驻留预设停多久（s）；阈值 15 ⇒ 20 s 刚好越过 */
  DWELL_S: 20,
  /** 绕圈几圈 / 折返几趟 */
  LOOP_LAPS: 6,
  PACE_TRIPS: 8,
  /** 离场后再看多久痕迹衰减（s，仿真时间）再重播 */
  AFTER_EXIT_S: 30,
  /**
   * 视野全角（弧度）。**π = 前方半圆**（用户「视线范围只有约 180°」）；2π = 全圆 = 旧行为。
   * 模块默认 2π（守门与旧线稿逐位不变），新线稿与台架显式传 π。
   */
  FOV: { min: Math.PI / 3, max: Math.PI * 2, def: Math.PI },
  /**
   * 让位（m）：平台外缘离身体至少留多少。默认 0.15 ≈ 一肘。模块默认 **null = 关**（旧行为）。
   * 让位距离 D = platR + BODY_R + clearance（见 `keepOut`）。
   */
  CLEARANCE: { min: 0, max: 0.4, def: 0.15 },
  /**
   * 「人有朝向、有身体」的台架默认（2026-09-05 用户拍板「按你的做」）：视野 180° · 让位一肘 · 走廊随让位 ·
   * 影响半径 1.5（这一档的含义是看到多远）。模块默认仍是旧口径（全圆、不让位、1.0）。
   */
  ATTENTION: { fov: Math.PI, clearance: 0.15, lane: true, reach: 1.5, look: true },
  /**
   * 成形占比（2026-09-05 用户看真机「触发单元的边界定得有点严格，这一圈里被触发的只有两个」）：
   * 单元读的是脚下整片地面的均值，演示口径下每格最多记到阈值 ⇒ 只有整片地都在扇面里的单元才读得满，
   * 扇面边上盖住一半的永远到不了、视线一转更是时盖时不盖。占比 = 脚下有多大比例的地面被看够了就下来：
   * 程度 = 读数 / (阈值 × 占比)。1.0 = 旧口径（整片都满）；台架默认 0.5（一半）。
   */
  FILL: { min: 0.25, max: 1, def: 0.5 },
} as const;

/** 转头（站着时视线到处看）的几个数——演示装置，不是行为规则 */
export const GAZE = {
  /** 视线离身体朝向最多多少（弧度）：头 ±70° 加眼睛 ±40°，再远身体就得跟着转 */
  SPAN: (110 * Math.PI) / 180,
  /** 头转的速度（rad/s） */
  TURN: 3.0,
  /** 看住一个方向多久（s），均匀随机 */
  HOLD: { min: 1.5, max: 6 },
  /** 有这么大几率下一眼是回看正前方（±15°） */
  AHEAD_P: 0.35,
  AHEAD: (15 * Math.PI) / 180,
} as const;

/** 把角度折到 (−π, π] */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** mulberry32：一个种子一条可复现的序列（与 crowd-plan 同款；放这里是让 Walker 自己能用） */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 让位距离 D（m，芯到人）：平台外缘 + 身体 + 让位——近于这个距离的平台会打到人 */
export function keepOut(layout: PlanLayout, clearance: number): number {
  return layout.platR + PLAN.BODY_R + clearance;
}

// ── 平面布局：Lab.12 那间房与那块场地，N×N 个按比例缩小的单元 ────────────────

export interface PlanUnit {
  /** 行优先编号（与 skin-grid.ringGridCells 同：列走 x、行走 y） */
  i: number;
  row: number;
  col: number;
  x: number;
  y: number;
}
export interface PlanDoor {
  x: number;
  y: number;
  side: 'left' | 'right';
}
export interface PlanLayout {
  /** 每边格数 */
  n: number;
  radius: number;
  /** 房间内净（见方，m）——Lab.12 的，不随 N 变 */
  roomM: number;
  /** 阵列占宽（m，含两端平台外缘）——Lab.12 的，不随 N 变 */
  fieldM: number;
  /** 格距（m），随 N 变 */
  pitchM: number;
  /** 4×4 时的格距（m）：路径预设的物理尺子，不随 N 变 */
  pitch4: number;
  /** 芯（立杆）半径（m） */
  mastR: number;
  /** 平台外缘半径（m） */
  platR: number;
  units: PlanUnit[];
  doors: PlanDoor[];
}

/** 平台 ⌀ / 格距、芯 ⌀ / 格距（Lab.12 默认半径下的比例，随 N 缩时保持） */
function ratios(radius: number): { plat: number; mast: number } {
  const p = ringCellPitch(radius);
  return { plat: (2 * ringOuter(radius)) / p, mast: (2 * radius) / p };
}

export function planLayout(n: number = PLAN.GRID_DEF, radius: number = RING.RADIUS_DEF): PlanLayout {
  if (!Number.isInteger(n) || n < 2) throw new Error(`grid must be an integer ≥ 2, got ${n}`);
  const fieldM = w2m(ringGridSpan(radius, RING_GRID.COLS));
  const roomM = w2m(roomSpan(radius, RING_GRID.COLS));
  const { plat, mast } = ratios(radius);
  // fieldM = (n − 1)·pitch + plat·pitch（两端各露半个平台）
  const pitchM = fieldM / (n - 1 + plat);
  const pitch4 = fieldM / (RING_GRID.COLS - 1 + plat);
  const units: PlanUnit[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      units.push({ i: r * n + c, row: r, col: c, x: (c - (n - 1) / 2) * pitchM, y: (r - (n - 1) / 2) * pitchM });
  return {
    n,
    radius,
    roomM,
    fieldM,
    pitchM,
    pitch4,
    mastR: (mast * pitchM) / 2,
    platR: (plat * pitchM) / 2,
    units,
    doors: [
      { x: -roomM / 2, y: 0, side: 'left' },
      { x: roomM / 2, y: 0, side: 'right' },
    ],
  };
}

/** 离 (x,y) 最近的单元 */
export function nearestUnit(l: PlanLayout, x: number, y: number): PlanUnit {
  let best = l.units[0];
  let bd = Infinity;
  for (const u of l.units) {
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

// ── 痕迹场：地面网格，存在·秒 ─────────────────────────────────────────────────

export class TraceField {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** 网格左上角（x 最小、y 最小）在房间坐标里的位置 */
  readonly x0: number;
  readonly y0: number;
  readonly data: Float32Array;
  /**
   * 每格痕迹的上限（秒）。`Infinity` = 不封顶（原型：站得越久记得越多，读数升到 1/衰减率 的稳态）。
   * 台架封到阈值：**人一走，读数立刻在阈值以下，程度当即开始退**——不封顶的话要先等长尾跌回阈值。
   */
  cap: number;
  /** 本步被人覆盖过的格子（`relax` 跳过它们：人站着的地方不褪） */
  private readonly touched: Uint8Array;
  private readonly stampCache = new Map<number, Int32Array>();

  constructor(roomM: number, cell: number = PLAN.CELL, cap = Infinity) {
    this.cell = cell;
    this.cols = Math.ceil(roomM / cell);
    this.rows = this.cols;
    this.x0 = (-this.cols * cell) / 2;
    this.y0 = (-this.rows * cell) / 2;
    this.data = new Float32Array(this.cols * this.rows);
    this.touched = new Uint8Array(this.cols * this.rows);
    this.cap = cap;
  }

  /** 格中心（m） */
  cellCenter(idx: number): [number, number] {
    const c = idx % this.cols;
    const r = Math.floor(idx / this.cols);
    return [this.x0 + (c + 0.5) * this.cell, this.y0 + (r + 0.5) * this.cell];
  }

  /** 点落在哪一格；出界 = −1 */
  indexOf(x: number, y: number): number {
    const c = Math.floor((x - this.x0) / this.cell);
    const r = Math.floor((y - this.y0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /** 半径 r 的圆盘覆盖哪些格偏移（以格为单位；缓存） */
  private stamp(r: number): Int32Array {
    const key = Math.round(r * 1e4);
    const hit = this.stampCache.get(key);
    if (hit) return hit;
    const n = Math.ceil(r / this.cell);
    const out: number[] = [];
    for (let dy = -n; dy <= n; dy++)
      for (let dx = -n; dx <= n; dx++) {
        if (Math.hypot(dx * this.cell, dy * this.cell) <= r) out.push(dx, dy);
      }
    const arr = Int32Array.from(out);
    this.stampCache.set(key, arr);
    return arr;
  }

  /**
   * 人在 (x,y) 待了 dt 秒：影响半径 r 以内的每块地面各记 dt 秒（**强度语义**，不是把 dt 分摊——
   * 原型是「落到的那一格 +1」，这里的圆就是那一格放大；人站在圈里的每块地都完整感到他）。
   * 出界的格子不收。
   */
  imprint(x: number, y: number, r: number, dt: number): void {
    const c0 = Math.floor((x - this.x0) / this.cell);
    const r0 = Math.floor((y - this.y0) / this.cell);
    const st = this.stamp(r);
    for (let k = 0; k < st.length; k += 2) {
      const c = c0 + st[k];
      const rr = r0 + st[k + 1];
      if (c >= 0 && rr >= 0 && c < this.cols && rr < this.rows) {
        const i = rr * this.cols + c;
        this.data[i] = Math.min(this.cap, this.data[i] + dt);
        this.touched[i] = 1;
      }
    }
  }

  /**
   * 带朝向与身体的落痕（2026-09-05）：影响半径 r 以内、且
   *   - 在朝向 `heading` 前方全角 `fov` 的扇形里（fov ≥ 2π = 不限；人所在的那一格恒收）；
   *   - 离人 ≥ `holeR`（让位圈，0 = 不留）；
   *   - 不在前方走廊里（`laneHalfW` > 0 时：前向分量 > 0 且 |侧向| < laneHalfW 的格子不收）
   * 的格子各记 dt 秒。三个都取「不限」时与 `imprint` 逐位相同（直接走那条路）。
   */
  imprintShaped(x: number, y: number, r: number, dt: number, heading: number, fov: number, holeR: number, laneHalfW: number, gaze: number = heading): void {
    if (fov >= Math.PI * 2 - 1e-9 && holeR <= 0 && laneHalfW <= 0) {
      this.imprint(x, y, r, dt);
      return;
    }
    const c0 = Math.floor((x - this.x0) / this.cell);
    const r0 = Math.floor((y - this.y0) / this.cell);
    const st = this.stamp(r);
    // 视野扇形沿视线（gaze），走廊沿身体朝向（heading）——两者可以不同（站着转头时）
    const gx = Math.cos(gaze);
    const gy = Math.sin(gaze);
    const hx = Math.cos(heading);
    const hy = Math.sin(heading);
    const cosHalf = Math.cos(Math.min(Math.PI, fov / 2));
    const own = this.cell * 0.5;
    for (let k = 0; k < st.length; k += 2) {
      const c = c0 + st[k];
      const rr = r0 + st[k + 1];
      if (c < 0 || rr < 0 || c >= this.cols || rr >= this.rows) continue;
      const dx = this.x0 + (c + 0.5) * this.cell - x;
      const dy = this.y0 + (rr + 0.5) * this.cell - y;
      const d = Math.hypot(dx, dy);
      if (d < holeR) continue;
      if (d >= own && dx * gx + dy * gy < d * cosHalf) continue;
      if (laneHalfW > 0 && dx * hx + dy * hy > 0 && Math.abs(dx * hy - dy * hx) < laneHalfW) continue;
      const i = rr * this.cols + c;
      this.data[i] = Math.min(this.cap, this.data[i] + dt);
      this.touched[i] = 1;
    }
  }

  /**
   * 线性褪去（台架用）：没被人覆盖的格子每秒退 `cap / seconds`，`seconds` 秒退光；
   * **人站着的格子这一步不退**（当步被 imprint 过），所以站着的读数照涨到封顶。
   * 与 `decay` 的指数衰减是两条路：指数没有零点（长尾），线性有——「六秒散掉」要的就是这个。
   */
  relax(dt: number, seconds: number): void {
    const step = ((Number.isFinite(this.cap) ? this.cap : 1) * dt) / seconds;
    const d = this.data;
    for (let i = 0; i < d.length; i++) {
      if (this.touched[i]) {
        this.touched[i] = 0;
        continue;
      }
      const v = d[i] - step;
      d[i] = v > 1e-6 ? v : 0;
    }
  }

  /** 全场按每秒比例 rate 衰减 dt 秒：× (1−rate)^dt；极小值清零，免得几万个次正规数拖慢 */
  decay(dt: number, rate: number = PLAN.DECAY): void {
    const f = Math.pow(1 - rate, dt);
    const d = this.data;
    for (let i = 0; i < d.length; i++) {
      const v = d[i] * f;
      d[i] = v < 1e-6 ? 0 : v;
    }
  }

  max(): number {
    let m = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] > m) m = this.data[i];
    return m;
  }

  total(): number {
    let s = 0;
    for (let i = 0; i < this.data.length; i++) s += this.data[i];
    return s;
  }

  clear(): void {
    this.data.fill(0);
    this.touched.fill(0);
  }
}

// ── 读法：一个单元读哪片地面 ────────────────────────────────────────────────

export type Reading = 'nearest' | 'disk';
export const READINGS = [
  { key: 'nearest', zh: '按格', en: 'by cell' },
  { key: 'disk', zh: '脚下', en: 'footprint' },
] as const satisfies readonly { key: Reading; zh: string; en: string }[];

export interface Catchment {
  reading: Reading;
  /** 每个单元读的格子下标 */
  cellsOf: Int32Array[];
  /** 按格读法：每格归哪个单元（脚下读法下为 null） */
  ownerOf: Int16Array | null;
}

export function buildCatchment(layout: PlanLayout, field: TraceField, reading: Reading): Catchment {
  const n = layout.units.length;
  const lists: number[][] = Array.from({ length: n }, () => []);
  let ownerOf: Int16Array | null = null;
  if (reading === 'nearest') {
    ownerOf = new Int16Array(field.cols * field.rows);
    for (let idx = 0; idx < ownerOf.length; idx++) {
      const [x, y] = field.cellCenter(idx);
      const u = nearestUnit(layout, x, y).i;
      ownerOf[idx] = u;
      lists[u].push(idx);
    }
  } else {
    for (let idx = 0; idx < field.cols * field.rows; idx++) {
      const [x, y] = field.cellCenter(idx);
      for (let u = 0; u < n; u++) {
        if (Math.hypot(x - layout.units[u].x, y - layout.units[u].y) <= layout.platR) lists[u].push(idx);
      }
    }
  }
  return { reading, cellsOf: lists.map((l) => Int32Array.from(l)), ownerOf };
}

/** 每个单元读到的存在（秒）= 它那片格子的**均值**（阈值因此不随单元大小变） */
export function unitInputs(field: TraceField, catchment: Catchment, out?: Float64Array): Float64Array {
  const n = catchment.cellsOf.length;
  const res = out ?? new Float64Array(n);
  for (let u = 0; u < n; u++) {
    const cells = catchment.cellsOf[u];
    let s = 0;
    for (let k = 0; k < cells.length; k++) s += field.data[cells[k]];
    res[u] = cells.length ? s / cells.length : 0;
  }
  return res;
}

// ── 激活：读数 / 阈值，棘轮不回退 ────────────────────────────────────────────

/**
 * 单元怎么响应读数——两档（2026-09-04 用户「人走了之后这个单元就应该变成不激活的状态」）：
 *
 * - `ratchet` **锁定**：程度只升不降。这是项目立论的那个滞回（交接件冻结决定 4：键一旦锁定不解开；
 *   案例页「方法」节写的「痕迹的衰减慢于身体离场，形态不返回初始状态」）。
 * - `follow` **跟随**：程度追当前读数，人走了读数退、结构也收回去，追的速度有上限（PLAN.RESPONSE，
 *   读作绞盘收放需要时间）。**台架默认这一档**：演示上要看见结构跟着人涨落。
 *
 * 两档是同一台机器的两种键谱：跟随 = 键不锁死（可解开的吸附），锁定 = 键锁死。谁对是作者的研究问题，
 * 这里两个都留着，按钮切换。
 */
export type ResponseMode = 'follow' | 'ratchet';
export const RESPONSES = [
  { key: 'follow', zh: '跟随', en: 'follow' },
  { key: 'ratchet', zh: '锁定', en: 'lock' },
] as const satisfies readonly { key: ResponseMode; zh: string; en: string }[];

export class Activation {
  /** 当前读数（秒，随痕迹呼吸） */
  readonly input: Float64Array;
  /** 激活程度 0–1；锁定档只升不降，跟随档追读数（有速率上限） */
  readonly degree: Float64Array;
  threshold: number;
  mode: ResponseMode;
  /** 成形占比：脚下多大比例的地面读满即成形（见 PLAN.FILL）；1 = 整片都满（旧口径） */
  fill: number;

  constructor(n: number, threshold: number = PLAN.THRESHOLD, mode: ResponseMode = 'ratchet', fill = 1) {
    this.input = new Float64Array(n);
    this.degree = new Float64Array(n);
    this.threshold = threshold;
    this.mode = mode;
    this.fill = fill;
  }

  /**
   * 推进 dt 秒（省略 = 不限速，瞬间到位；锁定档的旧路径就是这条 ⇒ 守门与线稿逐位不变）。
   * `blocked[u]` 非零 = 这个单元此刻被身体让位闸住：目标当 0（跟随档按限速退回去、锁定档只是不升）。
   */
  update(inputs: Float64Array, dt = Infinity, blocked?: Uint8Array | null): void {
    const up = PLAN.RESPONSE.rise * dt;
    const down = PLAN.RESPONSE.fall * dt;
    for (let u = 0; u < inputs.length; u++) {
      this.input[u] = inputs[u];
      const target = blocked && blocked[u] ? 0 : Math.min(1, inputs[u] / (this.threshold * this.fill));
      const d = this.degree[u];
      if (target > d) this.degree[u] = Math.min(target, d + up);
      else if (this.mode === 'follow') this.degree[u] = Math.max(target, d - down);
    }
  }

  /** 成形（读满阈值）的单元下标 */
  formed(): number[] {
    const out: number[] = [];
    for (let u = 0; u < this.degree.length; u++) if (this.degree[u] >= 1 - 1e-9) out.push(u);
    return out;
  }
  /** 动了但没成形（0 < 程度 < 1）的单元下标 */
  partial(): number[] {
    const out: number[] = [];
    for (let u = 0; u < this.degree.length; u++) if (this.degree[u] > 1e-6 && this.degree[u] < 1 - 1e-9) out.push(u);
    return out;
  }
  /** 程度 ≥ level 的单元数（「一群」有多大） */
  countAtLeast(level: number): number {
    let c = 0;
    for (let u = 0; u < this.degree.length; u++) if (this.degree[u] >= level - 1e-9) c++;
    return c;
  }
  maxInput(): number {
    let m = 0;
    for (let u = 0; u < this.input.length; u++) if (this.input[u] > m) m = this.input[u];
    return m;
  }
  reset(): void {
    this.input.fill(0);
    this.degree.fill(0);
  }
}

/**
 * 身体让位闸：芯到某个在场的人 < D（`keepOut`）的单元标 1——它的平台下来会打到人。
 * clearance 为 null = 全 0（旧行为）。
 */
export function blockedUnits(
  layout: PlanLayout,
  people: readonly { x: number; y: number; present: boolean }[],
  clearance: number | null,
  out?: Uint8Array,
): Uint8Array {
  const res = out ?? new Uint8Array(layout.units.length);
  res.fill(0);
  if (clearance === null) return res;
  const lim = keepOut(layout, clearance);
  for (const p of people) {
    if (!p.present) continue;
    for (const u of layout.units) {
      if (Math.hypot(u.x - p.x, u.y - p.y) < lim) res[u.i] = 1;
    }
  }
  return res;
}

/** 离 (x,y) 最近的过道交叉点（格线的交点；人能站的地方——单元中心是根杆子） */
export function nearestCrossing(l: PlanLayout, x: number, y: number): { x: number; y: number } {
  const a = aisleLines(l);
  const pick = (v: number, arr: number[]) => arr.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b));
  return { x: pick(x, a.x), y: pick(y, a.y) };
}

/** 哪些单元的芯/平台与身体重叠（人站在杆子里）——布局体检用 */
export function unitsUnderBody(layout: PlanLayout, x: number, y: number, r: number = PLAN.BODY_R): PlanUnit[] {
  return layout.units.filter((u) => Math.hypot(u.x - x, u.y - y) < layout.mastR + r);
}

// ── 人：沿路点走，走到停多久，最后从门出去 ────────────────────────────────────

export type WalkerState = 'outside' | 'walk' | 'dwell' | 'idle';
export interface Waypoint {
  x: number;
  y: number;
  /** 到了停多久（s） */
  dwell?: number;
  /** 到了就离场（门） */
  exit?: boolean;
}

export class Walker {
  x = 0;
  y = 0;
  /** 朝向 = 身体（弧度，房间坐标 x 向右、y 向下）：走的方向；走廊沿它开 */
  heading = 0;
  /** 视线 = 头：视野扇形沿它转。走着时跟着朝向；站着且 lookAround 开着时到处看 */
  gaze = 0;
  /** 站着时转头（演示装置；默认关 ⇒ 视线恒 = 朝向） */
  lookAround = false;
  speed: number;
  present = false;
  state: WalkerState = 'outside';
  /** 已走过的路程（m）与在场时长（s），HUD 与守门用 */
  distance = 0;
  presentTime = 0;
  private queue: Waypoint[] = [];
  private dwellLeft = 0;
  private gazeTarget = 0;
  private gazeHold = 0;
  private rng: () => number;

  constructor(speed: number = PLAN.SPEED.def, seed = 20260905) {
    this.speed = speed;
    this.rng = seededRng(seed);
  }

  /** 换种子（重播要逐位复现） */
  reseed(seed: number): void {
    this.rng = seededRng(seed);
    this.gazeHold = 0;
    this.gaze = this.heading;
    this.gazeTarget = this.heading;
  }

  /** 摆到 (x,y)，在场 */
  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.present = true;
    this.state = 'idle';
    this.queue = [];
    this.dwellLeft = 0;
    this.gaze = this.heading;
    this.gazeTarget = this.heading;
    this.gazeHold = 0;
  }

  /**
   * 头往哪看，推进 dt 秒。走着（或转头关着）⇒ 视线以 GAZE.TURN 转回朝向；站着 ⇒ 看住一个方向 1.5–6 s，
   * 再挑下一个（身体前方 ±SPAN 以内，AHEAD_P 的几率回看正前方），以 GAZE.TURN 转过去。
   */
  look(dt: number, walking: boolean): void {
    if (!this.present) return;
    if (!this.lookAround) {
      // 转头关着：视线就是朝向（旧口径，逐位）
      this.gaze = this.heading;
      this.gazeTarget = this.heading;
      this.gazeHold = 0;
      return;
    }
    const maxTurn = GAZE.TURN * dt;
    if (walking) {
      this.gazeHold = 0;
      this.gazeTarget = this.heading;
    } else {
      this.gazeHold -= dt;
      if (this.gazeHold <= 0) {
        const u = this.rng();
        const v = this.rng();
        const off = u < GAZE.AHEAD_P ? (v * 2 - 1) * GAZE.AHEAD : (v * 2 - 1) * GAZE.SPAN;
        this.gazeTarget = this.heading + off;
        this.gazeHold = GAZE.HOLD.min + this.rng() * (GAZE.HOLD.max - GAZE.HOLD.min);
      }
    }
    const diff = wrapAngle(this.gazeTarget - this.gaze);
    this.gaze = wrapAngle(this.gaze + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  /** 整条路线（第一个点是起点：直接摆过去） */
  setRoute(route: readonly Waypoint[]): void {
    if (route.length === 0) {
      this.present = false;
      this.state = 'outside';
      this.queue = [];
      return;
    }
    this.place(route[0].x, route[0].y);
    this.queue = route.slice(1).map((w) => ({ ...w }));
    this.state = this.queue.length ? 'walk' : 'idle';
    // 一进门就面朝要走的方向（视线随之），重播才逐位复现——否则第一眼是上一遍离场时的朝向
    if (this.queue.length) {
      const dx = this.queue[0].x - this.x;
      const dy = this.queue[0].y - this.y;
      if (Math.hypot(dx, dy) > 1e-9) this.heading = Math.atan2(dy, dx);
    }
    this.gaze = this.heading;
    this.gazeTarget = this.heading;
  }

  /** 追加一个目标（自由模式：点哪走哪） */
  pushTarget(w: Waypoint, replace = true): void {
    if (!this.present) return;
    if (replace) this.queue = [];
    this.queue.push({ ...w });
    this.dwellLeft = 0;
    this.state = 'walk';
  }

  /** 走 dt 秒；返回本步走过的路程（m）。站着的话顺带转头（look） */
  step(dt: number): number {
    if (!this.present) return 0;
    this.presentTime += dt;
    if (this.state === 'dwell') {
      this.dwellLeft -= dt;
      if (this.dwellLeft <= 0) {
        this.dwellLeft = 0;
        this.state = this.queue.length ? 'walk' : 'idle';
      }
      this.look(dt, false);
      return 0;
    }
    if (this.state !== 'walk') {
      this.look(dt, false);
      return 0;
    }
    let left = this.speed * dt;
    let moved = 0;
    while (left > 0 && this.queue.length) {
      const w = this.queue[0];
      const dx = w.x - this.x;
      const dy = w.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) this.heading = Math.atan2(dy, dx);
      if (d <= left) {
        this.x = w.x;
        this.y = w.y;
        moved += d;
        left -= d;
        this.queue.shift();
        if (w.exit) {
          this.present = false;
          this.state = 'outside';
          break;
        }
        if (w.dwell && w.dwell > 0) {
          this.dwellLeft = w.dwell;
          this.state = 'dwell';
          break;
        }
        if (!this.queue.length) this.state = 'idle';
      } else {
        this.x += (dx / d) * left;
        this.y += (dy / d) * left;
        moved += left;
        left = 0;
      }
    }
    this.distance += moved;
    this.look(dt, moved > 0);
    return moved;
  }
}

// ── 路径预设：五条固定 + 自由。物理尺子一律用 pitch4（Lab.12 的格距），不随 N 变 ─────

export type PathKey = 'through' | 'diagonal' | 'dwell' | 'loop' | 'pace' | 'free';
export interface PathPreset {
  key: PathKey;
  zh: string;
  en: string;
  /** 一句话说这条路在试什么行为 */
  zhNote: string;
  enNote: string;
  route(l: PlanLayout): Waypoint[];
  free?: boolean;
}

const pt = (x: number, y: number, extra: Partial<Waypoint> = {}): Waypoint => ({ x, y, ...extra });

/**
 * 驻留点：离「4×4 时单元 (1,1) 的中心」最近的**过道交叉点**（2026-09-05 用户拍板改走过道——此前站单元中心，
 * 那里是根杆子：`unitsUnderBody` 体检三种密度都 = 1）。
 */
export function dwellSpot(l: PlanLayout): { x: number; y: number } {
  return nearestCrossing(l, -l.pitch4 / 2, -l.pitch4 / 2);
}

/** 离 v 最近的一条过道线（沿 x 或 y）——路线预设贴过道走用 */
function nearestAisle(lines: number[], v: number): number {
  return lines.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b));
}

export const PATHS: readonly PathPreset[] = [
  {
    key: 'through',
    zh: '穿行',
    en: 'passing through',
    zhNote: '从左门走到右门，一直在房间中线上——最短的路过',
    enNote: 'left door to right door along the room’s centre line — the briefest passage',
    route: (l) => [pt(l.doors[0].x, 0), pt(l.doors[1].x, 0, { exit: true })],
  },
  {
    key: 'diagonal',
    zh: '斜穿',
    en: 'diagonal',
    zhNote: '从左门沿过道一步横一步纵地斜穿整片场地到对角，再到右门',
    enNote: 'left door, then across the whole field corner to corner in aisle-wise steps, right door',
    route: (l) => {
      // 直线对角必穿杆子（格子的对角线过格心），改成沿过道的阶梯：横一格、纵一格交替
      const c0 = l.units[0];
      const c1 = l.units[l.units.length - 1];
      const a = nearestCrossing(l, c0.x, c0.y);
      const b = nearestCrossing(l, c1.x, c1.y);
      const nx = Math.round((b.x - a.x) / l.pitchM);
      const ny = Math.round((b.y - a.y) / l.pitchM);
      const out: Waypoint[] = [pt(l.doors[0].x, 0), pt(a.x, a.y)];
      let x = a.x;
      let y = a.y;
      for (let k = 0; k < Math.max(nx, ny); k++) {
        if (k < nx) out.push(pt((x += l.pitchM), y));
        if (k < ny) out.push(pt(x, (y += l.pitchM)));
      }
      out.push(pt(l.doors[1].x, 0, { exit: true }));
      return out;
    },
  },
  {
    key: 'dwell',
    zh: '驻留',
    en: 'dwell',
    zhNote: `走到场地里一处站 ${PLAN.DWELL_S} 秒再走`,
    enNote: `walk in, stand in one spot ${PLAN.DWELL_S} s, leave`,
    route: (l) => {
      const u = dwellSpot(l);
      return [pt(l.doors[0].x, 0), pt(u.x, u.y, { dwell: PLAN.DWELL_S }), pt(l.doors[1].x, 0, { exit: true })];
    },
  },
  {
    key: 'loop',
    zh: '绕圈',
    en: 'loop',
    zhNote: `沿过道绕场地中央 ${PLAN.LOOP_LAPS} 圈（边长约两个 Lab.12 格距）——反复经过、从不停留`,
    enNote: `${PLAN.LOOP_LAPS} laps round the centre of the field along the aisles — passing, never staying`,
    route: (l) => {
      // 边贴最近的一条过道线（原 ±pitch4 在 6×6 下正穿过一排杆子）
      const p = nearestAisle(aisleLines(l).x.filter((v) => v > 0), l.pitch4);
      const out: Waypoint[] = [pt(l.doors[0].x, 0), pt(-p, 0), pt(-p, -p)];
      for (let k = 0; k < PLAN.LOOP_LAPS; k++) out.push(pt(p, -p), pt(p, p), pt(-p, p), pt(-p, -p));
      out.push(pt(-p, 0), pt(l.doors[1].x, 0, { exit: true }));
      return out;
    },
  },
  {
    key: 'pace',
    zh: '折返',
    en: 'pacing',
    zhNote: `在中线上来回 ${PLAN.PACE_TRIPS} 趟`,
    enNote: `${PLAN.PACE_TRIPS} trips back and forth along the centre line`,
    route: (l) => {
      const p = l.pitch4;
      const out: Waypoint[] = [pt(l.doors[0].x, 0)];
      for (let k = 0; k < PLAN.PACE_TRIPS; k++) out.push(pt(k % 2 === 0 ? 1.5 * p : -1.5 * p, 0));
      out.push(pt(l.doors[1].x, 0, { exit: true }));
      return out;
    },
  },
  {
    key: 'free',
    zh: '自由',
    en: 'free',
    zhNote: '点地面，人就走过去；停在那儿就是驻留',
    enNote: 'click the floor and the person walks there; standing still is dwelling',
    route: (l) => [pt(l.doors[0].x, 0)],
    free: true,
  },
];

export function pathPreset(key: PathKey): PathPreset {
  const p = PATHS.find((x) => x.key === key);
  if (!p) throw new Error(`unknown path ${key}`);
  return p;
}

// ── 整台仿真：把上面几件接起来 ──────────────────────────────────────────────

export interface PlanSimOpts {
  path?: PathKey;
  /** 每边格数（PLAN.GRIDS 之一；守门也跑别的 N） */
  grid?: number;
  speed?: number;
  /** 影响半径（m） */
  reach?: number;
  reading?: Reading;
  threshold?: number;
  decay?: number;
  /**
   * 痕迹**线性褪去**的秒数（人不在的地方几秒退光）。给了就用它，痕迹同时封顶到阈值；
   * 省略 = 原型的指数衰减（`decay`），不封顶。
   */
  fade?: number | null;
  /** 单元怎么响应读数：跟随（人走了收回去）/ 锁定（滞回，不回退）。默认锁定 = 原型行为 */
  mode?: ResponseMode;
  /** 站位半径（Lab.12 的滑块量；这台钉默认） */
  radius?: number;
  /** 视野全角（弧度）；省略 = 2π 全圆（旧行为）。π = 前方半圆 */
  fov?: number;
  /** 让位（m，平台外缘离身体至少留多少）：D 以内不落痕迹 + 芯在 D 以内的单元闸住；省略/null = 关（旧行为） */
  clearance?: number | null;
  /** 走动时前方走廊不落痕迹（半宽 = D）；只在 clearance 开着时有意义。省略 = 关 */
  lane?: boolean;
  /** 站着时转头（视线 ≠ 朝向，视野扇形跟着视线转）。省略 = 关（视线恒 = 朝向） */
  look?: boolean;
  /** 转头用的随机种子（同种子逐位复现） */
  seed?: number;
  /** 成形占比（PLAN.FILL）；省略 = 1 = 整片地面都读满才成形（旧口径） */
  fill?: number;
}

/** 行走推进的最大子步（s）：步速 1.5 m/s 时一子步走 7.5 cm < 格边，痕迹才连成一条不断的道 */
const MAX_SUB_DT = 0.05;

export class PlanSim {
  readonly layout: PlanLayout;
  readonly field: TraceField;
  readonly walker: Walker;
  readonly act: Activation;
  catchment: Catchment;
  decay: number;
  /** 线性褪去秒数；null = 走原型的指数衰减 */
  fade: number | null;
  reach: number;
  path: PathKey;
  /** 视野全角（弧度）；2π = 全圆 */
  fov: number;
  /** 让位（m）；null = 关 */
  clearance: number | null;
  /** 走动时前方走廊不落痕迹 */
  lane: boolean;
  /** 此刻被身体让位闸住的单元（每步现算；clearance 关时全 0） */
  readonly blocked: Uint8Array;
  /** 上一子步人有没有动（走廊只在走着时开；画法据此画胶囊） */
  moving = false;
  /** 仿真时间（s） */
  t = 0;
  /** 人离场那一刻的 t（未离场 = null） */
  exitedAt: number | null = null;
  /** 走过的足迹（每隔一小段记一点，画路径用；自由模式也记） */
  readonly trail: number[] = [];
  private trailAcc = 0;
  private readonly inputsBuf: Float64Array;
  private lastX = 0;
  private lastY = 0;
  private readonly seed: number;

  constructor(opts: PlanSimOpts = {}) {
    this.layout = planLayout(opts.grid ?? PLAN.GRID_DEF, opts.radius ?? RING.RADIUS_DEF);
    const threshold = opts.threshold ?? PLAN.THRESHOLD;
    this.fade = opts.fade ?? null;
    // 线性褪去时把每格封顶到阈值：人一走读数就在阈值以下，程度当即开始退
    this.field = new TraceField(this.layout.roomM, PLAN.CELL, this.fade === null ? Infinity : threshold);
    this.seed = opts.seed ?? 20260905;
    this.walker = new Walker(opts.speed ?? PLAN.SPEED.def, this.seed);
    this.walker.lookAround = opts.look ?? false;
    this.act = new Activation(this.layout.units.length, threshold, opts.mode ?? 'ratchet', opts.fill ?? 1);
    this.decay = opts.decay ?? PLAN.DECAY;
    this.reach = opts.reach ?? PLAN.REACH.def;
    this.catchment = buildCatchment(this.layout, this.field, opts.reading ?? 'nearest');
    this.inputsBuf = new Float64Array(this.layout.units.length);
    this.blocked = new Uint8Array(this.layout.units.length);
    this.fov = opts.fov ?? Math.PI * 2;
    this.clearance = opts.clearance ?? null;
    this.lane = opts.lane ?? false;
    this.path = opts.path ?? 'dwell';
    this.reset();
  }

  /** 从头来：清痕迹、清激活、人回起点 */
  reset(): void {
    this.field.clear();
    this.act.reset();
    this.t = 0;
    this.held = false;
    this.exitedAt = null;
    this.trail.length = 0;
    this.trailAcc = 0;
    this.walker.distance = 0;
    this.walker.presentTime = 0;
    this.walker.reseed(this.seed);
    this.walker.setRoute(pathPreset(this.path).route(this.layout));
    this.trail.push(this.walker.x, this.walker.y);
    this.lastX = this.walker.x;
    this.lastY = this.walker.y;
    this.moving = false;
    this.blocked.fill(0);
  }

  setPath(key: PathKey): void {
    this.path = key;
    this.reset();
  }

  /** 换读法只换「谁读哪片地」：痕迹与已成形的都留着 */
  setReading(reading: Reading): void {
    this.catchment = buildCatchment(this.layout, this.field, reading);
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
  }

  setSpeed(v: number): void {
    this.walker.speed = v;
  }
  setReach(v: number): void {
    this.reach = v;
  }
  setThreshold(v: number): void {
    this.act.threshold = v;
    if (this.fade !== null) this.field.cap = v; // 封顶跟着阈值走
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
  }
  setDecay(v: number): void {
    this.decay = v;
  }
  /** 换褪去秒数（null = 回到原型的指数衰减，同时取消封顶） */
  setFade(v: number | null): void {
    this.fade = v;
    this.field.cap = v === null ? Infinity : this.act.threshold;
  }
  /** 换响应模式：已经下来的单元留在原处，从这一刻起按新规矩走（跟随档会开始回落） */
  setMode(m: ResponseMode): void {
    this.act.mode = m;
  }
  setFov(v: number): void {
    this.fov = v;
  }
  setClearance(v: number | null): void {
    this.clearance = v;
  }
  setLane(on: boolean): void {
    this.lane = on;
  }
  /** 站着时转头；关掉视线当即转回朝向 */
  setLook(on: boolean): void {
    this.walker.lookAround = on;
  }
  /** 成形占比（跟随档下当即按新口径重算） */
  setFill(v: number): void {
    this.act.fill = v;
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf), this.act.mode === 'follow' ? 0 : Infinity, this.clearance === null ? null : this.blocked);
  }

  /** 让位距离 D（m）；让位关着时 0 */
  get keepOutM(): number {
    return this.clearance === null ? 0 : keepOut(this.layout, this.clearance);
  }

  /** 被指针按着（拖）：位置直接给、不经步速；松手站在原地 */
  held = false;

  /** 按住人：清掉路线，之后每帧 drag 给位置 */
  hold(x: number, y: number): void {
    if (!this.walker.present) {
      this.walker.place(this.layout.doors[0].x, this.layout.doors[0].y);
      this.exitedAt = null;
    }
    this.held = true;
    this.walker.setRoute([{ x: this.walker.x, y: this.walker.y }]); // 清路线、站住
    this.drag(x, y);
  }

  drag(x: number, y: number): void {
    if (!this.held) return;
    const h = this.layout.roomM / 2 - PLAN.BODY_R;
    const nx = Math.max(-h, Math.min(h, x));
    const ny = Math.max(-h, Math.min(h, y));
    const dx = nx - this.walker.x;
    const dy = ny - this.walker.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      this.walker.heading = Math.atan2(dy, dx);
      this.walker.distance += d;
    }
    this.walker.x = nx;
    this.walker.y = ny;
    this.trailAcc += d;
    if (this.trailAcc >= 0.1) {
      this.trail.push(nx, ny);
      this.trailAcc = 0;
    }
  }

  /** 松手：站在原地（预设的路线已清掉，不会再自己走；要重走点「重播」） */
  release(): void {
    this.held = false;
    this.walker.state = 'idle';
  }

  /** 自由模式：点地面 */
  pointerTarget(x: number, y: number): void {
    const h = this.layout.roomM / 2;
    const cx = Math.max(-h, Math.min(h, x));
    const cy = Math.max(-h, Math.min(h, y));
    if (!this.walker.present) {
      // 离场了再点：从左门重新进来
      this.walker.place(this.layout.doors[0].x, this.layout.doors[0].y);
      this.exitedAt = null;
    }
    this.walker.pushTarget(pt(cx, cy));
  }

  /** 自由模式：从最近的门出去 */
  leave(): void {
    if (!this.walker.present) return;
    const d = this.layout.doors.reduce((a, b) => (Math.abs(b.x - this.walker.x) < Math.abs(a.x - this.walker.x) ? b : a));
    this.walker.pushTarget(pt(d.x, d.y, { exit: true }));
  }

  /** 推进 dt 秒仿真时间：行走与落痕迹按 ≤ MAX_SUB_DT 子步，衰减与读数按整段一次（线性，逐位等价） */
  step(dt: number): void {
    if (dt <= 0) return;
    let left = dt;
    while (left > 1e-12) {
      const sdt = Math.min(MAX_SUB_DT, left);
      left -= sdt;
      const wasPresent = this.walker.present;
      let moved = 0;
      if (this.held) {
        // 被拖着：不按步速走，位置由 drag 给；头照样转
        this.walker.presentTime += sdt;
        this.walker.look(sdt, Math.hypot(this.walker.x - this.lastX, this.walker.y - this.lastY) > 1e-9);
      } else moved = this.walker.step(sdt);
      if (this.walker.present) {
        // 走着 = 这一子步位置动了（预设按步速走、拖着按指针给，两条路一个判据）
        const moving = Math.hypot(this.walker.x - this.lastX, this.walker.y - this.lastY) > 1e-9;
        this.moving = moving;
        const hole = this.keepOutM;
        this.field.imprintShaped(this.walker.x, this.walker.y, this.reach, sdt, this.walker.heading, this.fov, hole, this.lane && moving ? hole : 0, this.walker.gaze);
        this.trailAcc += moved;
        if (this.trailAcc >= 0.1) {
          this.trail.push(this.walker.x, this.walker.y);
          this.trailAcc = 0;
        }
      } else if (wasPresent) {
        this.trail.push(this.walker.x, this.walker.y);
        this.exitedAt = this.t + (dt - left);
      }
      this.lastX = this.walker.x;
      this.lastY = this.walker.y;
    }
    if (this.fade !== null) this.field.relax(dt, this.fade);
    else this.field.decay(dt, this.decay);
    blockedUnits(this.layout, [this.walker], this.clearance, this.blocked);
    // 锁定档传 Infinity = 旧路径逐位不变（守门与线稿的结论钉在那上面）；跟随档才按机构速率限速
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf), this.act.mode === 'follow' ? dt : Infinity, this.clearance === null ? null : this.blocked);
    this.t += dt;
  }

  /** 预设走完 + 离场后又看了 AFTER_EXIT_S 秒 ⇒ 这一遍结束 */
  get done(): boolean {
    return this.exitedAt !== null && this.t - this.exitedAt >= PLAN.AFTER_EXIT_S;
  }

  /** 这一遍的结论 */
  summary(): PlanSummary {
    return {
      formed: this.act.formed(),
      partial: this.act.partial(),
      half: this.act.countAtLeast(0.5),
      maxInput: this.act.maxInput(),
      degree: Array.from(this.act.degree),
      input: Array.from(this.act.input),
      distance: this.walker.distance,
      presentTime: this.walker.presentTime,
      t: this.t,
    };
  }
}

export interface PlanSummary {
  formed: number[];
  partial: number[];
  /** 程度 ≥ 1/2 的单元数 */
  half: number;
  maxInput: number;
  degree: number[];
  input: number[];
  distance: number;
  presentTime: number;
  t: number;
}

/**
 * 离线跑一遍：走完预设、离场后再看 afterExit 秒（默认 = PLAN.AFTER_EXIT_S）。
 * 守门与线稿脚本共用这一个入口，台架逐帧调的是同一个 PlanSim.step。
 */
export function runScenario(opts: PlanSimOpts, afterExit: number = PLAN.AFTER_EXIT_S, dt = 0.05, maxT = 900): PlanSim {
  const sim = new PlanSim(opts);
  while (sim.t < maxT) {
    sim.step(dt);
    if (sim.exitedAt !== null && sim.t - sim.exitedAt >= afterExit) break;
    if (sim.walker.state === 'idle' && !pathPreset(opts.path ?? 'dwell').free) break; // 预设不该停在场内
  }
  return sim;
}

/**
 * 解析对照：一块地面在人的影响圈里待 D 秒、痕迹每秒衰减 rate，累计读数 = ∫₀ᴰ (1−rate)^(D−τ) dτ。
 * 守门拿它对仿真（连续时间版；原型的离散 tick 版是 (1−(1−rate)^D)/rate，差在第二位）。
 */
export function dwellInput(seconds: number, rate: number = PLAN.DECAY): number {
  const k = -Math.log(1 - rate);
  return (1 - Math.exp(-k * seconds)) / k;
}

/** 规则网格的 Voronoi 界线 = 过道正中的格线（画「按格」读法的边界用） */
export function aisleLines(l: PlanLayout): { x: number[]; y: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 1; c < l.n; c++) xs.push((c - l.n / 2) * l.pitchM);
  for (let r = 1; r < l.n; r++) ys.push((r - l.n / 2) * l.pitchM);
  return { x: xs, y: ys };
}
