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
 * 对位构造 v3：**三段全部全员同值**（lead / free / tail 逐级相同）。
 *
 * 这是并拢排布下「任何时刻整片齐平」的充要条件：台架按末节点对位（footAlign），
 * 芯长(r) = (lead+tail)·2px + free·2r px——三段同值 ⇒ 芯长在**每一个 r 上**都
 * 逐级相等 ⇒ 顶端与底端全程都是一条直线。此前只统一了总长（free 各异、lead 找补），
 * 收缩量 free·2(0.95−r) 就不等，顶端随收缩越走越散、终态差 70px 的阶梯
 * （用户 2026-08-29 看图指出）。也试过「按终态芯长配平 lead」——终态齐了、
 * 初始不齐，footAlign 按初始位置对位，反而散得更开（68px）。
 *
 * 做法：**配平垫**——一段无键的自由材料，夹在两段贴合之间（`[贴合 8 | 垫 | 贴合 16
 * | 结构自由段 | 贴合 69]`），每级 垫 + 结构自由段 = 107 恒定。三个字都有讲究：
 * - **无键的自由材料**：它随收缩变短（贴合不会——那正是此前顶端阶梯的根源），
 *   富余弧长由 rootHug 贴轴 + boxSquare 均匀排布收拾在杆上（缓冲料的既有机制），
 *   画面上只是杆上那段织物条纹变密——布收进去堆在杆上，读法是老实的。
 * - **夹在两段贴合之间**：垫的两端都被钉住 ⇒ 结构不挂在它身上。第一版把垫直接
 *   贴在结构上方，结构挂上软垫，垫越长垂得越多（L0 垫 54 节垂 26px、L9 零垫
 *   零垂）——顶端齐了、结构又成了新阶梯。
 * - **中间那段贴合 16 节**：全局约束最大跨距 16（双结构带 mid≥16 的既有结论）
 *   ⇒ 没有任何一条约束同时抓住垫与结构 ⇒ 结构的动力学环境与逐级定案**完全相同**
 *   （贴合就是贴合，16 节外再多的贴合对结构没有影响），十级剪影Δ / 成形时刻 /
 *   打结结论全部原样成立，不必重磨。
 * 早先两版失败留档：全员同 FREE **居中**放置 = 富余掉进成形区（L8 崩）；
 * **底端锚定** = 结构挂软垫下垂（新阶梯）。
 */
export const SPLIT_TOTAL = 200;
/** 自由材料总量（垫 + 结构自由段，全员同值 = 最深级 L9 的自然长度 107） */
export const SPLIT_FREE_TOTAL = 107;
/** 顶端杆帽贴合（垫之上） */
export const SPLIT_LEAD_A = 8;
/** 垫与结构之间的隔离贴合（≥16 = 全局约束最大跨距 ⇒ 垫与结构互不相扰） */
export const SPLIT_LEAD_B = 16;
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
  { ramp: true, wallStep: 2, boxD: 36, a: 3, wallN: 10 }, // Δ2.00（2026-08-30 B 定稿补壁键：旧配方 wallStep0 是十级唯一「缝深无壁键」的级，缝壁成形期自由晃、中段歪斜，折痕 v1 也是被它拖塌；壁键 + 排整齐后终态反而更贴目标线）
  { ramp: true, wallStep: 2, boxD: 36, a: 3, wallN: 12 }, // Δ3.25
  { ramp: true, wallStep: 2, boxD: 36, a: 4, wallN: 14 }, // Δ4.77
  { ramp: true, wallStep: 2, boxD: 32, wallN: 15, lvl: true }, // Δ5.54
  { ramp: true, wallStep: 2, boxD: 36, wallN: 18, lvl: true }, // Δ4.38（缝裂到轴 = 两台分离）
];

