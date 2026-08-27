// 一次性校核：Lab.11 五条带全程运动包络 vs 台架取景（pivot/camScale）
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { buildDualDisplay, DUAL_MID_OPTIONS } from '../../src/lib/space/skin-dual.ts';

const GAP_X = 150;
const PIVOT = { x: 315, y: 190 };
const SCALE = 0.88;
for (const mid of DUAL_MID_OPTIONS) {
  const defs = buildDualDisplay({ mid });
  const sims = defs.map((d) => createSkinUnit(d.spec, d.opts));
  let x0 = 1e9, x1 = -1e9, y0 = -6, y1 = -1e9; // y0 起点 = 天花板条
  for (let s = 0; s <= SKIN.STEPS; s++) {
    if (s % 25 === 0 || s === SKIN.STEPS) {
      sims.forEach((sim, u) => {
        for (let i = 0; i < sim.n; i++) {
          const wx = u * GAP_X + sim.px[i] * 100;
          const wy = -sim.py[i] * 100;
          x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
        }
      });
    }
    if (s < SKIN.STEPS) for (const sim of sims) sim.advance();
  }
  // 视空间（FlatRenderer 700×520，正视）：view = (w − pivot)·scale + (350, 260)
  const vx0 = (x0 - PIVOT.x) * SCALE + 350, vx1 = (x1 - PIVOT.x) * SCALE + 350;
  const vy0 = (y0 - PIVOT.y) * SCALE + 260, vy1 = (y1 - PIVOT.y) * SCALE + 260;
  console.log(`mid=${String(mid).padStart(2)} 世界 x [${x0.toFixed(1)}, ${x1.toFixed(1)}] y [${y0.toFixed(1)}, ${y1.toFixed(1)}] → 视 x [${vx0.toFixed(0)}, ${vx1.toFixed(0)}]/700 y [${vy0.toFixed(0)}, ${vy1.toFixed(0)}]/520  余量 左${vx0.toFixed(0)} 右${(700 - vx1).toFixed(0)} 上${vy0.toFixed(0)} 下${(520 - vy1).toFixed(0)}`);
}
