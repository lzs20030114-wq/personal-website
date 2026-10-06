/**
 * 项目二 · 单元循环：判断 → 定形 → 落下成形 → 收回松键 → 回到静止，下次可成另一种形
 * （总框架 §12.10 第 8 条；2026-10-06 作者四项拍板）。纯模型，零 DOM。
 *
 * ## 作者的四项决定怎么落成代码
 *
 * 1. **触发是 0/1 判断，不是程度**（「单元经过各种情况下判断是否应该被激活以及被激活成什么状态，
 *    得出一个判断，之后才会激活，而不是按照程度就像定量一样的」）⇒ 单元只有两个静止态
 *    `idle`（直带子，没有键）/ `formed`（协议跑完、键锁着）和两个过渡态 `forming` / `retracting`。
 *    判断只在静止态受理（`apply`）；过渡一旦开始就把整条协议跑完，中途不受理新判断——
 *    平面台架那套「程度跟随」（Lab 2-10/2-11 的 follow 档）在这里没有对应物，是有意的。
 * 2. **布条按词汇表里最长的形态预裁**（「那就按最长的来做呗」）⇒ 一条带 338 节 = 捏分那张
 *    （`SQSPLIT_BAND`），每种形状「用多少取多少」：结构段之外的自由材料当配平垫贴在芯上。
 * 3. **重新落下先定形态再成形**（「先判断应该落下的是什么形态……做好判断之后下去成型」）⇒
 *    `deploy(shape)` 的参数就是那个判断的结果，落下的全过程只认它；判断逻辑本身不在这里
 *    （那是行为规则 R1–R5 + 代价模型的事，规则草案 §3 / §6）。
 * 4. **词汇表先做最小** ⇒ 两张：平台（阶梯方箱）+ 通道（捏分裂到轴那档：两片台之间一道 100 px 的缝，
 *    缝底贴到芯上，从外面看是上下两片台夹着一个通得过去的空腔）。
 *
 * ## 同一条布、同样的收缩量——两张谱只差「扣哪些键、夹在哪」
 *
 * 平台不是照环族那样搬到 [贴合 194 | 自由 129 | 贴合 15] 上，而是放进捏分那副七段谱
 * `[贴合 8 | 垫 82 | 隔离 16 | 结构 129 | 隔离 16 | 垫 82 | 尾 5]`（`sqSplitWrap`，自由总量 293 恒定）。
 * 这样两张谱的**贴合总量相同（45 节）、自由材料总量相同（293 节）** ⇒ 芯的收缩量相同、带子顶端的
 * 升降相同（实测终态顶端离钉住点都是 263.8 px）——换形不改变这个单元对外的运动学，只换键的程序。
 * 平台因此落在与通道同一个居中高度（中心离钉住点 ≈129 px，`sqSplitMouthY`）；要挪高低，
 * `sqSplitWrap` 的 `shift` 就是旋钮（两垫之间移材料、总长与协议不变），待行为层给出要求再定。
 *
 * 两条如实带着的账：
 * - **贴合段的位置随结构长短移动**（隔离段跟着垫走：平台的隔离块在 90–105 / 235–250，通道的在
 *   35–50 / 290–305）。真机上这意味着「布在芯上夹持的位置」也要能随程序变，与正文已经要写明的
 *   「键是可控开合的扣件」同一性质，一并写进假设；环族那种搬法同样需要它（贴合 194 对 8），不是本构造多出来的。
 * - 平台周围从「长贴合段」换成「隔离 16 + 垫」，形状对自身中心的逐点偏差实测 ≤0.03 px
 *   （不是逐位相同；锁定集合逐位相同）——与 Lab 2-5 那张平台是同一个形，守门卡这条。
 *
 * ## 换形不重建布：位置搬运
 *
 * 引擎按谱构造（`SkinUnit`），运行时换形 = 用新谱建实例并把这条布此刻的节点位置搬过去
 * （`applyTerminalState`，键清空、协议从 0 起）。探针（皮肤单元lab §26）已证明布在仿真里没有记忆：
 * 回直后再成形与全新单元逐位相同，所以搬运不会把上一轮的形带进下一轮。
 */
