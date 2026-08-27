/**
 * 项目二 · 双结构带（一条带上出现两个折叠结构）——纯数据，零 DOM。
 *
 * 用户 2026-08-26 草图立项：左 = 现有单结构带，右 = 「条可以出现两个结构的」。
 *
 * ## 内核零改
 *
 * SkinSpec 本就是通用分段列表（v7 的四个单元只是恰好都只有一个自由段）：
 * buildUnit 对每个带键谱的自由段各建一条独立拉链，advance 里锁定/层直化/
 * 吸引全部按链循环。双结构 = **五段谱**
 *   [贴合 lead | 自由 f₁(键谱A) | 贴合 mid | 自由 f₂(键谱B) | 贴合 tail]
 * ——不是交接件暂缓的 tunnel 形态（那个要「皮-芯键新键型」，这里没有任何新键型）。
 *
 * ## 解耦的构造前提（两个下限，实测钉准）
 *
 * 中间贴合段每迭代两次钉回芯上，两个结构之间只隔着被钉死的材料。
 * - **mid ≥ 16（合法下限）**：全局约束里跨距最大的是 16（span-16 抗弯），
 *   不短于它就没有任何一条约束同时抓住两个自由段的节点。锁定键集合与单结构
 *   逐位相同；但一个迭代**内**的瞬时位移仍会经贴合段传导（钉回发生在迭代末），
 *   实测形态偏差 mid=16 时 0.40px（折叠体）/ 0.86px（贴轴缓冲）——肉眼不可见。
 * - **mid ≥ 29（逐位解耦）**：一个迭代内扰动经贴合段的最大传导距离 =
 *   16（span-16 的读窗）+ 13（前序 stretch/bend4/bend8 的累计写入 1+4+8）= 29 节；
 *   贴合段不短于它时「把另一个结构拿掉」的对照带与双结构带**逐位相同**
 *   （实测 mid=28 偏差 7e-2px、mid=29 起精确 0.000——守门卡的就是这一位）。
 *
 * ## 单收缩自由度
 *
 * 交接件语义是「每单元一个收缩自由度 ℓ」——双结构带仍是**一个单元**，两个结构
 * 同步收缩。r₁ 与 boxSquare 都是单元级选项，两个结构必须同值：袋（r₁=0.66）
 * 不能与全深形态混排，阶梯方箱（boxSquare 作用于全部链）不能与非方箱形态混排
 * ——buildDualBand 对不合法的搭配直接抛错，而不是悄悄用其中一边的值。
 */
