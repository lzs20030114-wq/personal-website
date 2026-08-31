// 线稿工具：把一串键谱的**真引擎终态剖面**画成只有线的形态系列。
//
// 纪律（用户 2026-08-20 立）：先设计只有线的形态系列、确认后再上 3D。
// 用法： npx vite-node scripts/skin-ring/draft.mjs <out.svg> [模式]
//   模式 catalog（默认）= 目录四形态并排 + 叠合对照
//        bulb-ledge = 蘑菇↔直挑台的粗排系列（探路用；实测这一对差 1.86px，已否）
//        ring-gradient = 定版：Lab.09 环上渐变（蘑菇↔方箱，20 位回文 = 11 级）
//        ring-square = 方形环线稿：三档挑出把俯视外轮廓凑成正方形（角带 = 现行方箱原谱）
//        ring-square-x = 方形环 · 横向压缩族（用户方案）：只压挑出、高度不变——
//                        rb/端面板一律不动，从外侧剪梯挡（粗调）+ 端面板宽（细调）
//        ring-morph = 圆↔方五档线稿：俯视轮廓（目标超椭圆 + 二十个外缘点 + 弦）
//                     + 各档真引擎终态剖面叠合（整套查站上模块，不另写一份）
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import {
  RING, RING_BAND_NODES, RING_CENTER, RING_GROW, RING_LEAD,
  buildRingUnits, growSeg,
} from '../../src/lib/space/skin-ring.ts';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL, placeOnBand } from '../../src/lib/space/skin-array.ts';
import { SKIN_SITE_BASE, SKIN_UNITS, skinSiteOpts } from '../../src/lib/space/skin-data.ts';
import {
  SQUARE, SQUARE_MORPH, SQUARE_TIERS, buildSquareOrder, squareAngle, squareBuffer, squareFree,
  squareHalfSide, squareMorphExp, squareMorphRadiusAt, squareMorphReach, squareMorphRim,
  squareMorphTiers, squareSpec,
} from '../../src/lib/space/skin-square.ts';
import { buildGradientOrder, buildRingGradient } from '../../src/lib/space/skin-ring-gradient.ts';

const OUT = process.argv[2] ?? 'draft.svg';
const MODE = process.argv[3] ?? 'catalog';
const M = 160; // 等弧长重采样点数

const runToEnd = (spec, opts) => {
  const s = createSkinUnit(spec, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
/** 自由段终态剖面（世界 px，x = 离轴、y = 向下） */
const rawProfile = (sim) => {
  const pts = [];
  for (let i = ARRAY_LEAD; i < ARRAY_LEAD + ARRAY_FREE; i++)
    pts.push([sim.px[i] * 100, -sim.py[i] * 100]);
  return pts;
};
const resample = (pts) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++)
    L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let m = 0; m < M; m++) {
    const s = (m / (M - 1)) * total;
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])]);
  }
  return out;
};
const dist = (A, B) => {
  let s = 0;
  for (let i = 0; i < M; i++) s += Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]);
  return s / M;
};
/** 画图平滑（照台架的 renderSmooth 口径，只为线稿好看，不改物理） */
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next = cur.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = -w; k <= w; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        sx += cur[j][0];
        sy += cur[j][1];
        n++;
      }
      return [sx / n, sy / n];
    });
    cur = next;
  }
  return cur;
};

const band = (freeSeg) => [['g', ARRAY_LEAD], freeSeg, ['g', ARRAY_TAIL]];
const DEFS = buildRingUnits();
const byKey = Object.fromEntries(DEFS.map((d) => [d.key, d]));

/** 端点 A→B 的渐变系列：内侧键对按 rb 连续收紧（不是二值加键） */
function bulbLedgeSeries(levels) {
  // 蘑菇 = fan(30, 8..24, rb .10)；直挑台 = fan(30, 4..24, rb .09)
  // 差别只有内侧两对（k=4、6）。二值加键 = 一步跳完 = 断层（Lab.08 的教训），
  // 故内侧两对全程都在，rest 长度从「蘑菇终态下它们本来的间距」连续收到 .09。
  const OPEN = { 4: 0.182, 6: 0.24 }; // 蘑菇终态实测间距（px/100）
  const out = [];
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1);
    const rbOuter = 0.1 + (0.09 - 0.1) * t;
    const bonds = [];
    for (const k of [4, 6]) {
      // 内侧两对错峰收紧：k=6 走前 70%，k=4 走后 70%（同时收会把尖端一次夹死）
      const tk = k === 6 ? Math.min(1, t / 0.7) : Math.max(0, (t - 0.3) / 0.7);
      bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, OPEN[k] + (0.09 - OPEN[k]) * tk]);
    }
    for (let k = 8; k < 26; k += 2) bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, rbOuter]);
    bonds.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    out.push({ label: `t=${t.toFixed(2)}`, spec: band(['f', ARRAY_FREE, bonds]), opts: { ...SKIN_SITE_BASE }, smooth: [5, 2] });
  }
  return out;
}

function seriesFor(mode) {
  if (mode.startsWith('ring-gradient')) {
    // ring-gradient 或 ring-gradient:<panel格>:<梯挡格>（比稿用）
    const [, pw, kj] = mode.split(':');
    return buildRingGradient(pw ? Number(pw) : undefined, kj ? Number(kj) : undefined).map((d) => ({
      label: d.zh, spec: d.spec, opts: d.opts, smooth: d.smooth,
    }));
  }
  if (mode === 'catalog')
    return DEFS.map((d) => ({ label: `${d.zh} · ${d.en}`, spec: d.spec, opts: d.opts, smooth: d.smooth }));
  if (mode === 'bulb-ledge') return bulbLedgeSeries(11);
  throw new Error(`未知模式 ${mode}`);
}

