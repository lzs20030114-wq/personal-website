// 大触手反应的对照查看页：把 reaction-probe.mjs 的输出画成一张可以播放的网页。
//
//   node scripts/behavior/reaction-viewer.mjs <out.html> <A 版前缀> [<B 版前缀>] [--labels 现状,提案]
//
// 前缀指向 probe 的输出文件：<前缀>-A.json … <前缀>-D.json（每种人格一个，也可以是一个含全部人格的
// <前缀>.json）。给两个前缀就并排对照（同种子、同刺激、同步播放）。
// 画的东西都来自探针里的真实求解：侧视臂形（脊线 7 点）、从臂梢往回看的截面（梢端轨迹）、呼吸（环身
// 张合）、触须摆角、机身转了多少、发声；下面一条是「反应让梢端偏离本来位置」的距离曲线。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const li = args.indexOf('--labels');
const labels = li >= 0 ? args.splice(li, 2)[1].split(',') : ['现状', '提案'];
const [out, ...prefixes] = args;
if (!out || !prefixes.length) {
  console.error('usage: reaction-viewer.mjs <out.html> <prefix> [<prefix2>] [--labels a,b]');
  process.exit(1);
}

const load = (prefix) => {
  const merged = { reactions: null, summary: {}, examples: {} };
  const files = existsSync(`${prefix}.json`) ? [`${prefix}.json`] : ['A', 'B', 'C', 'D'].map((p) => `${prefix}-${p}.json`).filter(existsSync);
  for (const f of files) {
    const j = JSON.parse(readFileSync(resolve(f), 'utf8'));
    merged.reactions ??= j.reactions;
    Object.assign(merged.summary, j.summary);
    Object.assign(merged.examples, j.examples);
  }
  return merged;
};
const versions = prefixes.map(load);

/** 压数据：每帧只留侧视需要的 (y, z) 脊线 + 梢端 x，整数毫米；其余通道保留两位 */
const pack = (ex) => {
  if (!ex) return null;
  const all = [...(ex.pre ?? []), ...ex.frames];
  return {
    seed: ex.seed,
    t: all.map((f) => +f.t.toFixed(3)),
    sp: all.map((f) => f.spine.flatMap((p) => [Math.round(p[1]), Math.round(p[2])])),
    tx: all.map((f) => Math.round(f.spine[f.spine.length - 1][0])),
    s: all.map((f) => +f.s.toFixed(3)),
    yaw: all.map((f) => +f.yaw.toFixed(1)),
    feel: all.map((f) => +f.feel.toFixed(0)),
    snd: all.map((f) => f.sound),
    disp: all.map((f) => +f.disp.toFixed(0)),
    ev: (ex.events ?? []).filter((e) => !['HAND'].includes(e.ev)).map((e) => [+e.t.toFixed(2), e.ev, e.p?.action ?? e.p?.mode ?? '']),
  };
};

