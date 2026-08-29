/**
 * 项目二 · 捏分过渡（单箱 → 两台）——纯数据，零 DOM。
 *
 * 用户 2026-08-27 草图立项：一条带上的单个结构，面上逐级豁开一道缝，最后
 * 分成上下两个台（**不是**「一个大台中间挖个坑」——用户当轮纠偏的正是这点，
 * 故目标线是两台逐级拉开、台的尺寸全程不变）。目标线形经用户三轮「更薄」后
 * 拍板定版：**每台高 12 · 台深 40 · 终态缝 28 · 十级**。
 *
 * ## 架构「刻缝方箱」（逐级独立设计，用户 2026-08-29 拍板路线）
 *
 * 用户否决了单参数生成器（「完全不可用」），改为每级一份自己的谱与选项、
 * 单独磨到干净——本文件就是磨完的十份。共享的只有机械，数字逐级独立（TUNE）。
 *
 * 一条自由段的分区（自缝心 c 起算的节偏移）：
 *   a = 缝底半宽 · m = a+wallN 缝角 · f = m+faceN 面角 · M = f+boxD/2 轴嘴
 *   [buf | 上壁 | 上半面 | 缝上壁 | 缝底 | 缝下壁 | 下半面 | 下壁 | buf]
 *
 * 四件构造，每件都对着一个**硬机制**（软平衡的输出永远是圆的，方/直/平一律
 * 来自硬整形——这是 §16 硬机制审计的第一条）：
 * - **外箱梯**（链 0）：完整等长键扇，rest = H = 2·台高 + 缝嘴；boxSquare 全套
 *   但经 `sqChains:[0]` 只作用于它 ⇒ 嘴角贴轴 / 找平 / flattenToLine 碰不到缝区。
 * - **缝链**（附加链）：嘴键 wm + 等长壁键 + 底键 wt，自己一条拉链（嘴→底）。
 *   深缝级另经 `levelChains` 只吃「底面找平 + 端角重申」两件——补 v7「只找平
 *   上层」的老不对称（下缝壁锯齿即此），并让缝宽逐级精确命中。
 * - **面角同侧键**（两条单键链，rest = 台高）：一根键同时激活三件既有硬机制——
 *   梯挡垂直化把面角与缝角拉到同一 x（面竖直的硬锚）、面板端点从此是锁定键
 *   ⇒ 端面硬投影自动生效。**零新整形代码**。
 * - **coreTether 单侧限位**：缝底钉在 D−dv；ramp 时缝壁另给沿目标斜壁的上限。
 *
 * ## 两条来之不易的机理（细节见 项目二_皮肤单元lab.md §15.8 / §16）
 *
 * - **缝料的去向要在成形期就有约束**：缝链靠吸引在 step 250 前就预锁成刚性
 *   手风琴，随后被 PRESS 外翻成兜、箱合拢时关在台外。**键框架与斜坡限位单用
 *   皆败**（只给键 = 外翻/气球；只给斜坡 = S 折绞缠），两个一起给才成立。
 * - **缝料要配平、不能富余**：单侧限位拦得住外翻、拦不住过深——壁弧富余会把
 *   缝底往里顶。故 wallN / a 是逐级主调参轴（裁材料，不是调限位）。
 *
 * ## 对位：固定尾段，配平放在顶端
 *
 * 十级的外箱半跨 M 差得很远（24 → 49），折叠体若各自随谱漂，一排看过去就是台阶。
 * 收缩注册在底端（末节点钉住），故**缝心离下缘的账**只有三项：
 *   Y = 尾段贴合 ·2px + 下缓冲 ·2r px + 该级自身的半高 H/2
 * ——中间那 M 节材料的弧长全被折叠吃掉，对高度不贡献。所以只要**尾段与缓冲
 * 全员同值**，缝心在每个 r 上都齐平；剩下的 H/2 差是形态自身的（缝张开、两台
 * 分离，本来就该长高），不是放置误差。
 *
 * 于是：自由段仍取各级调好的**自然长度**（两端缓冲恒 4 节 = 交接件纪律下限），
 * 尾段钉死 69，配平量全放进**顶端贴合段**（在结构之上，不参与它的高度账）。
 * 带总长全员 200 ⇒ 顶端也齐。先试过 Lab.08 那副「全员同 FREE」的构造，
 * 浅缝级会被塞进 20+ 节多余缓冲，实测十级剪影Δ 全线变差（L8 直接崩）——
 * skin-array 里「自由段越长、富余越多、残留越大」那条在这里被放大成了形态事故。
 *
 * 边界申明：交接件明令「行为矩阵 → 键谱的翻译规则由使用者手写」。这十级是
 * 两张形态之间的形态学串联（演示编排），不是那套规则；正式规则交来后随时替换。
 */