// ── ring-square：方形环线稿（用户 2026-08-30「先用最简单的 Lab.09 的最初形态来做」）──
//
// 筒芯保持圆的，靠每条带挑出多远把**俯视外轮廓**凑到一个正方形上。
// 相位转半格（9°）让 4 条带正好落在 4 个角上 ⇒ 20 个平台外缘点全部落在方形边上；
// 环间膜俯视是弦线、同一条边上两点之间的弦就是边本身 ⇒ 终态外轮廓精确是方形。
// 20 位 ÷ D4 对称 = 只有 3 档挑出（面 8 条 / 边 8 条 / 角 4 条），解 3 条摆 20 处。
//
// 级族 = 等比缩放（growSeg 的 g 分档，形态同一张方箱谱、键根数不变）。
// 方形只能「往里做」：角档 = 现行方箱原谱（g = RING_GROW，即 Lab.09 整环同形那条），
// 其余两档往小缩——反过来把面档钉在现行大小去把角做大，挑出要 116px+，
// 202 节的带子装不下（总长钉死是 2026-08-25 的拍板）。
// 半径也钉死在默认值：挑出目标是「方形极径 − 站位半径」的绝对量，R 一变三档全要重标。
// ring-square-x（用户 2026-08-30 方案）：**只有向外扩展的横向维度被压缩，高度不变**，
// 每条带的压缩比例由「放进方形里具体压缩了多少」反推。机制上 = 剪梯族：
// 同一张方箱谱，rb（=箱高）与端面板一律不动，从外侧剪梯挡——挑出就是最外键兜住的
// 材料对折的长度（§14.5.3 实测关系），剪掉外圈键 = 只减折叠深度、不动端面高度。
// 粗调 = 剪几根（一根 ≈ 8px），细调 = 端面板半跨（渐变实测它在 2.1 尺度是连续杠杆）。
//
// **实测结论（2026-08-30，横向成立、竖向失败，弯路入档）**：
// - 横向那半成立：三档挑出贴住目标（外缘偏差 1.1px）、嘴 68px 三档恒定、键各自全锁；
// - 竖向失败：嘴心全程散布 22–61px，剖面图上箱子在跨度里各滑一头（边档沉到下半、
//   面档浮到上半且破形）。机理是一条结构性的账——箱高 68px 的竖向跨度由**锁定的
//   嘴键**撑着（零材料），于是自由段节点数被迫 ≥ ~115 才放得下这个跨度；节点就是
//   材料，角档的键兜走 220px 刚好吃满，面档的键只兜 136px，多出 ~90px 富余料挤在
//   ~3px 的松弛区间里打褶，而引擎的硬机制清单（§16）里**没有任何钉竖向位置的机制**
//   ——箱子连同褶一起乱滑。等比族没这个病：形一缩嘴也缩，自由段能贴身。
// - 端面板收窄（±13）还会破「面板端点恰好是锁定键」的触发条件，端面鼓圆角。
// 结论：高度钉在现行 68px 的横向压缩做不干净；「高度一圈恒定」要可行得把恒定值
// 降到面档反推的上限（H ≲ 1.2·kMax_face + ~10 ≈ 50px），那样每档都能贴身+配平垫。
// 模式保留作证据与复查工具。
// ring-square-h（用户 2026-08-30 拍板 A）：**高度一圈恒定、只有深度在变**。
// 是 x 族（用户方案）的可行版本——x 族横向那半成立、竖向失败，根因是箱高钉在 68px
// 时浅档的自由段放不下（详见 ring-square-x 注释）。把恒定值降到**带子装得下**的范围
// （默认 36，上限见下），每一档就都能用「贴身自由段 + 配平垫」的干净构造。
//
// 参数化（全部是已验证过的零件，无新机制）：
// - 箱高 H 恒定 ⇒ 嘴键 rb = H/100 全员相同；端面板半跨 = H/4 节（等长键纪律精确：
//   端面弧长 = 板跨 × SEG = 键长 ⇒ 端面必然被拉直）；
// - 深度由最外键的半跨定，材料账 4k = 2D + H ⇒ **D = 2k − H/2**（x 族实测验过：
//   k=34→34.0 / 46→57.9，与账逐一对上）；
// - 梯挡沿深度**间距恒定 8px**（KSTEP=4 节，原谱放大后的步长），故浅档自然少几根
//   ——一圈的梯纹是同一种织法，不是每条带各自拉伸；
// - 缓冲 b 由折叠余量 E = 4b − (轴向间隙) ≥ E_MIN 定（余量太小缓冲被拉直、箱子变形；
//   太大就是 x 族那种堆料乱滑）。这条规则在角档实扫验证。
//
// **定案（2026-08-30 实测，H=36）**：角 k52 / 边 k39 / 面 k35，一律 10 挡、嘴 36px。
// 挑出 89.2 / 63.7 / 56.0（外缘点对目标方形 ≤0.9px），箱高实测三档全是 **36.0px**、
// 顶面水平度 ≤0.1px，**平台面终态散布 0.0px、全程最差 1.6px**，且三档 lead 相同
// ⇒ 补偿一节都没用上，对齐是构造直接给的。方形边长 169px（等比族 156）。
//
// **H 的上限由带子总长定（202 节，2026-08-25 用户拍板钉死）**：
// 浅档要「箱子住得下自由段」⇒ 它的 k 要够大 ⇒ 方形要够大 ⇒ 角档 F_TOT 要够长。
// 逐档算下来 H=36 需 127 节、H=38 需 135 节（= lead 只剩 20 的硬上限）、
// H=40 需 141 节（超）。故 **H ≈ 38 是极限，取 36 留余量**。要更高的箱只能放开
// 「带子总长 202」那条拍板。
//
// 三条实测教训（都踩过，别再走）：
// ① **深度不服材料账**：4k = 2D + H 推出的 D = 2k − H/2 高估，实测 D ≈ 1.78k
//    （差的材料进了四个圆角与嘴的过渡段）。账只配当搜索起点，档位一律实测挑。
// ② **缓冲要按折叠余量恒定给，不能全员同值**：全员 b=7 那版浅档余量 31.6px
//    （角档才 13.6），扫掠当场非单调（k29→44 / k31→34），是富余材料在结构段里
//    乱折 —— x 族那个病的小号版。
// ③ **补偿的符号**：嘴心是从带顶往下量的，mouthY = 2(lead+iso) + 2r(**上**垫 + …)
//    ⇒ 管斜率的是上垫、lead 与 mouthY 同向。先按「下垫管斜率」写，把面档从
//    6.7 推到 13.9px 才发现。
//
// ④ **端面板端点必须恰好是一根锁定的梯挡**（用户 2026-08-30 看图「跑型了 明显不行」
//    的病根，§16.1 硬机制表里那条）。原谱这条自动成立（最内梯挡 17 = 板半跨）；
//    H 68→48 后板半跨变 12，而梯挡若按比例缩最内是 9/17 ⇒ **三档的端面硬投影
//    全没触发**，端面鼓、箱子跑型，而键全锁、箱高读数还都对得上。把最内梯挡钉在
//    PW_H 上（其余在 PW_H..kMax 间均分）即三条件同时成立；改完箱高从 48/48.2/49.3
//    变成三档精确 48.0、顶面水平度 0.2px，**扫掠也从非单调恢复完全单调**
//    ——先前记的「k≈26/31–32 另有折叠分支」那条盲区随之消失，根因是同一件事。
// ⑤ **验收量要测顶/底面本身**：只测「端面那一段的 y 跨度」会漏掉跑型（面是斜的、
//    跨度照样对）。现在测顶面/底面各自的位置与水平度；采样要**排除端面那一段**
//    ——端面的点 y 跨越半个箱高，混进来会把水平度读成 ~H/2（首版读出 22px 的假跑型）。
// ⑥ **warp 在这一族不可用**：它让同一时刻三档的 r 不同，而对位构造（嘴心随 r 的
//    常数项/斜率项）的前提正是同一时刻同一 r，用了反而全盘失配。三档末锁步
//    501/603/652 不同是事实，但不能靠 warp 抹平。
//
// ⑦ **「箱子住得下自由段」这条约束必须写成代码，不能只写在注释里**（用户
//    2026-08-30 看叠合图指出「绿色底部这个形状咋反了」的病根）。面档 fs=75 时
//    自由段在收缩终点的轴向跨度只有 44.4px，而箱高 48px ⇒ 间隙为 −3.6px：
//    箱子比它住的那一段还高，嘴的上节点被顶到段端、下节点只能伸到段外，
//    **下侧缓冲被拉直外翻**，上侧却松弛折叠 —— 上下不对称，底部嘴角就反向弯了。
//    这与 x 族失败是同一条约束，当时只在注释里推导（「H ≲ 50」）没落地成守门。
//    现在 gapOf ≥ G_MIN 进了 bForK 与 healthy 两处。
// ⑧ **对齐不需要旋钮，对称垫本身就精确满足**：上垫 + (fs−1)/2 = (F_TOT−1)/2 恒定
//    ⇒ 常数项与斜率项本来就三档相同。此前之所以要补偿，是因为箱子被挤（间隙不足）
//    产生的物理偏移；而补偿用的 padShift 会让结构两侧材料不对称、把形也弄不对称
//    （同一张图上用户还指出「有点小偏移」——两件事同一个根源）。间隙修好后
//    实测三档 lead 相同、平台面散布 0.0px。padShift 已撤（参数保留备查，恒传 0）。
//
// **一条方法教训**：这一族连翻三次车（端面投影没触发 / 间隙为负 / 为指标加旋钮
// 毁了形），三次都是「读数全绿、图不对」。§16.3 说的「人肉看图前先看分数」要补一句：
// **分数只能否决，不能通过**——通过必须看图，且要看上下对称性这类分数没度量的性质。
// ── ring-morph：圆↔方五档（2026-08-31）。轮廓从方形的**内切圆**长到方形，
// 半边长 a 全程不变 ⇒ 面档几乎不动、角往外长。几何与档位一律查 skin-square.ts
// （线稿与站上共用一份实现——§17 纪律），这里只负责画。
if (MODE === 'ring-morph') {
  ringMorph();
  process.exit(0);
}

