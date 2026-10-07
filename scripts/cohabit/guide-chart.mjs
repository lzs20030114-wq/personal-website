// 引导方式研究的图（guide-study.mjs 的 JSON → SVG）：每个方案一行，共温秒数 / 共触秒数两格，
// 三档空间各一条（会动 = 站内绿，基准 = 灰），条 = 种子均值、须 = ±1 SD、点 = 单个种子；
// 右侧标「会动 vs 钉死」「会动 vs 空房间」的置换检验星号与效应量 d（星号：*** p<.001 · ** <.01 · * <.05）。
// 用法：node scripts/cohabit/guide-chart.mjs out.svg a.json [b.json …]（多个 JSON 的方案按给定顺序拼起来）
import { readFileSync, writeFileSync } from 'node:fs';
import { stars } from './stats.mjs';

const [outPath, ...inPaths] = process.argv.slice(2);
if (!outPath || !inPaths.length) throw new Error('用法：node scripts/cohabit/guide-chart.mjs out.svg a.json [b.json …]');
const docs = inPaths.map((p) => JSON.parse(readFileSync(p, 'utf8')));
const configs = docs.flatMap((d) => d.configs);
const meta = docs[0];

function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const enc = (x) => { const v = Math.max(0, Math.min(1, x)); return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255); };
  return '#' + lin.map((x) => enc(x).toString(16).padStart(2, '0')).join('');
}
const C = { paper: oklch(0.965, 0.01, 115), ink: oklch(0.235, 0.025, 215), graphite: oklch(0.51, 0.014, 180), hairline: oklch(0.84, 0.01, 135), live: oklch(0.58, 0.105, 158), liveDot: oklch(0.42, 0.088, 178), base: oklch(0.72, 0.012, 150), baseDot: oklch(0.51, 0.014, 180) };
const SP = [['live', '会动的单元'], ['fixed', '单元钉死'], ['empty', '空房间']];
const MET = [['warmthS', '共温（秒）', '0.5–1.5 m 内人停着 ≥ 2 s'], ['touchS', '共触（秒）', '距离 < 0.5 m']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = `font-family="Archivo, 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif"`;
const LEFT = 32, TOP = 96, ROWH = 112, TITLEW = 210, PW = 300, STATW = 210, GAP = 24;
const W = LEFT * 2 + TITLEW + MET.length * (PW + STATW + GAP);
const H = TOP + configs.length * ROWH + 70;
// 每个读数一把共用的尺子（不同方案之间可比）
const xmax = Object.fromEntries(MET.map(([k]) => {
  const all = configs.flatMap((c) => SP.flatMap(([sp]) => [...c.metrics[k].v[sp], c.metrics[k].mean[sp] + c.metrics[k].sd[sp]]));
  const mx = Math.max(...all);
  const step = 10 ** Math.floor(Math.log10(mx / 4));
  return [k, Math.ceil(mx / (step * (mx / step > 40 ? 5 : 2))) * step * (mx / step > 40 ? 5 : 2)];
}));
const out = [];
out.push(`<text x="${LEFT}" y="38" font-size="18" font-weight="600" fill="${C.ink}">引导方式研究 · 人猫同台（Lab 2-14 · 座位三态）</text>`);
out.push(`<text x="${LEFT}" y="60" font-size="12" fill="${C.graphite}">${esc(`${meta.seconds} s 一场 · ${meta.seeds} 个种子 · ${meta.people} 名访客 ${meta.cats} 只猫 · 8×8 · 按带让路 · 条 = 均值，须 = ±1 SD，点 = 单个种子 · 星号 = 会动的单元对该基准的双侧置换检验`)}</text>`);
MET.forEach(([k, title, note], mi) => {
  const ox = LEFT + TITLEW + mi * (PW + STATW + GAP);
  out.push(`<text x="${ox}" y="${TOP - 18}" font-size="14" font-weight="600" fill="${C.ink}">${esc(title)}<tspan font-size="11" font-weight="400" fill="${C.graphite}">　${esc(note)}</tspan></text>`);
});
configs.forEach((c, ci) => {
  const oy = TOP + ci * ROWH;
  out.push(`<line x1="${LEFT}" y1="${oy - 6}" x2="${W - LEFT}" y2="${oy - 6}" stroke="${C.hairline}"/>`);
  const words = c.zh.split(' · ');
  words.forEach((w, i) => out.push(`<text x="${LEFT}" y="${oy + 16 + i * 16}" font-size="${i ? 11 : 12}" ${i ? '' : 'font-weight="600"'} fill="${i ? C.graphite : C.ink}">${esc(w)}</text>`));
  MET.forEach(([k], mi) => {
    const ox = LEFT + TITLEW + mi * (PW + STATW + GAP);
    const m = c.metrics[k];
    const x = (v) => ox + 70 + (Math.max(0, v) / xmax[k]) * (PW - 80);
    SP.forEach(([sp, label], si) => {
      const cy = oy + 14 + si * 28;
      const live = sp === 'live';
      out.push(`<text x="${ox + 62}" y="${cy + 4}" font-size="11" text-anchor="end" fill="${C.ink}" ${live ? 'font-weight="600"' : ''}>${label}</text>`);
      out.push(`<rect x="${x(0)}" y="${cy - 6}" width="${x(m.mean[sp]) - x(0)}" height="12" fill="${live ? C.live : C.base}"/>`);
      const lo = x(m.mean[sp] - m.sd[sp]), hi = x(m.mean[sp] + m.sd[sp]);
      out.push(`<line x1="${lo}" y1="${cy}" x2="${hi}" y2="${cy}" stroke="${C.ink}" stroke-width="1.1"/>`);
      m.v[sp].forEach((v, j) => out.push(`<circle cx="${x(v)}" cy="${cy + ((j % 5) - 2) * 2.2}" r="1.8" fill="${live ? C.liveDot : C.baseDot}"/>`));
      out.push(`<text x="${ox + PW + 4}" y="${cy + 4}" font-size="11" fill="${C.ink}" style="font-variant-numeric:tabular-nums">${m.mean[sp].toFixed(0)}</text>`);
    });
    const t = (r, name) => `${name} ${stars(r.p)} d ${r.d.toFixed(2)}`;
    out.push(`<text x="${ox + PW + 44}" y="${oy + 32}" font-size="11" fill="${C.ink}">${esc(t(m.vsFixed, '对钉死'))}</text>`);
    out.push(`<text x="${ox + PW + 44}" y="${oy + 52}" font-size="11" fill="${C.ink}">${esc(t(m.vsEmpty, '对空房间'))}</text>`);
  });
});
out.push(`<text x="${LEFT}" y="${H - 34}" font-size="11" fill="${C.graphite}">${esc('阈值与秒数常量：猫按 Mertens & Turner 1988 标定（单人单猫场景，标定不是验证），其余多为演示值；「开阔处代价」没有实测数，只做敏感性。这张图只说在这套规则下的差别。')}</text>`);
writeFileSync(outPath, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}><rect width="${W}" height="${H}" fill="${C.paper}"/>${out.join('\n')}</svg>\n`);
console.log(`图 → ${outPath}（${W}×${H}）`);