import { fan } from './skin-data';
import { SKIN_ROOT_FIX, type SkinBond, type SkinPanel, type SkinSpec, type SkinUnitOpts } from './skin-unit';

/** 目标线形（用户 2026-08-27 拍板定版） */
export const SPLIT_LOBE = 12; // 每台高
export const SPLIT_DEPTH = 40; // 台深
export const SPLIT_SEAM = 28; // 终态缝宽（两台之间）
/** 十级的过渡参数（视觉等距取级，见 scripts/skin-dual/line-draft.mjs） */
export const SPLIT_T: readonly number[] = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];

/** 缝嘴宽（张得快）· 缝底退距（退得稳）· 缝尖宽/缝嘴宽（早期窄楔 → 末期平行缝） */
export const splitSeamW = (t: number): number => SPLIT_SEAM * Math.pow(t, 0.7);
export const splitSink = (t: number): number => SPLIT_DEPTH * Math.pow(t, 1.2);
export const splitTipRatio = (t: number): number => 0.4 + 0.6 * t;

/** 对位构造：尾段与缓冲全员同值（缝心齐平的全部条件），配平放顶端贴合段 */
export const SPLIT_TAIL = 69;
/**
 * 带总长（节）。全员同值——**这是并拢排布下十片对齐的前提**：台架按末节点
 * 对位（footAlign），而末节点的初始位置由总长定；总长不等则十片的落位散开
 * （2026-08-29 试过「按终态芯长配平顶端」让顶端在终态齐平，实测反而把台架的
 * 落位打散到 68px——终态芯长齐了，初始芯长就不齐了，而对位是按初始位置做的）。
 * 代价：各级自由段长短不同 ⇒ 终态芯长差 70px，带子顶端读成一道缓坡（下缘齐、
 * 结构齐，只有顶端不齐）——那是「收得多的带子短」的老实结果，留着。
 */
export const SPLIT_TOTAL = 200;
/** 键谱两端缓冲（交接件纪律下限 4——取下限：富余材料越少形态越稳） */
export const SPLIT_BUF = 4;
const FACE_N = Math.round(SPLIT_LOBE / 2); // 面（台的立面）占的节数

/** 逐级旋钮（省略项按 t 推；每级的值是磨出来的，不是算出来的） */
export interface SplitTune {
  /** 缝壁键密度（节；0 = 只留嘴键与底键）——浅缝级稀、深缝级密 */
  wallStep?: number;
  /** 外箱设计深度（按充气量回标：等长键箱终态比设计值鼓 ~5%） */
  boxD?: number;
  /** 缝底半宽（节） */
  a?: number;
  /** 缝壁节数——缝料配平的主轴（富余会把缝底顶深） */
  wallN?: number;
  /** 缝壁是否给斜坡单侧上限（封死成形期外翻；与缝链是组合拳） */
  ramp?: boolean;
  /** 缝链是否吃「底面找平 + 端角重申」（深缝级用，压下缝壁锯齿） */
  lvl?: boolean;
  /** 收缩时间曲线指数（省略 = 按 LOCK_U 对齐算）——扫描工具用，站上走定案表 */
  warp?: number;
}

/**
 * 十级定案（sweep 按剪影Δ挑出，逐级独立；注释里的 Δ = 对目标线的平均横向差 px）。
 * 浅缝级斜坡 + 稀键，深缝级斜坡 + 壁键——同一架构在不同缝深区间最优配方不同，
 * 这正是逐级独立设计要解决的事。
 */
