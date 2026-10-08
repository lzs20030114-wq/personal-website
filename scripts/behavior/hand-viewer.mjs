// 迎手链两版并排查看页（研究笔记 §9）：读 hand-probe.mjs 的逐场 JSON，画每种人格 × 现行 / v2 的时间线。
//
//   node scripts/behavior/hand-viewer.mjs <probeOutDir> <out.html> [场景，默认 S1n,S4,S4s,S7,S2]
//
// 每一行 = 一个种子的一场（取该格第一个种子）：
//   ① 阶段条：迎手链的阶段（陪着 / 凑 / 缠 / 握 / 追 / 放开 / 找 / 躲 / 看着 / 够不着）按颜色铺在时间轴上，拍名写在条里；
//      现行没有阶段，用抓握状态（WRAP / HOLD / RELEASE）代替；
//   ② 指针 ↔ 臂脊线的画面距离（mm）：碰到半径（32 mm）一条虚线，压到线下 = 碰着；
//   ③ 差动指令 D（臂弯多少；0.5 以上只有深卷）与环身呼吸行程 s（细线）。
// 竖线：看见手（灰）、碰到（绿）、握住（深绿）、脱手（红）。悬停显示那一刻的读数。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dirArg, outArg, scenArg] = process.argv.slice(2);
if (!dirArg || !outArg) {
  console.error('用法：node scripts/behavior/hand-viewer.mjs <probeOutDir> <out.html> [S1n,S4,...]');
  process.exit(1);
}
const DIR = resolve(dirArg);
const SCENS = (scenArg ?? 'S1n,S4,S4s,S7,S2').split(',');
const PERSONAS = ['A', 'B', 'C', 'D'];
const NAMES = { A: '活力 A', B: '沉静 B', C: '好奇 C', D: '不稳定 D' };
const SCEN_ZH = {
  S1n: '手停在臂够得着的地方（看见 → 凑 → 碰到 → 缠 → 握）',
  S4: '握住 3 s 后快速抽手',
  S4s: '握住 3 s 后慢慢抽手',
  S4b: '握住 3 s 后把手挪到另一边停住',
  S5: '握着时慢慢牵着走',
  S7: '手在正前方 0.9 m 不动（躲的那一路）',
  S2: '手在够不着的地方',
  S3: '手慢慢划过臂前方',
  S6: '正视，手在臂中段正上方（深卷几何）',
  S8: '惊跳松手后手不动（重新武装）',
};

const runsOf = (sc, P, v) => {
  const f = join(DIR, 'runs', `${sc}-${P}-v${v}.json`);
  if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(j) ? j : (j.runs ?? null);
};

const sections = [];
for (const sc of SCENS) {
  const rows = [];
  for (const P of PERSONAS) {
    for (const v of [1, 2]) {
      const runs = runsOf(sc, P, v);
      if (!runs || !runs.length) continue;
      const r = runs[0];
      rows.push({ P, v, seed: r.seed, series: r.series ?? [], events: r.events ?? [] });
    }
  }
  if (rows.length) sections.push({ sc, rows });
}
if (!sections.length) {
  console.error(`在 ${DIR}/runs 下没找到这些场景的结果：${SCENS.join(', ')}`);
  process.exit(1);
}

