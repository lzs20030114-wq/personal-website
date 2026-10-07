// 探针（作者 2026-10-07「松键之后多余的布可以往上去啊，就像它还没成型之前那样」）：
// 一条成形的带按引擎回程（retractStep，a 路径：r 回 R0、键倒序松开、布回到顶上）走，
// 挑出随回程步数怎么退——退到走廊所需的 0.279 m 要几步、中途有没有鼓过成形值。
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { buildRingUnits } = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
  const { createSkinUnit, SKIN } = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  const { px2m, planLayout, PLAN } = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
  const l = planLayout(4);
  const corridorReach = l.pitchM / 2 - PLAN.BODY_R - l.mastR; // 带挑出要退到这么小
  const reachOf = (u) => { let m = 0; for (let k = 0; k < u.n; k++) m = Math.max(m, u.px[k] * 100); return m; };
  console.log(`4×4 真实尺度：走廊 0.44 m ⇒ 面上带挑出须 ≤ ${corridorReach.toFixed(3)} m = ${(corridorReach / px2m(1)).toFixed(1)} px（芯半径 ${l.mastR.toFixed(3)} m）`);
  console.log(`回程 = retractStep：r 走 900 步回 R0，之后到 ${SKIN.STEPS} 步静置；台架 80 步/s ⇒ 900 步 ≈ ${(900 / 80).toFixed(1)} s`);
  for (const d of buildRingUnits()) {
    const u = createSkinUnit(d.spec, d.opts);
    for (let s = 0; s < SKIN.STEPS; s++) u.advance();
    const formed = reachOf(u);
    const locked0 = u.locked.length;
    let clearAt = -1, peak = 0, peakAt = 0, lockedAtClear = -1;
    const curve = [];
    for (let k = 0; k < SKIN.STEPS; k++) {
      u.retractStep();
      const r = reachOf(u);
      if (r > peak) { peak = r; peakAt = k + 1; }
      if (clearAt < 0 && px2m(r) <= corridorReach) { clearAt = k + 1; lockedAtClear = u.locked.length; }
      if ((k + 1) % 150 === 0) curve.push(`${k + 1}:${r.toFixed(0)}`);
    }
    const end = reachOf(u);
    console.log(
      `${d.zh.padEnd(6)} 成形挑出 ${formed.toFixed(1)}px = ${px2m(formed).toFixed(3)} m · 键 ${locked0} → 回程 ` +
      `${clearAt > 0 ? `第 ${clearAt} 步让出走廊（≈${(clearAt / 80).toFixed(1)} s，此时还挂 ${lockedAtClear} 键）` : '走完也没让出'} ` +
      `· 峰值 ${peak.toFixed(1)}px@${peakAt}${peak > formed + 1 ? ' ⚠ 回程中鼓过成形值' : ''} · 终 ${end.toFixed(1)}px（键 ${u.locked.length}）`
    );
    console.log(`       挑出曲线(步:px) ${curve.join(' ')}`);
  }
} finally { await server.close(); }
