/**
 * 项目二 · 方形环（Lab.14 的编制）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-08-30 立项：「现在我们环形的单元俯视看是这样圆形的。我想试试看能不能
 * 做出来正方形 长方形的 就是靠外延的长度来做形状」，随后拍板「只有向外扩展的横向
 * 维度被压缩，高度之类的都不变，压缩比例就由把每一条放进方形里具体压缩了多少的
 * 比例来计算」。
 *
 * ## 这台在做什么
 *
 * 筒芯仍是圆的（二十条带绕轴一圈，站位半径不变），靠**每条带挑出多远**把俯视的
 * 外轮廓凑成一个正方形。相位转半格（9°）让四条带正落在四个角上 ⇒ 二十个平台外缘点
 * 全部落在方形的边上；环间膜俯视是弦线，同一条边上两点之间的弦就是那条边本身
 * ⇒ 终态外轮廓精确是方形，不是近似。
 *
 * 20 位 ÷ 正方形的对称性 = **只有三档挑出**（面 8 条 / 边 8 条 / 角 4 条），
 * 所以解三条引擎摆二十处，物理开销与 Lab.09 同量级。
 *
 * ## 「只压横向」怎么落到键谱上
 *
 * - **箱高 H 一圈恒定** ⇒ 嘴键 rb = H/100 三档相同；端面板半跨 = H/4 节
 *   （等长键纪律：板跨 × SEG = 键长 ⇒ 端面必然被拉直）。
 * - **深度由最外梯挡的半跨 kMax 定**，三档各一个 kMax。
 * - **梯挡根数恒定（10 根）、间距按比例压**：整张键位图沿深度等比缩，rb 与端面板
 *   一个数不动 —— 这就是「同一个箱子被横向压扁」。一圈二十条带梯挡数相同
 *   （§13 环上渐变那轮明确把「有两条带比邻居少一根梯挡」当过否决理由）。
 * - **最内那根梯挡钉死在端面板端点**（k = H/4），不跟着比例缩：端面硬投影的触发
 *   条件是「面板端点恰好是锁定键」，缩了就不触发、端面鼓、箱子跑型（下方 §坑 ①）。
 *
 * ## 对齐是构造给的，不是凑的
 *
 * 每档 = [贴合 lead | 垫 p | 隔离 16 | 结构 fs | 隔离 16 | 垫 p | 尾 15]（Lab.12 v4
 * 配平垫先例），垫 + 结构 = F_TOT 恒定。嘴心（从带顶往下量）
 *   mouthY(r) = 2·(lead + ISO) + 2r·(上垫 + (fs−1)/2)，  上垫 + (fs−1)/2 = (F_TOT−1)/2
 * ⇒ 常数项与斜率项都与档位无关，**在每一个 r 上逐位相等**。实测三档 lead 相同、
 * 平台面终态散布 0.0px（全程最差 1.6px），补偿一节都没用上。
 *
 * ## 三个坑（都踩过，图见 scripts/skin-ring/draft.mjs 的 ring-square-h 模式）
 *
 * ① **端面板端点必须是一根锁定的梯挡**。原谱这条自动成立（最内梯挡 17 = 板半跨）；
 *    H 一改板半跨就变，梯挡若按比例缩就对不上 ⇒ 三档端面投影全不触发，端面鼓、
 *    箱子跑型，而键全锁、箱高读数还都对得上（用户看图「跑型了 明显不行」）。
 * ② **箱子必须住得下自己那段自由段**：gap = 自由段在收缩终点的轴向跨度 − H 要为正。
 *    负的时候嘴的上节点被顶到段端、下节点只能伸到段外，下侧缓冲被拉直外翻而上侧
 *    松弛折叠 —— 上下不对称，底部嘴角反向弯（用户看图「绿色底部这个形状咋反了」）。
 *    这条与 Lab.09 那次 x 族失败是同一个约束，当时只推导没落地成守门，于是又踩一次。
 * ③ **对齐不要加旋钮**：曾用「垫的上下不对称分配」去补残差，结果把结构两侧的材料
 *    也弄不对称、形跟着不对称。对称垫本身就精确满足对齐条件（见上），②修好之后
 *    残差自然归零。
 *
 * ## H 的上限由带子总长定
 *
 * 浅档要「住得下」⇒ 它的 kMax 要够大 ⇒ 方形要够大 ⇒ 角档的自由段要够长，而带子
 * 总长钉死 202 节（2026-08-25 用户拍板）。逐档算：H=36 需 127 节、H=38 需 135 节
 * （lead 只剩 20 的硬上限）、H=40 需 141 节（超）。故 **H≈38 是极限，取 36 留余量**。
 * 角档深度因此也不再钉在某个历史值，而是**取带长允许的最大**——方形做大反而让浅档
 * 更容易装下箱子，把角档做小是在为难面档。
 */