const data = JSON.stringify({ sections, names: NAMES, scenZh: SCEN_ZH });
const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>迎手链两版对照</title>
<style>
:root {
  --bg: #f7f6f2; --ink: #1d1f1c; --muted: #6b6f68; --grid: #dedbd2; --panel: #ffffff;
  --track: #8aa2b8; --approach: #2f7d5b; --wrap: #b8641f; --hold: #8a3f2a; --chase: #b8325a; --release: #9a8f7a;
  --search: #6c5aa8; --avoid: #c07a9a; --watch: #7f8c6a; --strain: #c9a227; --grasp: #b8641f;
  --d: #1d1f1c; --s: #8aa2b8; --dist: #2f7d5b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #171816; --ink: #ecebe6; --muted: #a2a59d; --grid: #34362f; --panel: #20221e;
    --track: #7f98ae; --approach: #4fae84; --wrap: #d98a46; --hold: #c76a50; --chase: #e0607f; --release: #a89e88;
    --search: #9886d6; --avoid: #d79ab6; --watch: #a2b08a; --strain: #e0bd48; --grasp: #d98a46;
    --d: #ecebe6; --s: #7f98ae; --dist: #4fae84;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 32px 0 8px; }
p.lede, p.note { color: var(--muted); margin: 0 0 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 8px 0 16px; font-size: 12px; color: var(--muted); }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; background: var(--c); }
.row { background: var(--panel); border: 1px solid var(--grid); border-radius: 8px; padding: 8px 10px 4px; margin: 8px 0; overflow-x: auto; }
.row h3 { font-size: 13px; margin: 0 0 4px; font-weight: 600; }
.row h3 small { font-weight: 400; color: var(--muted); }
svg { display: block; min-width: 720px; width: 100%; height: auto; }
.tip { position: fixed; pointer-events: none; background: var(--panel); border: 1px solid var(--grid); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--ink); display: none; box-shadow: 0 2px 8px rgb(0 0 0 / 0.15); }
</style>
</head>
<body>
<main>
<h1>迎手链：现行 vs v2</h1>
<p class="lede">闭环探针（引擎 → 三腱 → 肌肉 → 求解器 + 台架同式碰臂）的逐场时间线。每格取第一个种子；时间从手出现算。</p>
<div class="legend" id="legend"></div>
<div id="root"></div>
</main>
<div class="tip" id="tip"></div>
<script>
const D = ${data};
const STAGES = ['track','approach','strain','watch','wrap','hold','chase','release','search','avoid'];
const STAGE_ZH = { track:'陪着', approach:'凑', strain:'够不着', watch:'看着', wrap:'缠', hold:'握', chase:'追', release:'放开', search:'找', avoid:'侧身躲', grasp:'抓握（现行）' };
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
const legend = document.getElementById('legend');
for (const s of [...STAGES, 'grasp']) { const e = document.createElement('span'); e.style.setProperty('--c', 'var(--' + s + ')'); e.textContent = STAGE_ZH[s]; legend.appendChild(e); }
for (const [k, label] of [['dist','指针 ↔ 臂脊线（mm）'], ['d','差动指令 D'], ['s','呼吸行程 s']]) { const e = document.createElement('span'); e.style.setProperty('--c', 'var(--' + k + ')'); e.textContent = label; legend.appendChild(e); }
const root = document.getElementById('root');
const tip = document.getElementById('tip');
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a, p) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); if (p) p.appendChild(x); return x; };

