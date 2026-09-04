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
  /** 影响半径（m）：人的存在能被多远的地面感到。下限 = 身体，上限 = Hall 个人距离外沿；
   *  默认 1.0 ≈ 一臂之遥（Hall 个人距离的远相 0.76–1.2 m）——8×8 下一个人站 20 s 正好长出
   *  一个十字形的「一群」（中心 + 四邻成形、四角半成，⌀ ≈ 1.8 m）；0.6 只点亮脚下那一个 */
  REACH: { min: 0.22, max: 1.2, def: 1.0 },
  /** 步速量程与默认（m/s）——1.2 m/s 是作者人类层「密度约 1.2 人/m² 之后开始下降」那条规则的基准步速 */
  SPEED: { min: 0.3, max: 1.5, def: 1.2 },
  /** 痕迹每秒衰减比例（原型「每拍衰减 2%」，tick 当 1 s） */
  DECAY: 0.02,
  /** 成形阈值（秒；原型「超过 15 就固化」） */
  THRESHOLD: 15,
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
} as const;

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
  private readonly stampCache = new Map<number, Int32Array>();

  constructor(roomM: number, cell: number = PLAN.CELL) {
    this.cell = cell;
    this.cols = Math.ceil(roomM / cell);
    this.rows = this.cols;
    this.x0 = (-this.cols * cell) / 2;
    this.y0 = (-this.rows * cell) / 2;
    this.data = new Float32Array(this.cols * this.rows);
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
      if (c >= 0 && rr >= 0 && c < this.cols && rr < this.rows) this.data[rr * this.cols + c] += dt;
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

export class Activation {
  /** 当前读数（秒，随痕迹呼吸） */
  readonly input: Float64Array;
  /** 激活程度 0–1，只升不降（锁定的键不解开） */
  readonly degree: Float64Array;
  threshold: number;

  constructor(n: number, threshold: number = PLAN.THRESHOLD) {
    this.input = new Float64Array(n);
    this.degree = new Float64Array(n);
    this.threshold = threshold;
  }

  update(inputs: Float64Array): void {
    for (let u = 0; u < inputs.length; u++) {
      this.input[u] = inputs[u];
      const a = Math.min(1, inputs[u] / this.threshold);
      if (a > this.degree[u]) this.degree[u] = a;
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
  /** 朝向（弧度，房间坐标 x 向右、y 向下） */
  heading = 0;
  speed: number;
  present = false;
  state: WalkerState = 'outside';
  /** 已走过的路程（m）与在场时长（s），HUD 与守门用 */
  distance = 0;
  presentTime = 0;
  private queue: Waypoint[] = [];
  private dwellLeft = 0;

  constructor(speed: number = PLAN.SPEED.def) {
    this.speed = speed;
  }

  /** 摆到 (x,y)，在场 */
  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.present = true;
    this.state = 'idle';
    this.queue = [];
    this.dwellLeft = 0;
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
  }

  /** 追加一个目标（自由模式：点哪走哪） */
  pushTarget(w: Waypoint, replace = true): void {
    if (!this.present) return;
    if (replace) this.queue = [];
    this.queue.push({ ...w });
    this.dwellLeft = 0;
    this.state = 'walk';
  }

  /** 走 dt 秒；返回本步走过的路程（m） */
  step(dt: number): number {
    if (!this.present) return 0;
    this.presentTime += dt;
    if (this.state === 'dwell') {
      this.dwellLeft -= dt;
      if (this.dwellLeft <= 0) {
        this.dwellLeft = 0;
        this.state = this.queue.length ? 'walk' : 'idle';
      }
      return 0;
    }
    if (this.state !== 'walk') return 0;
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

/** 驻留点：4×4 时单元 (1,1) 的中心；别的 N 取离它最近的单元中心（站到单元正下方） */
export function dwellSpot(l: PlanLayout): PlanUnit {
  return nearestUnit(l, -l.pitch4 / 2, -l.pitch4 / 2);
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
    zhNote: '从左门斜着横过整片场地到对角，再到右门',
    enNote: 'left door, diagonally across the whole field, right door',
    route: (l) => {
      const c0 = l.units[0];
      const c1 = l.units[l.units.length - 1];
      return [pt(l.doors[0].x, 0), pt(c0.x, c0.y), pt(c1.x, c1.y), pt(l.doors[1].x, 0, { exit: true })];
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
    zhNote: `绕场地中央 ${PLAN.LOOP_LAPS} 圈（边长两个 Lab.12 格距）——反复经过、从不停留`,
    enNote: `${PLAN.LOOP_LAPS} laps round the centre of the field — passing, never staying`,
    route: (l) => {
      const p = l.pitch4;
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
  /** 站位半径（Lab.12 的滑块量；这台钉默认） */
  radius?: number;
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
  reach: number;
  path: PathKey;
  /** 仿真时间（s） */
  t = 0;
  /** 人离场那一刻的 t（未离场 = null） */
  exitedAt: number | null = null;
  /** 走过的足迹（每隔一小段记一点，画路径用；自由模式也记） */
  readonly trail: number[] = [];
  private trailAcc = 0;
  private readonly inputsBuf: Float64Array;

  constructor(opts: PlanSimOpts = {}) {
    this.layout = planLayout(opts.grid ?? PLAN.GRID_DEF, opts.radius ?? RING.RADIUS_DEF);
    this.field = new TraceField(this.layout.roomM);
    this.walker = new Walker(opts.speed ?? PLAN.SPEED.def);
    this.act = new Activation(this.layout.units.length, opts.threshold ?? PLAN.THRESHOLD);
    this.decay = opts.decay ?? PLAN.DECAY;
    this.reach = opts.reach ?? PLAN.REACH.def;
    this.catchment = buildCatchment(this.layout, this.field, opts.reading ?? 'nearest');
    this.inputsBuf = new Float64Array(this.layout.units.length);
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
    this.walker.setRoute(pathPreset(this.path).route(this.layout));
    this.trail.push(this.walker.x, this.walker.y);
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
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
  }
  setDecay(v: number): void {
    this.decay = v;
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
      if (this.held) this.walker.presentTime += sdt; // 被拖着：不按步速走，位置由 drag 给
      else moved = this.walker.step(sdt);
      if (this.walker.present) {
        this.field.imprint(this.walker.x, this.walker.y, this.reach, sdt);
        this.trailAcc += moved;
        if (this.trailAcc >= 0.1) {
          this.trail.push(this.walker.x, this.walker.y);
          this.trailAcc = 0;
        }
      } else if (wasPresent) {
        this.trail.push(this.walker.x, this.walker.y);
        this.exitedAt = this.t + (dt - left);
      }
    }
    this.field.decay(dt, this.decay);
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
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