import { SKIN, type SkinBond, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { RING, RING_BAND_NODES } from './skin-ring';
import type { RingUnitDef } from './skin-ring';

const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped')!;

export const SQUARE = {
  /** 圈上的单元数（与 Lab.09 同） */
  COUNT: RING.COUNT,
  /** 箱高（px）——一圈恒定，这一族的定义。上限见文件头 */
  H: 36,
  /** 站位半径**钉死**：三档的目标深度是「方形极径 − 站位半径」的绝对量，R 一变全要重标 */
  RADIUS: RING.RADIUS_DEF,
  /** 带深 / 织物厚度：沿用 Lab.09 环族 */
  DEPTH: RING.DEPTH,
  THICK: RING.THICK,
  /** 垫与结构之间的隔离贴合（= 约束最大跨距 ⇒ 结构的动力学不受垫扰） */
  ISO: 16,
  /** 尾段（钉住端那一截；平档用这个值，起伏档按 lead 配平） */
  TAIL: 15,
  /** 尾段下限：实测 lead 32 / tail 5 仍逐位不变，留一点余量 */
  TAIL_MIN: 5,
  /**
   * 贴合段的下限。**8 是实测的，不是拍的**：角档 lead 6…32 全区间剖面偏差 0.000px
   * （挑出/箱高/水平度/键数逐位不变）——垫与结构之间的 ISO 隔离贴合把结构的动力学
   * 与两端分配隔开了。初版按 Lab.09 的经验拍了 20，把起伏幅度低估了三倍（见 SQUARE_WAVE）。
   */
  LEAD_MIN: 8,
  /** 键谱两端缓冲的纪律下限（交接件） */
  BUF_MIN: 4,
  /** 轴向间隙下限：箱子住得下自由段，还留一点过渡（坑②） */
  G_MIN: 6,
  /** 折叠余量下限：缓冲折得起来、不被拉直 */
  E_MIN: 12,
} as const;

/** 梯挡根数 = 现行方箱键位图的根数（10）——一圈恒定 */
export const SQUARE_RUNGS = (STEPPED.spec[1] as readonly ['f', number, readonly SkinBond[]])[2].length;

/** 端面板半跨 = 最内那根梯挡（等长键纪律 + 端面硬投影的触发条件，坑①） */
export const SQUARE_PW = Math.round(SQUARE.H / 4);

/** 自由段 fs 节在收缩终点的轴向跨度（px） */
export function squareSpan(kMax: number, b: number): number {
  return 2 * SKIN.R1 * (2 * (kMax + b) + 1 - 1);
}
/** 轴向间隙 = 自由段跨度 − 箱高。**必须为正**（坑②） */
export function squareGap(kMax: number, b: number): number {
  return squareSpan(kMax, b) - SQUARE.H;
}
/** 折叠余量 = 缓冲材料 4b − 它要跨的轴向间隙（>0 = 折着，<0 = 被拉直） */
export function squareSlack(kMax: number, b: number): number {
  return 4 * b - squareGap(kMax, b);
}
/** 缓冲 b：同时满足「住得下」与「折得起来」的最小值 */
export function squareBuffer(kMax: number): number {
  let b = SQUARE.BUF_MIN;
  while (squareGap(kMax, b) < SQUARE.G_MIN || squareSlack(kMax, b) < SQUARE.E_MIN) b++;
  return b;
}

/** 该档的梯挡半跨表：最内钉死在端面板端点、最外 = kMax，其余均分（根数恒定） */
export function squareLadder(kMax: number): number[] {
  const ks = Array.from({ length: SQUARE_RUNGS }, (_, i) =>
    Math.round(SQUARE_PW + ((kMax - SQUARE_PW) * i) / (SQUARE_RUNGS - 1)),
  );
  return [...new Set(ks)];
}

/** 自由段节数（贴身：结构 + 两侧缓冲，取奇数使扇心落在整数节点上） */
export function squareFree(kMax: number, b: number = squareBuffer(kMax)): number {
  return 2 * (kMax + b) + 1;
}

/** 配平基准 = 三档里最长的那个自由段（角档）——垫把其余两档补到同一总量 */
export function squareFreeTotal(tiers: readonly SquareTier[] = SQUARE_TIERS): number {
  return Math.max(...tiers.map((t) => squareFree(t.k)));
}

export interface SquareTier {
  /** 档名 */
  name: string;
  en: string;
  /** 最外梯挡半跨（= 深度旋钮） */
  k: number;
  /** 一圈里有几条带走这一档 */
  count: number;
}

/**
 * 三档（标定自 scripts/skin-ring/draft.mjs 的 ring-square-h 扫掠，真引擎实测）：
 * 角档取带长允许的最大 kMax，方形由它定；边/面两档按方形几何反推目标深度后搜出。
 * 实测挑出 89.2 / 63.7 / 56.0，外缘点对目标方形 ≤0.9px。
 */
export const SQUARE_TIERS: readonly SquareTier[] = [
  { name: '面', en: 'face', k: 35, count: 8 },
  { name: '边', en: 'edge', k: 39, count: 8 },
  { name: '角', en: 'corner', k: 52, count: 4 },
];

/** 三档实测挑出（px，真引擎终态；守门按它卡，改构造必须同步重标） */
export const SQUARE_REACH: readonly number[] = [56.0, 63.7, 89.2];

/** 平档的贴合段（三档全员同值 ⇒ 对齐的常数项相同） */
export function squareLead(fTotal: number = squareFreeTotal()): number {
  return RING_BAND_NODES - 2 * SQUARE.ISO - fTotal - SQUARE.TAIL;
}

/**
 * 一档的谱：配平垫七段（垫对称——坑③）。
 * `lead` 省略 = 平档那个值（三档相同）；起伏编制按位置传不同的 lead——
 * 那是形状**在带子上的位置**（2px/节，纯平移），实测 lead 6…32 剖面偏差 0.000px、
 * 挑出/箱高/水平度/键数逐位不变，靠的是垫与结构之间那两段 ISO 隔离贴合。
 */
export function squareSpec(
  kMax: number,
  fTotal: number = squareFreeTotal(),
  leadAt: number = squareLead(fTotal),
): SkinSpec {
  const b = squareBuffer(kMax);
  const fs = squareFree(kMax, b);
  const c = (fs - 1) / 2;
  const bonds: SkinBond[] = squareLadder(kMax).map((k) => [c - k, c + k, SQUARE.H / 100]);
  const seg: SkinSeg = ['f', fs, bonds, [[c - SQUARE_PW, c + SQUARE_PW]]];
  const p = (fTotal - fs) / 2;
  const lead = leadAt;
  const tail = RING_BAND_NODES - 2 * SQUARE.ISO - fTotal - lead;
  if (p < 0 || lead < SQUARE.LEAD_MIN || tail < SQUARE.TAIL_MIN)
    throw new Error(`方形环档位越界：k=${kMax} 垫=${p} lead=${lead} tail=${tail}`);
  return p > 0
    ? [['g', lead], ['f', p, []], ['g', SQUARE.ISO], seg, ['g', SQUARE.ISO], ['f', p, []], ['g', tail]]
    : [['g', lead + SQUARE.ISO], seg, ['g', SQUARE.ISO + tail]];
}

/** 三档的引擎定义（同一张方箱的整形选项，只换键谱） */
export function buildSquareUnits(): RingUnitDef[] {
  const fTotal = squareFreeTotal();
  const opts: SkinUnitOpts = skinSiteOpts(STEPPED);
  return SQUARE_TIERS.map((t) => ({
    key: `sq-${t.en}`,
    zh: `${t.name}档`,
    en: t.en,
    spec: squareSpec(t.k, fTotal),
    opts,
    smooth: [3, 1] as const,
  }));
}

/**
 * 相位：半格（= 半个角节距）。不转的话没有带落在 45° 上，四个角就是空的
 * ——转半格后位置 2/7/12/17 正对四个角，二十个外缘点才全部落在方形边上。
 */
export const SQUARE_PHASE = Math.PI / SQUARE.COUNT;

/** 圈上第 i 位的方位角（含相位） */
export function squareAngle(i: number, count: number = SQUARE.COUNT): number {
  return SQUARE_PHASE + (i / count) * Math.PI * 2;
}

/** 方形边界的极径：半边长 a 的正方形在方位角 θ 处的半径 */
export function squareRadiusAt(theta: number, a: number): number {
  return a / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
}

/** 目标方形的半边长（由角档实测挑出反推：角点 = 站位半径 + 角档挑出） */
export function squareHalfSide(reach: readonly number[] = SQUARE_REACH): number {
  return (SQUARE.RADIUS + reach[reach.length - 1]) / Math.SQRT2;
}

/**
 * 二十位编制：每位按自己的方位角，在三档里取目标深度最接近的那一档。
 * 正方形的对称性保证结果恰好是 面 8 / 边 8 / 角 4。
 */
export function buildSquareOrder(count: number = SQUARE.COUNT): number[] {
  const a = squareHalfSide();
  return Array.from({ length: count }, (_, i) => {
    const want = squareRadiusAt(squareAngle(i, count), a) - SQUARE.RADIUS;
    let best = 0;
    for (let t = 1; t < SQUARE_REACH.length; t++)
      if (Math.abs(SQUARE_REACH[t] - want) < Math.abs(SQUARE_REACH[best] - want)) best = t;
    return best;
  });
}

/** 二十个平台外缘点（俯视，世界 XZ）——守门用它卡「落在方形边上」 */
export function squareRimPoints(
  reach: readonly number[] = SQUARE_REACH,
  count: number = SQUARE.COUNT,
): { x: number; z: number; dev: number }[] {
  const a = squareHalfSide(reach);
  const order = buildSquareOrder(count);
  return order.map((t, i) => {
    const th = squareAngle(i, count);
    const rr = SQUARE.RADIUS + reach[t];
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, dev: rr - squareRadiusAt(th, a) };
  });
}