import { placeOnBand } from './skin-array';
import { SKIN_UNITS, fan, skinSiteOpts, type SkinUnitDef } from './skin-data';
import { SKIN, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';

/** 每个结构自己的自由段长（= Lab.08 对位构造的 ARRAY_FREE，四种目录形态都放得下且缓冲 ≥4） */
export const DUAL_FREE = 61;
/** 扇形对位中心（正居中 ⇒ 上下缓冲等长，对位构造的 φ=1/2 对每个结构各自成立） */
export const DUAL_CENTER = (DUAL_FREE - 1) / 2;
/** 默认三段贴合：顶 / 中 / 尾。mid 默认取合法下限 16 = 线稿里最贴草图的紧凑间距 */
export const DUAL_LEAD = 24;
export const DUAL_MID = 16;
export const DUAL_TAIL = 24;
/** 合法下限：全局约束最大跨距 = 16（advance 里的 span-16 抗弯），无一条约束跨两段 */
export const DUAL_MID_MIN = 16;
/** 逐位解耦下限：迭代内扰动最大传导 16 + (1+4+8) = 29 节（推导见文件头，实测钉准） */
export const DUAL_MID_EXACT = 29;
/** 台架的间距三档（mid 是待拍板的手感量——照转速滑块的先例做成控件，不替用户定死）：
 *  紧凑 16 = 草图 · 29 = 逐位解耦下限 · 48 = 拉开读 */
export const DUAL_MID_OPTIONS = [DUAL_MID_MIN, DUAL_MID_EXACT, 48] as const;

export interface DualDims {
  lead?: number;
  mid?: number;
  tail?: number;
  free?: number;
}

/** 五段谱：两段既有键谱各搬到自己的自由段正中（形态逐位不动，placeOnBand 同一份） */
export function buildDualSpec(segA: SkinSeg, segB: SkinSeg, dims: DualDims = {}): SkinSpec {
  const lead = dims.lead ?? DUAL_LEAD;
  const mid = dims.mid ?? DUAL_MID;
  const tail = dims.tail ?? DUAL_TAIL;
  const free = dims.free ?? DUAL_FREE;
  const center = (free - 1) / 2;
  return [
    ['g', lead],
    placeOnBand(segA, free, center),
    ['g', mid],
    placeOnBand(segB, free, center),
    ['g', tail],
  ];
}

export interface DualBandDef {
  key: string;
  zh: string;
  en: string;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

const byKey = (k: string): SkinUnitDef => {
  const d = SKIN_UNITS.find((u) => u.key === k);
  if (!d) throw new Error(`未知形态 ${k}`);
  return d;
};

/**
 * 目录形态两两成带。keyB 省略 = 同形双结构（草图右侧那种）。
 * A 在上（靠注册前端）、B 在下（靠钉住端）。
 */
export function buildDualBand(keyA: string, keyB: string = keyA, dims?: DualDims): DualBandDef {
  const A = byKey(keyA);
  const B = byKey(keyB);
  // 单元级选项必须同值（单收缩自由度；boxSquare 作用于全部链）——不合法的搭配抛错
  if ((A.r1 ?? SKIN.R1) !== (B.r1 ?? SKIN.R1))
    throw new Error(`双结构带是一个单元、一个收缩自由度：${keyA}(r₁=${A.r1 ?? SKIN.R1}) 与 ${keyB}(r₁=${B.r1 ?? SKIN.R1}) 不能混排`);
  if (!!A.boxSquare !== !!B.boxSquare)
    throw new Error(`boxSquare 是单元级整形（作用于全部链）：${keyA} 与 ${keyB} 不能混排`);
  const sa = A.smooth ?? [3, 1];
  const sb = B.smooth ?? [3, 1];
  return {
    key: keyA === keyB ? `dual-${keyA}` : `dual-${keyA}-${keyB}`,
    zh: keyA === keyB ? `双${A.zh}` : `${A.zh}＋${B.zh}`,
    en: keyA === keyB ? `double ${A.en}` : `${A.en} + ${B.en}`,
    spec: buildDualSpec(A.spec[1], B.spec[1], dims),
    opts: skinSiteOpts(A),
    smooth: [Math.max(sa[0], sb[0]), Math.max(sa[1], sb[1])] as const,
  };
}

/**
 * Lab.11 台架的五条带：四种同形对（目录序，草图右侧那种）+ 一条混排
 * （蘑菇＋直挑台——两条拉链各自独立的直接演示）。五条各自独立引擎。
 */
export function buildDualDisplay(dims?: DualDims): DualBandDef[] {
  return [
    buildDualBand('pocket', 'pocket', dims),
    buildDualBand('bulb', 'bulb', dims),
    buildDualBand('ledge', 'ledge', dims),
    buildDualBand('stepped', 'stepped', dims),
    buildDualBand('bulb', 'ledge', dims),
  ];
}

/**
 * 解耦对照带：与双结构带同一条带（同长、同贴合分段、同收缩），只把其中一个
 * 结构的键谱拿掉（那个自由段留着、键清空）。守门用它证明「另一个结构在不在，
 * 这个结构的形态与锁定键逐位不变」。
 */
export function buildDualControl(
  keyA: string,
  keyB: string,
  drop: 'A' | 'B',
  dims?: DualDims,
): DualBandDef {
  const band = buildDualBand(keyA, keyB, dims);
  const free = dims?.free ?? DUAL_FREE;
  const empty: SkinSeg = ['f', free, []];
  const spec = band.spec.map((s, i) =>
    (drop === 'A' && i === 1) || (drop === 'B' && i === 3) ? empty : s,
  ) as unknown as SkinSpec;
  return { ...band, key: `${band.key}-ctrl-${drop}`, spec };
}

/**
 * 过渡组（用户 2026-08-26 草图二：「一组过渡组，从左边的形状平滑过渡到右边」——
 * 左 = 单阶梯方箱，右 = 双阶梯方箱）。
 *
 * 结构的「出生」走**材料捕获量**那个旋钮（环族放大的既定结论：挑出 ≈ 最外键
 * 半跨 × 2px）：下结构的扇形从一对键起逐级向外加键（kMax 8 → 26，每级一根），
 * rb 与端面板恒取方箱自己的值。kMax=8 时捕获弧长 32px 恰好等于键长 ⇒ 出生态
 * 是一段平直面（挑出 0），此后每级 +2 节捕获 ⇒ 挑出连续爬升到满谱的 40.6px。
 * 等长键纪律在每一级都精确成立（全部键 rb = 端面板跨度 × SEG）。
 *
 * **顶端锚定生长（首版事故的修正）**：首版把每级扇形正居中摆，小结构两侧留下
 * 20 节量级的空余缓冲——小结构 + 长缓冲 = 轴向位置欠定（实测嘴整体逃出自己的
 * 槽：kMax=10 在槽上方 44px、kMax=20 在槽下方 26px，相邻距离 Δ 冲到 18.9）。
 * 终谱的位置之所以确定，是因为它的缓冲只有 4 节。修正 = 每级扇心 c = 4 + kMax：
 * 最外键上角恒在节点 4（= 终谱的上缓冲），上缓冲全程 4 节、短到钉死位置；
 * 结构从上贴合段下方出生、只向下延伸、上缘全程不动，末级 c=30 恰好逐位收敛到
 * 双方箱正谱。下方的长空余是**无键**松弛段，贴轴摊平（L0 对照带同款，实证是平的）。
 *
 * 五段布局全级恒定（= 双结构带默认布局，键谱是唯一变量）⇒ 收缩轨迹全级逐位
 * 同步、帘子高度不参差；上结构 A 逐级**同一个对象**（守门卡引用同一）。
 * 端点都是既有对象：L0 = 解耦对照带（真单结构），末级 = buildDualBand('stepped')
 * 的谱（B 段直接引用同一）。
 */
export function buildDualTransition(dims?: DualDims): DualBandDef[] {
  const dual = buildDualBand('stepped', 'stepped', dims);
  const ctrl = buildDualControl('stepped', 'stepped', 'B', dims);
  const segB = dual.spec[3] as SkinSeg & { 3?: readonly (readonly [number, number])[] };
  const bonds = segB[2]! as readonly (readonly [number, number, number])[];
  const half = (b: readonly [number, number, number]): number => (b[1] - b[0]) / 2;
  const rb = bonds[0][2]; // 等长键：全部键同一 rb = 端面板跨度 × SEG
  const panelHalf = (segB[3]![0][1] - segB[3]![0][0]) / 2; // 方箱端面板半跨（8）
  const topBuf = Math.min(...bonds.map((b) => b[0])); // 终谱的上缓冲节数（4）= 锚
  const spans: number[] = [...new Set(bonds.map(half))].sort((a, b) => a - b); // 8, 10, …, 26
  // 尾部半步内插（kMax=25）：剪影口径下最大的一步是末步（24→26 Δ4.71——最后一口
  // 材料全变成可见的箱体，而出生期的捕获有一半藏在下垂里），劈成两半。键是任意
  // 皮对、奇数半跨合法，rb 仍等长 ⇒ 纪律不破；该级键数与末级同为 10（换外键不加键）
  const sched = [...spans.slice(0, -1), spans[spans.length - 1] - 1, spans[spans.length - 1]];
  const out: DualBandDef[] = [{ ...ctrl, key: 'dual-t00', zh: '单阶梯方箱', en: 'single stepped box' }];
  sched.forEach((kMax, i) => {
    const last = i === sched.length - 1;
    const c = topBuf + kMax; // 顶端锚定：最外键上角恒在节点 topBuf，扇心随级下移
    const inner = fan(c, 8, kMax % 2 ? kMax : kMax + 1, 2, rb); // 偶数 kMax 时含最外键
    const seg = last
      ? segB // 末级 = 双方箱正谱（同一个对象——端点守门卡引用同一）
      : (['f', segB[1], kMax % 2 ? [...inner, [c - kMax, c + kMax, rb] as const] : inner, [[c - panelHalf, c + panelHalf]]] as unknown as SkinSeg);
    out.push({
      ...dual,
      key: `dual-t${String(i + 1).padStart(2, '0')}`,
      zh: last ? '双阶梯方箱' : `过渡 ${i + 1}（kMax ${kMax}）`,
      en: last ? 'double stepped box' : `transition ${i + 1}`,
      spec: dual.spec.map((s, si) => (si === 3 ? seg : s)) as unknown as SkinSpec,
    });
  });
  return out;
}
