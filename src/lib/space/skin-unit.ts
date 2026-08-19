/**
 * 项目二 · 收缩张紧外皮单元 —— skin_sim_v7_final.py 的 1:1 移植。
 *
 * 纯数学，零依赖，零 DOM（与 src/lib/linkage 的内核纪律同款；这是站上第三个内核，
 * 与两个连杆内核平行、互不引用）。物理阶段已在 Python 侧收口（见 项目二参考/
 * HANDOFF_claude_code.md「冻结决定」），本文件**只做语言搬运、不做内核改进**；
 * 数值与 Python 参考的对照见 skin-unit.test.ts（基准 = skin-ref.json）。
 *
 * 移植要点（错一处就与参考漂移）：
 * - numpy 的切片批量更新是 **Jacobi 快照语义**：corr 全部从更新前的位置算出，
 *   再统一施加（先整段 +=，后整段 -=）。逐节点边算边改（Gauss–Seidel）是另一套动力学。
 * - 每步迭代内约束顺序不可乱：钉贴合段 → 拉伸 → 多尺度抗弯 → 锁定键+梯挡垂直化 →
 *   层直化/找平 → 面板 → 拉链判定（必须在迭代末尾）→ 重钉贴合段。
 * - 锁定永久：键一旦锁定不解开——滞回的物理来源。拉链纪律：吸引全员同时，
 *   锁定按跨度从大到小逐颗放行；step>950 纪律解除（排掉滞留气泡）。
 */

export type SkinBond = readonly [number, number, number]; // (i, j, rb)：皮上两点吸附配对，rb=键静止长度
export type SkinPanel = readonly [number, number]; // (a, b)：区段强制直化 + x 向找直
export type SkinSeg =
  | readonly ['g', number] // 贴合段：钉在芯上
  | readonly ['f', number, readonly SkinBond[]] // 自由段：富余材料 + 键谱
  | readonly ['f', number, readonly SkinBond[], readonly SkinPanel[]];
export type SkinSpec = readonly SkinSeg[];

/** 全部物理常量，逐字取自 v7（不是手感参数，不许调——协议本体） */
export const SKIN = {
  SEG: 0.02,
  BETA: 0.8, // v6 验证过的成形刚度（皮软，只助有序折叠）
  GRAV: -1.8,
  PRESS: 3.0, // 3D 皮环向刚度的 2D 等效外撑
  DT: 0.004,
  DAMP: 0.9, // 准静态防抖
  ITERS: 55,
  STEPS: 1500,
  R0: 0.95,
  R1: 0.3,
  D_ACT: 1.2,
  D_LOCK: 0.14,
  K_ATT: 0.1,
  K_STR: 1.0, // 层直化强度（键生成刚度）
  STRIPE: 8, // 渲染条纹节距（绘图用，不参与物理）
} as const;

const STRAIGHTEN_OFFS = [2, 4, 8, 16, 32] as const;

export interface SkinBuild {
  n: number;
  glued: number[];
  /** 键谱链（绝对下标，跨度降序 = 拉链顺序） */
  chains: SkinBond[][];
  panels: SkinPanel[];
}

/**
 * 站方可选修正（用户 2026-08-18 看真机拍板「根部不想被提拉起来，没被键拉起的地方
 * 贴着最开始的轴」）。两项都默认关——默认路径 = v7 逐字，Python 对照不受影响：
 * - coreWall：芯不可穿透（x ≥ 0 的单侧墙，只作用于自由节点）。v7 是纯 2D 剖面、
 *   没建这条显然的物理事实，富余材料会从轴左侧穿出去鼓包——红圈事故的主因。
 * - rootHug：键谱围合区之外的自由节点（根部缓冲料）向芯贴靠的弱吸附，
 *   把根部富余压成贴轴的褶而不是离轴的弓。
 */