/**
 * ## 一圈起伏（第二种编制，2026-08-30）
 *
 * 与 Lab.09 的起伏同一个旋钮：**同一张键谱、每个位置一个不同的 lead**
 * ——lead 是形状在带子上的位置（2px/节），所以这不是新形态，是把已经验过的
 * 那个旋钮沿圆周排成一条波。方形那一半完全不受影响：挑出由 kMax 定，与 lead 正交。
 *
 * 幅度：实测角档 lead 6…32 全区间剖面偏差 **0.000px**（挑出 89.2 / 箱高 36.0 /
 * 顶底面水平度 0.1 / 键 10 逐位不变，嘴心精确按 2px/节平移）。取对称安全区
 * [12, 32]（中心 22 = 平档那个位置）⇒ 幅度 **40px ≈ 1.1 倍箱高**，与 Lab.09 的
 * 1.29 同量级。这一族比 Lab.09 宽松，是因为垫与结构之间那两段 ISO 隔离贴合把
 * 结构的动力学与两端的分配隔开了——Lab.09 的 `tail ≥ 11` 是在没有这层隔离的
 * 构造上测的，**跨族搬那个下限会把幅度低估三倍**（本轮实测纠正）。
 *
 * 用余弦不用三角波（三角波在最高最低处有折角），20 位回文 ⇒ 11 级。
 * 相位转四分之一圈：不转的话波峰波谷落在正前正后，默认机位下看不出起伏。
 *
 * **注意平台面不再齐平**——那正是这一档要的效果；平档那条「平台面散布 0.0px」
 * 的守门在起伏档下不适用，改卡「形状逐位不变、只有高度在变」。
 */
