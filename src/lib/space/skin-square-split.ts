/**
 * 项目二 · 方形环的第三种编制「捏分」（Lab.14）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-09-01 立项并逐项拍板：收方形小一圈 · 终态缝 12 · 边档 t=0.5 · 角档实心箱。
 *
 * ## 这一编制在做什么
 *
 * 沿圆周走一个「单箱 → 开缝 → 裂成两台 → 合拢」的来回，而俯视轮廓仍然是方的。
 * 二十位的档序 = 方形自己的三个方位类（面 8 / 边 8 / 角 4），故一圈**四个来回**：
 *   … 边 面 面 边 │ 角 │ 边 面 面 边 │ 角 │ …
 *
 * ## 两条推翻上一轮否决的发现（2026-09-01 审计，细节见 项目二_皮肤单元lab.md §17.9）
 *
 * ① **总高钉死、缝宽换台高**（`lobe = (H − w)/2`），不是捏分族原来的「台高钉死、
 *    总高随缝涨」。终态那两片台的高度与原捏分逐位相同（各 12），只是缝从 28 收到 12，
 *    于是总高恰好等于方形族的 36 ⇒ 一圈上下缘齐平，「只压横向、高度不变」的族定义不破。
 *    用 Lab.14 守门自己的口径实测：三档箱高全 36.00（散布 0.00）、顶底面水平度
 *    0.07–0.28（守门线 <1.5，平档自己 0.13–0.15）。
 * ② **预算不是 107**：那是 Lab.12 自己的分配（lead 8 / tail 53 / 200 节带）；方形环在
 *    202 节带上本来就有 **133**（lead 22 / tail 15），带子一节不用加长。
 *    （2026-09-01 第二轮把缝加深后，这一编制改用自己那份分配 F_TOT 149 / lead 8 /
 *      tail 13 —— 仍是同一条 202 节的带子，只是重新分配；见 `SQSPLIT.F_TOT`。）
 *
 * ## 材料账：为什么必须是 4 重，且缝只能在面档最深
 *
 * 结构半跨（节，1 节 = 2px 织物）：`M = 挑出/2 + 台高/2 + 缝深/2 + 缝尖宽/4`；
 * 缓冲要跨过「自由段轴向跨度 − 箱高」并留折叠余量 e ⇒ `M ≤ (1.4·F + H − 1.4 − e)/4`。
 * 满裂（缝深 = 箱深 = D）时 `M = D + H/4`，**H 在两边抵消** ⇒ 满裂的设计深度上限
 * `D ≤ (1.4·F − 1.4 − e)/4 = 43.2px`，与箱高、与缝宽都无关。
 * （这条非显然的抵消由引擎证实：恒高与变高两条路线的面档天花板同为挑出 47.1、
 *   方形同为边长 152 —— 变高只多出一圈 ±14px 的上下缘起伏，什么也换不来。）
 *
 * ⇒ 挑得远与缝得深抢同一份材料，故**最深的角档只能是实心箱、最浅的面档才裂得开**
 * （注意与立项时的猜想相反）。实测角档最多吃到切进 24%，且切进 6% 以上箱高就从 36
 * 漂到 39.6，故角档取实心箱（用户拍板）。
 *
 * ## 「一圈只一个来回」（10 级，Lab.13 那种读法）已实测否决
 *
 * 它要求角上也带深缝 ⇒ 角档挑出压到 ≤53 ⇒ 方形只能到边长 118；而那时面档挑出只剩
 * 29.5，箱才 18px 深却要开 12–15px 的缝并切到底，**渲出来是楔形不是两片台**
 * （剪影Δ 11.5，本编制是 0.19–3.35）。根子是方形自己的角/面挑出比 0.55。
 * 所以 4 重不是选择，是这条比值定的——理由是「形不对」，不是「装不下」。
 *
 * ## 已知瑕疵（上站时如实带着）
 *
 * **全程对位**：同一组检查点下平档三档散布 0.2/0.5/2.5/0.2/0.1/0.1px（族守门线 2.5），
 * 本编制是 9.2/14.9/11.6/7.2/2.3/2.3 —— 成形中段面档滞后，峰值是守门线的 6 倍，
 * 到 step 1000 收敛，终态那一格（2.3）是过的。这是**成形过程**的账（§16.4：Lab.12
 * 当初也是先定终态形、再单独做一轮成形设计），守门按实测钉住、不放宽族的那条线。
 */
