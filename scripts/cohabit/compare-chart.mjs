// 对照图线稿（待办第 6 条「出一张能进正文的图」）：空房间 / 单元钉死 / 会动的单元，六个读数各一格。
// 用法：node scripts/cohabit/compare.mjs 300 8 3 1 4 1 out.json   ← 先跑对照，逐种子读数落 JSON
//       node scripts/cohabit/compare-chart.mjs out.json [out.svg]  ← 再画（图与表同一次跑，不另抽样）
// 画法：小多图（读数量纲不同，一格一个，不共轴）；强调式配色——会动的单元 = 站内绿，两个基准 = 灰，
//   行名写在每格左侧，身份不只靠颜色；条 = 种子均值，须 = ±1 标准差，点 = 单个种子；数值统一列在右栏。
// 配色取站内 token（app/globals.css :root）：纸 / 墨 / graphite n600 / hairline n300 / g500 g700 / n400 n600。
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath = inPath.replace(/\.json$/, '') + '.svg'] = process.argv.slice(2);
if (!inPath) throw new Error('用法：node scripts/cohabit/compare-chart.mjs <compare.json> [out.svg]');
const data = JSON.parse(readFileSync(inPath, 'utf8'));

// oklch → sRGB hex（站内 token 是 oklch；SVG 交给任何查看器都要 hex）
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (x) => {
    const v = Math.max(0, Math.min(1, x));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  };
  return '#' + lin.map((x) => enc(x).toString(16).padStart(2, '0')).join('');
}
const C = {
  paper: oklch(0.965, 0.01, 115),
  ink: oklch(0.235, 0.025, 215),
  graphite: oklch(0.51, 0.014, 180), // n600
  hairline: oklch(0.84, 0.01, 135), // n300
  live: oklch(0.58, 0.105, 158), // g500：条
  liveDot: oklch(0.42, 0.088, 178), // g700：种子点
  base: oklch(0.72, 0.012, 150), // n400：条
  baseDot: oklch(0.51, 0.014, 180), // n600：种子点
};

// 行序 = 待办第 6 条原文的顺序：空房间 → 钉死 → 会动的（基准在上，设计在下）
const ORDER = ['empty', 'fixed', 'live'];
const SHORT = { empty: '空房间', fixed: '单元钉死', live: '会动的单元' };
const rows = ORDER.map((k) => data.rows.find((r) => r.space === k));
const PANELS = [
  { key: 'gaze', title: '共视', unit: '次', note: '人与猫互相看着 ≥ 1 s', d: 1 },
  { key: 'warmth', title: '共温', unit: '次', note: '0.5–1.5 m 内人站着 ≥ 2 s', d: 1 },
  { key: 'touch', title: '共触', unit: '次', note: '距离 < 0.5 m', d: 1 },
  { key: 'pass', title: '交接', unit: '次', note: '人走着穿过猫的 1.5 m 域', d: 1 },
  { key: 'settled', title: '猫安稳停留', unit: '秒', note: `坐 / 卧 / 靠近到位，满 ${data.seconds} s`, d: 0 },
  { key: 'detour', title: '访客绕行', unit: '米', note: '比直线多走的路', d: 1 },
];