export const SQUARE_WAVE = {
  LEVELS: 11,
  /** 波谷（lead 大 = 折叠体沿带下移 = 低） */
  LOW: 32,
  /** 波峰（lead 小 = 高）。两端都在实测安全区内且留了余量（实测边界 6 / 32） */
  HIGH: 12,
  /**
   * 相位：**让波的对称轴落在角位上**（位置 2 与 12）。
   * 这不是外观微调，是省一半引擎：深度档关于角位镜像（t(2+d) = t(2−d)），
   * 若波的轴不与它重合，(档, 级) 组合几乎不重复 —— 实测 PHASE=5 要解 19 条带，
   * 对齐后只要 11 条（与 Lab.09 渐变同量级）。视觉上仍是「一圈从最低升到最高
   * 再回来」，只是波谷波峰恰好落在一对对角上。
   */
  PHASE: 18,
} as const;

/** 各级的 lead（0 = 最低，LEVELS−1 = 最高） */
export function squareWaveLeads(): number[] {
  const { LEVELS, LOW, HIGH } = SQUARE_WAVE;
  return Array.from({ length: LEVELS }, (_, l) =>
    Math.round(LOW - (LOW - HIGH) * ((1 - Math.cos((Math.PI * l) / (LEVELS - 1))) / 2)),
  );
}

