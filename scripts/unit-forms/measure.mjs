// 一台单元的形态研究：量平台剖面的深度表（台厚 16 / 36 / 56 px），结果抄进 src/lib/space/unit-forms.ts 的 UF_DEPTH。
//   node scripts/unit-forms/measure.mjs
// 每一档：338 节带、结构贴底（尾 5）、站上平台的整形选项；记终态挑出、台面与台底离钉住端、键锁、最大自交环。
import { createServer } from 'vite';
const s = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const U = await s.ssrLoadModule('/src/lib/space/skin-unit.ts');
const Q = await s.ssrLoadModule('/src/lib/space/skin-square.ts');
const C = await s.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
await s.close();
const { createSkinUnit, SKIN } = U;
const opts = C.UNIT_TIERS[0].opts;
function knot(u) { let w = 0; const n = u.n, X = (i) => u.px[i], Y = (i) => u.py[i];
  for (let i = 0; i < n - 1; i++) for (let j = i + 2; j < n - 1; j++) {
    const d1 = (X(i+1)-X(i))*(Y(j)-Y(i))-(Y(i+1)-Y(i))*(X(j)-X(i)), d2 = (X(i+1)-X(i))*(Y(j+1)-Y(i))-(Y(i+1)-Y(i))*(X(j+1)-X(i));
    const d3 = (X(j+1)-X(j))*(Y(i)-Y(j))-(Y(j+1)-Y(j))*(X(i)-X(j)), d4 = (X(j+1)-X(j))*(Y(i+1)-Y(j))-(Y(j+1)-Y(j))*(X(i+1)-X(j));
    if (d1*d2 < 0 && d3*d4 < 0) w = Math.max(w, j - i); } return w; }
const out = {};
for (const h of [16, 36, 56]) {
  const rows = [];
  for (let k = 10; k <= 80; k++) {
    let seg;
    try { seg = Q.squareSeg(k, h); } catch { continue; }
    const fs = seg[1], tail = 5, lead = 338 - fs - tail;
    if (lead < 8) continue;
    const u = createSkinUnit([['g', lead], seg, ['g', tail]], opts);
    for (let i = 0; i < SKIN.STEPS; i++) u.advance();
    const foot = u.py[u.n - 1] * 100;
    let reach = 0; for (let i = lead; i < lead + fs; i++) reach = Math.max(reach, u.px[i] * 100);
    const ys = []; for (let i = lead; i < lead + fs; i++) if (u.px[i] * 100 > 0.5 * reach) ys.push(Math.abs(u.py[i] * 100 - foot));
    const ok = u.locked.length === seg[2].length;
    const kn = knot(u);
    rows.push({ k, fs, reach: +reach.toFixed(1), top: +Math.max(...ys).toFixed(1), bot: +Math.min(...ys).toFixed(1), ok, knot: kn });
    console.error(`h${h} k${k} fs${fs} reach${reach.toFixed(1)} top${Math.max(...ys).toFixed(1)} bot${Math.min(...ys).toFixed(1)} lock${ok} knot${kn}`);
  }
  out[h] = rows;
}
console.log(JSON.stringify(out));
