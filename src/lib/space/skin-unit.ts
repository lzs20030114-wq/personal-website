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

  constructor(spec: SkinSpec) {
    this.spec = spec;
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

    const r = SKIN.R0 + (SKIN.R1 - SKIN.R0) * Math.min(step / 900, 1.0);
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
    }
    this.step = step + 1;
  }
}

export function createSkinUnit(spec: SkinSpec): SkinUnit {
  return new SkinUnit(spec);
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