import { SKIN_ROOT_FIX, type SkinBond, type SkinPanel, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { skinSiteOpts, SKIN_UNITS } from './skin-data';
import {
  SQUARE, SQUARE_RUNGS, buildSquareOrder, squareAngle, squareBuffer,
  squareFree, squarePw, squareSpec, squareWrap,
} from './skin-square';
import type { RingUnitDef } from './skin-ring';

const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped')!;

export const SQSPLIT = {
  /**
   * **箱高** = 两片台（各 22）+ 缝（32）。这一档单独用 76，平档是 36。
   *
   * 来历分两步。① 2026-09-01「整体厚一些…大概收缩到最多的时候也要有这么厚」（截图红线
   * ≈69）⇒ 36 → 68。**不是等比放大**：一条带的布料钉死 202 节而形的周长跟着放大倍数长，
   * 等比 g=1.05 就爆预算（结构自由段 141 > 133）；而**只长高几乎不花钱**——箱高在材料账
   * 两边同时出现（箱高涨 ⇒ 自由段留给缓冲的间隙变小 ⇒ 所需缓冲变少），正好抵消：
   * `M ≤ (1.4F + H − 1.4 − e)/4` 与 `M = 挑出/2 + 缝深/2 + H/4` 的 H 项同斜率。
   * ② 同日「维持上下两个平台高度不变，中间的空间再加高 1 倍」⇒ 台高钉死 22×2、缝 24 → 32。
   *
   * **加一倍（缝 48 / 箱高 92）做不到**。三道账夹着这个数，H 每涨一档就要多付一样东西：
   *  · 布料：自由段在收缩终点的轴向跨度只有 `0.6·(F−1)`，箱子要住得进去（间隙 ≥ G_MIN）
   *    ⇒ `H ≤ 0.6·(F_TOT−1) − 6`。F=133（平档那份）给 73.2、F=149 给 82.8、F=157（榨干）
   *    给 87.6；92 要 164 节自由段，而 202 节的带子最多给 157（lead 8 / tail 5）。
   *  · **缓冲富余上限**（`SQUARE.E_MAX`，这一轮才发现）：箱越高，浅档要的缓冲越多，
   *    富余一过 31 折叠体就沿轴浮起来 —— 剖面/箱高/水平度/锁定数全绿而**平台不平了**
   *    （H=82 实测三档缝心 101/134/134，散布 33px）。压住富余就得让最外梯挡更深
   *    ⇒ **角档的挑出有下限**（H68 ≥78.9 · H72 ≥82.7 · H76 ≥88.6 · H80 ≥92.6）⇒ 方形被顶大。
   *  · 而**面档（满裂那一档）的挑出有上限**：满裂时 M ≈ 挑出 + H/4，而 M ≤ F/2 − BUF_MIN
   *    ⇒ `挑出 ≤ F/2 − 4 − H/4`。箱越高这条越紧、角档那条越松 —— 两条对着走，
   *    代进方形的角/面比（`挑出角 = √2·cos9°·(挑出面 + R) − R`）就解出 H 的上限；
   *    它随 F 走：**F=149 ⇒ H ≤ 73.5 · F=157 ⇒ H ≤ 77.1**。再加上「H 必须是 4 的倍数」
   *    （端面板半跨 = H/4 节，等长键纪律要它是整数）⇒ F=149 只能到 72、F=157 能到 **76**。
   *    实测印证：F=149/H=76 时面档最深只到 50.5（⇒ 边长 ≤159）而角档最浅 88.6（⇒ ≥168），
   *    两个区间没有交集，最好的组合外缘偏差也有 2.62px。
   * ⇒ 取 **F=157 / H=76 / 缝 32（1.33×）**。代价写在 `F_TOT` 那条：这一编制的平台比平档
   *    低 12.8px。换来的不只是缝：外缘偏差 1.31 → 0.86、全程对位散布 14.9 → 3.3
   *    （原来那条已知瑕疵基本消掉）、方形 153 → 167 ≈ 平档的 169。
   */
  H: 76,
  /**
   * 终态缝宽。`lobe = (H − w)/2` ⇒ 两片台各 22（与 68/24 那一版逐位相同——用户要的
   * 「维持上下两个平台高度不变」就是这个），缝 24 → 32。缝宽本身不进材料账
   * （台高与缝在 M 里合成 H/4），真正的天花板是上面那三条。
   */
  W_END: 32,
  /**
   * **这一编制自己的带子分配**（平档是 F_TOT 133 / lead 22 / tail 15）。
   * 缝要更深就得让自由段更长，而 202 节的带子只能重新分：`lead + 16 + F + 16 + tail = 202`。
   * 取 **F=157 / lead=8（贴合段下限）/ tail=5（尾段下限）** —— 把带子榨到底。
   *
   * **代价（如实带着）**：缝心离下缘 = `2(tail+ISO) + r(F−1)`，终态 r=0.3 ⇒
   * 平档 101.6 / 本档 **88.8**，这一编制的平台整体低 **12.8px**（带子全长约 340px 的 4%）。
   * 切编制时会看到平台落得低一点——两种编制本来就是各跑各的（换编制走 setUnits 重建、
   * 从头收缩），不会在动画中途跳。**编制内部的对位仍然是构造精确给的**（三档共用这一份）。
   * 保住对齐的那一档（F=149 / tail=13 / 平台差 0.8px）只能到 H=72、缝 28，
   * 而且外缘偏差要放到 2.6px —— 少 4px 的缝、方形还更歪，不值。
   */
  F_TOT: 157,
  LEAD: 8,
  /** 边档的形态位置（拍板 0.5：缝开到一半、切进 44%，Δ 最干净）。
   *  可用区间不宽：0.35 箱高失准到 40.4、0.65 形崩到 Δ16.7。 */
  EDGE_T: 0.5,
  /** 吸引近程门。**2.5 是本族实测值，不是从 Lab.12 搬的 1.5**——搬过来反而造出卷钩
   *  （环 45 @step471，上半瓣单侧卷；2.0/2.5 → 环 0）。门限按键长倍数算，而本族键长
   *  只有 H=36px，1.5 倍才 54px、比箱子自己（36 高 × 47 深）还小，把正当吸引一起掐了。
   *  教训：跨族搬实测值前先在本族测一次。 */
  ATT_NEAR: 2.5,
  /** 缝壁键的节距（0 = 只留嘴键与底键） */
  WALL_STEP: 2,
} as const;

/** 形态时间表（沿用捏分族原式）：缝宽张得快 · 缝深退得稳 · 缝尖宽/缝嘴宽 */
export const sqSplitSeamW = (t: number, wEnd: number = SQSPLIT.W_END): number => wEnd * Math.pow(t, 0.7);
export const sqSplitSink = (t: number, D: number): number => D * Math.pow(t, 1.2);
export const sqSplitTip = (t: number): number => 0.4 + 0.6 * t;
/** 缝宽换台高 ⇒ 2·台高 + 缝 = H 恒定 */
export const sqSplitLobe = (t: number, wEnd: number = SQSPLIT.W_END): number => (SQSPLIT.H - sqSplitSeamW(t, wEnd)) / 2;

/**
 * 缓冲：折得起来（余量 ≥ E_MIN）且住得下（间隙 ≥ G_MIN）。
 * 与 `squareBuffer` 是同一条规则，只是那边按 kMax 解、这边按结构半跨 M 解。
 * **本族必须解缓冲**：Lab.12 自己不解（BUF 固定 4），那套在 H=52 时余量尚有 9.2，
 * 换到 H=36 会变成 −11.6（缓冲被拉直，§17.3 坑②）。
 */
export function sqSplitBuffer(M: number): number {
  for (let b = SQUARE.BUF_MIN; b < 60; b++) {
    const span = 1.2 * (M + b);
    const slack = 4 * b - (span - SQSPLIT.H);
    if (span - SQSPLIT.H < SQUARE.G_MIN || slack < SQUARE.E_MIN) continue;
    // 富余上限（SQUARE.E_MAX）：超了折叠体会沿轴浮起来，一圈的平台就不平了
    if (slack > SQUARE.E_MAX)
      throw new Error(`捏分档缓冲富余 ${slack.toFixed(1)} 超上限 ${SQUARE.E_MAX}（M=${M}）：折叠体会沿轴浮起来`);
    return b;
  }
  throw new Error(`捏分档缓冲解不出来：M=${M}`);
}

/** 材料账天花板：结构半跨 M 的上限（解析；slack ≥ e 与 free ≤ F 联立消去 BUF） */
export const sqSplitMCap = (fTotal: number = SQSPLIT.F_TOT, e: number = SQUARE.E_MIN): number =>
  (1.4 * fTotal + SQSPLIT.H - 1.4 - e) / 4;
/** 满裂平台的设计深度上限（解析）——H 在两边抵消 ⇒ **与箱高无关**（长高不能换来更深） */
export const sqSplitDCap = (fTotal: number = SQSPLIT.F_TOT, e: number = SQUARE.E_MIN): number =>
  sqSplitMCap(fTotal, e) - SQSPLIT.H / 4;

/** 梯挡：10 根，最内钉在端面板端点 f（端面硬投影的触发条件，§17.3 坑①），最外 = M */
export function sqSplitLadder(f: number, M: number): number[] {
  return [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1))))];
}

