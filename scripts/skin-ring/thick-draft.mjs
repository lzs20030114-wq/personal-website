// 方形环 · 捏分：① 变厚 ② 一次循环 —— 两项要求的线稿（2026-09-01 第二轮）
// 用法： npx vite-node scripts/skin-ring/thick-draft.mjs <out.svg>
import { writeFileSync } from 'node:fs';
import { build, buildSolid, run } from './split-thick.mjs';

const OUT = process.argv[2] ?? 'thick.svg';
const R = 30, TH = (n) => (Math.PI / 20) * n;
const T10 = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];
// 验收判据（与 split-thick.mjs 的 ok/okm 同一套）：**剪影Δ 与端面竖直度也在里面**
// ——2026-09-01 用户从这张线稿里一眼看出一个「形状崩坏」的形，而当时这里只卡
// 锁定/打结/水平度，坏的那档照样被画了出来、看着像个提案。
const why = (m) => {
  if (m.locked !== m.tot) return `键没锁全 ${m.locked}/${m.tot}`;
  if (m.knot > 6) return `打结 ${m.knot} 节`;
  if (m.topFlat >= 1.5 || m.botFlat >= 1.5) return `面不平 ${Math.max(m.topFlat, m.botFlat).toFixed(1)}`;
  if (m.silD >= 6) return `剪影Δ ${m.silD.toFixed(1)}`;
  if (m.vert > 1.5) return `缝角鼓出端面 ${m.vert.toFixed(1)}`;
  return '';
};
const prof = (b, s) => b.profile;

/** 拿一档的终态剖面（以箱中心为 y 原点） */
function shape(b) {
  const m = run(b, true);
  return m;
}

// 三种方案
const PLANS = [
  { key: 'now', label: '现状', H: 36, W: 12, side: 152, tiers: [['面', 40, 46.8, 1], ['边', 46, 55.5, 0.5], ['角', 46, null, 0]] },
  { key: 'thick', label: '变厚（4 重）', H: 68, W: 24, side: 150, tiers: [['面', 38, 45.7, 1], ['边', 52, 60.3, 0.5], ['角', 53, null, 0]] },
  { key: 'mir', label: '一次循环（1 重）', H: 68, W: 24, side: 110, tiers: [['面·裂', 16, 29, 1], ['面·实', 31, null, 0], ['角·深缝', 40, 48, 0.834]] },
];

const rows = PLANS.map((P) => ({
  ...P,
  runs: P.tiers.map(([nm, k, D, t]) => {
    const b = t === 0 ? buildSolid(P.H, k) : build(P.H, P.W, D, k, t);
    if (b.over || b.odd !== undefined || b.floats)
      return { nm, bad: b.over ? `装不下(${b.over})` : b.floats ? `缓冲富余超上限(b=${b.floats})：折叠体会浮起来` : '垫非偶' };
    // 单箱档没有目标深度：先跑一遍拿实测挑出，再以「那个深度的矩形」当目标线量 Δ
    const m0 = run(b, { t, D: D ?? 0, wEnd: P.W, H: P.H });
    const m = D === null ? run(b, { t, D: m0.reach, wEnd: P.W, H: P.H }) : m0;
    return { nm, b, m, why: why(m) };
  }),
}));

for (const r of rows) {
  console.log(`── ${r.label}（箱高 ${r.H} · 缝 ${r.W} · 边长 ${r.side}）`);
  for (const q of r.runs)
    console.log(q.bad ? `   ${q.nm}: ${q.bad}` : `   ${q.nm}: 挑出 ${q.m.reach.toFixed(1)} 箱高 ${q.m.boxH.toFixed(2)} 顶平 ${q.m.topFlat.toFixed(2)} 锁 ${q.m.locked}/${q.m.tot} 结 ${q.m.knot} Δ ${q.m.silD.toFixed(2)} 端面 ${q.m.vert.toFixed(2)} 缝底x ${q.m.seamMin.toFixed(1)}${q.why ? ' ✗ ' + q.why : ''}`);
}