/**
 * 成形时序：**自然级联，不做 warp 对齐**（2026-08-30 定案，一段走过弯路的账）。
 *
 * 每级的拉链是「一瞬间全锁」，自然时刻由键长/跨度定（实测 571→726 步，
 * 与级序基本单调）。曾用引擎的 `warp`（收缩时间曲线指数）把十级的这一瞬对齐到
 * 同一步——对齐本身成立（散布收到 11 步），且实测 **warp 完全不影响终态形**
 * （十级剪影Δ 逐位不变，滞回没咬）。但它有一个当时没看见的代价：warp 让十级
 * 各走各的 r(t)，**芯长 = 贴合·2 + 自由·2r 在中途就不再逐级相等**——顶端在
 * 收缩中段错开 ~37px（用户看图指出的阶梯，其中一半就是它），到对齐点才收拢。
 * 锁定同步与顶端全程齐平在 r 这个旋钮上**不可兼得**。
 *
 * 取舍（实测支持）：不 warp 时过程连续性与对齐版同量级（相邻剪影Δ 峰值 13.6 vs
 * 14，锁后同收敛到 ≤4），而顶端全程齐平、十次成形从同时一响变成**从左到右的
 * 有序级联**（自然时刻近乎单调）——空间上是一道传播的裂开，时间上把动作摊开
 * 2 秒、不再集体猛一下。故 Lab.12 用自然时序；`warp` 留在引擎里（加法式、
 * 默认逐位不变），「不影响终态形的过程旋钮」这条发现照旧成立、供后用。
 *
 * ## 成形节拍/限速：试过并当日回滚（2026-08-30，用户看真机叫停）
 *
 * 单级成形确是一声啪（外箱十键同一步全锁——吸引护栏早把全链备到 rb 附近，
 * 拉链只等最外键入窗；整形机制全以锁定为开关，峰值 34.5 px/步 = 基线 114 倍），
 * 曾用引擎的 lockGap（只圈外箱链）+ stepClamp 把它摊成逐挡拉链——每步位移、
 * 瞬态环、终态Δ 全部达标，**但把成形拖成了 ~3 秒的半成形皱巴态**（面上锯齿
 * 褶皱 + 翻折卷，乘十条带级联铺开 = 用户截图里的乱七八糟）。复查结论：速度
 * 指标与终态指标都不度量「中间形态整不整齐」，而这些单元的**中间形态从来
 * 没有被设计过**——调快 = 啪，调慢 = 把丑摊开。故回滚到自然时序（丑的时段
 * 最短、成形前后都是定形态），中间形态的设计立为独立工作。审视四条与全程
 * 逐帧证据见 项目二_皮肤单元lab.md §15.12；lockGap / stepClamp 保留在引擎
 * （默认关、逐位不变），此处不再使用。
 *
 * ## 成形过程设计定稿（B 路线 v3，2026-08-30 用户逐轮看线稿拍板后接入）
 *
 * 上一节的教训落成正事：把「成形到一半长什么样」当设计对象，先线稿后上站。
 * 合格基准（动手前写死）：**全程任何一帧单独截下来都像一个有意的形态**——
 * 无卷钩、无锯齿褶皱、无翻折；成形段每帧都是「更深一挡的箱」。四件套：
 *
 * 1. **外箱拉链反向**（zipUp:[0]，SPLIT_BASE）：v7 拉链从最大跨放行、而最外键
 *    最晚够得着 ⇒ 全链等它、一到全放（啪的根源）；反向后哪挡材料够了哪挡锁，
 *    箱体从面鼻逐挡向外长出（锁定摊在 ~240–690 步的连续生长）。
 * 2. **吸引近程门**（attNear 1.5 只圈外箱链，SPLIT_BASE）：远程吸引把等待材料
 *    拧成卷钩，收窄后等待材料是干净的斜坡直线。近程门对缝链无效（浅缝出生
 *    即在锁定窗口内）——缝区另有 3/4 两件。
 * 3. **缝区折痕待命**（coreTetherRel 同侧规则）+ 4. **缝壁排整齐**（alignRuns）
 *    ——依赖缝区节点下标，构造在 levelNotched 里，注释见彼处。
 * 另有一处逐级配方修正：L5 补壁键（SPLIT_TUNE[5] 注释）。
 *
 * 十级验收（括号内为 08-29 定案旧值）：剪影Δ 0.29–3.72（0.29–5.54——全面更贴
 * 目标线，L9 4.38→1.42：旧偏差大半是壁纹，而目标线的缝壁本来就是直的）；
 * 密采样瞬态自交环全部 0（≤5）；全程任意时刻相邻级最大距离 5.4（同步全锁
 * 13.6 / 被否的拉链波 15.1）；锁定数不变、末锁 561–685 全在纪律解除（950）前、
 * 终态相邻比值 1.80×。滞回披露：换了折叠路径，终态不再与 08-29 定案逐位相同
 * （Δ 反而全面更小），守门按 v3 重钉。细节 = 项目二_皮肤单元lab.md §15.13。
 */

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

/**
 * 站方公共选项 + 本族专属（缝链的作用域拆分 + **成形过程设计**，
 * 2026-08-30 用户拍板 B 路线后逐轮线稿定的四件套之一二——另两件（折痕、
 * 缝壁排整齐）依赖缝区节点下标，在 levelNotched 里逐级构造）：
 * - `zipUp:[0]` 外箱拉链反向：从最小跨（面侧）放行，哪挡材料够了哪挡锁
 *   ⇒ 箱体从面鼻逐挡向外长出（实测锁定摊在 ~560–690 步），不再是
 *   「等最外键入窗、一瞬全放」的啪；
 * - `attNear:1.5`（只圈外箱链）吸引近程门：远程吸引会把等待中的富余材料
 *   拧成卷钩（鼓包想收成环），收窄到 1.5×键长后等待材料是干净的斜坡。
 * 缝链/面角键保持 v7 原时序（缝链预锁是 §15.8 的既有机理，不碰）。
 */