/**
 * 成形过程设计：与 Lab.12 定案同一套四件（逐挡长出 / 吸引近程门 / 缝区折痕待命 /
 * 缝壁排整齐），只有近程门的门限按本族重标（见 SQSPLIT.ATT_NEAR）。
 * **角档也吃这一套**——终态在两种成形选项下逐位相同（挑出 77.9 / 箱高 36.00 / 锁 10
 * 全等），但混用会让一圈里 4 个角位在别人都成形后还是没成形的波浪管，故零代价地统一。
 */
const FORM: Pick<SkinUnitOpts, 'zipUp' | 'attNear' | 'attNearChains'> = {
  zipUp: [0],
  attNear: SQSPLIT.ATT_NEAR,
  attNearChains: [0],
};

export interface SqSplitTier {
  name: string;
  en: string;
  /** 一圈里有几条带走这一档 */
  count: number;
  /** 形态位置（0 = 单箱，1 = 满裂） */
  t: number;
  /** tether 的绝对深度锚（px；斜坡上限按它给）。单箱那一档没有缝、不需要它 */
  D?: number;
  /** 箱设计深度（px；等长键箱终态比它鼓出约 +4，故要标定、不能直接拿目标值当设计值） */
  boxD?: number;
  /** 单箱那一档：直接走平档原谱的 kMax */
  k?: number;
}