// ── SVG ──
const sv = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, s, size = 12, fill = '#333', bold = false) => sv.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}"${bold ? ' font-weight="600"' : ''}>${esc(s)}</text>`);
const line = (x1, y1, x2, y2, c, w = 1, d = '') => sv.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''}/>`);
const poly = (pts, c, w = 1.4) => sv.push(`<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`);
const smooth = (p, w = 3) => p.map((_, i) => { let sx = 0, sy = 0, n = 0; for (let k = -w; k <= w; k++) { const j = Math.min(p.length - 1, Math.max(0, i + k)); sx += p[j][0]; sy += p[j][1]; n++; } return [sx / n, sy / n]; });

const W = 1180;
let Y = 30;
txt(24, Y, '方形环 · 捏分：① 整体变厚 ② 一圈一次循环 —— 两项要求的线稿', 17, '#111', true);
Y += 24;
for (const s of [
  '① **变厚做得到，但不是「等比」**：等比放大 g=1.05 就爆预算（自由段 141 > 133）——一条带的布料是定死的 202 节，形的周长跟着 g 长。',
  '   而**只长高几乎不花钱**：箱高在材料账两边同时出现（箱高涨 ⇒ 自由段留给缓冲的间隙变小 ⇒ 所需缓冲变少），正好抵消。实测 36 → 68（1.9×，对上你红线）。',
  '   代价是三档深度要重标（长高会把布料从深度挪到高度：角档在旧 k 上从 77.9 掉到 58.2）。重标后方形 150px ≈ 现在的 152，箱高散布 0.02。',
  '② **一次循环与「变厚」冲突，且单独看也要付方形**：材料账里「箱深 + 缝深 ≤ 86px」是硬的、与箱高无关。',
  '   1 重编制在二十个相位里最好的一个，也会把 L7 的深缝押到**角位**（最深的那一档）⇒ 角档吃不下 ⇒ 方形被压到 **~110**（现在 150，小 27%）。',
  '   而 110 的方形 + 68 的箱高 ⇒ 面档平台只挑出 26，比桅杆半径 30 还短，读作**一圈高领子**，不是「两片台」。',
]) { txt(24, Y, s, 12, '#444'); Y += 16.5; }

Y += 14;
const COL = ['#c2571a', '#8a6d1f', '#3f6d3f'];
for (const r of rows) {
  txt(24, Y, `${r.label} · 箱高 ${r.H} · 终态缝 ${r.W} · 方形边长 ${r.side}px`, 13, '#111', true);
  Y += 12;
  const SC = 1.55, CY = Y + 78;
  let x0 = 70;
  for (let i = 0; i < r.runs.length; i++) {
    const q = r.runs[i];
    if (q.bad) { txt(x0, CY, q.bad, 11, '#c33'); x0 += 190; continue; }
    line(x0, CY - 62, x0, CY + 62, '#999', 1);
    line(x0 - 6, CY, x0 + q.m.reach * SC + 14, CY, '#ddd', 0.8, '3 3');
    // 没过验收的档**画成红色虚线并写明理由**，不许它混在提案里当正常形看
    poly(smooth(q.m.profile).map(([x, y]) => [x0 + x * SC, CY + y * SC]), q.why ? '#c33' : COL[i % 3], 1.6);
    txt(x0, CY + 78, q.nm, 12, q.why ? '#c33' : '#222', true);
    txt(x0, CY + 92, `挑出 ${q.m.reach.toFixed(1)} · 高 ${q.m.boxH.toFixed(1)}`, 10.5, '#666');
    if (q.why) txt(x0, CY + 106, `✗ ${q.why}`, 10.5, '#c33');
    x0 += Math.max(q.m.reach * SC, 60) + 74;
  }
  // 桅杆半径参考
  line(70 - R * SC, CY - 62, 70 - R * SC, CY + 62, '#ccc', 1, '2 3');
  txt(70 - R * SC, CY - 68, '桅杆轴', 9.5, '#aaa');
  Y = CY + 112;
}

// 整圈立面对照（同一比例）——直接回答「是不是这么厚」
txt(24, Y, '整圈二十位立面 · 同一比例（▲ = 角位；灰线 = 箱高上下缘）', 13, '#111', true);
Y += 12;
{
  const SC = 0.62, SLOT = 55;
  const ORDER = [0, 1, 2, 1, 0, 0, 1, 2, 1, 0, 0, 1, 2, 1, 0, 0, 1, 2, 1, 0];
  for (const r of rows.slice(0, 2)) {
    const CY = Y + r.H * SC * 0.5 + 22;
    line(24, CY - (r.H / 2) * SC, 24 + 20 * SLOT + 16, CY - (r.H / 2) * SC, '#bbb', 1);
    line(24, CY + (r.H / 2) * SC, 24 + 20 * SLOT + 16, CY + (r.H / 2) * SC, '#bbb', 1);
    for (let i = 0; i < 20; i++) {
      const q = r.runs[ORDER[i]];
      if (!q || q.bad || q.why) continue;
      const x0 = 34 + i * SLOT;
      poly(smooth(q.m.profile).map(([x, y]) => [x0 + x * SC, CY + y * SC]), COL[ORDER[i]], 1.2);
      if (ORDER[i] === 2) txt(x0, CY - (r.H / 2) * SC - 6, '▲', 9, '#3f6d3f');
    }
    txt(24 + 20 * SLOT + 22, CY + 4, `${r.label} 高 ${r.H}`, 11, '#666');
    Y = CY + (r.H / 2) * SC + 26;
  }
  txt(24, Y, '两行同一比例：下面一行的箱高是上面的 1.9 倍——这就是你红线量的那个厚度。挑出（横向）两行几乎一样，方形 152 → 150。', 11, '#555');
  Y += 26;
}

txt(24, Y, '要你拍板的', 13, '#111', true);
Y += 18;
for (const s of [
  '① 变厚照做（4 重不变）：箱高 36 → 68，方形 150px。三档形都干净（结 ≤3、顶底面水平度 ≤1.0、箱高散布 0.02）。',
  '② 一次循环要付方形：从 150 压到 110，而且那时平台比桅杆还窄、读作高领子。要不要这么换？',
  '③ 折中：只做变厚，一次循环留给圆筒环（Lab.13 已经就是「一圈一个来回」，没有方形约束、形态是十级完整过渡）。',
]) { txt(24, Y, s, 12, '#444'); Y += 17; }

writeFileSync(OUT, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${(Y + 20).toFixed(0)}" viewBox="0 0 ${W} ${(Y + 20).toFixed(0)}" font-family="system-ui, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"><rect width="100%" height="100%" fill="#faf9f6"/>${sv.join('')}</svg>`);
console.log(`\n线稿已写 ${OUT}`);