import { SKIN, createSkinUnit, type SkinSpec, type SkinUnit, type SkinUnitOpts } from './skin-unit';
import { buildRingUnits, RING_DEFAULT_FORM } from './skin-ring';
import { SPLIT_RING_BAND, SPLIT_RING_TIERS } from './skin-split-ring';
import { SQSPLIT, sqSplitBuild, sqSplitWrap } from './skin-square-split';

export type CycleShapeKey = 'platform' | 'channel';

export interface CycleShape {
  key: CycleShapeKey;
  zh: string;
  en: string;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
  /** 缝底节点（只有通道有）：台架据此不画跨缝的键（RingUnitDef.seam 同义） */
  seam?: number;
  /** 结构段（真正折成形的那一段自由材料）在带上的起止节点 [from, to) */
  structure: readonly [number, number];
}

/** 一条带的节数 = 词汇表里最长的那张（捏分，338） */
export const CYCLE_BAND = SPLIT_RING_BAND;
/** 自由材料总量（结构 + 两垫），两张谱相同 ⇒ 收缩量相同 */
export const CYCLE_FREE = SQSPLIT.F_TOT;
/** 回程步数：与正向协议同长（900 步回到 R0 + 600 步静置），探针与守门都按它 */
export const CYCLE_RETRACT_STEPS = SKIN.STEPS;

const nodesOf = (spec: SkinSpec): number => spec.reduce((a, s) => a + s[1], 0);
const freeOf = (spec: SkinSpec): number => spec.reduce((a, s) => a + (s[0] === 'f' ? s[1] : 0), 0);

/** 最小词汇表：平台（阶梯方箱）+ 通道（捏分裂到轴那档） */
export function cycleShapes(): readonly CycleShape[] {
  const stepped = buildRingUnits()[RING_DEFAULT_FORM];
  const plat = sqSplitWrap(stepped.spec[1], SQSPLIT.F_TOT, '平台');
  const chan = sqSplitBuild(SPLIT_RING_TIERS[0]);
  const shapes: CycleShape[] = [
    {
      key: 'platform',
      zh: '平台',
      en: 'platform',
      spec: plat.spec,
      opts: stepped.opts,
      smooth: stepped.smooth,
      structure: [plat.base, plat.base + stepped.spec[1][1]],
    },
    {
      key: 'channel',
      zh: '通道',
      en: 'channel',
      spec: chan.spec,
      opts: chan.opts,
      smooth: [3, 1],
      seam: chan.marks.center,
      structure: [chan.lead, chan.lead + chan.free],
    },
  ];
  assertOneBand(shapes, CYCLE_BAND, CYCLE_FREE);
  return shapes;
}

/**
 * 词汇表必须在同一条布上：节数相同（否则位置搬不过去）、自由材料总量相同（否则换形时芯的
 * 收缩量不同、带子顶端会跳）。构造期抛错，不悄悄取一边。
 */
export function assertOneBand(shapes: readonly CycleShape[], nodes = nodesOf(shapes[0]?.spec ?? []), free = freeOf(shapes[0]?.spec ?? [])): void {
  if (!shapes.length) throw new Error('词汇表为空');
  for (const s of shapes) {
    if (nodesOf(s.spec) !== nodes) throw new Error(`词汇表「${s.zh}」不在 ${nodes} 节的带上（${nodesOf(s.spec)}）`);
    if (freeOf(s.spec) !== free) throw new Error(`词汇表「${s.zh}」自由材料 ${freeOf(s.spec)} ≠ ${free}：收缩量会与别的形不同`);
  }
}

export function cycleShape(key: CycleShapeKey, shapes: readonly CycleShape[] = cycleShapes()): CycleShape {
  const s = shapes.find((x) => x.key === key);
  if (!s) throw new Error(`词汇表里没有「${key}」`);
  return s;
}

export type CycleState = 'idle' | 'forming' | 'formed' | 'retracting';

/** 0/1 判断的结果：不激活，或激活成某一种形 */
export type CycleDecision = { active: false } | { active: true; shape: CycleShapeKey };

/**
 * 一个单元 = 一条预裁好的布 + 当前驱动它的谱 + 它在循环里的位置。
 * 物理全在 `SkinUnit` 里（正向 `advance` / 回程 `retractStep`），这里只管状态与搬运。
 */
export class SkinCycleUnit {
  readonly shapes: readonly CycleShape[];
  private band: SkinUnit;
  private _state: CycleState = 'idle';
  private _shape: CycleShapeKey | null = null;
  private retractK = 0;
  /** 完成过的循环数（每次从回程回到 idle 加一） */
  cycles = 0;