const med = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const data = {
  labels: labels.slice(0, versions.length),
  reactions: versions[0].reactions,
  personas: ['A', 'B', 'C', 'D'].filter((p) => versions[0].examples[p]),
  v: versions.map((V) => {
    const ex = {};
    const sm = {};
    for (const P of Object.keys(V.examples)) {
      ex[P] = {};
      sm[P] = {};
      for (const R of V.reactions) {
        ex[P][R.key] = pack(V.examples[P][R.key]);
        const ms = V.summary[P]?.[R.key] ?? [];
        sm[P][R.key] = ['peak', 'onset', 'tPeak', 'vPeak', 'aPeak', 'dYaw', 'dC', 'aMul', 'feel'].reduce(
          (o, k) => ({ ...o, [k]: med(ms.map((m) => m[k])) }),
          {},
        );
      }
    }
    return { ex, sm };
  }),
};

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大触手反应对照</title>
<style>
:root {
  color-scheme: light;
  --bg: #f4f3ef; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --ink-3: #8a8984; --line: #dddcd6;
  --v0: #8f8e88; --v1: #2a78d6; --hot: #e34948; --breath: #c9c7bf;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --bg: #121211; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --ink-3: #8f8e86; --line: #34332f;
    --v0: #9a998f; --v1: #3987e5; --hot: #e66767; --breath: #3d3c37;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif; }
main { max-width: 1240px; margin: 0 auto; padding: 20px 16px 60px; }
h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--ink-2); margin: 0 0 16px; max-width: 74ch; }
.bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 0; background: var(--bg); border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.seg { display: inline-flex; }
.seg button, .bar > button { font: inherit; padding: 5px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.seg button + button { margin-left: -1px; }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.clock { font-variant-numeric: tabular-nums; color: var(--ink-2); min-width: 7ch; }
.legend { display: inline-flex; gap: 14px; color: var(--ink-2); }
.legend i { display: inline-block; width: 14px; height: 3px; vertical-align: middle; margin-right: 5px; border-radius: 2px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); padding: 10px 12px 12px; }
.card h2 { font-size: 14px; margin: 0 0 6px; font-weight: 600; }
.pair { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 10px; }
.pane { position: relative; }
.pane .tag { position: absolute; left: 6px; top: 4px; font-size: 11px; color: var(--ink-2); }
.pane .ev { position: absolute; right: 6px; top: 4px; font-size: 11px; color: var(--hot); font-weight: 600; min-height: 1em; }
svg { display: block; width: 100%; height: auto; }
.strip { margin-top: 6px; }
.nums { margin-top: 6px; font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 10px; }
table { border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; margin-top: 24px; width: 100%; }
th, td { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: right; }
th:first-child, td:first-child { text-align: left; }
caption { text-align: left; font-weight: 600; padding-bottom: 6px; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<h1>大触手反应对照</h1>
<p class="sub">同一个种子、同一次刺激，${data.labels.length > 1 ? '两版并排同步播放' : '逐一播放'}。数据全部来自探针（引擎 → 三腱 → 肌肉 → 触手求解器）。每格左侧是机身（高度 = 呼吸张合）与两条触须，向右伸出的是大触手的侧视；右下小方框是从臂梢往回看的截面（梢端往哪边偏）；小表盘是机身转了多少；红点 = 发声。刺激在 0 秒。下面的曲线是「这次反应让梢端偏离本来位置」的距离（mm），已减去静息漂移。</p>
<div class="bar">
  <span class="seg" id="personas"></span>
  <button id="play">暂停</button>
  <span class="seg" id="speed"><button data-s="1" aria-pressed="true">1×</button><button data-s="0.5">0.5×</button><button data-s="0.25">0.25×</button></span>
  <span class="clock" id="clock">t = 0.0 s</span>
  <span class="legend" id="legend"></span>
</div>
<div class="grid" id="grid"></div>
<div id="tables"></div>
</main>
<script>
const D = ${JSON.stringify(data)};
const N = D.v.length;
const COLORS = ['var(--v0)', 'var(--v1)'];
const SKIP = new Set(['rest']);
let persona = D.personas.includes('C') ? 'C' : D.personas[0];
let speed = 1, playing = true, t = -1, last = performance.now();
const T0 = -1, T1 = 9;
document.documentElement.style.setProperty('--n', N);
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, kids = []) => {
  const ns = ['svg','g','path','line','circle','rect','polyline','text','polygon'].includes(tag) ? 'http://www.w3.org/2000/svg' : null;
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
};
$('#legend').innerHTML = D.labels.map((l, i) => '<span><i style="background:' + COLORS[N === 1 ? 1 : i] + '"></i>' + l + '</span>').join('');
for (const P of D.personas) {
  const names = { A: 'A 活力', B: 'B 沉静', C: 'C 好奇', D: 'D 不稳定' };
  const b = el('button', { 'aria-pressed': String(P === persona) }, [names[P]]);
  b.onclick = () => { persona = P; [...$('#personas').children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); build(); t = T0; };
  $('#personas').append(b);
}
$('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? '暂停' : '播放'; last = performance.now(); };
[...$('#speed').children].forEach((b) => (b.onclick = () => { speed = +b.dataset.s; [...$('#speed').children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));

// 侧视坐标：臂沿 +y（0→~355 mm）画向右，z 向上；机身画在臂根左侧
const W = 300, H = 230, OX = 64, OY = 120, K = 0.62;
const sx = (y) => OX + y * K, sy = (z) => OY - z * K;
let panes = [];
function build() {
  const grid = $('#grid');
  grid.innerHTML = '';
  panes = [];
  for (const R of D.reactions) {
    if (SKIP.has(R.key)) continue;
    const card = el('section', { class: 'card' });
    card.append(el('h2', {}, [R.zh]));
    const pair = el('div', { class: 'pair' });
    const nums = el('div', { class: 'nums' });
    for (let v = 0; v < N; v++) {
      const ex = D.v[v].ex[persona]?.[R.key];
      const col = COLORS[N === 1 ? 1 : v];
      const pane = el('div', { class: 'pane' });
      const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': D.labels[v] + ' ' + R.zh });
      // 地面与机身
      svg.append(el('line', { x1: 8, y1: OY + 70, x2: W - 8, y2: OY + 70, stroke: 'var(--line)' }));
      const body = el('rect', { x: 14, width: 44, rx: 10, fill: 'var(--breath)' });
      svg.append(body);
      const fA = el('line', { stroke: col, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
      const fB = el('line', { stroke: col, 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.55 });
      svg.append(fA, fB);
      // 静息参照（刺激前那一刻的臂形）
      const ghost = el('polyline', { fill: 'none', stroke: 'var(--line)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const trail = el('polyline', { fill: 'none', stroke: col, 'stroke-width': 1.2, opacity: 0.45 });
      const arm = el('polyline', { fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      svg.append(ghost, trail, arm);
      // 截面（从臂梢往回看：x 横、z 竖）
      const BX = W - 62, BY = H - 62, BS = 54;
      svg.append(el('rect', { x: BX, y: BY, width: BS, height: BS, fill: 'none', stroke: 'var(--line)' }));
      svg.append(el('line', { x1: BX + BS / 2, y1: BY, x2: BX + BS / 2, y2: BY + BS, stroke: 'var(--line)', 'stroke-dasharray': '2 3' }));
      svg.append(el('line', { x1: BX, y1: BY + BS / 2, x2: BX + BS, y2: BY + BS / 2, stroke: 'var(--line)', 'stroke-dasharray': '2 3' }));
      const xtrail = el('polyline', { fill: 'none', stroke: col, 'stroke-width': 1.2, opacity: 0.5 });
      const xdot = el('circle', { r: 3.5, fill: col });
      svg.append(xtrail, xdot);
      svg.append(el('text', { x: BX, y: BY - 4, 'font-size': 9, fill: 'var(--ink-3)' }, ['梢端截面']));
      // 转身表盘
      const dial = el('g', { transform: 'translate(' + (W - 22) + ',22)' });
      dial.append(el('circle', { r: 13, fill: 'none', stroke: 'var(--line)' }));
      const needle = el('line', { x1: 0, y1: 0, x2: 0, y2: -12, stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round' });
      dial.append(needle);
      svg.append(dial);
      const snd = el('circle', { cx: 36, cy: 18, r: 5, fill: 'var(--hot)', opacity: 0 });
      svg.append(snd);
      pane.append(svg);
      pane.append(el('span', { class: 'tag' }, [D.labels[v]]));
      const evTag = el('span', { class: 'ev' });
      pane.append(evTag);
      // 位移曲线
      const SW = W, SH = 54;
      const strip = el('svg', { class: 'strip', viewBox: '0 0 ' + SW + ' ' + SH });
      const maxD = 160;
      const px = (tt) => 6 + ((tt - T0) / (T1 - T0)) * (SW - 12);
      const py = (d) => SH - 6 - (Math.min(d, maxD) / maxD) * (SH - 12);
      strip.append(el('line', { x1: px(0), y1: 2, x2: px(0), y2: SH - 2, stroke: 'var(--hot)', 'stroke-dasharray': '2 3', opacity: 0.6 }));
      strip.append(el('line', { x1: 6, y1: SH - 6, x2: SW - 6, y2: SH - 6, stroke: 'var(--line)' }));
      if (ex) strip.append(el('polyline', { fill: 'none', stroke: col, 'stroke-width': 2, points: ex.t.map((tt, i) => px(tt) + ',' + py(ex.disp[i])).join(' ') }));
      strip.append(el('text', { x: SW - 6, y: 10, 'font-size': 9, 'text-anchor': 'end', fill: 'var(--ink-3)' }, ['梢端偏离 0–' + maxD + ' mm']));
      const head = el('line', { y1: 2, y2: SH - 2, stroke: 'var(--ink-2)' });
      strip.append(head);
      pane.append(strip);
      pair.append(pane);
      const sm = D.v[v].sm[persona]?.[R.key] ?? {};
      const f = (x, d = 0) => (x === null || x === undefined ? '—' : x.toFixed(d));
      nums.append(el('div', {}, ['峰值 ' + f(sm.peak) + ' mm · 起动 ' + f(sm.onset, 2) + ' s · 到峰 ' + f(sm.tPeak, 2) + ' s · 峰速 ' + f(sm.vPeak) + ' mm/s']));
      panes.push({ ex, body, fA, fB, ghost, trail, arm, xtrail, xdot, needle, snd, evTag, head, px, BX, BY, BS });
    }
    card.append(pair, nums);
    grid.append(card);
  }
  tables();
}
function idx(ex, tt) {
  let lo = 0, hi = ex.t.length - 1;
  if (tt <= ex.t[0]) return 0;
  if (tt >= ex.t[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ex.t[m] <= tt) lo = m; else hi = m; }
  return lo;
}
const pts = (sp) => { const o = []; for (let k = 0; k < sp.length; k += 2) o.push(sx(sp[k]) + ',' + sy(sp[k + 1])); return o.join(' '); };
function draw() {
  for (const p of panes) {
    const ex = p.ex;
    if (!ex) continue;
    const i = idx(ex, t);
    const i0 = idx(ex, 0);
    p.ghost.setAttribute('points', pts(ex.sp[i0]));
    p.arm.setAttribute('points', pts(ex.sp[i]));
    const tr = [];
    for (let j = Math.max(0, i - 30); j <= i; j++) { const sp = ex.sp[j]; tr.push(sx(sp[sp.length - 2]) + ',' + sy(sp[sp.length - 1])); }
    p.trail.setAttribute('points', tr.join(' '));
    // 截面：梢端相对刺激前的偏移（x 左右、z 上下），±160 mm 填满方框
    const sc = p.BS / 2 / 160;
    const cx = (j) => p.BX + p.BS / 2 + Math.max(-160, Math.min(160, ex.tx[j] - ex.tx[i0])) * sc;
    const cz = (j) => { const a = ex.sp[j], b = ex.sp[i0]; return p.BY + p.BS / 2 - Math.max(-160, Math.min(160, a[a.length - 1] - b[b.length - 1])) * sc; };
    const xt = [];
    for (let j = Math.max(0, i - 45); j <= i; j++) xt.push(cx(j) + ',' + cz(j));
    p.xtrail.setAttribute('points', xt.join(' '));
    p.xdot.setAttribute('cx', cx(i));
    p.xdot.setAttribute('cy', cz(i));
    // 机身高度 = 呼吸张合（s 0 全开 → 高；1 收拢 → 矮）
    const h = 50 + 70 * (1 - ex.s[i]);
    p.body.setAttribute('y', OY + 70 - h);
    p.body.setAttribute('height', h);
    const a = (ex.feel[i] * Math.PI) / 180;
    const fx = 58, fy = OY + 70 - h + 8;
    p.fA.setAttribute('x1', fx); p.fA.setAttribute('y1', fy);
    p.fA.setAttribute('x2', fx + 26 * Math.sin(a)); p.fA.setAttribute('y2', fy - 26 * Math.cos(a));
    p.fB.setAttribute('x1', 14); p.fB.setAttribute('y1', fy);
    p.fB.setAttribute('x2', 14 - 26 * Math.sin(a)); p.fB.setAttribute('y2', fy - 26 * Math.cos(a));
    const ya = (ex.yaw[i] * Math.PI) / 180;
    p.needle.setAttribute('x2', 12 * Math.sin(ya)); p.needle.setAttribute('y2', -12 * Math.cos(ya));
    p.snd.setAttribute('opacity', ex.snd[i] ? 1 : 0);
    const recent = ex.ev.filter((e) => e[0] <= t && t - e[0] < 1.2 && !['SKIP'].includes(e[1]));
    p.evTag.textContent = recent.length ? recent[recent.length - 1][1] + (recent[recent.length - 1][2] ? ' · ' + recent[recent.length - 1][2] : '') : (t >= 0 && t < 0.6 ? '刺激' : '');
    p.head.setAttribute('x1', p.px(t)); p.head.setAttribute('x2', p.px(t));
  }
  $('#clock').textContent = 't = ' + t.toFixed(1) + ' s';
}
function tables() {
  const wrap = $('#tables');
  wrap.innerHTML = '';
  const tb = el('table');
  tb.append(el('caption', {}, ['人格 ' + persona + ' · 12 个种子的中位数（反应部分，已减静息漂移）']));
  const cols = [['peak', '峰值 mm', 0], ['onset', '起动 s', 2], ['tPeak', '到峰 s', 2], ['vPeak', '峰速 mm/s', 0], ['aPeak', '峰加速 m/s²', 2], ['dYaw', '转身 °', 0], ['dC', '呼吸中心偏移', 2], ['aMul', '呼吸幅度 ×', 2], ['feel', '触须 °', 0]];
  const head = el('tr', {}, [el('th', {}, ['反应'])]);
  if (N > 1) head.append(el('th', {}, ['版本']));
  for (const c of cols) head.append(el('th', {}, [c[1]]));
  tb.append(head);
  for (const R of D.reactions) {
    if (SKIP.has(R.key)) continue;
    for (let v = 0; v < N; v++) {
      const sm = D.v[v].sm[persona]?.[R.key] ?? {};
      const tr = el('tr', {}, [el('td', {}, [v === 0 ? R.zh : ''])]);
      if (N > 1) tr.append(el('td', {}, [D.labels[v]]));
      for (const c of cols) tr.append(el('td', {}, [sm[c[0]] === null || sm[c[0]] === undefined ? '—' : sm[c[0]].toFixed(c[2])]));
      tb.append(tr);
    }
  }
  wrap.append(tb);
}
build();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) { t += dt * speed; if (t > T1) t = T0; }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>`;

writeFileSync(resolve(out), html);
console.log(`写出 ${out}（${(html.length / 1024).toFixed(0)} KB）`);
