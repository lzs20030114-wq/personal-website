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
import { RING } from './skin-ring';
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
  /**
   * **这一族自己的带子总长**（环族那个 `RING_BAND_NODES` 是 202，Lab.09/10/13 仍用它）。
   *
   * 2026-09-02 用户「缝加不了一倍是为什么？带子不够长了吗 那就加长带子呗」——
   * 是。加深缝的三道账里有两道随带长走（自由段要装得下更高的箱 · 满裂档的挑出上限
   * `≤ F/2 − BUF_MIN − H/4`），只有 E_MAX 那道不随。实测每多要 4px 的缝，
   * 带子要长约 11–12 节：缝 32 要 202 · 36 要 216 · **48（= 原来 24 的两倍）要 250**。
   * 取 250 ⇒ 捏分编制能做到缝 48，且平台高度回到与平档只差 1.6px（不用再牺牲 tail）。
   *
   * **只改这一族**（Lab.14 的三种编制共用它）：Lab.09/10/13 仍是 202——Lab.10 的
   * 房间与人的比例是从吊件总长推出来的（§14.5），跟着改要重新推整套场景尺寸，
   * 不在这次的范围里。代价是 Lab.14 的筒比 Lab.09/13 高 24%，机位各自重取。
   *
   * 各编制的**形状在带子上的高度不变**：那由 `TAIL` 与 F_TOT 定（`2(尾+ISO) + r(F−1)`），
   * 与总长无关；加长的部分全部进 `lead`（平档 22 → 70），即筒的上半截是更长的素管。
   */
  BAND: 250,
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
  /**
   * 折叠余量**上限**（2026-09-01 加深缝那轮实测发现，此前这一族只有下限）。
   * 缓冲里的富余布料太多时，折叠体会**沿轴整体浮起来**、下方那截布料被拉成直线：
   * 剖面、箱高、水平度、锁定数**全都照样合格**，只有「缝心离下缘」跳三十来 px
   * ——一圈里各档浮的量不同，平台就不平了。
   * 实测阈值很干脆（缓冲 b≤9 干净 / b=10 就浮，三个箱高上各测一次）：
   *   H68 k52 富余 33.6 浮 · k53 29.6 干净；H72 k55 34 浮 · k56 30 干净；
   *   H76 k59 33.2 浮 · k60 29.2 干净；H80 k62 33.6 浮 · k63 29.6 干净。
   * 取 31 落在两侧之间。平档全表最大富余 22.0（k28），不受影响。
   *
   * **它是「箱高 ↔ 方形大小」的真正联系**：箱越高，浅档要的缓冲越多，
   * 于是最外那根梯挡必须更深才压得住富余 ⇒ 方形被顶大。
   */
  E_MAX: 31,
} as const;

/** 梯挡根数 = 现行方箱键位图的根数（10）——一圈恒定 */
export const SQUARE_RUNGS = (STEPPED.spec[1] as readonly ['f', number, readonly SkinBond[]])[2].length;

/** 端面板半跨 = 最内那根梯挡（等长键纪律 + 端面硬投影的触发条件，坑①） */
export const SQUARE_PW = Math.round(SQUARE.H / 4);
/** 同上，但按给定箱高算——捏分编制用比平档高的箱（默认 = 平档，逐位不变） */
export const squarePw = (h: number = SQUARE.H): number => Math.round(h / 4);

/** 自由段 fs 节在收缩终点的轴向跨度（px） */
export function squareSpan(kMax: number, b: number): number {
  return 2 * SKIN.R1 * (2 * (kMax + b) + 1 - 1);
}
/**
 * 轴向间隙 = 自由段跨度 − 箱高。**必须为正**（坑②）。
 * `h` 省略 = 平档箱高；捏分编制用更高的箱（2026-09-01 用户「整体厚一些」），
 * 传入它自己那个高度 ⇒ 平档路径逐位不变。
 */