  constructor(shapes: readonly CycleShape[] = cycleShapes()) {
    assertOneBand(shapes);
    this.shapes = shapes;
    // 起始 = 直带子：按第一张谱建一个从未推进的实例，只借它的节点位置（没有键、没有协议进度）
    this.band = createSkinUnit(shapes[0].spec, shapes[0].opts);
  }

  get state(): CycleState {
    return this._state;
  }
  /** 当前（成形中 / 已成形 / 回程中）的形；idle 时为 null */
  get shape(): CycleShapeKey | null {
    return this._shape;
  }
  get shapeDef(): CycleShape | null {
    return this._shape === null ? null : cycleShape(this._shape, this.shapes);
  }
  /** 当前驱动这条布的引擎实例（渲染读它的 px / py / locked） */
  get unit(): SkinUnit {
    return this.band;
  }
  /** 过渡进度 0–1（forming 按协议步、retracting 按回程步；两个静止态分别 0 / 1） */
  get progress(): number {
    if (this._state === 'forming') return this.band.step / SKIN.STEPS;
    if (this._state === 'retracting') return this.retractK / CYCLE_RETRACT_STEPS;
    return this._state === 'formed' ? 1 : 0;
  }
  get resting(): boolean {
    return this._state === 'idle' || this._state === 'formed';
  }

  /**
   * 落下成形：只从 idle 起。参数 = 判断的结果（这次成什么形）。
   * 新谱建实例、把这条布此刻的位置搬过去（键清空、协议从 0 起），然后整条正向协议跑完。
   */
  deploy(shape: CycleShapeKey): void {
    if (this._state !== 'idle') throw new Error(`只有静止（idle）的单元能落下：现在是 ${this._state}`);
    const def = cycleShape(shape, this.shapes);
    const next = createSkinUnit(def.spec, def.opts);
    next.applyTerminalState({
      px: Float64Array.from(this.band.px),
      py: Float64Array.from(this.band.py),
      locked: [],
      step: 0,
      r: SKIN.R0,
    });
    this.band = next;
    this._shape = shape;
    this._state = 'forming';
  }

  /**
   * 收回：松键回直（引擎 `retractStep`，a 路径）。从 formed 起是常规路；从 forming 中途收回
   * 物理上同样成立（回程从此刻的 r 起），留给策略层用——但 `apply` 不会在过渡中这么做。
   */
  retract(): void {
    if (this._state !== 'formed' && this._state !== 'forming')
      throw new Error(`没有可收回的形：现在是 ${this._state}`);
    this._state = 'retracting';
    this.retractK = 0;
  }

  /**
   * 0/1 判断的接口：只在两个静止态上生效，返回是否发生了转换。
   * - idle + 激活 ⇒ 落下成形（形 = 判断给的）。
   * - formed + 不激活 ⇒ 收回。
   * - formed + 激活成**另一种**形 ⇒ 先收回；等回到 idle 再问一次判断，那时再落成新形
   *   （「重新落下先判断形态」——换形一律走完整的收回 → 落下，不在半空改谱）。
   * - 过渡中（forming / retracting）一律不受理。
   */
  apply(d: CycleDecision): boolean {
    if (this._state === 'idle') {
      if (!d.active) return false;
      this.deploy(d.shape);
      return true;
    }
    if (this._state === 'formed') {
      if (d.active && d.shape === this._shape) return false;
      this.retract();
      return true;
    }
    return false;
  }

  /** 推进一个协议步：forming 走 advance、retracting 走 retractStep；静止态什么都不做。返回当前状态 */
  tick(): CycleState {
    if (this._state === 'forming') {
      this.band.advance();
      if (this.band.done) this._state = 'formed';
    } else if (this._state === 'retracting') {
      this.band.retractStep();
      this.retractK++;
      if (this.retractK >= CYCLE_RETRACT_STEPS) {
        this._state = 'idle';
        this._shape = null;
        this.cycles++;
      }
    }
    return this._state;
  }

  run(steps: number): CycleState {
    for (let k = 0; k < steps && !this.resting; k++) this.tick();
    return this._state;
  }

  /** 把当前过渡跑完（静止态直接返回） */
  settle(): CycleState {
    while (!this.resting) this.tick();
    return this._state;
  }
}