export const SPLIT_TUNE: readonly (SplitTune | null)[] = [
  null, // L0 单箱（另一支构造）
  { ramp: true, wallStep: 0, boxD: 36 }, // Δ0.48
  { ramp: true, wallStep: 0, boxD: 36 }, // Δ0.88
  { ramp: true, wallStep: 0, boxD: 36, wallN: 5 }, // Δ0.88
  { ramp: true, wallStep: 2, boxD: 36, wallN: 6, a: 3 }, // Δ1.92（缝料按下方「不打结」重挑）
  { ramp: true, wallStep: 0, boxD: 36, a: 3, wallN: 9 }, // Δ3.26（同上）
  { ramp: true, wallStep: 2, boxD: 36, a: 3, wallN: 12 }, // Δ3.25
  { ramp: true, wallStep: 2, boxD: 36, a: 4, wallN: 14 }, // Δ4.77
  { ramp: true, wallStep: 2, boxD: 32, wallN: 15, lvl: true }, // Δ5.54
  { ramp: true, wallStep: 2, boxD: 36, wallN: 18, lvl: true }, // Δ4.38（缝裂到轴 = 两台分离）
];

/**
 * **全程连续的关键：成形时刻对齐**（用户 2026-08-29 看图纠偏「要确保它们收缩的
 * 过程里也是平滑的过渡连续形状」）。
 *
 * 每级的拉链是「一瞬间全锁」，而这一瞬发生在各自不同的 r 上——键长 rb 与跨度 f
 * 的比值定的，十级实测落在 u = 0.633…0.806（u = min(step/900,1)，见下表）。
 * 十条带同推时，画面上总有一段已成形、一段还是直带子，那道边界扫过整排
 * ＝ 断层（实测 step 400 相邻Δ 最大 12.9px、比值 9.4×，而终态只有 1.4×）。
 *
 * 修法不是改形态，是改**路上的快慢**：引擎的 `warp` 指数只改 r(step) 的形状、
 * 不动两端（u=0 → R0、u=1 → r1），故收缩终点与协议长度都不变。逐级取
 *   warp_i = ln(自然全锁 u_i) / ln(对齐点 u*)
 * 即把各自那一瞬搬到同一个 u 上：早锁的放慢、晚锁的加快。
 *
 * 代价与验收：这是**路径**改动，而拉链锁定不可逆（滞回）——换条路走到同一个 r
 * 未必得到同一个锁定集合，故终态必须重验（守门卡逐级剪影Δ 与全锁）。
 */
const LOCK_U: readonly number[] = [0.634, 0.659, 0.636, 0.636, 0.646, 0.663, 0.709, 0.738, 0.733, 0.807];
/**
 * 对齐点（逐级）。**warp 不影响终态形**——十级剪影Δ 在 u* = 0.68…0.88 全程逐位
 * 不变（实测），它只改路上的快慢。于是它是一个**免费的过程质量旋钮**，这里就
 * 拿它解第二个问题：成形期的自交。
 *
 * 松料在拉链闭合前被 PRESS 顶出去、能不能绕回来打成环，是个**分岔**——同一级
 * 换个对齐点，结的个数在 0 与 6 之间跳（矩阵见 项目二_皮肤单元lab.md §15.10）。
 * 故逐级扫过 u* ∈ [0.70, 0.845]，各取「零自交且完成步离大伙最近」的那个：
 * 基准 0.71，只有 L7 要挪到 0.72。十级完成步落在 628–649（差 21 步 ≈ 0.26s），
 * 排上任何时刻都是同一阶段 ⇒ 全程读作连续渐变。
 */
const SYNC_U: readonly number[] = [0.71, 0.71, 0.71, 0.71, 0.71, 0.71, 0.71, 0.72, 0.71, 0.71];
export const splitWarp = (i: number): number => Math.log(LOCK_U[i]) / Math.log(SYNC_U[i]);

export interface SkinSplitLevel {
  /** 级序 0..9 */
  i: number;
  /** 过渡参数（0 = 单箱，1 = 两台） */
  t: number;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
  /** 该级的顶端贴合段节数（= 对位配平量；自由段越短、顶端越长） */
  lead: number;
  /** 自由段节数（各级自然长度 = 2M+1+2·BUF） */
  free: number;
  /** 关键节点（绝对下标，守门与读数用） */
  marks: {
    /** 缝心（L0 = 箱的面心） */
    center: number;
    /** 上/下缝角（L0 无缝，取面角） */
    mouthA: number;
    mouthB: number;
  };
}