export function squareGap(kMax: number, b: number, h: number = SQUARE.H): number {
  return squareSpan(kMax, b) - h;
}
/** 折叠余量 = 缓冲材料 4b − 它要跨的轴向间隙（>0 = 折着，<0 = 被拉直） */
export function squareSlack(kMax: number, b: number, h: number = SQUARE.H): number {
  return 4 * b - squareGap(kMax, b, h);
}
/** 缓冲 b：同时满足「住得下」与「折得起来」的最小值；富余超上限即拒绝（见 E_MAX） */
export function squareBuffer(kMax: number, h: number = SQUARE.H): number {
  let b = SQUARE.BUF_MIN;
  while (squareGap(kMax, b, h) < SQUARE.G_MIN || squareSlack(kMax, b, h) < SQUARE.E_MIN) b++;
  if (squareSlack(kMax, b, h) > SQUARE.E_MAX)
    throw new Error(`缓冲富余 ${squareSlack(kMax, b, h).toFixed(1)} 超上限 ${SQUARE.E_MAX}（k=${kMax} 箱高=${h}）：折叠体会沿轴浮起来`);
  return b;
}

/** 该档的梯挡半跨表：最内钉死在端面板端点、最外 = kMax，其余均分（根数恒定） */
export function squareLadder(kMax: number, pw: number = SQUARE_PW): number[] {
  const ks = Array.from({ length: SQUARE_RUNGS }, (_, i) =>
    Math.round(pw + ((kMax - pw) * i) / (SQUARE_RUNGS - 1)),
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
 * ## 深度表：最外梯挡半跨 kMax → 挑出（px）
 *
 * 真引擎实测（scratchpad 扫掠，共用配平基准 F_TOT / lead ⇒ 与站上逐位同构），
 * 两列分别是**终态**（平台伸到哪）与**全程峰值**（阵列格距按它定，见 §阵列）。
 *
 * - **下界 k=28 是实测的**：H 恒 36 ⇒ 自由段轴向跨度要够住得下箱子（gap ≥ G_MIN）
 *   ⇒ k 越小缓冲 b 被顶得越高（k30 时 b=5，k20 时 b=15），多出来的松料把嘴心
 *   拽偏 30px、顶底面水平度从 0.13 掉到 0.9。k28 起嘴心才稳定。
 * - **上界 k=52 是带长定的**：贴身自由段 2(k+b)+1 要装得进 F_TOT=133。
 * - **嘴心全表散布 0.26px** —— 这正是「换 kMax 不改平台高度」的硬证据，
 *   也是圆↔方能做成一组档位、切档时平台不跳的前提。
 */
export const SQUARE_DEPTH = {
  /** 表的首个 kMax */
  KLO: 28,
  /** 终态挑出（px），下标 = kMax − KLO */
  REACH: [
    44.2, 45.5, 46.8, 48.4, 50.5, 52.5, 54.1, 56.0, 57.8, 59.9, 61.6, 63.7, 65.5,
    68.0, 70.2, 71.9, 74.1, 75.8, 77.9, 79.6, 81.4, 83.5, 85.3, 87.3, 89.2,
  ],
  /** 全程峰值挑出（px，成形期鼓出的那一下） */
  PEAK: [
    45.5, 47.4, 49.4, 51.1, 52.6, 54.3, 56.7, 58.5, 60.3, 62.3, 64.0, 66.0, 67.9,
    70.0, 72.0, 73.7, 75.7, 77.6, 79.5, 81.5, 83.1, 85.0, 87.1, 89.1, 90.7,
  ],
} as const;

/** 表内最大 kMax */
export const SQUARE_KHI = SQUARE_DEPTH.KLO + SQUARE_DEPTH.REACH.length - 1;

function depthAt(col: readonly number[], k: number): number {
  const i = k - SQUARE_DEPTH.KLO;
  if (i < 0 || i >= col.length) throw new Error(`方形环深度表越界：k=${k}（表 ${SQUARE_DEPTH.KLO}–${SQUARE_KHI}）`);
  return col[i];
}
/** 该 kMax 的终态挑出 */
export function squareReachOf(k: number): number {
  return depthAt(SQUARE_DEPTH.REACH, k);
}
/** 该 kMax 的全程峰值挑出 */
export function squarePeakOf(k: number): number {
  return depthAt(SQUARE_DEPTH.PEAK, k);
}
/** 反查：挑出最接近目标的那个 kMax（并列时取小的 ⇒ 端点复现档案值） */
export function squareDepthK(want: number): number {
  let best: number = SQUARE_DEPTH.KLO;
  for (let k = SQUARE_DEPTH.KLO + 1; k <= SQUARE_KHI; k++)
    if (Math.abs(squareReachOf(k) - want) < Math.abs(squareReachOf(best) - want)) best = k;
  return best;
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

/** 三档实测挑出（px，真引擎终态）——**查深度表**，不再另抄一份数 */
export const SQUARE_REACH: readonly number[] = SQUARE_TIERS.map((t) => squareReachOf(t.k));

/** 平档的贴合段（三档全员同值 ⇒ 对齐的常数项相同） */
export function squareLead(fTotal: number = squareFreeTotal()): number {
  return SQUARE.BAND - 2 * SQUARE.ISO - fTotal - SQUARE.TAIL;
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
  h: number = SQUARE.H,
): SkinSpec {
  const b = squareBuffer(kMax, h);
  const fs = squareFree(kMax, b);
  const c = (fs - 1) / 2;
  const pw = squarePw(h);
  const bonds: SkinBond[] = squareLadder(kMax, pw).map((k) => [c - k, c + k, h / 100]);
  const seg: SkinSeg = ['f', fs, bonds, [[c - pw, c + pw]]];
  return squareWrap(seg, fTotal, leadAt, `k=${kMax}`).spec;
}

/**
 * 七段谱包装（对位构造 v4 的配平垫）——**平档与捏分档共用这一份**。
 * `[贴合 lead | 垫 p | 隔离 ISO | 结构 | 隔离 ISO | 垫 p | 尾 tail]`，垫对称（坑③），
 * 垫 + 结构 = fTotal 恒定 ⇒ 嘴心 = 2(lead+ISO) + 2r·(fTotal−1)/2 与档位无关。
 * 返回 `base` = 结构段的绝对起点（读数窗口与 marks 用，别从垫上量）。
 */
export function squareWrap(
  seg: SkinSeg,
  fTotal: number = squareFreeTotal(),
  leadAt: number = squareLead(fTotal),
  who = '',
): { spec: SkinSpec; base: number } {
  const fs = seg[1];
  const p = (fTotal - fs) / 2;
  const lead = leadAt;
  const tail = SQUARE.BAND - 2 * SQUARE.ISO - fTotal - lead;
  if (p < 0 || lead < SQUARE.LEAD_MIN || tail < SQUARE.TAIL_MIN)
    throw new Error(`方形环档位越界：${who} 垫=${p} lead=${lead} tail=${tail}`);
  if (p % 1 !== 0) throw new Error(`配平垫 ${p} 非整数（自由段应为奇数）：${who}`);
  return p > 0
    ? {
        spec: [['g', lead], ['f', p, []], ['g', SQUARE.ISO], seg, ['g', SQUARE.ISO], ['f', p, []], ['g', tail]],
        base: lead + p + SQUARE.ISO,
      }
    : { spec: [['g', lead + SQUARE.ISO], seg, ['g', SQUARE.ISO + tail]], base: lead + SQUARE.ISO };
}

/** 三档的引擎定义（同一张方箱的整形选项，只换键谱） */
export function buildSquareUnits(tiers: readonly SquareTier[] = SQUARE_TIERS): RingUnitDef[] {
  const fTotal = squareFreeTotal();
  const opts: SkinUnitOpts = skinSiteOpts(STEPPED);
  return tiers.map((t) => ({
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
 * 第 i 位属于哪一档——**按方位角到最近坐标轴的角距现算**，不看深度。
 * 正方形（以及任何一条 D4 对称的轮廓线）都只有三类方位：把角折进 [0°,45°]，
 * 二十位给出 9° / 27° / 45°（= 面 8 / 边 8 / 角 4）。
 *
 * 早先这里是「在三档挑出里取最接近的那个」——对方形等价，但**圆那一档三档挑出
 * 相同、最接近是并列的**，圆↔方那组档位就靠不住了。守门里仍留着旧那套几何反查
 * 作为对照（两者对方形必须逐位一致）。
 */
export function squareClassOf(i: number, count: number = SQUARE.COUNT): number {
  const step = (Math.PI * 2) / count;
  const q = ((squareAngle(i, count) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  return Math.round(Math.min(q, Math.PI / 2 - q) / step - 0.5);
}

/** 二十位编制：每位一个档号（面 0 / 边 1 / 角 2） */
export function buildSquareOrder(count: number = SQUARE.COUNT): number[] {
  return Array.from({ length: count }, (_, i) => squareClassOf(i, count));
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
  /**
   * 波谷（lead 大 = 折叠体沿带下移 = 低）。
   * **2026-09-02 随带长 202 → 250 整体上移 48**（幅度 40px 与两端间距一字未改，
   * 中心仍等于平档的 lead ⇒ 切编制时平台的平均高度不跳）。安全区那条实测结论
   * （lead 6…32 剖面偏差 0.000px）靠的是垫与结构之间的 ISO 隔离，与 lead 的绝对值
   * 无关；新区间 60…80 由守门「形状逐点相同、只是整体平移」逐级核对。
   */
  LOW: 80,
  /** 波峰（lead 小 = 高） */
  HIGH: 60,
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
export function buildSquareWave(
  depths: readonly SquareTier[] = SQUARE_TIERS,
): { units: RingUnitDef[]; order: number[] } {
  const fTotal = squareFreeTotal();
  const leads = squareWaveLeads();
  const tiers = buildSquareOrder();
  const opts: SkinUnitOpts = skinSiteOpts(STEPPED);
  const seen = new Map<string, number>();
  const units: RingUnitDef[] = [];
  const order = Array.from({ length: SQUARE.COUNT }, (_, i) => {
    const t = tiers[i];
    const l = squareWaveLevel(i);
    // 去重键取**真正决定引擎的那两个量**（深度 + 位置），不是 (档号, 级号)：
    // 圆那一档三档 kMax 相同，而余弦波的波峰波谷各有两级取整后 lead 相同
    // ⇒ 按档号去重会留下两条一模一样的引擎白跑（实测圆档 11 → 9）。
    // 另外四档 (k, lead) 与 (档号, 级号) 一一对应，故单元表逐位不变。
    const key = `${depths[t].k}:${leads[l]}`;
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = units.length;
      seen.set(key, idx);
      units.push({
        key: `sq-${depths[t].en}-w${l}`,
        zh: `${depths[t].name}档 ${l}/${SQUARE_WAVE.LEVELS - 1}`,
        en: `${depths[t].en} ${l}`,
        spec: squareSpec(depths[t].k, fTotal, leads[l]),
        opts,
        smooth: [3, 1] as const,
      });
    }
    return idx;
  });
  return { units, order };
}

/**
 * ## 4×4 阵列（第二组控件「排布」，2026-08-30）
 *
 * 与 Lab.10 的圆环阵列是同一件事，但**格距的账不一样**——圆环的外缘处处等距，
 * 方形环没有：
 * - 终态下边对边与角对角**恰好一样紧**（都是 2a）；
 * - 但**过程中面档鼓得比角档多**（实测峰值 面 +2.5 / 边 +2.3 / 角 +1.5），
 *   于是峰值口径下**边对边更紧**（177 vs 角对角 170.7）——格距按它定。
 * 所以这里不能套 skin-grid 的 `ringOuter(radius) = radius + PEAK_REACH`（那是圆的）。
 *
 * 缝照 Lab.10 的规则给（环间缝 = 1.5 × 环内平台外缘的带间缝），但取**最紧处**
 * ——面档那个方位，不是角档：一圈里最容易挤上的是面对面。
 *
 * **相位一律相同**：试过隔格转 45° 让角对着邻格的边，实测最近距离反而从 168.6
 * 变成 203.5（a + a√2）——正方形阵列里同相位最省地方。
 */
/** 三档全程峰值挑出（px，真引擎实测；终态是 56.0 / 63.7 / 89.2）——同样查表 */
export const SQUARE_PEAK: readonly number[] = SQUARE_TIERS.map((t) => squarePeakOf(t.k));

/** 峰值口径下的最紧外缘半径 = 面档那个方位（决定边对边） */
export function squareTightRadius(): number {
  return SQUARE.RADIUS + SQUARE_PEAK[0];
}

/** 环间净缝：照 Lab.10 的比值规则，取最紧处的带间缝 */
export function squareCellGap(): number {
  const rho = squareTightRadius();
  return 1.5 * ((2 * Math.PI * rho) / SQUARE.COUNT - SQUARE.DEPTH);
}

/** 格距 = 边对边（2 × 最紧外缘）+ 缝 */
export function squareCellPitch(): number {
  return 2 * squareTightRadius() + squareCellGap();
}

export const SQUARE_GRID = { COLS: 4, ROWS: 4 } as const;

/**
 * 峰值口径下的角点半径。**角档的带子本来就指向 45°，它的外缘点就是方形的角**
 * ——不要再乘 √2（那是「半边长 → 角点」的换算，这里不适用；初版就这么错过一次，
 * 把对角约束算成 241.4、结论也跟着反了）。
 */
export function squareCornerRadius(): number {
  return SQUARE.RADIUS + SQUARE_PEAK[SQUARE_PEAK.length - 1];
}

/**
 * 整片阵列在一个方向上的占宽（含两端环的角点——包围盒由角点定，不是边）。
 * 顺带记下两条约束的比较：边对边要 pitch ≥ 2×88.5 = 177，对角相邻要
 * pitch·√2 ≥ 2×120.7 ⇒ pitch ≥ 170.7 —— **边对边更紧**，格距按它定。
 */
export function squareGridSpan(cols: number = SQUARE_GRID.COLS): number {
  return (cols - 1) * squareCellPitch() + 2 * squareCornerRadius();
}

/** 十六个格子的站位（阵列以原点居中） */
export function squareGridCells(
  cols: number = SQUARE_GRID.COLS,
  rows: number = SQUARE_GRID.ROWS,
): { x: number; z: number; plan: number }[] {
  const pitch = squareCellPitch();
  const out: { x: number; z: number; plan: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: (c - (cols - 1) / 2) * pitch, z: (r - (rows - 1) / 2) * pitch, plan: 0 });
  return out;
}

/**
 * ## 圆 ↔ 方（第三组控件「轮廓」，2026-08-31）
 *
 * 同一族的第三个旋钮，仍然只动**每条带挑出多远**——用户立项时那句「靠外延的
 * 长度来做形状」的直接推论：把目标轮廓从正方形换成**超椭圆** |x|ⁿ+|z|ⁿ = aⁿ，
 * n=2 是圆、n→∞ 是方，中间是圆角方。键谱、箱高、梯挡根数、对位构造一个数不动。
 *
 * ### 固定的是内切圆，不是外接圆
 *
 * 半边长 a（= 方形那档的内切圆半径 84.3）全程不变 ⇒ **面档几乎不动**
 * （挑出 54.1 → 56.0），**角往外长**（54.1 → 89.2）。读起来就是「一个圆的四个角
 * 被推出去变成方」，而不是整个平台忽大忽小。另两种取法（固定外接圆 / 固定面积）
 * 都会让圆比方明显大一圈或小一圈，形状之外还多出一个尺寸变化，反而读不清。
 *
 * ### 五档怎么取的
 *
 * 按**角点半径线性**推进（不是按 n 线性——n 的尾巴很长，等分 n 会让后两档几乎
 * 看不出差别）：R_corner(u) = a·(1 + u·(√2−1))，而超椭圆的角点半径恰好是
 * a·2^(1/2 − 1/n) ⇒ 反解 n(u) = 1 / (1/2 − log₂(1 + u(√2−1)))。
 * 实测得到的角档 kMax 是 **34 / 39 / 43 / 47 / 52**（Δ 5·4·4·5），逐级几乎等距。
 *
 * ### 切档时平台不跳
 *
 * 五档共用同一个配平基准 F_TOT ⇒ lead 恒定 ⇒ 嘴心与 kMax 无关（深度表实测
 * 全表散布 0.26px）。这是圆↔方能做成一组档位的前提：切档只换轮廓，不换高度。
 *
 * ### 端点复现
 *
 * 末档（n=∞）反查出来的三档 kMax 必须逐位等于 SQUARE_TIERS（35/39/52）——
 * 那是用户逐轮看图拍板过的方形，守门直接卡这条（Lab.08 端点同一断言的先例）。
 */
export const SQUARE_MORPH = {
  /** 档数（含两端） */
  STEPS: 5,
  /**
   * 控件标签（用户 2026-09-01 拍板）。初版中间三档只标 1/2/3——序号读不出是什么形状，
   * 而这一组按钮的全部意义就是形状。现在按「离方形还有多远」命名：
   * 圆 (n=2) · 微方 (2.8) · 半方 (4.4) · 近方 (9.1) · 方 (n→∞)。
   */
  LABELS: ['圆', '微方', '半方', '近方', '方'] as const,
  /** 默认停在方形档（= 这台立项时的那个形状） */
  DEF: 4,
} as const;

/** 第 step 档的超椭圆指数（末档 = Infinity，即正方形） */
export function squareMorphExp(step: number, steps: number = SQUARE_MORPH.STEPS): number {
  const u = step / (steps - 1);
  if (u >= 1) return Infinity;
  return 1 / (0.5 - Math.log2(1 + u * (Math.SQRT2 - 1)));
}

/** 第 step 档的轮廓在方位角 θ 处的极径（半边长 a 固定） */
export function squareMorphRadiusAt(
  theta: number,
  step: number,
  a: number = squareHalfSide(),
  steps: number = SQUARE_MORPH.STEPS,
): number {
  const n = squareMorphExp(step, steps);
  if (!Number.isFinite(n)) return squareRadiusAt(theta, a);
  const c = Math.abs(Math.cos(theta));
  const t = Math.abs(Math.sin(theta));
  return a / Math.pow(Math.pow(c, n) + Math.pow(t, n), 1 / n);
}

/** 第 step 档的三档深度（档名沿用面/边/角——它们是方位类，不随轮廓变） */
export function squareMorphTiers(
  step: number,
  count: number = SQUARE.COUNT,
  steps: number = SQUARE_MORPH.STEPS,
): SquareTier[] {
  const a = squareHalfSide();
  const order = buildSquareOrder(count);
  return SQUARE_TIERS.map((t, c) => {
    const i = order.indexOf(c);
    const want = squareMorphRadiusAt(squareAngle(i, count), step, a, steps) - SQUARE.RADIUS;
    return { name: t.name, en: t.en, k: squareDepthK(want), count: order.filter((q) => q === c).length };
  });
}

/** 第 step 档的三档挑出（查表） */
export function squareMorphReach(step: number, count: number = SQUARE.COUNT): number[] {
  return squareMorphTiers(step, count).map((t) => squareReachOf(t.k));
}

/**
 * 第 step 档的二十个平台外缘点（俯视，世界 XZ）+ 对目标轮廓线的偏差。
 * 守门用它卡「外缘点落在轮廓线上」——偏差 = 深度表离散化的量化误差（≤1px）。
 */
export function squareMorphRim(
  step: number,
  count: number = SQUARE.COUNT,
): { x: number; z: number; dev: number }[] {
  const a = squareHalfSide();
  const reach = squareMorphReach(step, count);
  return buildSquareOrder(count).map((t, i) => {
    const th = squareAngle(i, count);
    const rr = SQUARE.RADIUS + reach[t];
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, dev: rr - squareMorphRadiusAt(th, step, a) };
  });
}

/**
 * 阵列格距对所有轮廓档都够用吗？——**格距不随轮廓档变**（站位是场地的属性，
 * 切轮廓时格子不该重排），故这里给出每档在格子方向（±X / ±Z）上的最大外伸，
 * 守门卡它不超过方档那个最紧值。方档最紧的是面档（88.5 × cos9° = 87.4），
 * 圆档处处 86.7、角档虽远但指着 45° ⇒ 都比它松。
 */
export function squareMorphExtent(step: number, count: number = SQUARE.COUNT): number {
  const tiers = squareMorphTiers(step, count);
  const order = buildSquareOrder(count);
  let m = 0;
  for (let i = 0; i < count; i++) {
    const rho = SQUARE.RADIUS + squarePeakOf(tiers[order[i]].k);
    m = Math.max(m, Math.abs(Math.cos(squareAngle(i, count))) * rho);
  }
  return m;
}