export interface SkinUnitOpts {
  coreWall?: boolean;
  rootHug?: number; // 每迭代向 x=0 靠拢的比例（0=关；1=硬贴轴）
  /**
   * 该单元的收缩终点 r₁（默认 SKIN.R1=0.30）。结构系统本就是「每单元一个收缩
   * 自由度 ℓ」（交接件），目录图为了对比才共用一个终点；用户 2026-08-18 拍板
   * 袋收缩浅一点最好看（终态 = 原协议 step≈400 的圆鼓形，不再压到下垂）。
   * 时间表不变（step 900 走完），只改深度——四单元仍同步呼吸。
   */
  r1?: number;
  /**
   * 方箱整形（阶梯挑台用，用户 2026-08-19 拍板「最终的形态应该是一个方形」）。
   * 全部用 v7 自己的约束词汇，补上它没做的三件（实测即「不方」的三个来源）：
   * ① 嘴角贴轴——最外键对 x=0（箱体内面就是轴，手绘即此；此前浮在轴外 8px）；
   * ② 底面找平——v7 只找平上层台面（猫站的面），底面只直化不找平（波动 6.5px）；
   * ③ 端角键距迭代末重申——找平/直化会把最外与最内键对压短（24→22.1px），
   *    端面弦 < 弧 ⇒ 必然外鼓 4px；末位重申让端面弦=弧 → 拉直。
   *
   * 强度（2026-08-19 Lab.08 过渡系列新增，用户「转变不平滑」返工）：
   * true = 1.0（既有行为逐位不变），数字 ∈ (0,1) = 各项整形按比例減力——
   * 硬投影变 blend、找平/重申系数乘强度。过渡中段用弱强度让「方」渐入，
   * 而不是最后一格二值切换。
   */
  boxSquare?: boolean | number;
}

/**
 * 站上台架用的定案参数（对照手绘 P2 逐档实验：0.08 太弱——拉伸约束每迭代 55 次
 * 会把缓冲拽回斜线；0.3 仍剩小漏斗；1.0 = 硬贴轴，形态直接从轴上长出）。
 * 四单元锁定数在此参数下与 v7 逐一相同（2/9/11/11），拉链不受影响。
 */
export const SKIN_ROOT_FIX: SkinUnitOpts = { coreWall: true, rootHug: 1.0 };

export function buildUnit(spec: SkinSpec): SkinBuild {
  const glued: number[] = [];
  const chains: SkinBond[][] = [];
  const panels: SkinPanel[] = [];
  let idx = 0;
  for (const s of spec) {
    if (s[0] === 'g') {
      for (let i = idx; i < idx + s[1]; i++) glued.push(i);
    } else {
      if (s[2].length) {
        const zone: SkinBond[] = s[2].map(([a, b, rb]) => [idx + a, idx + b, rb]);
        zone.sort((t1, t2) => t2[1] - t2[0] - (t1[1] - t1[0])); // 拉链: 跨度大(近主干)在前（稳定排序）
        chains.push(zone);
      }
      if (s.length === 4) for (const [a, b] of s[3]) panels.push([idx + a, idx + b]);
    }
    idx += s[1];
  }
  return { n: idx, glued, chains, panels };
}

/** 芯上各节点的目标 y（贴合段按 SEG、自由段按 SEG·r 排布）；返回芯全长 */
export function coreY(spec: SkinSpec, r: number, out: Float64Array): number {
  let y = 0;
  let idx = 0;
  for (const s of spec) {
    const step = s[0] === 'g' ? SKIN.SEG : SKIN.SEG * r;
    for (let k = 0; k < s[1]; k++) {
      out[idx++] = -y;
      y += step;
    }
  }
  return y;
}

export class SkinUnit {
  readonly spec: SkinSpec;
  readonly n: number;
  readonly glued: number[];
  readonly chains: SkinBond[][];
  readonly panels: SkinPanel[];
  readonly freeMask: Uint8Array;

  px: Float64Array;
  py: Float64Array;
  /** 锁定键（追加序 = 锁定时间序；永久，不解开） */
  locked: [number, number, number][] = [];

