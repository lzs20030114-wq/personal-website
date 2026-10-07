// 行为引擎示例会话（轮回机器_行为引擎spec.md §9 M1 验收物）：一位模拟被试陪机器过完四世，
// 写出事件日志与一张四世时间线图，给用户看「人格读不读得出来、死得对不对、刺激有没有回应」。
//
// 引擎、规则、人格表一律取站上模块（src/lib/linkage/behavior/），这里不另写一份。
// 被试的动作是脚本里写死的一套（不是行为规则），按每一世的诞生时刻对齐；
// 先空跑一遍拿各世时刻——交互挪不动死亡时点（守门测试卡着），所以空跑的时刻就是真跑的时刻。
//
// 用法：node scripts/behavior/session.mjs <outDir> [seed=7] [order=ABCD]
//   产出 session.jsonl（会话头 + 全部事件，一行一条）· session.html（四世时间线 + 表格视图）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] ?? 'behavior-out');
const SEED = Number(process.argv[3] ?? 7);
const ORDER = (process.argv[4] ?? 'ABCD').split('');
mkdirSync(OUT, { recursive: true });

// ─────────────────────────────────────────────────────────────── 数据

function lifeTimes(log) {
  const lives = [];
  for (const r of log) {
    if (r.ev === 'LIFE_BIRTH') lives.push({ life: r.life, persona: r.persona, birth: r.t });
    const L = lives[lives.length - 1];
    if (r.ev === 'LIFE_GROW') L.grow = r.t;
    if (r.ev === 'LIFE_AGE') L.age = r.t;
    if (r.ev === 'LIFE_DEATH_START') L.deathStart = r.t;
    if (r.ev === 'LIFE_DEATH') L.death = r.t;
  }
  const end = log[log.length - 1].t;
  lives.forEach((L, i) => (L.end = i + 1 < lives.length ? lives[i + 1].birth : end));
  return lives;
}