/** 站方公共选项 + 本族专属（缝链的作用域拆分） */
const SPLIT_BASE: SkinUnitOpts = { ...SKIN_ROOT_FIX, anchorEnd: true, boxSquare: true };

/** 自由段外裹上对位构造：顶端配平（终态芯长恒定）+ 固定尾段 */
export function splitLead(free: number): number {
  return SPLIT_TOTAL - SPLIT_TAIL - free;
}
function band(free: number): { lead: number; wrap: (seg: SkinSpec[number]) => SkinSpec } {
  const lead = splitLead(free);
  if (lead < SPLIT_BUF) throw new Error(`自由段 ${free} 节放不下（顶端配平 ${lead} < ${SPLIT_BUF}）`);
  return { lead, wrap: (seg) => [['g', lead], seg, ['g', SPLIT_TAIL]] };
}

/** L0 单箱：一条链 + 方箱整形全套（目录阶梯方箱同一区制，已验证干净） */
function levelSingle(boxD = 36): SkinSplitLevel {
  const kf = Math.round((2 * SPLIT_LOBE) / 4); // 面 = 总高 24px ⇒ 半跨 6
  const kMax = kf + boxD / 2;
  const free = 2 * kMax + 1 + 2 * SPLIT_BUF;
  const c = SPLIT_BUF + kMax;
  const { lead, wrap } = band(free);
  const seg: SkinSpec[number] = [
    'f',
    free,
    fan(c, kf, kMax + 1, 2, (2 * SPLIT_LOBE) / 100),
    [[c - kf, c + kf]],
  ];
  return {
    i: 0,
    t: SPLIT_T[0],
    spec: wrap(seg),
    opts: { ...SPLIT_BASE, warp: splitWarp(0) },
    smooth: [3, 1],
    lead,
    free,
    marks: { center: lead + c, mouthA: lead + c - kf, mouthB: lead + c + kf },
  };
}

/** L1–L9 刻缝方箱 */
function levelNotched(i: number, tune: SplitTune): SkinSplitLevel {
  const t = SPLIT_T[i];
  const w = splitSeamW(t);
  const dv = splitSink(t);
  const wt = w * splitTipRatio(t);
  const rTip = (SPLIT_DEPTH - dv) / 100;
  const a = tune.a ?? Math.max(1, Math.round(wt / 4));
  const wallN = tune.wallN ?? Math.max(1, Math.round(Math.hypot(dv, (w - wt) / 2) / 2));
  const wallStep = tune.wallStep ?? 2;
  const boxD = tune.boxD ?? SPLIT_DEPTH;
  const m = a + wallN; // 缝角
  const f = m + FACE_N; // 面角
  const M = f + boxD / 2; // 轴嘴（外箱最外键）
  const H = 2 * SPLIT_LOBE + w; // 外箱高 = 两台 + 缝嘴
  const free = 2 * M + 1 + 2 * SPLIT_BUF;
  const c = SPLIT_BUF + M; // 缝心（自由段正中）
  const { lead, wrap } = band(free);

  // 缝链：嘴键 → 等长壁键 → 底键（跨度降序 = 拉链从嘴合到底）
  const wv = (w + wt) / 2;
  const crack: SkinBond[] = [[c - m, c + m, w / 100]];
  if (wallStep > 0)
    for (let k = m - wallStep; k > a + 1; k -= wallStep) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  // 面角同侧键：各自成链（rest = 台高）⇒ 垂直化锚住面、面板端点成锁定键
  const faceUp: SkinBond[] = [[c - f, c - m, SPLIT_LOBE / 100]];
  const faceDn: SkinBond[] = [[c + m, c + f, SPLIT_LOBE / 100]];
  const panels: SkinPanel[] = [
    [c - f, c - m], // 上半面
    [c + m, c + f], // 下半面
    [c - a, c + a], // 缝底
  ];
  const seg: SkinSpec[number] = ['f', free, fan(c, f, M + 1, 2, H / 100), panels, [crack, faceUp, faceDn]];

  // 单侧限位：缝底钉 rTip；ramp 时缝壁沿目标斜壁给上限（成形期封死外翻）
  const c0 = lead + c;
  const tether: [number, number][] = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  if (tune.ramp)
    for (let k = a + 1; k <= m; k++) {
      const r = rTip + ((k - a) * (SPLIT_DEPTH / 100 - rTip)) / wallN;
      tether.push([c0 + k, r], [c0 - k, r]);
    }

  return {
    i,
    t,
    spec: wrap(seg),
    lead,
    free,
    opts: {
      ...SPLIT_BASE,
      warp: tune.warp ?? splitWarp(i), // 成形时刻对齐（见 LOCK_U 上方的推导）
      sqChains: [0], // 方箱整形只作用于外箱梯
      ...(tune.lvl ? { levelChains: [1] } : {}), // 缝链只吃找平 + 端角重申
      coreTether: tether,
    },
    // 缝只有几 px 宽，[3,1] 的窗口会把它抹平——绘图平滑不许说谎（§16.3）
    smooth: [2, 1],
    marks: { center: c0, mouthA: c0 - m, mouthB: c0 + m },
  };
}