/**
 * ## 定案三档（真引擎标定，**冻结成表**——不是活扫掠）
 *
 * 标定法：三档各扫一遍 (boxD × tether 深) / k，只留**干净候选**——键全锁 · 打结 ≤6 ·
 * 顶底面水平度 <1.5 · 箱高准 · 面档缝真裂到轴 · **剪影Δ <6** · **缝角不鼓出端面** ·
 * **缓冲富余不超 E_MAX**；再在候选集上按三条一起选：外缘偏差（方形准不准）·
 * 剪影Δ（形对不对）· **全程对位散布**（一圈平不平）。半边长 a 也进优化。
 *
 * 实测（Lab.14 守门口径）：
 *   角 k60  挑出 88.59（偏 +0.23） 箱高 76.00  顶/底平 0.13  锁 10/10  结 0  Δ 0.09
 *   边 t.5  挑出 64.80（偏 +0.86） 箱高 76.00  顶/底平 0.15  锁 20/20  结 0  Δ 1.95
 *   面 t1   挑出 54.50（偏 −0.24） 箱高 76.00  顶/底平 0.05  锁 26/26  结 0  Δ 0.69
 * 边长 **167px**（加深缝前 153；平档 169）· 外缘偏差 **≤0.86px**（加深前 1.31）·
 * 三档剪影Δ 全面更好（3.35/1.98/0.19 → 0.69/1.95/0.09）· **全程对位散布 14.9 → 3.3px**
 * （原来那条已知瑕疵基本消掉）· 全程峰值挑出 = 终态（无鼓胀）⇒ 阵列格距与取景不用重排。
 *
 * **判据这一轮补了三条**（加深之前只卡锁定/打结/水平度）：
 *  · **剪影Δ** —— §16.3 早写着「验收只认剪影Δ」，是探索工具漏了它；
 *  · **缝角不许鼓出端面** —— 否则「挑出」量到的是缝角而不是台面外缘，方形就建在
 *    错的特征上（第一版把端面竖直度从 0.24 弄到 4.08）；
 *  · **缓冲富余上限** —— 见 `SQUARE.E_MAX`。
 * **对位也是这一轮才进选优的**（此前只按外缘偏差挑）。
 */