/** 一位被试在一世里做的事（相对诞生秒）。不是行为规则，只是一套固定的演示动作 */
function participant(L) {
  const b = L.birth;
  const ev = [];
  const at = (t, input) => ev.push({ t, input });
  at(b + 10, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }); // 刚醒：不回应
  at(b + 70, { kind: 'PRESENCE', band: 'far', bearing: 0.9 });
  at(b + 85, { kind: 'PRESENCE', band: 'mid', bearing: 0.6 });
  at(b + 95, { kind: 'PRESENCE', band: 'near', bearing: 0.4 });
  at(b + 110, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' });
  at(b + 125, { kind: 'SHELL_STROKE', half: 'R', touch: 'stroke' });
  at(b + 140, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' });
  at(b + 160, { kind: 'SHELL_STROKE', half: 'R', touch: 'pat' });
  at(b + 180, { kind: 'FEELER_TOUCH', feeler: 0, side: 'L' });
  at(b + 200, { kind: 'ARM_TOUCH', on: true });
  at(b + 201.2, { kind: 'RESISTANCE', on: true });
  at(b + 209, { kind: 'RESISTANCE', on: false });
  at(b + 209.5, { kind: 'ARM_TOUCH', on: false });
  at(b + 230, { kind: 'SOUND', level: 0.8 });
  at(b + 250, { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' });
  at(b + 270, { kind: 'KNOCK', intensity: 0.6 });
  at(b + 290, { kind: 'LIFT', lifted: true });
  at(b + 300, { kind: 'LIFT', lifted: false });
  for (const dt of [20, 45, 70]) at(L.age + dt, { kind: 'SHELL_STROKE', half: dt === 45 ? 'R' : 'L', touch: 'stroke' });
  at(L.deathStart + 20, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }); // 将死：不再回应
  at(L.death + 5, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }); // 死后的触碰
  at(L.death + 15, { kind: 'PRESENCE', band: 'gone' });
  return ev;
}

// ─────────────────────────────────────────────────────────────── 页面

const PHASE_ZH = { BIRTH: '诞生', GROW: '成长', AGE: '衰老', DEATH: '死亡', BLANK: '空白', END: '结束' };
const OUT_ZH = { respond: '回应', startle: '惊吓', busy: '忙着（未排响应）', muted: '不回应', none: '只改状态' };
function eventZh(r) {
  const p = r.p ?? {};
  switch (r.ev) {
    case 'PRESENCE':
      return { gone: '人离开', far: '人在远处', mid: '人走近', near: '人到跟前' }[p.band] ?? '在场';
    case 'FEELER_TOUCH':
      return `碰${p.feeler === 0 ? '左' : '右'}触须`;
    case 'SHELL_STROKE':
      return { stroke: '抚摸', pat: '轻拍', poke: '戳' }[p.touch] + `${p.half === 'L' ? '左' : '右'}半壳`;
    case 'SHELL_HOLD':
      return p.on ? '按住壳' : '松开壳';
    case 'LIFT':
      return p.lifted ? '拿起' : '放下';
    case 'KNOCK':
      return '敲';
    case 'SOUND':
      return '拍手';
    case 'ARM_TOUCH':
      return p.on ? '碰臂' : '手离开臂';
    case 'RESISTANCE':
      return p.on ? '臂受力' : '臂失力';
    default:
      return r.ev;
  }
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (x) => x.toFixed(1);
const mmss = (s) => `${Math.floor(s / 60)}′${String(Math.floor(s % 60)).padStart(2, '0')}″`;

function page(run, lives, PERSONAS) {
  const W = 1120;
  const X0 = 72;
  const X1 = 852;
  const IX0 = 892;
  const IX1 = 1092;
  const SPAN = 600; // 主轨统一 10 分钟，四世的长短可以直接比
  const INSET = 20; // 放大窗 20 秒（成长段）
  const HEAD = 0;
  const ROW = 196;
  const TOP = 8;
  const H = TOP + lives.length * ROW + 8;
  const PLOT_Y = 58;
  const PLOT_H = 100;
  const STRIP_Y = 40;
  const x = (t) => X0 + (t / SPAN) * (X1 - X0);
  const ix = (t) => IX0 + (t / INSET) * (IX1 - IX0);
  const y = (row, open) => TOP + row * ROW + PLOT_Y + (1 - open) * PLOT_H;

  const svg = [];
  const hover = [];
  const table = [];
  lives.forEach((L, row) => {
    const p = PERSONAS[L.persona];
    const top = TOP + row * ROW + HEAD;
    const rel = (t) => t - L.birth;
    // 行标题
    svg.push(
      `<text x="${X0}" y="${top + 16}"><tspan class="t-title">第 ${L.life} 世 · ${esc(L.persona)} ${esc(p.zh)}</tspan><tspan class="t-sub" dx="14">呼吸 ${fmtRange(p.breathPeriod, ' s')} · 幅度 ${fmtRange(p.breathAmp.map((v) => v * 100), '%')} · 响应延迟 ${fmtRange(p.latency, ' s')} · 惊吓阈值 ${fmtRange(p.startle, '')} · 死法：${esc(p.death.zh)}（${p.death.dur} s）</tspan></text>`,
    );
    // 阶段：死亡 + 空白铺底，分界发丝线 + 段名
    const y0 = top + PLOT_Y;
    svg.push(`<rect class="dead" x="${f1(x(rel(L.deathStart)))}" y="${y0}" width="${f1(x(rel(L.end)) - x(rel(L.deathStart)))}" height="${PLOT_H}"/>`);
    const bounds = [
      ['BIRTH', L.birth],
      ['GROW', L.grow],
      ['AGE', L.age],
      ['DEATH', L.deathStart],
      ['BLANK', L.death],
    ];
    bounds.forEach(([ph, t], i) => {
      const xa = x(rel(t));
      const xb = x(rel(i + 1 < bounds.length ? bounds[i + 1][1] : L.end));
      if (i > 0) svg.push(`<line class="phase" x1="${f1(xa)}" x2="${f1(xa)}" y1="${y0 - 4}" y2="${y0 + PLOT_H}"/>`);
      if (xb - xa > 26) svg.push(`<text class="t-phase" x="${f1((xa + xb) / 2)}" y="${y0 + PLOT_H + 14}" text-anchor="middle">${PHASE_ZH[ph]}</text>`);
    });
    // 轴：张开度 0 / 1，时间刻度每分钟
    svg.push(
      `<line class="axis" x1="${X0}" x2="${X1}" y1="${y0 + PLOT_H}" y2="${y0 + PLOT_H}"/>`,
      `<line class="grid" x1="${X0}" x2="${X1}" y1="${y0}" y2="${y0}"/>`,
      `<text class="t-tick" x="${X0 - 8}" y="${y0 + 4}" text-anchor="end">全开</text>`,
      `<text class="t-tick" x="${X0 - 8}" y="${y0 + PLOT_H + 4}" text-anchor="end">折叠</text>`,
    );
    for (let m = 0; m <= SPAN / 60; m++) {
      svg.push(`<text class="t-tick num" x="${f1(x(m * 60))}" y="${y0 + PLOT_H + 30}" text-anchor="middle">${m}′</text>`);
    }
    // 呼吸：逐像素列 min/max 抽稀（与全量折线在这个分辨率下逐像素一样）
    const frames = run.frames.filter((fr) => fr.life === L.life);
    svg.push(`<path class="breath" d="${decimate(frames, (fr) => x(fr.t - L.birth), (fr) => y(row, 1 - fr.targets.breath.s))}"/>`);
    // 放大窗：成长段 20 秒，真实波形
    const w0 = L.grow + 50;
    const win = frames.filter((fr) => fr.t >= w0 && fr.t <= w0 + INSET);
    svg.push(
      `<line class="axis" x1="${IX0}" x2="${IX1}" y1="${y0 + PLOT_H}" y2="${y0 + PLOT_H}"/>`,
      `<line class="grid" x1="${IX0}" x2="${IX1}" y1="${y0}" y2="${y0}"/>`,
      `<path class="breath zoom" d="${win.map((fr, i) => `${i ? 'L' : 'M'}${f1(ix(fr.t - w0))},${f1(y(row, 1 - fr.targets.breath.s))}`).join('')}"/>`,
      `<text class="t-tick" x="${IX0}" y="${y0 + PLOT_H + 14}">成长段 20 秒放大</text>`,
      `<text class="t-tick num" x="${IX1}" y="${y0 + PLOT_H + 14}" text-anchor="end">${mmss(w0 - L.birth)}–${mmss(w0 + INSET - L.birth)}</text>`,
    );
    // 刺激：圆 = 回应，三角 = 惊吓，空心 = 不回应（形状兜住色盲）
    const sensor = run.log.filter((r) => r.src === 'sensor' && r.life === L.life && (r.I ?? 0) > 0);
    const marks = [];
    for (const r of sensor) {
      const cx = x(rel(r.t));
      const cy = top + STRIP_Y;
      const resp = run.log.find((q) => (q.ev === 'RESPONSE' || q.ev === 'RESPONSE_DROP') && q.p?.to === r.id);
      const detail =
        r.out === 'respond' && resp?.ev === 'RESPONSE'
          ? `延迟 ${resp.p.latency.toFixed(2)} s · 强度 ${resp.p.gain >= 0 ? '+' : ''}${Math.round(resp.p.gain * 100)}%${resp.p.grasp ? ' · 开始缠绕' : ''}`
          : r.out === 'startle'
            ? `强度 ${r.I} > 阈值`
            : r.out === 'muted'
              ? `${PHASE_ZH[r.phase]}段不回应`
              : '';
      marks.push({ t: rel(r.t), cx, label: eventZh(r), out: r.out, detail });
      const cls = r.out === 'startle' ? 'm-startle' : r.out === 'respond' ? 'm-respond' : 'm-muted';
      const shape =
        r.out === 'startle'
          ? `<path class="${cls}" d="M${f1(cx)},${f1(cy - 6)}L${f1(cx + 5.6)},${f1(cy + 4)}L${f1(cx - 5.6)},${f1(cy + 4)}Z"/>`
          : `<circle class="${cls}" cx="${f1(cx)}" cy="${cy}" r="4.5"/>`;
      svg.push(shape);
    }
    svg.push(`<line class="grid" x1="${X0}" x2="${X1}" y1="${top + STRIP_Y + 10}" y2="${top + STRIP_Y + 10}"/>`);
    // 悬停数据：每秒一格（张开度这一秒的范围、唤醒度、阶段）
    const secs = [];
    for (let s = 0; s <= Math.ceil(L.end - L.birth); s++) {
      const fs = frames.filter((fr) => fr.t - L.birth >= s && fr.t - L.birth < s + 1);
      if (!fs.length) continue;
      const open = fs.map((fr) => 1 - fr.targets.breath.s);
      secs.push([s, +Math.min(...open).toFixed(2), +Math.max(...open).toFixed(2), +fs[0].arousal.toFixed(2), fs[0].phase]);
    }
    hover.push({ life: L.life, persona: `${L.persona} ${p.zh}`, birth: L.birth, top, secs, marks });
  });

  for (const r of run.log) {
    if (r.ev === 'SPONTANEOUS' || r.ev === 'ORIENT' || r.ev === 'REFLEX') continue;
    const name = r.src === 'sensor' ? eventZh(r) : r.ev;
    table.push(
      `<tr><td class="num">${mmss(r.t)}</td><td>${r.life}</td><td>${esc(r.persona)}</td><td>${PHASE_ZH[r.phase]}</td><td>${esc(name)}</td><td class="num">${r.I ?? ''}</td><td>${r.out ? OUT_ZH[r.out] : ''}</td><td class="mono">${esc(r.p ? JSON.stringify(r.p) : '')}</td></tr>`,
    );
  }

  const minutes = (run.engine.time / 60).toFixed(1);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>行为引擎示例会话</title>
<style>

:root{color-scheme:light;--page:#f9f9f7;--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--dead:#f0efec;--series-1:#2a78d6;--series-2:#eb6834;--series-3:#1baf7a;--border:rgba(11,11,11,.10)}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--page:#0d0d0d;--surface-1:#1a1a19;--text-primary:#fff;--text-secondary:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--dead:#262624;--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--border:rgba(255,255,255,.10)}}
:root[data-theme="dark"]{color-scheme:dark;--page:#0d0d0d;--surface-1:#1a1a19;--text-primary:#fff;--text-secondary:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--dead:#262624;--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--border:rgba(255,255,255,.10)}
html,body{margin:0;background:var(--page)}
.viz-root{background:var(--page);color:var(--text-primary);font:14px/1.5 system-ui,-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;padding:24px 16px 48px;min-height:100vh;box-sizing:border-box}
.wrap{max-width:1120px;margin:0 auto}
h1{font-size:20px;font-weight:600;margin:0 0 4px}
.sub{color:var(--text-secondary);margin:0 0 12px}
.legend{display:flex;flex-wrap:wrap;gap:6px 20px;list-style:none;padding:0;margin:0 0 12px;color:var(--text-secondary);font-size:13px}
.legend svg{vertical-align:-3px;margin-right:6px}
figure{margin:0;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:8px 0;position:relative}
svg.chart{display:block;width:100%;height:auto}
.t-title{font-size:14px;font-weight:600;fill:var(--text-primary)}
.t-sub{font-size:12px;fill:var(--text-secondary)}
.t-phase,.t-tick{font-size:11px;fill:var(--muted)}
.num{font-variant-numeric:tabular-nums}
.grid{stroke:var(--grid);stroke-width:1}
.axis{stroke:var(--axis);stroke-width:1}
.phase{stroke:var(--axis);stroke-width:1}
.dead{fill:var(--dead)}
.breath{fill:none;stroke:var(--series-1);stroke-width:1;stroke-linejoin:round}
.breath.zoom{stroke-width:2;stroke-linecap:round}
.m-respond{fill:var(--series-3);stroke:var(--surface-1);stroke-width:2}
.m-startle{fill:var(--series-2);stroke:var(--surface-1);stroke-width:2;stroke-linejoin:round}
.m-muted{fill:var(--surface-1);stroke:var(--muted);stroke-width:1.5}
.cross{stroke:var(--text-secondary);stroke-width:1;pointer-events:none}
.tip{position:absolute;pointer-events:none;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--text-secondary);box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap}
.tip b{color:var(--text-primary);font-weight:600}
details{margin-top:16px}
summary{cursor:pointer;color:var(--text-secondary)}
table{border-collapse:collapse;margin-top:8px;font-size:12px;width:100%}
th,td{text-align:left;padding:3px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
th{color:var(--text-secondary);font-weight:600}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);word-break:break-all}
.note{color:var(--muted);font-size:12px;margin-top:16px}
</style></head>
<body><main class="viz-root"><div class="wrap">
<h1>行为引擎 M1 · 一场示例会话</h1>
<p class="sub">种子 ${SEED} · 人格顺序 ${ORDER.join(' → ')} · 全场 ${minutes} 分钟。每一行是一世，横轴是这一世诞生后的时间（四行同一把尺）。被试的动作是固定脚本：走近、抚摸、轻拍、碰触须、碰臂、拍手、戳、敲、拿起，死亡与空白里各再摸一次。</p>
<ul class="legend">
<li><svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="var(--series-1)" stroke-width="2" stroke-linecap="round"/></svg>机身张开度（上 = 全开，下 = 折叠）</li>
<li><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--series-3)"/></svg>刺激 → 回应</li>
<li><svg width="14" height="12"><path d="M7,1L12.6,11L1.4,11Z" fill="var(--series-2)"/></svg>刺激 → 惊吓</li>
<li><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--muted)" stroke-width="1.5"/></svg>刺激 → 不回应（诞生头 20 秒、死亡、空白）</li>
<li><svg width="18" height="12"><rect x="0" y="1" width="18" height="10" fill="var(--dead)"/></svg>死亡 + 空白</li>
</ul>
<figure><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="四世时间线：每一世的呼吸张开度与被试刺激的去向">${svg.join('')}<line class="cross" id="cross" x1="0" x2="0" y1="0" y2="0" visibility="hidden"/></svg><div class="tip" id="tip" hidden></div></figure>
<details><summary>表格视图：全部刺激与引擎事件（自发动作、转向、反射略）</summary>
<table><thead><tr><th>时刻</th><th>世</th><th>人格</th><th>阶段</th><th>事件</th><th>强度</th><th>去向</th><th>载荷</th></tr></thead><tbody>${table.join('')}</tbody></table></details>
<p class="note">衰老段用的是占位斜坡（衰老曲线待讨论），「交互加速死亡」搁置未做；四世的死亡时点只由种子决定，与被试做了什么无关。日志全文见同目录 session.jsonl。</p>
</div></main>
<script>
const ROWS=${JSON.stringify(hover)};
const G={X0:${X0},X1:${X1},SPAN:${SPAN},ROW:${ROW},TOP:${TOP},PLOT_Y:${PLOT_Y},PLOT_H:${PLOT_H},STRIP_Y:${STRIP_Y}};
const PH=${JSON.stringify(PHASE_ZH)};const OUTZ=${JSON.stringify(OUT_ZH)};
const svg=document.querySelector('svg.chart'),cross=document.getElementById('cross'),tip=document.getElementById('tip'),fig=svg.parentElement;
const mmss=s=>Math.floor(s/60)+'′'+String(Math.floor(s%60)).padStart(2,'0')+'″';
function hide(){cross.setAttribute('visibility','hidden');tip.hidden=true}
function line(b,t){const d=document.createElement('div');if(b){const s=document.createElement('b');s.textContent=b;d.appendChild(s);d.appendChild(document.createTextNode(' '))}d.appendChild(document.createTextNode(t));return d}
svg.addEventListener('pointermove',e=>{
  const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  const row=Math.floor((p.y-G.TOP)/G.ROW),R=ROWS[row];
  if(!R||p.x<G.X0||p.x>G.X1){hide();return}
  const t=(p.x-G.X0)/(G.X1-G.X0)*G.SPAN;const sec=R.secs.find(s=>s[0]===Math.floor(t));
  if(!sec){hide();return}
  const near=R.marks.reduce((a,m)=>Math.abs(m.t-t)<(a?Math.abs(a.t-t):3)?m:a,null);
  const top=G.TOP+row*G.ROW;cross.setAttribute('x1',p.x);cross.setAttribute('x2',p.x);cross.setAttribute('y1',top+G.STRIP_Y-10);cross.setAttribute('y2',top+G.PLOT_Y+G.PLOT_H);cross.setAttribute('visibility','visible');
  tip.replaceChildren(line(sec[1].toFixed(2)+'–'+sec[2].toFixed(2),'张开度（这一秒）'),line(sec[3].toFixed(2),'唤醒度'),line('第 '+R.life+' 世','· '+R.persona+' · '+PH[sec[4]]+'段 · '+mmss(t)+'（全场 '+mmss(R.birth+t)+'）'));
  if(near)tip.appendChild(line(near.label+' → '+OUTZ[near.out],near.detail+' · '+mmss(near.t)));
  tip.hidden=false;const box=fig.getBoundingClientRect();let lx=e.clientX-box.left+14;if(lx+tip.offsetWidth>box.width)lx=e.clientX-box.left-tip.offsetWidth-14;tip.style.left=lx+'px';tip.style.top=(e.clientY-box.top+14)+'px';
});
svg.addEventListener('pointerleave',hide);
</script></body></html>
`;
}

function fmtRange([lo, hi], unit) {
  const r = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
  return lo === hi ? `${r(lo)}${unit}` : `${r(lo)}–${r(hi)}${unit}`;
}

/** 逐像素列 min/max 抽稀：保留每列的首、最低、最高、末点，按时间顺序连 */
function decimate(frames, fx, fy) {
  const out = [];
  let col = null;
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    const lo = bucket.reduce((a, b) => (b[1] > a[1] ? b : a));
    const hi = bucket.reduce((a, b) => (b[1] < a[1] ? b : a));
    const pts = [bucket[0], lo, hi, bucket[bucket.length - 1]].sort((a, b) => a[2] - b[2]);
    for (const q of pts) out.push(q);
    bucket = [];
  };
  frames.forEach((fr, i) => {
    const px = fx(fr);
    const c = Math.round(px);
    if (c !== col) {
      flush();
      col = c;
    }
    bucket.push([px, fy(fr), i]);
  });
  flush();
  return out.map((q, i) => `${i ? 'L' : 'M'}${f1(q[0])},${f1(q[1])}`).join('');
}

// 主体放在最后：上面的小工具（esc / PHASE_ZH …）都是 const，要先初始化
async function main() {
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { runSession } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
    const { toJsonl } = await server.ssrLoadModule('/src/lib/linkage/behavior/log.ts');
    const { PERSONAS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');

    // ── 空跑：各世的阶段时刻 ─────────────────────────────────────────────
    const dry = runSession({ seed: SEED, order: ORDER });
    const lives = lifeTimes(dry.log);

    // ── 被试脚本：每一世同一套，按诞生时刻对齐 ─────────────────────────
    const inputs = lives.flatMap(participant);
    const run = runSession({ seed: SEED, order: ORDER, inputs, frameEvery: 0.1 });

    writeFileSync(join(OUT, 'session.jsonl'), toJsonl(run.log, run.header));
    writeFileSync(join(OUT, 'session.html'), page(run, lives, PERSONAS));

    const count = (ev) => run.log.filter((r) => r.ev === ev).length;
    const sensor = run.log.filter((r) => r.src === 'sensor');
    const outs = Object.fromEntries(['respond', 'startle', 'busy', 'muted', 'none'].map((o) => [o, sensor.filter((r) => r.out === o).length]));
    console.log(`种子 ${SEED} · 顺序 ${ORDER.join('→')} · 全场 ${(run.engine.time / 60).toFixed(1)} 分钟 · 日志 ${run.log.length} 条`);
    console.log(`刺激 ${sensor.length} 条：`, outs);
    console.log(`回应 ${count('RESPONSE')} · 惊吓 ${count('STARTLE')} · 反射 ${count('REFLEX')} · 自发 ${count('SPONTANEOUS')} · 转向 ${count('ORIENT')} · 抓握开始 ${count('GRASP_START')}`);
    console.log(`写出 ${join(OUT, 'session.jsonl')} · ${join(OUT, 'session.html')}`);
  } finally {
    await server.close();
  }
}

await main();
