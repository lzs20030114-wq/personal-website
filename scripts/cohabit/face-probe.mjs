// 探针（作者 2026-10-07 提问「人穿过两单元之间，只收相对的两个面够不够」）：
// 同一个芯收缩（ℓ 不变）下，一条带把键全松开会鼓成多大？与成形的挑出比；再按 4×4 真实尺度算走廊要几条带让路。
// 注意：这里的「全松键」是**顶端不放、ℓ 不变**的读法，量出来是鼓包——作者当日纠正「松键之后多余的布可以往上去」，
// 那是引擎一条带一条带的回程（retractStep），正确的账见 retract-probe.mjs；本脚本只留几何账（走廊要几条带让路）作记录。
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { buildRingUnits } = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
  const { createSkinUnit, SKIN } = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  const { px2m, planLayout, PLAN } = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
  const reach = (spec, opts) => {
    const u = createSkinUnit(spec, opts);
    for (let s = 0; s < SKIN.STEPS; s++) u.advance();
    let m = 0;
    for (let k = 0; k < u.n; k++) m = Math.max(m, u.px[k] * 100);
    return m;
  };
  const strip = (spec) => spec.map((seg) => (seg[0] === 'f' ? ['f', seg[1], []] : seg));
  const l = planLayout(4);
  const corridorReach = l.pitchM / 2 - PLAN.BODY_R; // 面上「芯外缘」（芯半径 + 带挑出）要退到这么近才让得出 0.44 m 的走廊
  console.log(`4×4 真实尺度：格距 ${l.pitchM.toFixed(3)} m · 平台半径 ${l.platR.toFixed(3)} m · 两平台之间 ${(l.pitchM - 2 * l.platR).toFixed(3)} m · 走廊 0.44 m ⇒ 面上芯外缘须 ≤ ${corridorReach.toFixed(3)} m（芯半径 ${l.mastR.toFixed(3)} ⇒ 带挑出 ≤ ${(corridorReach - l.mastR).toFixed(3)} m）`);
  const theta = Math.acos(corridorReach / l.platR) * 180 / Math.PI;
  console.log(`要退的扇区半角 ${theta.toFixed(0)}° ⇒ 每侧约 ${Math.ceil(2 * theta / 18)} 条带（20 条 / 圈）`);
  for (const d of buildRingUnits()) {
    const full = reach(d.spec, d.opts);
    // 全松键：站方的 rootHug=1.0 会把没键的材料整条钉回轴上（那是「根部贴轴」的修正，不是松键的物理），
    // 故鼓包按 rootHug 关、芯墙开（v7 + 芯不可穿透）量
    const slack = reach(strip(d.spec), { ...d.opts, rootHug: 0 });
    const faceOK = (r) => l.mastR + px2m(r) <= corridorReach;
    console.log(`${d.zh.padEnd(6)} 成形挑出 ${full.toFixed(1)}px = ${px2m(full).toFixed(3)} m（芯外缘 ${(l.mastR + px2m(full)).toFixed(3)} m）${faceOK(full) ? '✓ 本身就让得出' : '✗ 挡走廊'} · 全松键鼓包 ${slack.toFixed(1)}px = ${px2m(slack).toFixed(3)} m（芯外缘 ${(l.mastR + px2m(slack)).toFixed(3)} m）${faceOK(slack) ? '✓ 让得出走廊' : '✗ 还挡着'}`);
  }
} finally { await server.close(); }
