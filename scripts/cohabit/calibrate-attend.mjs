// 坐着的访客看不看猫的标定（2026-11-27，作者「人不应该 99% 的时间都看着猫」）。
// 读「猫有人理」的时间占比 = 有人看着它（attendingOf）或有人在 0.5 m 内。
// 目标 ≈ 52%：Hirsch 等 2025（瑞典一家猫咖，27 只猫，逐只跟拍）——44.4% 的时间没有任何人与猫互动，
// 只看或逗 29.0% + 摸 23.2% = 52.2%（另 3.4% 是人在旁边但没理它）。
// 那家店是固定层架的普通猫咖，对应钉死档（与 calibrate-levels.mjs 同一个口径），所以默认在钉死档里标定。
// 三种写法：
//   timer      只按时长交替：看 30–90 s，扫「不看一段」的平均值（取值区间 = 平均值的 0.5–1.5 倍）
//   arrive     同上，另加「有猫来到 1.5 m 内就转去看它」（PACE_DEMO 现行）
//   activities 试验：看猫 / 和同伴说话 / 看手机（PACE_ACTIVITIES_TRIAL），扫看猫的权重
// 用法：node scripts/cohabit/calibrate-attend.mjs [seeds=8] [seconds=1800] [space=fixed] [rule=arrive] [取值列表] [看一段的平均值=60]
//   取值 0 = 一直看（旧口径）。标准场景其余设置同 cohabit-solid 的 standardSceneSim（6 人 4 猫 · 引导开）。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [seedsArg, secArg, spaceArg, ruleArg, valArg, lookArg] = process.argv.slice(2);
const LOOK = Number(lookArg ?? 60); // 看一段的平均值（取值区间 = 它的 0.5–1.5 倍）；activities 一档不用
const seeds = Number(seedsArg ?? 8);
const seconds = Number(secArg ?? 1800);
const space = spaceArg ?? 'fixed';
const rule = ruleArg ?? 'arrive';
const VALS = (valArg ?? (rule === 'activities' ? '0.5,1,1.5,2' : '0,105,135,165')).split(',').map(Number);
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const solid = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const dt = 1 / 30;
  const { attend: _a, ...plain } = m.PACE_DEMO;
  const paceOf = (v) => {
    if (v <= 0) return plain;
    if (rule === 'activities') return { ...m.PACE_ACTIVITIES_TRIAL, activities: { ...m.PACE_ACTIVITIES_TRIAL.activities, cat: { ...m.PACE_ACTIVITIES_TRIAL.activities.cat, w: v } } };
    return { ...plain, attend: { look: { min: LOOK * 0.5, max: LOOK * 1.5 }, away: { min: v * 0.5, max: v * 1.5 }, ...(rule === 'arrive' ? { near: m.COHABIT.BAND.far } : {}) } };
  };
  console.log(`${space} · ${rule} · 看一段平均 ${LOOK} s · ${seeds} 种子 × ${seconds} s · 目标：猫有人理 ≈ 52%（Hirsch 等 2025）`);
  console.log(`| ${rule === 'activities' ? '看猫的权重' : '不看一段（平均 s）'} | 猫有人理 | 其中被看着 | 有人在 0.5 m 内 | 坐着的人在看猫 | 独自 / 结伴的人在看猫 | 共温 s | 共触 s |`);
  console.log('|---|---|---|---|---|---|---|---|');
  for (const v of VALS) {
    let catS = 0, any = 0, att = 0, touch = 0, seatS = 0, seatLook = 0, soloS = 0, soloLook = 0, pairS = 0, pairLook = 0, warm = 0, tch = 0;
    for (let s = 1; s <= seeds; s++) {
      const sim = solid.standardSceneSim(space, 100 + s, paceOf(v));
      const size = new Map();
      for (const p of sim.people) size.set(p.party, (size.get(p.party) ?? 0) + 1);
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        sim.step(dt);
        for (const c of sim.cats) {
          const a = !!sim.attendingOf(c);
          const near = sim.nearestVisitor(c.walker.x, c.walker.y).d < m.COHABIT.BAND.near;
          catS += dt; if (a) att += dt; if (near) touch += dt; if (a || near) any += dt;
        }
        for (const p of sim.people) if (p.walker.present && p.seated) {
          const look = p.watching !== null ? dt : 0;
          seatS += dt; seatLook += look;
          if (size.get(p.party) > 1) { pairS += dt; pairLook += look; } else { soloS += dt; soloLook += look; }
        }
      }
      const sum = sim.summary(); warm += sum.ledger.seconds.warmth; tch += sum.ledger.seconds.touch;
    }
    const pc = (x, d) => (d > 0 ? `${((100 * x) / d).toFixed(1)}%` : '—');
    console.log(`| ${v || '一直看'} | ${pc(any, catS)} | ${pc(att, catS)} | ${pc(touch, catS)} | ${pc(seatLook, seatS)} | ${pc(soloLook, soloS)} / ${pc(pairLook, pairS)} | ${(warm / seeds).toFixed(0)} | ${(tch / seeds).toFixed(0)} |`);
  }
} finally {
  await server.close();
}
