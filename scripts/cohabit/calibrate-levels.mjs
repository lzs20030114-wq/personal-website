// 换层标定（Lab 2-14 · 2026-10-08）：钉死档（= 有固定层架的普通猫咖）· 6 位访客（社会层开）· 1 只猫 · 600 s 一场，
// 扫「上台几率 = logistic(upBias + upCrowd · 猫 1.5 m 内访客数)」的两个数，读猫在台上的时间占比。
// 目标 ≈ 49%：Hirsch 等 2025（瑞典一家猫咖，27 只猫，227 小时）的「高层 49.3%」，原文没写清分母（层架 / 家具 + 层架）。
// upCrowd 没有实测，每档 upCrowd 各自找让占比贴近 49% 的 upBias → COHABIT.CAT_LEVELS 的 flat / mid / steep。
// 用法：node scripts/cohabit/calibrate-levels.mjs [seeds=24] [upCrowd 列表=0,0.5,1] [upBias 列表=-0.5,0,0.5,1,1.5]
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [seedsArg, ucArg, ubArg] = process.argv.slice(2);
const seeds = Number(seedsArg ?? 24);
const UC = (ucArg ?? '0,0.5,1').split(',').map(Number);
const UB = (ubArg ?? '-0.5,0,0.5,1,1.5').split(',').map(Number);
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  console.log('| upCrowd | upBias | 台上时间占比 |');
  console.log('|---|---|---|');
  for (const upCrowd of UC)
    for (const upBias of UB) {
      let floor = 0;
      for (let s = 1; s <= seeds; s++)
        floor += m.runCohabit({ trigger: 'posture', space: 'fixed', seed: 200 + s, seconds: 600, people: 6, cats: 1, faces: true, social: true, catFloor: true, cat: { ...m.COHABIT.CAT_MT, upBias, upCrowd } }).catFloorShare;
      console.log(`| ${upCrowd} | ${upBias} | ${((1 - floor / seeds) * 100).toFixed(1)}% |`);
    }
} finally {
  await server.close();
}