function ringMorph() {
  const P = 30;
  const N = SQUARE.COUNT;
  const R = SQUARE.RADIUS;
  const a = squareHalfSide();
  const opts = skinSiteOpts(SKIN_UNITS.find((d) => d.key === 'stepped'));
  const order = buildSquareOrder();
  const STEPS = SQUARE_MORPH.STEPS;

  // 每档：三条真引擎终态剖面（只跑不同的 kMax，最多 3 条/档，重复的复用）
  const cache = new Map();
  const sectionOf = (k) => {
    if (!cache.has(k)) {
      const sim = runToEnd(squareSpec(k), opts);
      const pts = [];
      for (let i = 0; i < sim.n; i++) pts.push([sim.px[i] * 100, -sim.py[i] * 100]);
      cache.set(k, pts);
    }
    return cache.get(k);
  };

  const steps = Array.from({ length: STEPS }, (_, s) => {
    const tiers = squareMorphTiers(s);
    const reach = squareMorphReach(s);
    const rim = squareMorphRim(s);
    return { s, tiers, reach, rim, n: squareMorphExp(s), sections: tiers.map((t) => sectionOf(t.k)) };
  });

  console.log(`ring-morph · 圆↔方 ${STEPS} 档（半边长 a=${a.toFixed(1)}px 钉死 = 方形的内切圆；站位半径 R=${R}）`);
  for (const st of steps) {
    const dev = Math.max(...st.rim.map((q) => Math.abs(q.dev)));
    console.log(
      `  ${SQUARE_MORPH.LABELS[st.s]}  n=${Number.isFinite(st.n) ? st.n.toFixed(2).padStart(5) : '    ∞'}` +
        `  k=[${st.tiers.map((t) => t.k).join(', ')}]  挑出=[${st.reach.map((r) => r.toFixed(1)).join(', ')}]` +
        `  外缘点对轮廓线偏差 ≤${dev.toFixed(2)}px  角点 ${(R + st.reach[2]).toFixed(1)}px`,
    );
  }
  const kc = steps.map((st) => st.tiers[2].k);
  console.log(`  角档 kMax 逐级 ${kc.join(' → ')}（Δ ${kc.slice(1).map((k, i) => k - kc[i]).join(' · ')}）`);
  console.log(`  末档 = 档案三档 ${JSON.stringify(steps[STEPS - 1].tiers.map((t) => t.k))} vs ${JSON.stringify(SQUARE_TIERS.map((t) => t.k))}`);

  // ── 出图：上排 = 五档俯视轮廓；下排 = 各档三条剖面叠合
  const CW = 250, CH = 250, GAP = 18, SC = 0.86;
  const SEC_H = 230;
  const W = P * 2 + STEPS * CW + (STEPS - 1) * GAP;
  const H = P + 34 + CH + 26 + SEC_H + P;
  const COL = ['#2f7d4f', '#b8791f', '#7a4fc0'];
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#faf9f6"/>`);
  out.push(`<text x="${P}" y="${P}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ring-morph · 圆 ↔ 方五档（俯视轮廓 / 真引擎终态剖面）</text>`);
  out.push(`<text x="${P}" y="${P + 17}" font-size="10.5" fill="#6b6b66">半边长 a=${a.toFixed(1)}px 全程不变（方形的内切圆）· 箱高恒 ${SQUARE.H}px · 每条带 10 挡 · 面 8 / 边 8 / 角 4 · 灰 = 目标超椭圆，实线 = 二十个外缘点连成的弦</text>`);

  for (const st of steps) {
    const ox = P + st.s * (CW + GAP), oy = P + 34;
    const cx = ox + CW / 2, cy = oy + CH / 2 + 8;
    const px = (x) => cx + x * SC, py = (z) => cy + z * SC;
    out.push(`<rect x="${ox}" y="${oy}" width="${CW}" height="${CH}" fill="#fff" stroke="#e3e1da"/>`);
    out.push(`<text x="${ox + 8}" y="${oy + 15}" font-size="11.5" font-weight="700" fill="#1b1b1a">${SQUARE_MORPH.LABELS[st.s]}${Number.isFinite(st.n) ? ` · n=${st.n.toFixed(2)}` : ' · n→∞'}</text>`);
    // 目标轮廓线
    const curve = [];
    for (let d = 0; d <= 360; d++) {
      const th = (d * Math.PI) / 180;
      const r = squareMorphRadiusAt(th, st.s, a);
      curve.push(`${px(Math.cos(th) * r).toFixed(1)},${py(Math.sin(th) * r).toFixed(1)}`);
    }
    out.push(`<polyline points="${curve.join(' ')}" fill="none" stroke="#c9c6bd" stroke-width="1.2"/>`);
    // 芯（站位圆）
    out.push(`<circle cx="${px(0)}" cy="${py(0)}" r="${(R * SC).toFixed(1)}" fill="none" stroke="#dcd9d0" stroke-width="1" stroke-dasharray="3 3"/>`);
    // 二十条带 + 外缘点 + 弦
    const rim = st.rim;
    out.push(`<polygon points="${rim.map((q) => `${px(q.x).toFixed(1)},${py(q.z).toFixed(1)}`).join(' ')}" fill="none" stroke="#1b1b1a" stroke-width="1.4"/>`);
    for (let i = 0; i < N; i++) {
      const th = squareAngle(i);
      out.push(`<line x1="${px(Math.cos(th) * R).toFixed(1)}" y1="${py(Math.sin(th) * R).toFixed(1)}" x2="${px(rim[i].x).toFixed(1)}" y2="${py(rim[i].z).toFixed(1)}" stroke="${COL[order[i]]}" stroke-width="1.6" opacity="0.85"/>`);
      out.push(`<circle cx="${px(rim[i].x).toFixed(1)}" cy="${py(rim[i].z).toFixed(1)}" r="2" fill="${COL[order[i]]}"/>`);
    }
    out.push(`<text x="${ox + CW / 2}" y="${oy + CH - 8}" font-size="10" text-anchor="middle" fill="#6b6b66">k ${st.tiers.map((t) => t.k).join(' / ')} · 挑出 ${st.reach.map((r) => r.toFixed(0)).join(' / ')} · 偏差 ≤${Math.max(...rim.map((q) => Math.abs(q.dev))).toFixed(2)}px</text>`);
  }

  // 下排：剖面叠合（同一档三条按颜色，越深越长）
  const sy = P + 34 + CH + 26;
  // 只框折叠体那一段（离轴 >2px）——整条带绝大部分是贴轴的竖料，框进来箱子就成了一条缝
  let ymin = 1e9, ymax = -1e9, xmax = 0;
  for (const st of steps) for (const sec of st.sections) for (const [x, y] of sec) {
    if (x <= 2) continue;
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xmax = Math.max(xmax, x);
  }
  ymin -= 6; ymax += 6;
  const ssc = Math.min((CW - 34) / (xmax + 10), (SEC_H - 44) / (ymax - ymin));
  for (const st of steps) {
    const ox = P + st.s * (CW + GAP);
    out.push(`<rect x="${ox}" y="${sy}" width="${CW}" height="${SEC_H}" fill="#fff" stroke="#e3e1da"/>`);
    out.push(`<text x="${ox + 8}" y="${sy + 15}" font-size="10.5" fill="#6b6b66">终态剖面 · 只框折叠体（面 / 边 / 角）· 箱高恒 ${SQUARE.H}px</text>`);
    const bx = ox + 16, by = sy + 26;
    out.push(`<line x1="${bx}" y1="${by}" x2="${bx}" y2="${by + (ymax - ymin) * ssc}" stroke="#dcd9d0" stroke-width="1" stroke-dasharray="3 3"/>`);
    st.sections.forEach((sec, t) => {
      const pts = sec.map(([x, y]) => `${(bx + x * ssc).toFixed(1)},${(by + (y - ymin) * ssc).toFixed(1)}`).join(' ');
      out.push(`<polyline points="${pts}" fill="none" stroke="${COL[t]}" stroke-width="1.2" opacity="0.9"/>`);
    });
  }
  out.push('</svg>');
  writeFileSync(OUT, out.join('\n'));
  console.log(`→ ${OUT}`);
}

if (MODE === 'ring-square' || MODE === 'ring-square-x' || MODE.startsWith('ring-square-h')) {
  const fam = MODE === 'ring-square-x' ? 'x' : MODE.startsWith('ring-square-h') ? 'h' : 'iso';
  ringSquare(fam, Number(MODE.split(':')[1]) || 36);
  process.exit(0);
}

