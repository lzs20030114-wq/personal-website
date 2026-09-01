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
 *    202 节带上本来就有 **133**（lead 22 / tail 15）。用环族自己这份分配，带子一节不用
 *    加长，且与平档同一份配平基准 ⇒ 平台高度一致（六条一起缝心散布 2.31px）。
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
  SQUARE, SQUARE_PW, SQUARE_RUNGS, buildSquareOrder, squareAngle, squareBuffer,
  squareDepthK, squareFree, squareFreeTotal, squareLead, squareSpec, squareWrap,
} from './skin-square';
import type { RingUnitDef } from './skin-ring';

const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped')!;

export const SQSPLIT = {
  /** 终态缝宽（用户 2026-09-01 拍板 12：两片 12 高的台夹一道 12 的缝）。
   *  与材料账无关、纯审美——实测 8/12/16/20 都跑得干净（挑出 47.0–47.2 逐档同）。 */
  W_END: 12,
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
export const sqSplitLobe = (t: number, wEnd: number = SQSPLIT.W_END): number => (SQUARE.H - sqSplitSeamW(t, wEnd)) / 2;

/**
 * 缓冲：折得起来（余量 ≥ E_MIN）且住得下（间隙 ≥ G_MIN）。
 * 与 `squareBuffer` 是同一条规则，只是那边按 kMax 解、这边按结构半跨 M 解。
 * **本族必须解缓冲**：Lab.12 自己不解（BUF 固定 4），那套在 H=52 时余量尚有 9.2，
 * 换到 H=36 会变成 −11.6（缓冲被拉直，§17.3 坑②）。
 */
export function sqSplitBuffer(M: number): number {
  for (let b = SQUARE.BUF_MIN; b < 60; b++) {
    const span = 1.2 * (M + b);
    if (span - SQUARE.H >= SQUARE.G_MIN && 4 * b - (span - SQUARE.H) >= SQUARE.E_MIN) return b;
  }
  throw new Error(`捏分档缓冲解不出来：M=${M}`);
}

/** 材料账天花板：结构半跨 M 的上限（解析；slack ≥ e 与 free ≤ F 联立消去 BUF） */
export const sqSplitMCap = (fTotal: number = squareFreeTotal(), e: number = SQUARE.E_MIN): number =>
  (1.4 * fTotal + SQUARE.H - 1.4 - e) / 4;
/** 满裂平台的设计深度上限（解析）——H 在两边抵消 ⇒ 与箱高无关 */
export const sqSplitDCap = (fTotal: number = squareFreeTotal(), e: number = SQUARE.E_MIN): number =>
  sqSplitMCap(fTotal, e) - SQUARE.H / 4;

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
  /** 几何目标挑出（px）——tether 的绝对深度锚与目标线用 */
  D: number;
  /** 箱设计深度（px；等长键箱终态比它鼓出约 +4，故要标定、不能直接拿目标值当设计值） */
  boxD?: number;
  /** 单箱那一档：直接走平档原谱的 kMax */
  k?: number;
}

/**
 * ## 定案三档（真引擎标定，**冻结成表**——不是活扫掠）
 *
 * 半边长 a = (面档实测挑出 + 站位半径)·cos9° = 76.2 ⇒ **边长 152px**（现行平档 169，
 * 小 10%；用户 2026-09-01 拍板收）。面档的 boxD 取材料账允许的最深（42 起构造期拒绝）。
 *
 * 实测（Lab.14 守门口径）：
 *   角 k46  挑出 77.9  箱高 36.00  顶/底平 0.13  锁 10/10  结 0  Δ 0.19
 *   边 t.5  挑出 55.6  箱高 36.00  顶/底平 0.07  锁 19/19  结 0  Δ 1.98
 *   面 t1   挑出 47.1  箱高 36.00  顶/底平 0.28  锁 24/24  结 2  Δ 3.35
 * 外缘点对方形偏差 ≤0.2px；全程峰值挑出 = 终态（无鼓胀）⇒ 阵列格距与取景不用重排。
 */
export const SQSPLIT_TIERS: readonly SqSplitTier[] = [
  // D 是 tether 的绝对深度锚（斜坡上限按它给），**取标定第二遍自洽后的值**：
  // 第一遍用 boxD+鼓出量 46 跑出挑出 46.8，回代 46.8 再跑得 47.1 —— 差的 1.7% 全在
  // 斜坡上限上。填第一遍的 46 会少 0.3px（搬运时踩过一次，实测抓出来的）。
  { name: '面', en: 'face', count: 8, t: 1, D: 46.8, boxD: 40 },
  { name: '边', en: 'edge', count: 8, t: SQSPLIT.EDGE_T, D: 55.5, boxD: 46 },
  { name: '角', en: 'corner', count: 4, t: 0, D: 77.7, k: 46 },
];

/** 三档实测终态挑出（px）——守门逐位核对 */
export const SQSPLIT_REACH: readonly number[] = [47.1, 55.6, 77.9];

/** 目标方形的半边长（由面档实测挑出反推） */
export function sqSplitHalfSide(reach: readonly number[] = SQSPLIT_REACH): number {
  return (reach[0] + SQUARE.RADIUS) * Math.cos(Math.PI / SQUARE.COUNT);
}

/** 一档的谱 + 选项 + 关键节点下标 */
export function sqSplitBuild(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  lead: number;
  free: number;
  marks: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
} {
  const fTotal = squareFreeTotal();
  if (tier.t <= 0) {
    // 角档 = 平档原谱（只是浅一档）——构造完全复用 squareSpec，不另写一份
    const k = tier.k ?? squareDepthK(tier.D);
    const b = squareBuffer(k);
    const free = squareFree(k, b);
    const base = squareLead(fTotal) + (fTotal - free) / 2 + SQUARE.ISO;
    const c = base + (free - 1) / 2;
    return {
      spec: squareSpec(k),
      opts: { ...skinSiteOpts(STEPPED), ...FORM },
      lead: base,
      free,
      marks: { center: c, mouthA: c, mouthB: c, faceA: c - SQUARE_PW, faceB: c + SQUARE_PW, outA: c - k, outB: c + k },
    };
  }
  const w = sqSplitSeamW(tier.t, wEnd);
  const dv = sqSplitSink(tier.t, tier.D);
  const wt = w * sqSplitTip(tier.t);
  const lobe = (SQUARE.H - w) / 2;
  const faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4));
  const wallN = Math.max(1, Math.round(dv / 2));
  const boxD = tier.boxD ?? Math.round(tier.D / 2) * 2;
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
  const bonds: SkinBond[] = sqSplitLadder(f, M).map((k) => [c - k, c + k, SQUARE.H / 100]);
  const seg: SkinSeg = ['f', free, bonds, panels, [crack, faceUp, faceDn]];
  const { spec, base } = squareWrap(seg, fTotal, squareLead(fTotal), `${tier.name}档 t=${tier.t}`);

  const c0 = base + c;
  const rTip = (tier.D - dv) / 100;
  const tether: [number, number][] = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  for (let k = a + 1; k <= m; k++) {
    const r = rTip + ((k - a) * (tier.D / 100 - rTip)) / wallN;
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
  const a = sqSplitHalfSide(reach);
  return buildSquareSplitOrder(count).map((t, i) => {
    const th = squareAngle(i, count);
    const rr = SQUARE.RADIUS + reach[t];
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, dev: rr - a / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))) };
  });
}
