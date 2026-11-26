// 坐着的访客看猫 / 不看猫的时长标定（2026-11-27，作者「人不应该 99% 的时间都看着猫」→「先改访客这条」）。
// 标准场景（cohabit-solid 的 standardSceneSim：6 人 4 猫 · 会动的单元 · 引导开 · PACE_DEMO），扫 VisitorPace.attend 的 away，
// 读「猫有人理」的时间占比 = 有人看着它（attendingOf）或有人在 0.5 m 内。
// 目标 ≈ 52%：Hirsch 等 2025（瑞典一家猫咖，27 只猫，逐只跟拍）——44.4% 的时间没有任何人与猫互动，
// 只看或逗 29.0% + 摸 23.2% = 52.2%（另 3.4% 是人在旁边但没理它）。
// look（看一段多久）与 away（不看一段多久）各自多长没有实测：look 固定取 30–90 s，只扫 away 的平均值（取值区间 = 平均值的 0.5–1.5 倍）。
// 用法：node scripts/cohabit/calibrate-attend.mjs [seeds=8] [seconds=1800] [away 平均值列表=0,60,90,105,120,150]   （0 = 一直看，旧口径）
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [seedsArg, secArg, awayArg] = process.argv.slice(2);
const seeds = Number(seedsArg ?? 8);
const seconds = Number(secArg ?? 1800);
const AWAY = (awayArg ?? '0,60,90,105,120,150').split(',').map(Number);
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const solid = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const dt = 1 / 30;
  console.log(`标准场景 · ${seeds} 种子 × ${seconds} s · 目标：猫有人理 ≈ 52%（Hirsch 等 2025）`);
  console.log('| 不看一段（平均 s） | 猫有人理 | 其中被看着 | 有人在 0.5 m 内 | 坐着的人在看猫 | 共温 s | 共触 s |');
  console.log('|---|---|---|---|---|---|---|');
  for (const away of AWAY) {
    const { attend: _drop, ...base } = m.PACE_DEMO;
    const pace = away > 0 ? { ...base, attend: { look: { min: 30, max: 90 }, away: { min: away * 0.5, max: away * 1.5 } } } : base;
    let catS = 0, any = 0, att = 0, touch = 0, seatS = 0, seatLook = 0, warm = 0, tch = 0;
    for (let s = 1; s <= seeds; s++) {
      const sim = solid.standardSceneSim('live', 100 + s, pace);
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        sim.step(dt);
        for (const c of sim.cats) {
          const a = !!sim.attendingOf(c);
          const near = sim.nearestVisitor(c.walker.x, c.walker.y).d < m.COHABIT.BAND.near;
          catS += dt; if (a) att += dt; if (near) touch += dt; if (a || near) any += dt;
        }
        for (const p of sim.people) if (p.walker.present && p.seated) { seatS += dt; if (p.watching !== null) seatLook += dt; }
      }
      const sum = sim.summary(); warm += sum.ledger.seconds.warmth; tch += sum.ledger.seconds.touch;
    }
    const pc = (x, d) => `${((100 * x) / d).toFixed(1)}%`;
    console.log(`| ${away || '一直看'} | ${pc(any, catS)} | ${pc(att, catS)} | ${pc(touch, catS)} | ${pc(seatLook, seatS)} | ${(warm / seeds).toFixed(0)} | ${(tch / seeds).toFixed(0)} |`);
  }
} finally {
  await server.close();
}
