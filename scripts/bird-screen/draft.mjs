// 线稿：「凭空出现的墙」能不能用视线隔离压住惊飞（项目二 · 回避关系）
// 用法：node scripts/bird-screen/draft.mjs [out.svg]
// 真比例：树麻雀城市 FID 5 m（惊飞距离.md §2.4）；AD 比 FID 大，比值文献没给，按 1.5 画、标「示意」。
// 几何结论：墙要遮住「路在圈内的那段弦」在鸟眼里的整个角跨 ⇒ 墙长 = 弦长 × (墙到鸟 / 路到鸟)。
import { writeFileSync } from 'node:fs';

const FID = 5; // m，树麻雀（城市，§2.4）
const AD = 7.5; // m，示意：AD ≥ FID，比值待定
const D = 2; // 路离鸟的最近距离 m
const S = 24; // px / m
const W = 460, H = 480; // 每格
const chordHalf = (r) => Math.sqrt(r * r - D * D);
const fmt = (v) => v.toFixed(1);

function panel(ix, title, body) {
  const ox = 20 + ix * (W + 16), oy = 60;
  return `<g transform="translate(${ox},${oy})">
<rect width="${W}" height="${H}" fill="#fff" stroke="#bbb"/>
<text x="12" y="22" font-size="14" font-weight="600">${title}</text>
<g transform="translate(${W / 2},${170})">${body}</g></g>`;
}
// 公共底图：鸟在原点，FID / AD 圈，路在 y=+D（屏幕向下）
function base(showAD = true) {
  const cx = (chordHalf(FID)) * S;
  return `
<circle r="${FID * S}" fill="none" stroke="#c33" stroke-width="1.2"/>
<text x="${FID * S + 4}" y="4" font-size="10" fill="#c33">FID ${FID} m</text>
${showAD ? `<circle r="${AD * S}" fill="none" stroke="#c33" stroke-width="0.8" stroke-dasharray="4 3"/>
<text x="${AD * S * 0.72}" y="${-AD * S * 0.72}" font-size="10" fill="#c33">AD（示意 1.5×）</text>` : ''}
<line x1="${-W / 2 + 8}" y1="${D * S}" x2="${W / 2 - 8}" y2="${D * S}" stroke="#333" stroke-width="1.5"/>
<text x="${-W / 2 + 10}" y="${D * S - 5}" font-size="10">人的路（离鸟 ${D} m）→</text>
<line x1="${-cx}" y1="${D * S - 4}" x2="${-cx}" y2="${D * S + 4}" stroke="#c33"/>
<line x1="${cx}" y1="${D * S - 4}" x2="${cx}" y2="${D * S + 4}" stroke="#c33"/>
<text x="${-cx}" y="${D * S + 16}" font-size="9" fill="#c33" text-anchor="middle">弦 ${fmt(2 * chordHalf(FID))} m</text>
<circle r="5" fill="#222"/><text x="8" y="-6" font-size="10">鸟</text>`;
}
function wall(w, half, dash = false, color = '#2a6') {
  return `<line x1="${-half * S}" y1="${w * S}" x2="${half * S}" y2="${w * S}" stroke="${color}" stroke-width="5" ${dash ? 'stroke-dasharray="6 4"' : ''} stroke-linecap="butt"/>`;
}
// 从鸟经墙端射到路上的视线
function ray(w, half, color = '#999') {
  const xr = half * (D / w);
  return [1, -1].map((s) => `<line x1="0" y1="0" x2="${s * xr * S}" y2="${D * S}" stroke="${color}" stroke-width="0.8" stroke-dasharray="2 2"/>`).join('');
}

// A 墙横在中间但没挡全
const wA = 1.0, halfA = 2.0; // 4 m 的墙
const emergeA = halfA * (D / wA); // 冒出点
const A = base(false) + wall(wA, halfA) + ray(wA, halfA) +
  [1, -1].map((s) => `<circle cx="${s * emergeA * S}" cy="${D * S}" r="5" fill="#c33"/>
<text x="${s * emergeA * S}" y="${D * S + 30}" font-size="10" fill="#c33" text-anchor="middle">冒出 ${fmt(emergeA)} m &lt; FID ⇒ 惊飞</text>`).join('') +
  `<text x="0" y="${wA * S - 8}" font-size="10" text-anchor="middle">墙 ${2 * halfA} m，离鸟 ${wA} m</text>
<text x="${-W / 2 + 12}" y="${247}" font-size="11">人从墙后露出来时已在圈内：</text>
<text x="${-W / 2 + 12}" y="${263}" font-size="11">突然出现 = 最强的刺激，比全程可见更糟。</text>`;