for (const sec of D.sections) {
  const h = document.createElement('h2'); h.textContent = sec.sc + ' · ' + (D.scenZh[sec.sc] ?? ''); root.appendChild(h);
  const T = Math.max(...sec.rows.map((r) => r.series.length ? r.series[r.series.length - 1].t : 0));
  for (const r of sec.rows) {
    const box = document.createElement('div'); box.className = 'row'; root.appendChild(box);
    const hd = document.createElement('h3'); hd.innerHTML = D.names[r.P] + ' · ' + (r.v === 2 ? 'v2 迎手链' : '现行') + ' <small>种子 ' + r.seed + '</small>'; box.appendChild(hd);
    const W = 1100, L = 44, R = 10, H = 168;
    const x = (t) => L + ((t - Math.min(0, r.series[0]?.t ?? 0)) / Math.max(1e-6, T - Math.min(0, r.series[0]?.t ?? 0))) * (W - L - R);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': D.names[r.P] + ' 时间线' }, box);
    // ① 阶段条
    const sy = 4, sh = 22;
    let i0 = 0;
    const keyOf = (f) => r.v === 2 ? (f.stage && f.stage !== 'off' ? f.stage : null) : (f.gp && f.gp !== 'IDLE' ? 'grasp' : null);
    const beatOf = (f) => r.v === 2 ? (f.beat || '') : (f.gp || '');
    for (let i = 1; i <= r.series.length; i++) {
      const a = r.series[i0], b = r.series[i];
      if (i < r.series.length && keyOf(b) === keyOf(a) && beatOf(b) === beatOf(a)) continue;
      const k = keyOf(a);
      if (k) {
        const x0 = x(a.t), x1 = x(i < r.series.length ? b.t : a.t + 0.1);
        el('rect', { x: x0, y: sy, width: Math.max(1, x1 - x0 - 0.5), height: sh, rx: 2, fill: 'var(--' + k + ')' }, svg);
        if (x1 - x0 > 34) { const tx = el('text', { x: x0 + 3, y: sy + 15, 'font-size': 10, fill: '#fff' }, svg); tx.textContent = beatOf(a) || STAGE_ZH[k]; }
      }
      i0 = i;
    }
    // ② 距离、③ D 与 s
    const dy0 = 34, dh = 60, Dy0 = 102, Dh = 56;
    el('line', { x1: L, x2: W - R, y1: dy0 + dh, y2: dy0 + dh, stroke: 'var(--grid)' }, svg);
    el('line', { x1: L, x2: W - R, y1: Dy0 + Dh, y2: Dy0 + Dh, stroke: 'var(--grid)' }, svg);
    const dMax = 160;
    const yd = (d) => dy0 + dh - Math.min(1, d / dMax) * dh;
    el('line', { x1: L, x2: W - R, y1: yd(32), y2: yd(32), stroke: 'var(--muted)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }, svg);
    const lab = (y, t) => { const e = el('text', { x: L - 4, y, 'font-size': 10, fill: 'var(--muted)', 'text-anchor': 'end' }, svg); e.textContent = t; };
    lab(yd(32) + 3, '32'); lab(dy0 + 8, dMax + '+'); lab(Dy0 + 8, '0.5'); lab(Dy0 + Dh, '0');
    const path = (key, y, cls, w) => { let d = ''; for (const f of r.series) { if (f[key] === undefined) continue; d += (d ? 'L' : 'M') + x(f.t).toFixed(1) + ' ' + y(f[key]).toFixed(1); } if (d) el('path', { d, fill: 'none', stroke: 'var(--' + cls + ')', 'stroke-width': w }, svg); };
    path('dScr', yd, 'dist', 1.6);
    path('De', (v) => Dy0 + Dh - Math.min(1, v / 0.5) * Dh, 'd', 1.6);
    path('s', (v) => Dy0 + Dh - v * Dh, 's', 1);
    // 事件
    const evs = [];
    const seen = r.events.find((e) => e.ev === 'HAND_SEEN'); if (seen) evs.push([seen.tr ?? seen.t, 'var(--muted)', '看见']);
    let prevT = 0, prevH = 0;
    for (const f of r.series) { if (f.touch && !prevT) evs.push([f.t, 'var(--approach)', '碰到']); if (f.gp === 'HOLD_HUMAN' && !prevH) evs.push([f.t, 'var(--hold)', '握住']); prevT = f.touch; prevH = f.gp === 'HOLD_HUMAN'; }
    for (const e of r.events) if (e.ev === 'GRASP_LOST') evs.push([e.tr ?? e.t, 'var(--chase)', '脱手']);
    for (const [t, c] of evs) if (Number.isFinite(t)) el('line', { x1: x(t), x2: x(t), y1: 30, y2: H - 6, stroke: c, 'stroke-width': 1 }, svg);
    // 时间刻度
    for (let t = 0; t <= T; t += 2) { const e = el('text', { x: x(t), y: H - 1, 'font-size': 9, fill: 'var(--muted)', 'text-anchor': 'middle' }, svg); e.textContent = t + 's'; }
    // 悬停
    const hit = el('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', (ev) => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      let best = r.series[0], bd = Infinity;
      for (const f of r.series) { const d = Math.abs(x(f.t) - p.x); if (d < bd) { bd = d; best = f; } }
      tip.style.display = 'block'; tip.style.left = ev.clientX + 12 + 'px'; tip.style.top = ev.clientY + 12 + 'px';
      tip.innerHTML = 't ' + best.t.toFixed(1) + ' s<br>' + (r.v === 2 ? (STAGE_ZH[best.stage] ?? '—') + (best.beat ? ' · ' + best.beat : '') : (best.gp ?? '')) +
        '<br>指针 ↔ 臂 ' + (best.dScr !== undefined ? best.dScr.toFixed(0) + ' mm' : '—') + '<br>D ' + best.De.toFixed(3) + (best.deep ? ' · 深卷 ' + best.deep.toFixed(2) : '') + '<br>呼吸 s ' + best.s.toFixed(2);
    });
    hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }
}
</script>
</body>
</html>
`;
writeFileSync(resolve(outArg), html);
console.log(`wrote ${outArg}（${sections.length} 个场景）`);
