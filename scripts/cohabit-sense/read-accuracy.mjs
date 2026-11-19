// 项目二 · 感知层读得准不准（2026-11-19，作者「两个方案都做：摄像头那个，拿深度相机的话甚至可以直接读到人在做什么；
// 距离那个也就这么做」）。Lab 2-17 的同一个 SenseObserver，离线跑，不画：
//   方案 A（普通摄像头 / 深度相机 × 四种布置）：关键点有多少解得出立体位置、解出来差多少；读「在做什么」读对多少
//     （人：站 / 走 / 坐 + 看着哪只猫；猫：站 / 走 / 坐 / 趴 + 在地上、家具上还是台上）；
//   方案 B（四个固定点量距离）：解出的位置、高度差多少（按几段隔着身体分开数）；四段对不上能不能看出来；
//     只看高度分坐站对多少（与座位压力对照）。
// 场景 = Lab 2-17 那一场：标准房间（方台铺满、20 座）、6 人 4 猫、访客节奏取研究那一套（PACE_STUDY，画面里才有人走动）。
// 一场仿真同时喂所有读法（读法只读仿真、不改它），每 0.5 s 记一次，前 20 s 不记。
//
// 用法：node scripts/cohabit-sense/read-accuracy.mjs <out.json> [seconds=600] [seeds=4]
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [OUT = resolve(root, '项目二_感知层/read-accuracy.json'), SECS = '600', SEEDS = '4'] = process.argv.slice(2);
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const O = await server.ssrLoadModule('/src/lib/space/sense-observer.ts');
  const LAYOUTS = ['adjacent2', 'diagonal2', 'corners4', 'all8'];
  const configs = [...['rgb', 'depth'].flatMap((kind) => LAYOUTS.map((layout) => ({ key: `${kind}.${layout}`, kind, layout }))), { key: 'tag', kind: 'rgb', layout: 'corners4' }];
  const med = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const pct = (a, q) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  };
  const acc = Object.fromEntries(configs.map((c) => [c.key, {
    kp: { standLoc: 0, standN: 0, seatLoc: 0, seatN: 0, catLoc: 0, catN: 0, err: [] },
    person: { n: 0, known: 0, posture: 0, watchN: 0, watch: 0, ok: 0 },
    cat: { n: 0, known: 0, posture: 0, place: 0, ok: 0 },
    tag: { hz: { 0: [], 1: [], 2: [] }, vz: { 0: [], 1: [], 2: [] }, flag: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, sitH: [0, 0], posture: [0, 0], catPlace: [0, 0] },
  }]));
  const DT = 1 / 20;
  for (let seed = 101; seed < 101 + Number(SEEDS); seed++) {
    const sim = new m.CohabitSim({ trigger: 'posture', grid: m.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: m.PACE_STUDY });
    m.populateCohabit(sim, 6, 0);
    m.scatterCats(sim, 4, seed);
    const obs = configs.map((c, i) => new O.SenseObserver(sim.layout.roomM, c.layout, seed * 100 + i, c.kind));
    let next = 20;
    for (let t = 0; t < Number(SECS); t += DT) {
      sim.step(DT);
      for (const o of obs) o.update(sim, DT);
      if (t < next) continue;
      next += 0.5;
      configs.forEach((c, i) => {
        const A = acc[c.key];
        for (const b of obs[i].bodies) {
          if (c.key === 'tag') {
            const nl = Math.min(2, b.los.filter((x) => !x).length);
            A.tag.hz[nl].push(Math.hypot(b.tagEst.x - b.tag.x, b.tagEst.y - b.tag.y));
            A.tag.vz[nl].push(Math.abs(b.tagEst.z - b.tag.z));
            A.tag.flag[nl][0]++;
            if (!b.consistent) A.tag.flag[nl][1]++;
            if (b.kind === 'person') {
              A.tag.sitH[0]++;
              if (b.tagHeightSit === (b.real.posture === 'sit')) A.tag.sitH[1]++;
              A.tag.posture[0]++;
              if (b.tagOk) A.tag.posture[1]++;
            } else {
              A.tag.catPlace[0]++;
              if (b.tagOk) A.tag.catPlace[1]++;
            }
            continue;
          }
          const located = b.fix.filter((f) => f === 'tri' || f === 'depth').length;
          b.fix.forEach((f, k) => {
            if (f === 'tri' || f === 'depth') A.kp.err.push(Math.hypot(b.est[k].x - b.truth[k].x, b.est[k].y - b.truth[k].y, b.est[k].z - b.truth[k].z));
          });
          if (b.kind === 'person') {
            if (b.seated) {
              A.kp.seatLoc += located;
              A.kp.seatN += b.fix.length;
            } else {
              A.kp.standLoc += located;
              A.kp.standN += b.fix.length;
            }
            const P = A.person;
            P.n++;
            if (b.read.posture === 'unknown') continue;
            P.known++;
            if (b.read.posture === b.real.posture) P.posture++;
            if (b.real.posture !== 'walk') {
              P.watchN++;
              if (b.read.watching === b.real.watching) P.watch++;
            }
            if (b.readOk) P.ok++;
          } else {
            A.kp.catLoc += located;
            A.kp.catN += b.fix.length;
            const K = A.cat;
            K.n++;
            if (b.readOk === null) continue;
            K.known++;
            if (b.read.posture === b.real.posture || (b.real.posture === 'walk' && b.read.posture === 'stand')) K.posture++;
            if (b.read.place === b.real.place) K.place++;
            if (b.readOk) K.ok++;
          }
        }
      });
    }
    console.error(`seed ${seed} done`);
  }
  const r2 = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
  const share = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const out = {};
  for (const c of configs) {
    const A = acc[c.key];
    if (c.key === 'tag') {
      out.tag = {
        horizontal: Object.fromEntries([0, 1, 2].map((k) => [k, { n: A.tag.hz[k].length, median: r2(med(A.tag.hz[k])), p90: r2(pct(A.tag.hz[k], 0.9)) }])),
        height: Object.fromEntries([0, 1, 2].map((k) => [k, { median: r2(med(A.tag.vz[k])), p90: r2(pct(A.tag.vz[k], 0.9)) }])),
        flagged: Object.fromEntries([0, 1, 2].map((k) => [k, share(A.tag.flag[k][1], A.tag.flag[k][0])])),
        sitByHeightRight: share(A.tag.sitH[1], A.tag.sitH[0]),
        postureRight: share(A.tag.posture[1], A.tag.posture[0]),
        catPlaceRight: share(A.tag.catPlace[1], A.tag.catPlace[0]),
      };
      continue;
    }
    out[c.key] = {
      located: { standing: share(A.kp.standLoc, A.kp.standN), seated: share(A.kp.seatLoc, A.kp.seatN), cats: share(A.kp.catLoc, A.kp.catN) },
      errMedian: r2(med(A.kp.err)),
      errP90: r2(pct(A.kp.err, 0.9)),
      person: { unclear: share(A.person.n - A.person.known, A.person.n), posture: share(A.person.posture, A.person.known), watching: share(A.person.watch, A.person.watchN), both: share(A.person.ok, A.person.known) },
      cat: { unclear: share(A.cat.n - A.cat.known, A.cat.n), posture: share(A.cat.posture, A.cat.known), place: share(A.cat.place, A.cat.known), both: share(A.cat.ok, A.cat.known) },
    };
  }
  writeFileSync(OUT, JSON.stringify({ seconds: Number(SECS), seeds: Number(SEEDS), sampleEvery: 0.5, results: out }, null, 2));
  console.log(JSON.stringify(out, null, 1));
} finally {
  await server.close();
}