  /** 已完成的协议步数（0..STEPS） */
  step = 0;
  /** 最近一步施加的收缩比与芯长 */
  r: number = SKIN.R0;
  coreLen = 0;

  private ppx: Float64Array;
  private ppy: Float64Array;
  private ys: Float64Array;
  private cx: Float64Array;
  private cy: Float64Array;
  private lockedSet = new Set<number>();
  /** 每条链已锁定键的链内下标（升序 = 跨度降序），锁定时增量维护——热循环里不做 filter 分配 */
  private chainLocked: number[][];
  private coreWall: boolean;
  private rootHug: number;
  private r1: number;
  /** 方箱整形强度：0 = 关，(0,1) = 渐入（Lab.08 过渡中段），1 = 全量（阶梯方箱） */
  private boxSquare: number;
  /** 根部缓冲料的连续段（boxSquare 用：段内节点在两端锚点之间均匀排布） */
  private rootRuns: [number, number][] = [];
  /** 键谱围合区之外的自由节点（根部缓冲料）——rootHug 的作用对象，静态可知 */
  readonly rootFree: number[] = [];

  constructor(spec: SkinSpec, opts: SkinUnitOpts = {}) {
    this.spec = spec;
    this.coreWall = opts.coreWall ?? false;
    this.rootHug = opts.rootHug ?? 0;
    this.r1 = opts.r1 ?? SKIN.R1;
    this.boxSquare =
      opts.boxSquare === true ? 1 : typeof opts.boxSquare === 'number' ? opts.boxSquare : 0;
    const { n, glued, chains, panels } = buildUnit(spec);
    this.n = n;
    this.glued = glued;
    this.chains = chains;
    this.panels = panels;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.ppx = new Float64Array(n);
    this.ppy = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.cx = new Float64Array(n);
    this.cy = new Float64Array(n);
    this.freeMask = new Uint8Array(n).fill(1);
    for (const g of glued) this.freeMask[g] = 0;
    this.chainLocked = chains.map(() => []);
    // 根部缓冲料 = 自由节点里不落在任何键谱围合区（链的最外键跨）内的那些
    const inSpan = new Uint8Array(n);
    for (const ch of chains) {
      let lo = n;
      let hi = 0;
      for (const [i, j] of ch) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      for (let i = lo; i <= hi; i++) inSpan[i] = 1;
    }
    for (let i = 0; i < n; i++) if (this.freeMask[i] && !inSpan[i]) this.rootFree.push(i);
    for (let k = 0; k < this.rootFree.length; k++) {
      const a = this.rootFree[k];
      let b = a;
      while (k + 1 < this.rootFree.length && this.rootFree[k + 1] === b + 1) {
        b++;
        k++;
      }
      if (a > 0 && b < n - 1) this.rootRuns.push([a, b]);
    }

    this.coreLen = coreY(spec, SKIN.R0, this.ys);
    this.py.set(this.ys);
    // 自由段初始鼓包：np.sin(π·linspace(0,1,L))（L=1 时 linspace 取 [0]）
    let runStart = -1;
    for (let i = 0; i <= n; i++) {
      const free = i < n && this.freeMask[i] === 1;
      if (free && runStart < 0) runStart = i;
      if (!free && runStart >= 0) {
        const L = i - runStart;
        for (let k = 0; k < L; k++) {
          const t = L > 1 ? k / (L - 1) : 0;
          this.px[runStart + k] += 0.18 * Math.sin(Math.PI * t);
        }
        runStart = -1;
      }
    }
    this.ppx.set(this.px);
    this.ppy.set(this.py);
  }

  get done(): boolean {
    return this.step >= SKIN.STEPS;
  }