export const SQSPLIT_TIERS: readonly SqSplitTier[] = [
  // D 是 tether 的绝对深度锚（斜坡上限按它给），与 boxD 是**两个独立的量**：等长键箱
  // 终态比设计值鼓一截，故两者都要标定，不能拿目标值当设计值（2026-09-01 搬运时踩过）。
  // 自洽标定的目标取**面角 x**（台面外缘）而不是 max 挑出——后者在缝角鼓出时会被污染，
  // D 越设越大、缝角越鼓，是个正反馈。
  { name: '面', en: 'face', count: 8, t: 1, D: 53.7, boxD: 48 },
  { name: '边', en: 'edge', count: 8, t: SQSPLIT.EDGE_T, D: 64.8, boxD: 60 },
  { name: '角', en: 'corner', count: 4, t: 0, k: 60 },
];

/** 三档实测终态挑出（px）——守门逐位核对 */
export const SQSPLIT_REACH: readonly number[] = [54.5, 64.8, 88.6];

/**
 * 目标方形的半边长。**不是从面档反推的**——三档的深度旋钮很粗（角档 k 一格就是 2–3px、
 * 边档 boxD 一格 1.2px），按面档定 a 会让另两档差到 3px；它和三档配置一起进优化。
 * 边长 **167px**（加深缝前 153，平档 169）——加深缝把它顶大了，见 `SQSPLIT.H` 里那三条账。
 * 取 83.7 而不是偏差最小的 84.0：那个的边长 168.0 只比平档的 168.6 小 0.6px，留一点余量。
 */
export const SQSPLIT_HALF_SIDE = 83.7;

/** 目标方形的半边长 */
export function sqSplitHalfSide(): number {
  return SQSPLIT_HALF_SIDE;
}