/** 位置 i 的起伏级（20 位回文 + 相位） */
export function squareWaveLevel(i: number, count: number = SQUARE.COUNT): number {
  const half = SQUARE_WAVE.LEVELS - 1;
  const t = (((i + SQUARE_WAVE.PHASE) % count) / count) * 2;
  const l = Math.round(t * half);
  return l <= half ? l : 2 * half - l;
}

/**
 * 起伏编制：每个位置是 (深度档, 起伏级) 的组合。两者都由位置定，且都关于同一条
 * 轴镜像 ⇒ 组合数远少于 20（实测见守门）。相同组合共用同一条引擎。
 */
export function buildSquareWave(): { units: RingUnitDef[]; order: number[] } {
  const fTotal = squareFreeTotal();
  const leads = squareWaveLeads();
  const tiers = buildSquareOrder();
  const opts: SkinUnitOpts = skinSiteOpts(STEPPED);
  const seen = new Map<string, number>();
  const units: RingUnitDef[] = [];
  const order = Array.from({ length: SQUARE.COUNT }, (_, i) => {
    const t = tiers[i];
    const l = squareWaveLevel(i);
    const key = `${t}:${l}`;
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = units.length;
      seen.set(key, idx);
      units.push({
        key: `sq-${SQUARE_TIERS[t].en}-w${l}`,
        zh: `${SQUARE_TIERS[t].name}档 ${l}/${SQUARE_WAVE.LEVELS - 1}`,
        en: `${SQUARE_TIERS[t].en} ${l}`,
        spec: squareSpec(SQUARE_TIERS[t].k, fTotal, leads[l]),
        opts,
        smooth: [3, 1] as const,
      });
    }
    return idx;
  });
  return { units, order };
}