  /**
   * 跨距 off 的距离约束投影，Jacobi 快照语义（= numpy 的切片批量更新）：
   * corr 全部先算（从当前的位置快照），再先整段 +=、后整段 -=。
   * rest = off·SEG；k=1 时系数 0.5 即拉伸约束本体。
   */
  private projectSpan(a: number, b: number, off: number, k: number): void {
    const { px, py, cx, cy } = this;
    const m = b - a + 1 - off;
    const rest = off * SKIN.SEG;
    for (let t = 0; t < m; t++) {
      const i = a + t;
      const j = i + off;
      const dx = px[j] - px[i];
      const dy = py[j] - py[i];
      const dist = Math.sqrt(dx * dx + dy * dy); // = np.linalg.norm 的逐元素语义（不用 hypot：慢且舍入路径不同）
      const c = (k * 0.5 * (dist - rest)) / Math.max(dist, 1e-9);
      cx[t] = c * dx;
      cy[t] = c * dy;
    }
    for (let t = 0; t < m; t++) {
      px[a + t] += cx[t];
      py[a + t] += cy[t];
    }
    for (let t = 0; t < m; t++) {
      px[a + t + off] -= cx[t];
      py[a + t + off] -= cy[t];
    }
  }

  /** 多尺度直化: 在 a..b 区间按多个跨距施加 端距=弧长 约束 -> 板级刚度 */
  private straighten(a: number, b: number, k: number): void {
    if (b < a) {
      const t = a;
      a = b;
      b = t;
    }
    if (b - a < 4) return;
    for (let s = 0; s < STRAIGHTEN_OFFS.length; s++) {
      const off = STRAIGHTEN_OFFS[s];
      if (off > b - a) break;
      this.projectSpan(a, b, off, k);
    }
  }

  /**
   * 把 a..b 的内部节点向 a→b 连线投影（垂足）——只压横向偏差。
   * blend=1 是硬投影：迭代末面节点直接落在连线上。0.5 试过不够——键间材料把面
   * 中段顶出 ~2px，而嘴角被键距钉在 rb，面比嘴宽 ⇒ 靠嘴几节被拽成向内的斜坡
   *（用户 2026-08-19：「根部有一段错误的收紧」）；硬投影让面与嘴严格同高。
   */
  private flattenToLine(a: number, b: number, blend = 1.0): void {
    if (b < a) {
      const t = a;
      a = b;
      b = t;
    }
    const { px, py } = this;
    const ax = px[a];
    const ay = py[a];
    const ux = px[b] - ax;
    const uy = py[b] - ay;
    const L2 = Math.max(ux * ux + uy * uy, 1e-12);
    for (let i = a + 1; i < b; i++) {
      const t = ((px[i] - ax) * ux + (py[i] - ay) * uy) / L2;
      const fx = ax + t * ux;
      const fy = ay + t * uy;
      px[i] += blend * (fx - px[i]);
      py[i] += blend * (fy - py[i]);
    }
  }

  /** 锁定键入链内清单，保持链内下标升序（late 期可乱序锁定，需插入而非追加） */
  private addChainLock(c: number, idx: number): void {
    const arr = this.chainLocked[c];
    let p = arr.length;
    while (p > 0 && arr[p - 1] > idx) p--;
    arr.splice(p, 0, idx);
  }

  private pinGlued(): void {
    const { px, py, ys, glued } = this;
    for (let g = 0; g < glued.length; g++) {
      const i = glued[g];
      px[i] = 0;
      py[i] = ys[i];
    }
  }