// B 挡全：墙长 = 弦长 × w/d
const wB = 1.0;
const needB = chordHalf(FID) * (wB / D), marginB = chordHalf(AD) * (wB / D);
const B = base(true) + wall(wB, marginB, true, '#8c8') + wall(wB, needB) + ray(wB, marginB, '#8c8') + ray(wB, needB, '#2a6') +
  `<text x="0" y="${wB * S - 8}" font-size="10" text-anchor="middle">必须 ${fmt(2 * needB)} m（实线）· 余量到 AD ${fmt(2 * marginB)} m（虚线）</text>
<text x="${-W / 2 + 12}" y="${231}" font-size="11">墙长 = 弦长 × 墙到鸟 ÷ 路到鸟（鸟眼里的角跨）</text>
<text x="${-W / 2 + 12}" y="${247}" font-size="11">离鸟 0.5 / 1.0 / 1.8 m ⇒ 必须 ${fmt(2 * chordHalf(FID) * 0.25)} / ${fmt(2 * chordHalf(FID) * 0.5)} / ${fmt(2 * chordHalf(FID) * 0.9)} m</text>
<text x="${-W / 2 + 12}" y="${263}" font-size="11">越贴鸟越短，但墙自己就落在鸟跟前（它也是刺激）。</text>`;

// C 纯墙 vs 带缝
const C = base(false) + wall(wB, needB) +
  `<rect x="-3" y="${wB * S - 4}" width="6" height="8" fill="#fff" stroke="#2a6"/>
<circle cx="0" cy="${D * S}" r="4" fill="#36c"/><text x="8" y="${D * S + 4}" font-size="10" fill="#36c">人</text>
<line x1="0" y1="${D * S}" x2="0" y2="0" stroke="#36c" stroke-width="1" stroke-dasharray="3 2"/>
<text x="6" y="${(wB * S + D * S) / 2}" font-size="10" fill="#36c">缝 → 看见 ✓</text>
<text x="${-W / 2 + 12}" y="${215}" font-size="11">纯墙：零惊飞，但人也看不见鸟 = 固定围栏的动态版。</text>
<text x="${-W / 2 + 12}" y="${231}" font-size="11">要赢在「看见更多」，墙得开一道缝（观鸟掩体）：</text>
<text x="${-W / 2 + 12}" y="${247}" font-size="11">人从暗处的缝里看鸟、鸟看不见缝后的人——</text>
<text x="${-W / 2 + 12}" y="${263}" font-size="11">这是行业实践，没有量化数据，台架里当参数。</text>`;

// D 时序：人离鸟的距离轴
const Dx0 = -200, Dx1 = 200, dMax = 16;
const px = (m) => Dx0 + (1 - m / dMax) * (Dx1 - Dx0);
const marks = [[2 * AD, '2×AD 15 m · 墙开始落'], [AD, 'AD · 墙已落完'], [FID, 'FID · 人进圈，已被挡']];
const Dp = `<line x1="${Dx0}" y1="40" x2="${Dx1}" y2="40" stroke="#333"/>
<text x="${Dx0}" y="30" font-size="10">远 ← 人离鸟的距离</text><text x="${Dx1}" y="30" font-size="10" text-anchor="end">鸟</text>
${marks.map(([m, t], i) => `<line x1="${px(m)}" y1="34" x2="${px(m)}" y2="46" stroke="#c33"/><text x="${px(m)}" y="${62 + i * 14}" font-size="10" fill="#c33" text-anchor="middle">${t}</text>`).join('')}
<path d="M ${px(2 * AD)} 130 L ${px(AD)} 100 L ${Dx1} 100" fill="none" stroke="#2a6" stroke-width="2.5"/>
<text x="${px(2 * AD)}" y="146" font-size="10" fill="#2a6">墙的高度：从 2×AD 处开始落，到 AD 处落到位</text>
<text x="${-W / 2 + 12}" y="${215}" font-size="11">「凭空出现」本身是个会动的大东西，鸟对快的更怕（§3 速度）。</text>
<text x="${-W / 2 + 12}" y="${231}" font-size="11">所以：落得慢、落得早，在人进 AD 之前就落完；落完后不动。</text>
<text x="${-W / 2 + 12}" y="${247}" font-size="11">墙自己把鸟吓走的距离，文献没有 ⇒ 当参数扫；</text>
<text x="${-W / 2 + 12}" y="${263}" font-size="11">城市鸟对不追它的固定物会习惯（围栏效应，待核）。</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * (W + 16) + 24}" height="${H + 76}" font-family="system-ui, 'PingFang SC', 'Noto Sans CJK SC', sans-serif" fill="#222">
<rect width="100%" height="100%" fill="#f6f6f4"/>
<text x="20" y="30" font-size="16" font-weight="700">凭空出现的墙 · 视线隔离的四个条件（真比例：树麻雀城市 FID 5 m，路离鸟 2 m；AD 示意）</text>
<text x="20" y="48" font-size="11" fill="#666">A 没挡全 = 人从墙后冒出 · B 挡全的几何规则 · C 纯墙 vs 开缝 · D 墙什么时候落、落多快</text>
${panel(0, 'A · 墙横在中间但没挡全', A)}
${panel(1, 'B · 挡全：遮住弦在鸟眼里的角跨', B)}
${panel(2, 'C · 纯墙 = 围栏；要「看见」得开缝', C)}
${panel(3, 'D · 时序：先于人、慢、落完不动', Dp)}
</svg>`;
const out = process.argv[2] ?? 'bird-screen-draft.svg';
writeFileSync(out, svg);
console.log(`wrote ${out}; FID chord ${fmt(2 * chordHalf(FID))} m, wall@1m need ${fmt(2 * needB)} m, margin ${fmt(2 * marginB)} m`);