const PW = 340, PH = 150, GAPX = 28, GAPY = 30, COLS = 3;
const LABEL_W = 70, VALUE_W = 78, PLOT_W = PW - LABEL_W - VALUE_W - 10;
const TOP = 96, LEFT = 32;
const W = LEFT * 2 + COLS * PW + (COLS - 1) * GAPX;
const NROW = Math.ceil(PANELS.length / COLS);
const H = TOP + NROW * PH + (NROW - 1) * GAPY + 92;
const FONT = `font-family="Archivo, 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif"`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function niceStep(max) {
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function panel(P, ix) {
  const ox = LEFT + (ix % COLS) * (PW + GAPX), oy = TOP + Math.floor(ix / COLS) * (PH + GAPY);
  const all = rows.flatMap((r) => [...r[P.key].v, r[P.key].mean + r[P.key].sd]);
  const step = niceStep(Math.max(...all));
  const xmax = Math.ceil(Math.max(...all) / step) * step;
  const x = (v) => LABEL_W + (Math.max(0, v) / xmax) * PLOT_W;
  const plotTop = 44, rowH = 30;
  const out = [];
  out.push(`<text x="0" y="16" font-size="14" font-weight="600" fill="${C.ink}">${esc(P.title)}<tspan font-weight="400" fill="${C.graphite}">（${esc(P.unit)}）</tspan></text>`);
  out.push(`<text x="0" y="33" font-size="11" fill="${C.graphite}">${esc(P.note)}</text>`);
  // 网格 + 刻度（实线发丝，退后）
  for (let t = 0; t <= xmax + 1e-9; t += step) {
    const gx = x(t);
    out.push(`<line x1="${gx}" y1="${plotTop - 4}" x2="${gx}" y2="${plotTop + rowH * 3}" stroke="${C.hairline}" stroke-width="1"/>`);
    out.push(`<text x="${gx}" y="${plotTop + rowH * 3 + 14}" font-size="10" fill="${C.graphite}" text-anchor="middle" style="font-variant-numeric:tabular-nums">${+t.toFixed(2)}</text>`);
  }
  rows.forEach((r, i) => {
    const m = r[P.key], live = r.space === 'live';
    const cy = plotTop + rowH * i + rowH / 2;
    const bh = 12, x0 = x(0), x1 = x(m.mean), rr = Math.min(4, (x1 - x0) / 2);
    out.push(`<text x="${LABEL_W - 10}" y="${cy + 4}" font-size="12" fill="${C.ink}" text-anchor="end" ${live ? 'font-weight="600"' : ''}>${esc(SHORT[r.space])}</text>`);
    // 条：基线方角、数据端 4px 圆角
    out.push(`<path d="M${x0},${cy - bh / 2} H${x1 - rr} Q${x1},${cy - bh / 2} ${x1},${cy - bh / 2 + rr} V${cy + bh / 2 - rr} Q${x1},${cy + bh / 2} ${x1 - rr},${cy + bh / 2} H${x0} Z" fill="${live ? C.live : C.base}"/>`);
    // 须：±1 标准差
    const lo = x(m.mean - m.sd), hi = x(m.mean + m.sd);
    out.push(`<line x1="${lo}" y1="${cy}" x2="${hi}" y2="${cy}" stroke="${C.ink}" stroke-width="1.25"/>`);
    out.push(`<line x1="${lo}" y1="${cy - 5}" x2="${lo}" y2="${cy + 5}" stroke="${C.ink}" stroke-width="1.25"/>`);
    out.push(`<line x1="${hi}" y1="${cy - 5}" x2="${hi}" y2="${cy + 5}" stroke="${C.ink}" stroke-width="1.25"/>`);
    // 种子点：纵向错开免叠（种子多时五档、点小一号），外圈纸色
    const lv = m.v.length > 12 ? 5 : 3, dy = lv === 5 ? 2.4 : 4, r0 = lv === 5 ? 2.1 : 2.6;
    m.v.forEach((v, k) => {
      out.push(`<circle cx="${x(v)}" cy="${cy + ((k % lv) - (lv - 1) / 2) * dy}" r="${r0}" fill="${live ? C.liveDot : C.baseDot}" stroke="${C.paper}" stroke-width="1"/>`);
    });
    out.push(`<text x="${PW}" y="${cy + 4}" font-size="12" fill="${C.ink}" text-anchor="end" style="font-variant-numeric:tabular-nums" ${live ? 'font-weight="600"' : ''}>${m.mean.toFixed(P.d)} ± ${m.sd.toFixed(P.d)}</text>`);
  });
  return `<g transform="translate(${ox},${oy})">${out.join('\n')}</g>`;
}

const sub = `${data.seconds} s 一场 · ${data.seeds.length} 个种子（${data.seeds[0]}–${data.seeds.at(-1)}）· ${data.people} 名访客 ${data.cats} 只猫 · ${data.grid}×${data.grid} 真实单元（Lab 2-8 那间房）· 让路 ${data.faces ? '按带' : '整台'}`;
const foot = [
  '条 = 种子均值　须 = ±1 标准差　点 = 单个种子。行名与颜色同时标身份：绿 = 会动的单元，灰 = 两个基准。',
  '单元钉死 = 偶数行全落、从不收回；空房间 = 没有装置，猫在地面。三档的访客走同一套过道路线，对照才公平。',
  '阈值与各秒数常量大多是演示值（人猫同台lab §2 逐条标出处），这张图只说「在这套规则下」三档的差别，不是实证结论。',
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="${C.paper}"/>
<text x="${LEFT}" y="38" font-size="18" font-weight="600" fill="${C.ink}">有设计与无设计的对照 · 人猫同台（Lab 2-14）</text>
<text x="${LEFT}" y="60" font-size="12" fill="${C.graphite}">${esc(sub)}</text>
${PANELS.map(panel).join('\n')}
${foot.map((t, i) => `<text x="${LEFT}" y="${H - 66 + i * 18}" font-size="11" fill="${C.graphite}">${esc(t)}</text>`).join('\n')}
</svg>
`;
writeFileSync(outPath, svg);
console.log(`对照图 → ${outPath}（${W}×${H}）`);