/** 一档的谱 + 选项 + 关键节点下标 */
export function sqSplitBuild(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  lead: number;
  free: number;
  marks: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
} {
  const fTotal = SQSPLIT.F_TOT;
  if (tier.t <= 0) {
    // 角档 = 平档原谱（只是浅一档）——构造完全复用 squareSpec，不另写一份
    const k = tier.k!;
    const b = squareBuffer(k, SQSPLIT.H);
    const free = squareFree(k, b);
    const base = SQSPLIT.LEAD + (fTotal - free) / 2 + SQUARE.ISO;
    const c = base + (free - 1) / 2;
    const pw = squarePw(SQSPLIT.H);
    return {
      spec: squareSpec(k, fTotal, SQSPLIT.LEAD, SQSPLIT.H),
      opts: { ...skinSiteOpts(STEPPED), ...FORM },
      lead: base,
      free,
      marks: { center: c, mouthA: c, mouthB: c, faceA: c - pw, faceB: c + pw, outA: c - k, outB: c + k },
    };
  }
  const w = sqSplitSeamW(tier.t, wEnd);
  const D = tier.D!;
  const dv = sqSplitSink(tier.t, D);
  const wt = w * sqSplitTip(tier.t);
  const lobe = (SQSPLIT.H - w) / 2;
  const faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4));
  const wallN = Math.max(1, Math.round(dv / 2));
  const boxD = tier.boxD ?? Math.round(D / 2) * 2;
  const m = a + wallN; // 缝角
  const f = m + faceN; // 面角
  const M = f + boxD / 2; // 轴嘴
  const buf = sqSplitBuffer(M);
  const free = 2 * (M + buf) + 1;
  const c = buf + M;

  // 缝链：嘴键 → 等长壁键 → 底键（跨度降序 = 拉链从嘴合到底）
  const wv = (w + wt) / 2;
  const crack: SkinBond[] = [[c - m, c + m, w / 100]];
  for (let k = m - SQSPLIT.WALL_STEP; k > a + 1; k -= SQSPLIT.WALL_STEP) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  // 面角同侧键：一根键同时激活垂直化 + 端面硬投影 + 面板锁定键（§16.1 推论一）
  const faceUp: SkinBond[] = [[c - f, c - m, lobe / 100]];
  const faceDn: SkinBond[] = [[c + m, c + f, lobe / 100]];
  const panels: SkinPanel[] = [[c - f, c - m], [c + m, c + f], [c - a, c + a]];
  const bonds: SkinBond[] = sqSplitLadder(f, M).map((k) => [c - k, c + k, SQSPLIT.H / 100]);
  const seg: SkinSeg = ['f', free, bonds, panels, [crack, faceUp, faceDn]];
  const { spec, base } = squareWrap(seg, fTotal, SQSPLIT.LEAD, `${tier.name}档 t=${tier.t}`);

  const c0 = base + c;
  const rTip = (D - dv) / 100;
  const tether: [number, number][] = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  for (let k = a + 1; k <= m; k++) {
    const r = rTip + ((k - a) * (D / 100 - rTip)) / wallN;
    tether.push([c0 + k, r], [c0 - k, r]);
  }
  // 缝区折痕待命（同侧规则：缝壁贴同侧缝角、缝心贴双角。跨侧耦合会把形拖塌）
  const crease: [number, number, number][] = [];
  for (let j = c0 - m + 1; j < c0 + m; j++) {
    if (j < c0) crease.push([j, c0 - m, 0]);
    else if (j > c0) crease.push([j, c0 + m, 0]);
    else crease.push([j, c0 - m, 0], [j, c0 + m, 0]);
  }
  return {
    spec,
    opts: {
      ...SKIN_ROOT_FIX,
      anchorEnd: true,
      boxSquare: true,
      ...FORM,
      sqChains: [0], // 方箱整形只作用于外箱梯，碰不到缝区
      coreTether: tether,
      coreTetherRel: crease,
      alignRuns: [[c0 - m, c0 - a], [c0 + a, c0 + m]], // 缝壁排整齐（抹掉锯齿）
    },
    lead: base,
    free,
    marks: { center: c0, mouthA: c0 - m, mouthB: c0 + m, faceA: c0 - f, faceB: c0 + f, outA: c0 - M, outB: c0 + M },
  };
}

/** 三档的引擎定义（解三条摆二十处） */
export function buildSquareSplitUnits(tiers: readonly SqSplitTier[] = SQSPLIT_TIERS): RingUnitDef[] {
  return tiers.map((t) => {
    const b = sqSplitBuild(t);
    return {
      key: `sqsplit-${t.en}`,
      zh: `${t.name}档`,
      en: t.en,
      spec: b.spec,
      opts: b.opts,
      // 与全站同窗口且为奇数（§15.15：偶数窗会把 renderSmooth 的归一化撞出放大）
      smooth: [3, 1] as const,
    };
  });
}

/**
 * 二十位编制 = 方形自己的方位类（面 0 / 边 1 / 角 2），与平档同一份 `buildSquareOrder`。
 * 一圈读作四个来回：… 边 面 面 边 │ 角 │ 边 面 面 边 │ 角 │ …
 * 面档**成对相邻**（那一类在坐标轴两侧各 9°），故裂得最开的地方会连着出现两条。
 */
export const buildSquareSplitOrder = buildSquareOrder;

/** 二十个平台外缘点（俯视，世界 XZ）+ 对目标方形的偏差——守门用 */
export function sqSplitRim(
  reach: readonly number[] = SQSPLIT_REACH,
  count: number = SQUARE.COUNT,
): { x: number; z: number; dev: number }[] {
  const a = sqSplitHalfSide();
  return buildSquareSplitOrder(count).map((t, i) => {
    const th = squareAngle(i, count);
    const rr = SQUARE.RADIUS + reach[t];
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, dev: rr - a / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))) };
  });
}