  /** 推进一个协议步（step 索引即 Python 侧 for step in range(STEPS) 的 step） */
  advance(): void {
    if (this.done) return;
    const { px, py, ppx, ppy, ys, n, chains, panels, locked, lockedSet } = this;
    const step = this.step;

    const r = SKIN.R0 + (this.r1 - SKIN.R0) * Math.min(step / 900, 1.0);
    this.r = r;
    this.coreLen = coreY(this.spec, r, ys);

    for (let i = 0; i < n; i++) {
      const vx = (px[i] - ppx[i]) * SKIN.DAMP;
      const vy = (py[i] - ppy[i]) * SKIN.DAMP;
      ppx[i] = px[i];
      ppy[i] = py[i];
      px[i] += vx;
      py[i] += vy;
    }
    const g = SKIN.GRAV * SKIN.DT * SKIN.DT;
    for (let i = 0; i < n; i++) py[i] += g;
    const pressNow =
      SKIN.PRESS * (step < 900 ? 1.0 : Math.max(0.0, 1.0 - (step - 900) / 200));
    const pr = pressNow * SKIN.DT * SKIN.DT; // 外压随收缩结束衰减
    for (let i = 0; i < n; i++) if (this.freeMask[i]) px[i] += pr;

    const late = step > 950; // 收缩完成后拉链纪律解除
    for (let iter = 0; iter < SKIN.ITERS; iter++) {
      this.pinGlued();
      this.projectSpan(0, n - 1, 1, 1.0); // 拉伸（k=1 → 系数 0.5）
      this.projectSpan(0, n - 1, 4, SKIN.BETA); // 多尺度抗弯
      this.projectSpan(0, n - 1, 8, 0.65 * SKIN.BETA);
      this.projectSpan(0, n - 1, 16, 0.4 * SKIN.BETA);

      for (let b = 0; b < locked.length; b++) {
        const lb = locked[b];
        const i = lb[0];
        const j = lb[1];
        const rb = lb[2];
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const rr = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9);
        const c = (0.5 * (rr - rb)) / rr;
        px[i] += c * dx;
        py[i] += c * dy;
        px[j] -= c * dx;
        py[j] -= c * dy;
        const xm = 0.5 * (px[i] + px[j]); // 梯挡垂直化 -> 矩形化
        px[i] += 0.35 * (xm - px[i]);
        px[j] += 0.35 * (xm - px[j]);
      }

      // ---- 键生成刚度: 层直化（刚度是成键的结果，不是皮的属性） ----
      for (let c = 0; c < chains.length; c++) {
        const ch = chains[c];
        const lbi = this.chainLocked[c]; // 已锁定的链内下标（升序 = 跨度降序，锁定时维护）
        if (lbi.length >= 2) this.straighten(ch[lbi[0]][0], ch[lbi[lbi.length - 1]][0], SKIN.K_STR); // 上层通长直化
        if (lbi.length >= 3) {
          // 台面找平(横撑板条)：y 向均值，仅键数≥3 的链
          const a = ch[lbi[0]][0];
          const bEnd = ch[lbi[lbi.length - 1]][0];
          let mean = 0;
          for (let i = a; i <= bEnd; i++) mean += py[i];
          mean /= bEnd - a + 1;
          for (let i = a; i <= bEnd; i++) py[i] += 0.25 * (mean - py[i]);
          // 下层按键长分段直化：run 边界 = 相邻锁定键 rb 变化处
          let runStart = 0;
          for (let t = 1; t <= lbi.length; t++) {
            if (t === lbi.length || Math.abs(ch[lbi[t]][2] - ch[lbi[t - 1]][2]) >= 1e-9) {
              if (t - runStart >= 2)
                this.straighten(ch[lbi[t - 1]][1], ch[lbi[runStart]][1], SKIN.K_STR);
              runStart = t;
            }
          }
        }
      }

      for (let p = 0; p < panels.length; p++) {
        // 面板: 直化 + 端面找直
        const a = panels[p][0];
        const b = panels[p][1];
        this.straighten(a, b, SKIN.K_STR);
        let mean = 0;
        for (let i = a; i <= b; i++) mean += px[i];
        mean /= b - a + 1;
        for (let i = a; i <= b; i++) px[i] += 0.3 * (mean - px[i]);
      }

      for (let c = 0; c < chains.length; c++) {
        const ch = chains[c];
        let firstUnlocked = true;
        for (let t = 0; t < ch.length; t++) {
          // 吸引全员, 锁定按拉链
          const bond = ch[t];
          const i = bond[0];
          const j = bond[1];
          const rb = bond[2];
          if (lockedSet.has(i * 1024 + j)) continue;
          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const rr = Math.sqrt(dx * dx + dy * dy);
          if ((firstUnlocked || late) && rr < rb + SKIN.D_LOCK) {
            locked.push([i, j, rb]);
            lockedSet.add(i * 1024 + j);
            this.addChainLock(c, t);
          } else if (rb < rr && rr < SKIN.D_ACT) {
            // 吸引护栏：键距小于键长不再收紧（否则封死端面）
            px[i] += SKIN.K_ATT * dx;
            py[i] += SKIN.K_ATT * dy;
            px[j] -= SKIN.K_ATT * dx;
            py[j] -= SKIN.K_ATT * dy;
          }
          firstUnlocked = false;
        }
      }
      this.pinGlued();
      // ---- 站方可选修正（默认关，见 SkinUnitOpts）----
      if (this.boxSquare > 0) {
        const sq = this.boxSquare; // 强度：<1 时各项整形按比例减力（Lab.08 过渡渐入）
        for (let c = 0; c < chains.length; c++) {
          const ch = chains[c];
          const lbi = this.chainLocked[c];
          // 嘴角贴轴：最外键对（链首）x=0——箱体内面就是轴。从 step 0 就锚，
          // 拉链照走（两角同在轴上时键距 = |Δy|，收缩推进自然入锁定窗口）
          if (sq >= 1) {
            px[ch[0][0]] = 0;
            px[ch[0][1]] = 0;
          } else {
            px[ch[0][0]] *= 1 - sq;
            px[ch[0][1]] *= 1 - sq;
          }
          if (lbi.length >= 3) {
            // 底面找平：v7 只找平上层台面（lb 全跨的 i 侧），底面（j 侧）对称补上
            const a = ch[lbi[lbi.length - 1]][1];
            const b = ch[lbi[0]][1];
            let mean = 0;
            for (let i = a; i <= b; i++) mean += py[i];
            mean /= b - a + 1;
            for (let i = a; i <= b; i++) py[i] += 0.25 * sq * (mean - py[i]);
          }
          // 端角键距迭代末重申：找平/直化会把最外与最内键对压短（弦 < 弧 ⇒ 端面鼓）
          for (const t of [lbi[0], lbi[lbi.length - 1]]) {
            if (t === undefined) continue;
            const bd = ch[t];
            const i = bd[0];
            const j = bd[1];
            const dx = px[j] - px[i];
            const dy = py[j] - py[i];
            const rr = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9);
            const cf = (0.5 * sq * (rr - bd[2])) / rr;
            px[i] += cf * dx;
            py[i] += cf * dy;
            px[j] -= cf * dx;
            py[j] -= cf * dy;
          }
          // 顶/底面压平：端角键锁定后（面才成立），把面内节点向「嘴角→端角连线」
          // 投影——只压横向偏差（垂足），沿线分布仍归拉伸/直化管。键间富余的
          // ±2.3px 起伏此前当织物质感保留，用户 2026-08-19 拍板「不够平直」，压掉。
          const tip = ch[ch.length - 1];
          if (lockedSet.has(tip[0] * 1024 + tip[1])) {
            this.flattenToLine(ch[0][0], tip[0], sq);
            this.flattenToLine(tip[1], ch[0][1], sq);
          }
        }
        // 端面拉直：找平每迭代把两个端角拽向顶/底面，把角旁的段抻长（实测 2.64px
        // = 超伸 32%）→ 面弧 > 弦 ⇒ 必然外鼓 4px，段长重申的力道追不上。改为决定性
        // 投影——最内键锁定后（弦 = 键长已建立），面内节点直接向「两角连线等分点」
        // 靠拢：这是 v7 面板注释「端面弧长=键长 -> 必然拉直」的逻辑终点。
        // 前提是弦≈弧（rb≈端面弧长）：rb 明显小于弧长时硬压 = 把富余材料逐迭代
        // 挤出端面，形态直接崩（Lab.08 线稿系列 candC，Δ11.45）。故按几何判据
        // 启用——面弦（锁定后 = rb）达到面弧的 93% 才投影（压缩 <7% 可被段长
        // 吸收），且按 sq 混入；渐入档更圆的鼻端交给 rb 增长本身（弓高随弦弧比
        // 连续收缩），投影只做收尾。
        for (let p = 0; p < panels.length; p++) {
          const a = panels[p][0];
          const b = panels[p][1];
          if (!lockedSet.has(a * 1024 + b)) continue;
          const chord = Math.sqrt((px[b] - px[a]) ** 2 + (py[b] - py[a]) ** 2);
          // 弦弧比 0.85→1.00 平滑渐入（smoothstep），再乘 sq：投影强度随几何
          // 一致性连续爬坡，不在任何一级上二值启用
          const ratio = chord / ((b - a) * SKIN.SEG);
          const w = Math.min(1, Math.max(0, (ratio - 0.85) / 0.15));
          const eff = sq >= 1 ? 1 : sq * w * w * (3 - 2 * w);
          if (eff <= 0) continue;
          const m = b - a;
          for (let t = 1; t < m; t++) {
            // 硬投影（同 flattenToLine 的理由）：端面每帧收尾都严格是直线
            const tx = px[a] + ((px[b] - px[a]) * t) / m;
            const ty = py[a] + ((py[b] - py[a]) * t) / m;
            if (eff >= 1) {
              px[a + t] = tx;
              py[a + t] = ty;
            } else {
              px[a + t] += eff * (tx - px[a + t]);
              py[a + t] += eff * (ty - py[a + t]);
            }
          }
        }
        // 根部缓冲料排整齐：在两端锚点（贴合端 ↔ 嘴角）之间均匀排布（硬投影）。
        // 缓冲弧长超出可用轴距（阶梯下缓冲 14px 只有 4px 可用），硬贴轴后自由褶皱
        // 会在嘴角背后拱成上下折返的疙瘩（实测 node 110 反而比嘴角高 5.8px），
        // 平滑再把它带出来 = 用户圈的「左侧收紧」；均匀排布 = 手绘 P2 的直线入角。
        for (const [a, b] of this.rootRuns) {
          const lo = a - 1;
          const hi = b + 1;
          const m = hi - lo;
          for (let i = a; i <= b; i++) {
            const t = (i - lo) / m;
            const tx = px[lo] + t * (px[hi] - px[lo]);
            const ty = py[lo] + t * (py[hi] - py[lo]);
            if (sq >= 1) {
              px[i] = tx;
              py[i] = ty;
            } else {
              px[i] += sq * (tx - px[i]);
              py[i] += sq * (ty - py[i]);
            }
          }
        }
      }
      if (this.rootHug > 0) {
        const k = this.rootHug;
        for (let t = 0; t < this.rootFree.length; t++) {
          const i = this.rootFree[t];
          px[i] -= k * px[i]; // 根部缓冲料向芯贴靠（只动 x，不碰围合区）
        }
      }
      if (this.coreWall) {
        for (let i = 0; i < n; i++) if (this.freeMask[i] && px[i] < 0) px[i] = 0; // 皮不得穿芯
      }
    }
    this.step = step + 1;
  }
}

export function createSkinUnit(spec: SkinSpec, opts?: SkinUnitOpts): SkinUnit {
  return new SkinUnit(spec, opts);
}

/**
 * 渲染用平滑（v7 render_smooth 的移植）：沿链移动平均（edge 补边），只用于绘图，
 * 不改物理数据。返回新数组。
 */
export function renderSmooth(
  px: Float64Array,
  py: Float64Array,
  w = 3,
  passes = 1,
): { x: Float64Array; y: Float64Array } {
  const n = px.length;
  let qx = Float64Array.from(px);
  let qy = Float64Array.from(py);
  const half = w >> 1;
  for (let p = 0; p < passes; p++) {
    const ox = new Float64Array(n);
    const oy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      for (let k = -half; k <= half; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sx += qx[j];
        sy += qy[j];
      }
      ox[i] = sx / w;
      oy[i] = sy / w;
    }
    qx = ox;
    qy = oy;
  }
  return { x: qx, y: qy };
}