function ringSquare(FAMILY, H_H) {
  const P = 30; // 画布边距（别用全局 PAD——它声明在本函数被调用之后，TDZ）
  const stepped = SKIN_UNITS.find((d) => d.key === 'stepped');
  const R = RING.RADIUS_DEF;
  const N = RING.COUNT;
  const PHASE = Math.PI / N; // 半格 = 9°：角带落在 45°/135°/225°/315°
  const BUF = 4; // 键谱两端缓冲的纪律下限
  const ISO = 16; // 垫与结构之间的隔离贴合（Lab.12 配平垫先例：约束最大跨距，结构动力学不受垫扰）
  const TAIL2 = 15; // 尾段照环族惯例

  // 贴身自由段：该 g 下 2(kMax+BUF)+1 的最小奇数长度（扇心居整数节点、缓冲压到纪律下限）
  const tautFs = (grown) => {
    let kMax = 0;
    for (const [i, j] of grown[2]) kMax = Math.max(kMax, Math.round((j - i) / 2));
    return 2 * (kMax + BUF) + 1;
  };
  const F_TOT = tautFs(growSeg(stepped.spec[1], RING_GROW)); // 角档贴身长 = 配平基准（奇数）
  const LEAD2 = RING_BAND_NODES - 2 * ISO - F_TOT - TAIL2;

  // 一档 = 同一张方箱谱缩到 g，放进 **配平垫七段谱**（Lab.12 v4 先例）：
  //   [贴合 | 垫 p | 隔离 16 | 结构 fs | 隔离 16 | 垫 p | 尾]，垫+结构 = F_TOT 恒定。
  // 两条弯路都实测过，记在这里：
  // - 三档共用 f=129：面档多出 ~40px 缓冲料，折叠体在松弛区间里被压沉，
  //   嘴心比角档低 61.7px（对位构造「嘴心与键长无关」的隐含前提是缓冲基本吃满跨度）；
  // - 贴身自由段 + lead 配平：常数项补得掉、**斜率补不掉**——coreY 里自由段按 SEG·r
  //   收缩而贴合段不收，fs 不同 ⇒ 嘴心随 r 的斜率不同，全程散布 14.6px（这正是
  //   skin-array 坚持「全员同 f」的原因）。
  // 配平垫把两头都钉死：嘴心高（离下缘）= SEG·(iso+tail) + SEG·r·(p+(fs+1)/2)，
  // 垫+结构恒定 ⇒ 常数项与斜率都与档位无关——对齐是构造给的，在每一个 r 上成立。
  // 垫是无键自由段（rootHug 把它贴在轴上，读作竖带的一部分）；fs 与 F_TOT 都取奇数
  // ⇒ 垫恒为偶数，上下各半精确整数。leadComp = 整数位残差补偿（纯平移），备而少用。
  const levelFor = (g, leadComp = 0) => {
    const grown = growSeg(stepped.spec[1], g);
    const fs = tautFs(grown);
    const c = (fs - 1) / 2;
    const seg = placeOnBand(grown, fs, c);
    const p = (F_TOT - fs) / 2;
    const lead = LEAD2 + leadComp;
    const tail = TAIL2 - leadComp;
    const spec =
      p > 0
        ? [['g', lead], ['f', p, []], ['g', ISO], seg, ['g', ISO], ['f', p, []], ['g', tail]]
        : [['g', lead + ISO], seg, ['g', ISO + tail]];
    const off = lead + p + ISO; // 结构段起点（剖面与嘴的绝对下标从这里偏）
    return { g, seg, fs, c, p, lead, tail, off, spec };
  };

  // 横向压缩族（用户方案）的一档：现行方箱谱**剪掉外侧 cut 根梯挡**，rb（=箱高）、
  // 内圈键位、fs 全员不动 ⇒ 高度与箱厚一圈恒定；pw = 端面板半跨（±17 = 原谱全跨，
  // 收窄是细调挑出的旋钮——渐变实测它在 2.1 尺度是连续杠杆；代价是端面硬投影的
  // 触发条件「面板端点恰好是锁定键」不再严格成立，端面质量看剖面图验收）。
  // M 恒定 + 全员同一副 [g|f|g] ⇒ 嘴心与档位无关，不需要配平垫。
  const PW_FULL = Math.round(8 * RING_GROW);
  const levelForX = (cut, pw, leadComp = 0) => {
    const fs = F_TOT;
    const c = (fs - 1) / 2;
    const placed = placeOnBand(growSeg(stepped.spec[1], RING_GROW), fs, c);
    const bonds = placed[2].slice(0, placed[2].length - cut); // 谱内升序，剪尾 = 剪最外
    const kMax = Math.round((bonds[bonds.length - 1][1] - bonds[bonds.length - 1][0]) / 2);
    const seg = ['f', fs, bonds, [[c - pw, c + pw]]];
    const lead = LEAD2 + leadComp;
    const tail = TAIL2 - leadComp;
    return {
      g: RING_GROW, cut, pw, kMax, keys: bonds.length, seg, fs, c, p: 0, lead, tail,
      off: lead + ISO,
      spec: [['g', lead + ISO], seg, ['g', ISO + tail]],
    };
  };

  // 高度恒定族的一档：箱高 H 恒定，**深度方向各向异性压缩**。
  //
  // 梯挡的排法试过两种，定案取后者：
  // - ✗ 间距恒定（KSTEP=4 节，浅档自然少几根）：实测面档只剩 4 挡、边档 5、角档 8,
  //   一圈里每条带梯挡数不同。§13 环上渐变那轮明确把「环上会有两条带比邻居少一根
  //   梯挡」当作否决理由——这是本项目的既有品味，不重犯。
  // - ✓ **根数恒定、间距按比例压**：整张键位图沿深度等比缩（ks × kMax/BASE_KMAX），
  //   rb 与端面板一个数不动。这正是「只有向外扩展的横向维度被压缩」的精确表达：
  //   同一个箱子被横向压扁，梯挡跟着挤密，一圈 20 条带全是同样 10 挡。
  const KMIN = 4; // 键谱内侧下限（交接件纪律：两端 ≥4 节缓冲）
  const KSTEP = 4; // 仅供已废的等间距排法参考
  const PW_H = Math.round(H_H / 4); // 等长键纪律：端面板跨 × SEG = 键长 ⇒ 半跨 = H/4 节
  const R1 = SKIN.R1;
  /** 现行环族方箱的键位图（放大 2.1 后的半跨表）= 根数的来源 */
  const BASE_KS = growSeg(stepped.spec[1], RING_GROW)[2].map(([i, j]) => Math.round((j - i) / 2));
  const BASE_KMAX = BASE_KS[BASE_KS.length - 1];
  /**
   * 该档梯挡的半跨表：**最内一根钉死在端面板端点 PW_H**、最外一根 = kMax，
   * 其余在两者之间均分（根数恒定）。
   *
   * 最内那根为什么不能跟着比例缩（2026-08-30 用户看图「跑型了 明显不行」的病根）：
   * 端面硬投影的触发条件是「**面板端点恰好是锁定键**」（§16.1 硬机制表）。原谱
   * 里这条是自动成立的——最内梯挡 k=17 就是端面板的半跨，等长键纪律
   * （板跨 × SEG = 键长）说的也是同一件事。H 从 68 改到 48 后板半跨变成 12，
   * 而按比例缩出来的最内梯挡是 9（面档）/ 17（角档），**三档的端面投影全没触发**
   * ⇒ 端面鼓、箱子跑型，而键全锁、箱高读数还都对得上（§16.3「量对了、形错了」
   * 第 N 次）。把最内梯挡钉在 PW_H 上，三个条件（板端点=锁定键、等长键、
   * 梯挡数恒定）同时成立。
   */
  const ladderKs = (kMax) => {
    const n = BASE_KS.length;
    const ks = Array.from({ length: n }, (_, i) => Math.round(PW_H + ((kMax - PW_H) * i) / (n - 1)));
    return [...new Set(ks)];
  };
  /**
   * 要深度 D 需要多大的最外半跨。**用实测标定的斜率，不用材料账**——
   * 纯材料账 4k = 2D + H ⇒ D = 2k − H/2 高估了：2026-08-30 实扫
   * （k=36→63.4 · 41→73 · 47→85 · 49→88.5 · 52→91.8）拟合出 **D ≈ 1.78k**，
   * 差的那部分材料进了四个圆角与嘴的过渡段。这里只作搜索的起点，档位一律按实测挑。
   */
  const D_PER_K = 1.78;
  const kForDepth = (D) => Math.max(KMIN + KSTEP, Math.round(D / D_PER_K));
  /**
   * 自由段在收缩终点的**轴向跨度**（px）。箱子就住在这一段里。
   */
  const spanOf = (kMax, b) => 2 * R1 * (2 * (kMax + b) + 1 - 1);
  /** 轴向间隙：自由段跨度减掉箱高。**必须为正**——负的就是「箱子比它住的那段还高」 */
  const gapOf = (kMax, b) => spanOf(kMax, b) - H_H;
  /** 折叠余量：缓冲材料 4b 减掉它要跨的轴向间隙（>0 = 折着，<0 = 被拉直 ⇒ 箱子变形） */
  const slackOf = (kMax, b) => 4 * b - gapOf(kMax, b);
  /**
   * 缓冲 b 要同时满足两条（**两条都得写成代码，不能只写在注释里**——用户
   * 2026-08-30 看图指出的「绿色底部形状反了」就是漏掉第一条：面档 fs=75 ⇒
   * 自由段轴向跨度只有 44.4px，而箱高 48px，箱子比它住的那一段还高，被硬挤进去，
   * 底部嘴角外翻。这正是 x 族失败的同一条约束，当时只推导没落地）：
   * ① 间隙 gap ≥ G_MIN：自由段放得下箱子，还留一点过渡；
   * ② 余量 slack ≥ E_MIN：缓冲折得起来、不被拉直。
   */
  const G_MIN = 6;
  const E_MIN = 12;
  const bForK = (kMax) => {
    let b = 4; // 交接件纪律：键谱两端 ≥4 节缓冲
    while (gapOf(kMax, b) < G_MIN || slackOf(kMax, b) < E_MIN) b++;
    return b;
  };
  // **缓冲要按余量恒定给，不能全员同值**（2026-08-30 实测，两条都跑过）：
  // 全员 b=7 那版浅档的折叠余量涨到 31.6px（角档只有 13.6），扫掠当场非单调
  // ——k29→44 / k31→34 这种相邻 20px 的跳，是富余材料在结构段里乱折，
  // 正是 x 族那个病的小号版。按 slackOf ≥ E_MIN 给 b，扫掠即恢复单调。
  const B_FIX_ENV = Number(process.env.SKIN_BFIX) || 0; // 实验：全员同缓冲（0 = 按余量规则）
  let F_TOT_H = 0; // 角档的自由段长（= 配平基准）；phase 2 之后才知道
  /**
   * 两个整数旋钮（Lab.08 的 lead + dFan 同款做法）：
   * 嘴心（从带顶往下量，anchorEnd 下三档芯长逐点相同 ⇒ 带顶同位、可比）：
   *   mouthY(r) = 2·(lead + iso) + 2r·(**上**垫 + (fs−1)/2)
   * - `leadComp`：lead 与 tail 对调几节 ⇒ 只动**常数项**（+2px/节）；
   * - `padShift`：垫在上下之间挪几节（总量不变 ⇒ 带长与斜率基准都不动）
   *   ⇒ 只动**斜率项**（−2r px/节，padShift 增 = 上垫减）。
   * 符号踩过一次：先按「下垫管斜率、lead 反向」写，补偿把面档从 6.7 推到 13.9px。
   * 一个补常数、一个补斜率，正好解掉「早期对上了终态又跑偏」那类残差。
   */
  // 定案那一档（H = 站上的 SQUARE.H）**直接用站上模块造谱**——线稿与站上共用一份
  // 实现，谁改了都不会漂；探索别的 H 时才走下面这套脚本自己的参数化。
  const useModule = H_H === SQUARE.H;
  const levelForH = (kMax, b, leadComp = 0, padShift = 0) => {
    if (useModule && leadComp === 0 && padShift === 0 && F_TOT_H) {
      const fs = squareFree(kMax, b);
      const p = (F_TOT_H - fs) / 2;
      const lead = RING_BAND_NODES - 2 * ISO - F_TOT_H - TAIL2;
      const spec = squareSpec(kMax, F_TOT_H);
      const seg = spec[p > 0 ? 3 : 1];
      return {
        g: 0, kMax, b, keys: seg[2].length, slack: slackOf(kMax, b),
        seg, fs, c: (fs - 1) / 2, p, pHi: p, pLo: p, padShift: 0, lead, tail: TAIL2,
        bad: p < 0 || lead < 20,
        off: lead + p + ISO,
        spec,
      };
    }
    const fs = 2 * (kMax + b) + 1;
    const c = (fs - 1) / 2;
    const bonds = ladderKs(kMax).map((k) => [c - k, c + k, H_H / 100]);
    const seg = ['f', fs, bonds, [[c - PW_H, c + PW_H]]];
    const p = F_TOT_H ? (F_TOT_H - fs) / 2 : 0;
    const pHi = p - padShift; // 结构上方的垫（靠天花那侧）
    const pLo = p + padShift; // 结构下方的垫（靠钉住端那侧）—— 嘴心的斜率就由它定
    const lead = RING_BAND_NODES - 2 * ISO - (2 * p + fs) - TAIL2 + leadComp;
    const tail = TAIL2 - leadComp;
    const segs = [];
    if (pHi > 0) segs.push(['g', lead], ['f', pHi, []], ['g', ISO]);
    else segs.push(['g', lead + ISO]);
    segs.push(seg);
    if (pLo > 0) segs.push(['g', ISO], ['f', pLo, []], ['g', tail]);
    else segs.push(['g', ISO + tail]);
    return {
      g: 0, kMax, b, keys: bonds.length, slack: slackOf(kMax, b),
      seg, fs, c, p, pHi, pLo, padShift, lead, tail,
      bad: pHi < 0 || pLo < 0 || lead < 20 || tail < 11,
      off: lead + (pHi > 0 ? pHi : 0) + ISO,
      spec: segs,
    };
  };

  // 全程检查点（§8.8 教训：动画件的对齐要按整个时间轴验，不能只验终态）
  const CHK_R = [0.87, 0.66, 0.44];
  const chkSteps = CHK_R.map((r) => Math.round((900 * (SKIN.R0 - r)) / (SKIN.R0 - SKIN.R1)));
  const cache = new Map();
  const runLevel = (lv) => {
    const sig = JSON.stringify(lv.spec);
    if (cache.has(sig)) return cache.get(sig);
    const sim = createSkinUnit(lv.spec, skinSiteOpts(stepped));
    const bonds = lv.seg[2];
    let w = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > w[1] - w[0]) w = b;
    const mi = lv.off + w[0];
    const mj = lv.off + w[1];
    const mouthAt = () => -((sim.py[mi] + sim.py[mj]) / 2) * 100;
    const chk = [];
    let lockEnd = 0; // 末锁步：最后一根键锁上的时刻（成形完成 = 这一刻）
    let nl = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (sim.locked.length > nl) {
        nl = sim.locked.length;
        lockEnd = k;
      }
      if (chkSteps.includes(k)) chk.push(mouthAt());
    }
    let out = 0;
    for (let k = 0; k < sim.n; k++) out = Math.max(out, sim.px[k] * 100);
    const raw = [];
    for (let i = lv.off; i < lv.off + lv.fs; i++) raw.push([sim.px[i] * 100, -sim.py[i] * 100]);
    // 形态实测（不是假设）：顶面 / 底面各自的位置与**水平度**。
    // 只测「箱高」会漏掉跑型——端面那一段的 y 跨度对得上，顶面照样可以是斜的。
    const my = mouthAt();
    const top = [];
    const bot = [];
    // 只取上下两条面的中段：近轴那头是嘴的过渡、最外那头是端面本身，
    // 端面的点 y 跨越半个箱高，混进来会把水平度读成 ~H/2（首版即此，读出 22px 的假跑型）
    for (const [x, y] of raw) if (x >= 0.35 * out && x <= 0.85 * out) (y < my ? top : bot).push(y);
    const stat = (v) =>
      v.length
        ? { m: v.reduce((s, t) => s + t, 0) / v.length, r: Math.max(...v) - Math.min(...v) }
        : { m: my, r: 0 };
    const T0 = stat(top);
    const B0 = stat(bot);
    const by0 = T0.m;
    const by1 = B0.m;
    const res = {
      ...lv, sig, out, raw,
      boxH: by1 - by0,
      lockEnd,
      topY: T0.m, // 平台面（用户真正要对齐的那条线）
      topFlat: T0.r, // 顶面水平度：跑型的直接读数
      botFlat: B0.r,
      locked: sim.locked.length,
      mouthY: mouthAt(),
      chk,
      mouthPx: bonds[0][2] * 100,
    };
    cache.set(sig, res);
    return res;
  };

  const sweep = [];
  const seen = new Set();
  const trySweep = (lv) => {
    const r = runLevel(lv);
    if (!seen.has(r.sig)) {
      seen.add(r.sig);
      sweep.push(r);
    }
    return r;
  };
  // 掉键的档直接不要：等比族键数恒 = 角档；剪梯/恒高族每档键数 = 自己谱里的根数
  const healthy = (r) =>
    FAMILY === 'iso'
      ? r.locked === corner.locked
      : FAMILY === 'h'
        ? r.locked === r.keys && // 键全锁
          r.keys === BASE_KS.length && // 梯挡数一圈相同（§13 的既有品味）
          Math.abs(r.boxH - H_H) <= 4 && // 箱高实测对得上 —— 键全锁不等于形没塌
          r.topFlat <= 6 &&
          r.botFlat <= 6 && // 顶/底面得是平的 —— 这条才抓得住「跑型」
          gapOf(r.kMax, r.b) >= G_MIN // 箱子住得下自己那段自由段
        : r.locked === r.keys;
  const closest = (pool, target) => {
    let best = null;
    for (const r of pool) {
      if (!healthy(r)) continue;
      const err = Math.abs(r.out - target);
      if (!best || err < Math.abs(best.out - target) - 1e-9) best = r;
      else if (Math.abs(err - Math.abs(best.out - target)) < 1e-9 && (r.pw ?? 0) > (best.pw ?? 0)) best = r;
    }
    return best;
  };

  /** 按目标深度搜 kMax：先按标定斜率粗扫（步 2），再在最优附近细扫（步 1） */
  const searchK = (target) => {
    const k0 = kForDepth(target);
    const put = (k) => {
      const lv = levelForH(k, B_FIX_ENV || bForK(k));
      if (k > KMIN && !lv.bad) trySweep(lv);
    };
    for (let k = k0 - 6; k <= k0 + 6; k += 2) put(k);
    const c0 = closest(sweep, target);
    if (c0) for (let k = c0.kMax - 2; k <= c0.kMax + 2; k++) put(k);
    return closest(sweep, target);
  };

  // 角档 = 方形的四个角，方形多大由它定（sq(θ) = 方形边界的极径）。
  // iso/x：角档 = 现行方箱形态（谱逐位同 Lab.09 整环同形那张；lead/tail 是位置量不属形态）。
  // h：角档保持**现行这个深度**（80.5px，上一版线稿已按它出过图）⇒ 方形边长、Lab.10
  //    的格距、房间尺寸一律不动，这一族改的只有箱高（68 → H_H）。
  const CORNER_D = 80.5; // iso/x 族的角档深度（h 族改为自动取最大，见下）
  let corner;
  if (FAMILY === 'h') {
    // 角档 = **带子装得下的最大深度**，不再钉在 iso 族那个 80.5。
    // 理由是这一族的瓶颈在最浅那档：方形越大 ⇒ 面档的 k 越大 ⇒ 它的自由段越长 ⇒
    // 越装得下那个恒定的箱高。把角档做小反而是在为难面档。
    // 上限来自带子总长：F_TOT = 2(k+b)+1 ≤ 202 − 2·ISO − TAIL2 − 20（lead 留 20）。
    const FS_MAX = RING_BAND_NODES - 2 * ISO - TAIL2 - 20;
    let k0 = 0;
    for (let k = 70; k >= 20; k--) {
      const b = bForK(k);
      if (2 * (k + b) + 1 <= FS_MAX) {
        k0 = k;
        break;
      }
    }
    // phase 1：b 规则实扫——余量太小缓冲被拉直、间隙太小箱子住不下；两条都要实测验
    const bScan = [];
    for (let b = 4; b <= 16; b += 3) bScan.push(runLevel(levelForH(k0, b)));
    console.log(
      `  [phase1] 角档 kMax=${k0}（带长上限）· 箱高目标 ${H_H} · 缓冲实扫：` +
        bScan
          .map(
            (r) =>
              `b${r.b}(间隙${gapOf(r.kMax, r.b).toFixed(0)}/余量${r.slack.toFixed(0)})→深${r.out.toFixed(1)}/高${r.boxH.toFixed(1)}/平${r.topFlat.toFixed(1)}`,
          )
          .join('  '),
    );
    corner = runLevel(levelForH(k0, bForK(k0)));
    if (!healthy(corner)) {
      console.log(
        `  [角档] k${corner.kMax}/b${corner.b}：深${corner.out.toFixed(1)}/高${corner.boxH.toFixed(1)}/平${corner.topFlat.toFixed(1)},${corner.botFlat.toFixed(1)}/键${corner.locked}of${corner.keys}/间隙${gapOf(corner.kMax, corner.b).toFixed(1)}`,
      );
      corner = null;
    }
    if (!corner) throw new Error('角档不健康——看上一行读数：深/高/平(顶,底)/键/间隙');
    F_TOT_H = corner.fs;
    corner = runLevel(levelForH(corner.kMax, B_FIX_ENV || bForK(corner.kMax))); // 带上配平垫重跑（角档 p=0，值应逐位不变）
  } else {
    corner = runLevel(FAMILY === 'x' ? levelForX(0, PW_FULL) : levelFor(RING_GROW));
  }
  const a = (R + corner.out) / Math.SQRT2;
  const sq = (th) => a / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
  const T = { mid: sq((Math.PI * 27) / 180) - R, face: sq((Math.PI * 9) / 180) - R };

  // 标定扫掠
  if (FAMILY === 'x') {
    for (let cut = 0; cut <= 6; cut++) for (const pw of [PW_FULL, 15, 13]) trySweep(levelForX(cut, pw));
  } else if (FAMILY === 'h') {
    // F_TOT 定了、垫参与进来 ⇒ 中/面两档重扫（phase 2 那批没有垫）
    sweep.length = 0;
    seen.clear();
    for (const D of [T.mid, T.face]) searchK(D);
  } else {
    for (let gi = 105; gi <= 180; gi += 1) trySweep(levelFor(gi / 100));
  }
  const pick = (target) => closest(sweep, target);

  // lead 整数位补偿：以角档为基准，把该档全程（三检查点 + 终态）的嘴心平均偏移
  // 用 lead 收掉（1 节 = 2px；lead/tail 对调、总长不变 = 纯平移）
  const allY = (r) => [...r.chk, r.mouthY];
  const RS = [...CHK_R, SKIN.R1]; // 四个检查点各自的 r
  const compensate = (r0) => {
    const ref = allY(corner);
    const d = allY(r0).reduce((s, y, i) => s + (y - ref[i]), 0) / (CHK_R.length + 1);
    // 补偿夹在尾段纪律内（tail ≥ 11——首跑 x 族时 +7 的补偿把尾段挤到 8）
    const comp = Math.min(-Math.round(d / 2), TAIL2 - 11);
    if (FAMILY !== 'h') {
      if (comp === 0) return r0;
      return runLevel(FAMILY === 'x' ? levelForX(r0.cut, r0.pw, comp) : levelFor(r0.g, comp));
    }
    // h 族：**只用 lead 这一个旋钮**。
    // 垫的上下分配（padShift）试过并撤销：对称垫时
    //   上垫 + (fs−1)/2 = (F_TOT−1)/2 恒定 ⇒ 常数项与斜率项**本来就精确相同**，
    // 对齐是构造给的、不需要那个旋钮；而挪动它会让结构两侧的缓冲材料不对称，
    // 箱子上下就不对称了（用户 2026-08-30 看图指出面档底部嘴角走向反了）。
    // 保留 levelForH 的参数备查，这里恒传 0。
    let cur = r0;
    let lead = 0;
    const pad = 0;
    for (let iter = 0; iter < 2; iter++) {
      const dev = allY(cur).map((y, i) => y - ref[i]);
      // 加权最小二乘拟合 dev ≈ A + B·r。两个旋钮只消得掉常数项与 r 的线性项，
      // 剩下的非线性残差是形态量（浅档折叠体在收缩末段多下垂，实测 8.6px）——
      // 故权重偏向收缩后段：终态是台架上停留最久、也是「一圈平台」真正被读出来的
      // 那个状态；早期让一点。
      const W = [1, 1, 2, 4];
      const n = RS.length;
      const sw = W.reduce((s, w) => s + w, 0);
      const mr = RS.reduce((s, r, i) => s + r * W[i], 0) / sw;
      const md = dev.reduce((s, v, i) => s + v * W[i], 0) / sw;
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < n; i++) {
        sxy += W[i] * (RS[i] - mr) * (dev[i] - md);
        sxx += W[i] * (RS[i] - mr) ** 2;
      }
      const B = sxx > 1e-9 ? sxy / sxx : 0;
      const A = md - B * mr;
      // Δ = 2·dLead − 2r·dPad 要抵消 dev = A + B·r
      const dLead = Math.round(-A / 2);
      if (dLead === 0) break;
      const next = levelForH(r0.kMax, r0.b, lead + dLead, pad);
      if (next.bad) break;
      lead += dLead;
      cur = runLevel(next);
    }
    return cur;
  };
  const face = compensate(pick(T.face));
  const mid = compensate(pick(T.mid));
  const LV = [
    { name: '面', r: face, target: T.face, count: 8 },
    { name: '边', r: mid, target: T.mid, count: 8 },
    { name: '角', r: corner, target: corner.out, count: 4 },
  ];

  const famName =
    FAMILY === 'x'
      ? '横向压缩族（剪梯挡，高度不变）'
      : FAMILY === 'h'
        ? `高度恒定族（箱高 ${H_H}px 一圈恒定，只压深度）`
        : '等比缩放族';
  const desc = (r) =>
    FAMILY === 'x'
      ? `剪${r.cut}根(kMax ${r.kMax})·板±${r.pw}`
      : FAMILY === 'h'
        ? `k${r.kMax}·${r.keys}挡·缓冲${r.b}`
        : `g=${r.g.toFixed(2)}`;
  const specStr = (r) =>
    r.p > 0
      ? `[${r.lead}|垫${r.pHi ?? r.p}|${ISO}|结构${r.fs}|${ISO}|垫${r.pLo ?? r.p}|${r.tail}]`
      : `[${r.lead + ISO}|结构${r.fs}|${ISO + r.tail}]`;
  console.log(`ring-square(${FAMILY}) · ${famName} 三档标定（R=${R} 钉死 · 相位 +9° · 角带 = 现行方箱形态）`);
  console.log(`  方形半边长 a = ${a.toFixed(1)}px（边长 ${(2 * a).toFixed(1)}px，外接现行环的外缘）`);
  for (const l of LV)
    console.log(
      `  ${l.name}档 ×${l.count}  ${desc(l.r)}  谱 ${specStr(l.r)}  挑出 目标 ${l.target.toFixed(1)} / 实测 ${l.r.out.toFixed(1)}` +
        `（偏差 ${(l.r.out - l.target >= 0 ? '+' : '')}${(l.r.out - l.target).toFixed(1)}）  锁定键 ${l.r.locked}  嘴 ${l.r.mouthPx.toFixed(0)}px  **箱高实测 ${l.r.boxH.toFixed(1)}px**`,
    );
  for (const l of LV) {
    if (l.r.tail < 11) console.log(`  ⚠ ${l.name}档 tail=${l.r.tail} < 11（尾段太短会拽变形）`);
    if (l.r.lead < 20) console.log(`  ⚠ ${l.name}档 lead=${l.r.lead} < 20（贴合段别让光）`);
  }
  const spreadAt = (i) => {
    const ys = LV.map((l) => allY(l.r)[i]);
    return Math.max(...ys) - Math.min(...ys);
  };
  const spreads = [...CHK_R, SKIN.R1].map((_, i) => spreadAt(i));
  for (const l of LV)
    console.log(
      `    ${l.name}档 嘴心 ${allY(l.r).map((y) => y.toFixed(1)).join(' / ')}` +
        `  顶面 ${l.r.topY.toFixed(1)}（水平度 ${l.r.topFlat.toFixed(1)} / 底 ${l.r.botFlat.toFixed(1)}）` +
        `  间隙 ${gapOf(l.r.kMax, l.r.b).toFixed(1)} / 余量 ${l.r.slack.toFixed(1)}  末锁 ${l.r.lockEnd}` +
        (l.r.padShift ? `（垫偏移 ${l.r.padShift}）` : ''),
    );
  const tops = LV.map((l) => l.r.topY);
  console.log(
    `  平台面（顶面）散布 ${(Math.max(...tops) - Math.min(...tops)).toFixed(1)}px · 顶面水平度最差 ${Math.max(...LV.map((l) => l.r.topFlat)).toFixed(1)}px`,
  );
  console.log(
    `  三档嘴心散布（全程 r≈${[...CHK_R, SKIN.R1].join('/')}）：${spreads.map((s) => s.toFixed(1)).join(' / ')}px`,
  );
  console.log(
    `  扫掠 →挑出（! = 掉键，不取）：${sweep
      .map(
        (r) =>
          `${FAMILY === 'x' ? `剪${r.cut}/±${r.pw}` : FAMILY === 'h' ? `k${r.kMax}` : r.g.toFixed(2)}→${r.out.toFixed(0)}${healthy(r) ? '' : '!'}`,
      )
      .join('  ')}`,
  );

  // 20 位：档位、外缘点、对目标方形的偏差
  const pts = Array.from({ length: N }, (_, i) => {
    const th = PHASE + (i / N) * Math.PI * 2;
    const t = sq(th) - R;
    let lvl = 0;
    for (let l = 1; l < LV.length; l++) if (Math.abs(LV[l].target - t) < Math.abs(LV[lvl].target - t)) lvl = l;
    const rr = R + LV[lvl].r.out;
    return { th, lvl, x: Math.cos(th) * rr, y: Math.sin(th) * rr, dev: rr - sq(th) };
  });
  const maxDev = Math.max(...pts.map((p) => Math.abs(p.dev)));
  console.log(`  20 个外缘点对目标方形的最大偏差 ${maxDev.toFixed(1)}px`);

  // ── SVG：上 = 俯视轮廓，下 = 三档剖面并排 + 叠合 ─────────────────────────
  const HUE = [150, 215, 285]; // 面→角：绿 → 蓝 → 紫
  const col = (l) => `hsl(${HUE[l]} 42% 38%)`;
  const PV = 560; // 俯视画布边长
  const SC2 = (PV - 70) / (2 * (a + 12));
  const cx = P + 60 + PV / 2;
  const cy = P + 52 + PV / 2;
  const X = (x) => (cx + x * SC2).toFixed(1);
  const Y = (y) => (cy + y * SC2).toFixed(1);

  const draws = LV.map((l) => smooth(l.r.raw, 3, 1));
  const allp = draws.flat();
  const b2 = allp.reduce(
    (acc, [x, y]) => ({ x0: Math.min(acc.x0, x), x1: Math.max(acc.x1, x), y0: Math.min(acc.y0, y), y1: Math.max(acc.y1, y) }),
    { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
  );
  const SC3 = Math.min(150 / Math.max(1, b2.x1 - b2.x0), 220 / Math.max(1, b2.y1 - b2.y0));
  const oyP = P + 52 + PV + 64;
  const drawH = (b2.y1 - b2.y0) * SC3;
  const lbY = oyP + drawH + 30; // 标签贴着剖面放（画布高度按内容收，不留死空间）
  // 公共 y 基准（对齐验证图的硬要求——逐帧按 yMin 归零会把要验的东西归掉）
  const prof = (ptsIn, ox) =>
    ptsIn.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC3).toFixed(2)},${(oyP + (y - b2.y0) * SC3).toFixed(2)}`).join('');

  const W2 = Math.max(P * 2 + PV + 120, P * 2 + 4 * 230);
  const H2 = Math.ceil(lbY + 14 + 30);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W2}" height="${H2}" fill="#f6f4ef"/>
<text x="${P}" y="${P}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ring-square${FAMILY === 'x' ? '-x' : ''} · 方形环（Lab.09 方箱 · ${famName} · 真引擎终态）</text>
<text x="${P}" y="${P + 20}" font-size="11.5" fill="#3a3a38">R=${R} 钉死 · 相位 +9°（角上有带）· 边长 ${(2 * a).toFixed(0)}px · 外缘点最大偏差 ${maxDev.toFixed(1)}px${
    FAMILY === 'h'
      ? ` · 箱高实测 ${LV.map((l) => l.r.boxH.toFixed(1)).join('/')}px · 顶面水平度 ≤${Math.max(...LV.map((l) => l.r.topFlat)).toFixed(1)}px · 平台面终态散布 ${(Math.max(...LV.map((l) => l.r.topY)) - Math.min(...LV.map((l) => l.r.topY))).toFixed(1)}px（全程最差 ${Math.max(...spreads).toFixed(1)}）`
      : ` · 嘴心散布全程 ${Math.max(...spreads).toFixed(1)}px`
  }</text>
<text x="${P}" y="${P + 40}" font-size="12" font-weight="700" fill="#1b1b1a">俯视：橙虚线 = 目标方形 · 紫虚线 = 环间膜的弦线 · 灰实圆 = 筒芯（不变）· 灰点圆 = 现行圆环外缘（对照）</text>`;

  // 目标方形 + 芯圆 + 现行圆环外缘（对照：从这个圆变成那个方）
  s += `<rect x="${X(-a)}" y="${Y(-a)}" width="${(2 * a * SC2).toFixed(1)}" height="${(2 * a * SC2).toFixed(1)}" fill="none" stroke="#a05a2c" stroke-width="1.6" stroke-dasharray="7 5"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${(R * SC2).toFixed(1)}" fill="none" stroke="#8f8a7d" stroke-width="1.2"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${((R + corner.out) * SC2).toFixed(1)}" fill="none" stroke="#8f8a7d" stroke-width="1" stroke-dasharray="2 4"/>`;
  // 膜弦线（外缘点连成的 20 边形——同边的弦落在方形边上）
  s += `<polygon points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="#5a4a8a" stroke-width="1.1" stroke-dasharray="3 3"/>`;
  // 二十条带（径向条：从芯到各自的挑出）
  for (const p of pts) {
    const c = Math.cos(p.th);
    const sn = Math.sin(p.th);
    const w = RING.DEPTH / 2;
    const E = R + LV[p.lvl].r.out;
    const q = (u, v) => `${X(u * c - v * sn)},${Y(u * sn + v * c)}`;
    s += `<polygon points="${q(R, -w)} ${q(E, -w)} ${q(E, w)} ${q(R, w)}" fill="hsl(${HUE[p.lvl]} 40% 42% / 0.5)" stroke="${col(p.lvl)}" stroke-width="1"/>`;
  }
  // 图例
  LV.forEach((l, i) => {
    const ly = P + 76 + i * 20;
    s += `<rect x="${P}" y="${ly - 10}" width="12" height="12" fill="hsl(${HUE[i]} 40% 42% / 0.5)" stroke="${col(i)}"/>`;
    s += `<text x="${P + 18}" y="${ly}" font-size="11" fill="#3a3a38">${l.name} ×${l.count} · ${desc(l.r)} · 挑出 ${l.r.out.toFixed(1)}</text>`;
  });

  // 三档剖面并排 + 叠合（公共 y 基准：上下缘与嘴心的相对关系直接可读）
  s += `<text x="${P}" y="${oyP - 34}" font-size="12" font-weight="700" fill="#1b1b1a">${
    FAMILY === 'iso'
      ? '三档侧面剖面（自由段终态 · 公共 y 基准同比例）——厚度跟着 g 走：角厚面薄，这是等比族的代价'
      : '三档侧面剖面（自由段终态 · 公共 y 基准同比例）——高度一圈恒定、只有深度在变：这是这族要验的东西'
  }</text>`;
  LV.forEach((l, i) => {
    const ox = P + i * 230 + 40;
    s += `<line x1="${ox}" y1="${oyP - 8}" x2="${ox}" y2="${oyP + (b2.y1 - b2.y0) * SC3 + 8}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
    s += `<path d="${prof(draws[i], ox)}" fill="none" stroke="${col(i)}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<text x="${ox - 26}" y="${lbY}" font-size="11" font-weight="700" fill="#3a3a38">${l.name}档 ${desc(l.r)}${l.r.p > 0 ? ` · 垫 ${2 * l.r.p}（配平）` : ''}</text>`;
    s += `<text x="${ox - 26}" y="${lbY + 14}" font-size="10.5" fill="#3a3a38">挑出 ${l.r.out.toFixed(1)}（目标 ${l.target.toFixed(1)}）· 键 ${l.r.locked} · 箱高 ${l.r.boxH.toFixed(1)}px</text>`;
  });
  const ox4 = P + 3 * 230 + 40;
  s += `<line x1="${ox4}" y1="${oyP - 8}" x2="${ox4}" y2="${oyP + (b2.y1 - b2.y0) * SC3 + 8}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  LV.forEach((_, i) => {
    s += `<path d="${prof(draws[i], ox4)}" fill="none" stroke="${col(i)}" stroke-width="1.3" opacity="0.9" stroke-linejoin="round"/>`;
  });
  s += `<text x="${ox4 - 26}" y="${lbY}" font-size="11" font-weight="700" fill="#3a3a38">${
    FAMILY === 'h'
      ? `叠合 · 平台面终态散布 ${(Math.max(...LV.map((l) => l.r.topY)) - Math.min(...LV.map((l) => l.r.topY))).toFixed(1)}px`
      : `叠合 · 嘴心散布全程 ${Math.max(...spreads).toFixed(1)}px`
  }</text>`;
  s += '</svg>';
  writeFileSync(OUT, s);
  console.log(`→ ${OUT}`);
}

const series = seriesFor(MODE);
const runs = series.map((u) => {
  const sim = runToEnd(u.spec, u.opts);
  const raw = rawProfile(sim);
  return { ...u, sim, raw, samp: resample(raw), draw: smooth(raw, u.smooth[0], u.smooth[1]) };
});

// 相邻形态距离
const gaps = runs.slice(1).map((r, i) => dist(runs[i].samp, r.samp));
console.log(`模式 ${MODE} · ${runs.length} 级`);
runs.forEach((r, i) => {
  let out = 0;
  for (let k = 0; k < r.sim.n; k++) out = Math.max(out, r.sim.px[k] * 100);
  console.log(`  ${String(i).padStart(2)} ${r.label.padEnd(22)} 离轴 ${out.toFixed(1).padStart(5)}  键 ${String(r.sim.locked.length).padStart(2)}` +
    (i ? `  ← 与上一级距离 ${gaps[i - 1].toFixed(2)}` : ''));
});
if (gaps.length)
  console.log(`相邻距离 ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}（最大/最小 ${(Math.max(...gaps) / Math.min(...gaps)).toFixed(1)}×）`);
if (MODE.startsWith('ring-gradient')) {
  const order = buildGradientOrder();
  console.log(`环上 20 位 → 级：${order.join(' ')}`);
  const seam = order.map((l, i) => {
    const j = order[(i + 1) % order.length];
    return Math.abs(l - j) === 1 ? gaps[Math.min(l, j)] : NaN;
  });
  console.log(`接缝（19↔0）距离 ${seam[order.length - 1].toFixed(2)}，与其余步同量级 = 闭合成立`);
}

// ── SVG：并排 + 叠合（按全系列公共包围盒等比铺满，形态之间才可比） ──────────
const all = runs.flatMap((r) => r.draw);
const bb = all.reduce(
  (a, [x, y]) => ({ x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), y0: Math.min(a.y0, y), y1: Math.max(a.y1, y) }),
  { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
);
const BW = bb.x1 - bb.x0;
const BH = bb.y1 - bb.y0;
const CW = 240;
const CH = 460;
const PAD = 30;
const SC = Math.min((CW - 40) / Math.max(BW, 1), (CH - 20) / Math.max(BH, 1));
const cols = runs.length;
const W = PAD * 2 + cols * CW;
const H = PAD * 2 + CH + 54 + CH + 40;
/** 世界 (x=离轴, y=向下) → 画布；轴（x=0）画成虚线 */
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - bb.y0) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ${MODE} · 真引擎终态剖面（自由段，${runs.length} 级）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 30;
  const oy = PAD + 16;
  svg += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${oy + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(r.draw, ox, oy)}" fill="none" stroke="#1c3a2c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<text x="${ox - 24}" y="${oy + CH - 26}" font-size="11" fill="#3a3a38">${r.label}</text>`;
  if (i) svg += `<text x="${ox - 24}" y="${oy + CH - 11}" font-size="11" font-weight="700" fill="#a05a2c">Δ ${gaps[i - 1].toFixed(2)}</text>`;
});
const oy2 = PAD + 16 + CH + 46;
svg += `<text x="${PAD}" y="${oy2 - 14}" font-size="13" font-weight="700" fill="#1b1b1a">全部叠合在同一条轴上（绿 → 紫 = 一级到末级）</text>`;
runs.forEach((r, i) => {
  const hue = 150 + (i / Math.max(1, runs.length - 1)) * 140;
  svg += `<path d="${path(r.draw, PAD + 120, oy2)}" fill="none" stroke="hsl(${hue} 48% 36%)" stroke-width="1.3" opacity="0.9" stroke-linejoin="round"/>`;
});
svg += `<line x1="${PAD + 120}" y1="${oy2 - 6}" x2="${PAD + 120}" y2="${oy2 + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