/** 单级（sweep 工具用：可临时覆盖旋钮） */
export function buildSplitLevel(i: number, tune?: SplitTune): SkinSplitLevel {
  if (i === 0 && !tune) return levelSingle();
  return levelNotched(i, tune ?? SPLIT_TUNE[i] ?? {});
}

/** 定案十级（左 = 单箱，右 = 两台） */
export function buildSplitLevels(): SkinSplitLevel[] {
  return SPLIT_T.map((_, i) => buildSplitLevel(i));
}

/**
 * 目标线（以缝心为原点，x = 离轴、y = 向下）——线稿、守门、台架题注共用同一份。
 * 形状 = 两个 LOBE 高的台 + 中间一道有锥度的裂口（嘴宽 w、尖宽 wt、退距 dv）。
 */
export function splitTargetProfile(t: number): [number, number][] {
  const w = splitSeamW(t);
  const dv = splitSink(t);
  const wt = w * splitTipRatio(t);
  const D = SPLIT_DEPTH;
  const y0 = -(2 * SPLIT_LOBE + w) / 2;
  const p: [number, number][] = [
    [0, y0],
    [D, y0],
  ];
  if (w > 0.5)
    p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
}

/**
 * 剪影Δ：两条折线在同一 y 网格上的平均横向差（**按线段光栅化**，不按顶点打点
 * ——逐点写只会写满十分之一的桶，剪影成「梳齿」、错位产生巨大伪距离）。
 *
 * 这是本族唯一有效的形状分数：尖/深/缝/锁定数四项全对时形仍可能全错
 * （本项目已四次「量对了、形错了」）。守门与线稿工具共用这一份。
 */
const SIL_DY = 0.5;
export function silhouette(pts: readonly (readonly [number, number])[], yLo: number, yHi: number): Float64Array {
  const n = Math.ceil((yHi - yLo) / SIL_DY) + 1;
  const sil = new Float64Array(n);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [xA, yA] = pts[i];
    const [xB, yB] = pts[i + 1];
    const b0 = Math.round((Math.min(yA, yB) - yLo) / SIL_DY);
    const b1 = Math.round((Math.max(yA, yB) - yLo) / SIL_DY);
    for (let b = Math.max(0, b0); b <= Math.min(n - 1, b1); b++) {
      const y = yLo + b * SIL_DY;
      const fr = Math.abs(yB - yA) < 1e-9 ? 0 : (y - yA) / (yB - yA);
      const x = xA + (xB - xA) * Math.min(1, Math.max(0, fr));
      if (x > sil[b]) sil[b] = x;
    }
  }
  return sil;
}

/** 引擎终态剖面（以缝心为 y 原点）对目标线的剪影Δ */
export function splitSilhouetteDelta(profile: readonly (readonly [number, number])[], t: number): number {
  const half = (2 * SPLIT_LOBE + splitSeamW(t)) / 2 + 4;
  const a = silhouette(profile, -half, half);
  const b = silhouette(splitTargetProfile(t), -half, half);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