const SPLIT_BASE: SkinUnitOpts = {
  ...SKIN_ROOT_FIX,
  anchorEnd: true,
  boxSquare: true,
  zipUp: [0],
  attNear: 1.5,
  attNearChains: [0],
};

/** 结构自由段外裹上对位构造：杆帽贴合 + 配平垫 + 隔离贴合 + 结构 + 尾段 */
function wrap(seg: SkinSpec[number] & readonly ['f', number, ...unknown[]]): { spec: SkinSpec; base: number } {
  const pad = SPLIT_FREE_TOTAL - seg[1];
  if (pad < 0) throw new Error(`结构自由段 ${seg[1]} 节超出总量 ${SPLIT_FREE_TOTAL}`);
  return {
    spec: [['g', SPLIT_LEAD_A], ['f', pad, []], ['g', SPLIT_LEAD_B], seg, ['g', SPLIT_TAIL]],
    base: SPLIT_LEAD_A + pad + SPLIT_LEAD_B, // 结构段的绝对起点（marks 用）
  };
}

/** L0 单箱：一条链 + 方箱整形全套（目录阶梯方箱同一区制，已验证干净） */
function levelSingle(boxD = 36): SkinSplitLevel {
  const kf = Math.round((2 * SPLIT_LOBE) / 4); // 面 = 总高 24px ⇒ 半跨 6
  const kMax = kf + boxD / 2;
  const free = 2 * kMax + 1 + 2 * SPLIT_BUF;
  const c = SPLIT_BUF + kMax;
  const seg = ['f', free, fan(c, kf, kMax + 1, 2, (2 * SPLIT_LOBE) / 100), [[c - kf, c + kf]]] as const;
  const { spec, base } = wrap(seg);
  return {
    i: 0,
    t: SPLIT_T[0],
    spec,
    opts: { ...SPLIT_BASE },
    smooth: [3, 1],
    lead: base,
    free,
    marks: { center: base + c, mouthA: base + c - kf, mouthB: base + c + kf },
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
  const free = 2 * M + 1 + 2 * SPLIT_BUF; // 结构自由段 = 各级自然长度（两端缓冲恒 4）
  const c = SPLIT_BUF + M; // 缝心（自由段正中）

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
  const seg = ['f', free, fan(c, f, M + 1, 2, H / 100), panels, [crack, faceUp, faceDn]] as const;
  const { spec, base } = wrap(seg);

  // 单侧限位：缝底钉 rTip；ramp 时缝壁沿目标斜壁给上限（成形期封死外翻）
  const c0 = base + c;
  const tether: [number, number][] = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  if (tune.ramp)
    for (let k = a + 1; k <= m; k++) {
      const r = rTip + ((k - a) * (SPLIT_DEPTH / 100 - rTip)) / wallN;
      tether.push([c0 + k, r], [c0 - k, r]);
    }
  // 成形过程设计其余两件（B 定稿 v3，2026-08-30）：
  // ① 缝区折痕待命（coreTetherRel **同侧规则**）：缝壁不得越过同侧缝角所在
  //    的面、缝心贴双角——等待期缝料压平读作面上一道折痕，箱面越过 rTip 后
  //    缝才从零逐步裂开（先见折痕、后见裂开，中间态始终是家族成员）。
  //    跨侧耦合版（每个节点贴双角）会把 L5 拖塌（Δ3.29→16.5），弃。
  // ② 缝壁排整齐（alignRuns 缝角↔缝底角）：锯齿 = 键与键之间的富余材料鼓成
  //    的小包串（用户「干净的方案不应该出现锯齿」），均匀排布直接抹平——
  //    终态反而全面更贴目标线（缝壁本来就该是直的），瞬态自交环密采归零。
  const crease: (readonly [number, number, number])[] = [];
  for (let i = c0 - m + 1; i < c0 + m; i++) {
    if (i < c0) crease.push([i, c0 - m, 0]);
    else if (i > c0) crease.push([i, c0 + m, 0]);
    else crease.push([i, c0 - m, 0], [i, c0 + m, 0]);
  }
  const walls: (readonly [number, number])[] = [
    [c0 - m, c0 - a],
    [c0 + a, c0 + m],
  ];

  return {
    i,
    t,
    spec,
    lead: base,
    free,
    opts: {
      ...SPLIT_BASE,
      ...(tune.warp !== undefined ? { warp: tune.warp } : {}), // 扫描工具用；站上走自然时序
      sqChains: [0], // 方箱整形只作用于外箱梯
      ...(tune.lvl ? { levelChains: [1] } : {}), // 缝链只吃找平 + 端角重申
      coreTether: tether,
      coreTetherRel: crease,
      alignRuns: walls,
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
