/**
 * Lab 2-15 立体演示的离线探针：用台架同一份配置跑一场，记下看得见的事第一次发生在第几秒，
 * 以及每一步有多少单元在过渡、多少种关键帧同时在用（台架按帧分组绘制，这决定一帧要画几次）。
 *   node scripts/cohabit/space-probe.mjs [seconds=300] [seed=11]
 */
import { createServer } from 'vite';

const seconds = Number(process.argv[2] ?? 300);
const seed = Number(process.argv[3] ?? 11);
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' });
try {
  const { COHABIT, CohabitSim, partySizes } = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const { SCENE, FRAMES, STEADY, TrajectoryBaker, bandFrame } = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const traj = new TrajectoryBaker().runAll();
  const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid }, guide: COHABIT.GUIDE });
  const half = sim.layout.fieldM / 2;
  const sizes = partySizes(SCENE.people);
  sizes.forEach((sz, i) => { const a = (i / sizes.length) * 2 * Math.PI + 0.3; sim.addParty(Math.cos(a) * half * 0.6, Math.sin(a) * half * 0.6, sz); });
  for (let i = 0; i < SCENE.cats; i++) sim.addCat(sim.layout.units[(i * 5) % sim.layout.units.length]);
  const BANDS = COHABIT.FACES.BANDS;
  const N = sim.layout.units.length;
  const fPrev = new Float32Array(N * BANDS);
  const rising = new Uint8Array(N * BANDS).fill(1);
  const firsts = {};
  const mark = (k, t) => { if (!(k in firsts)) firsts[k] = +t.toFixed(1); };
  let maxTrans = 0, maxFrames = 0, sumTrans = 0, steps = 0;
  const dt = 1 / 30;
  const marks = [30, 60, 120, 180, 300];
  const snapshots = [];
  for (let t = 0; t < seconds; t += dt) {
    sim.step(dt);
    steps++;
    const s = sim.summary();
    if (s.seated > 0) mark('first seated', t);
    if (s.guides > 0) mark('first guide route', t);
    if (s.formed > 0) mark('first unit formed', t);
    if (s.bandsOpen > 0) mark('first band opened (door)', t);
    if (s.ledger.counts.gaze > 0) mark('first co-gaze', t);
    if (s.ledger.counts.warmth > 0) mark('first co-warmth', t);
    if (s.ledger.counts.touch > 0) mark('first contact', t);
    if (s.catArrivals > 0) mark('first cat reached the unit in front of a seat', t);
    if (sim.cats.some((c) => !c.unit)) mark('first cat on the floor', t);
    let trans = 0; const frames = new Set();
    for (let u = 0; u < N; u++) {
      let allS = true, allF = true;
      for (let j = 0; j < BANDS; j++) {
        const i = u * BANDS + j;
        const f = Math.max(0, Math.min(1, sim.act.degree[u] * (1 - sim.bandOpen[i])));
        if (f > fPrev[i] + 1e-6) rising[i] = 1; else if (f < fPrev[i] - 1e-6) rising[i] = 0;
        fPrev[i] = f;
        const k = bandFrame(f, rising[i] === 1, FRAMES, traj.retractActive);
        if (k !== STEADY.straight) allS = false;
        if (k !== STEADY.formed) allF = false;
        if (k !== STEADY.straight && k !== STEADY.formed) frames.add(k);
      }
      if (!allS && !allF) trans++;
    }
    maxTrans = Math.max(maxTrans, trans); maxFrames = Math.max(maxFrames, frames.size); sumTrans += trans;
    if (marks.length && t >= marks[0]) {
      marks.shift();
      snapshots.push({ t: +t.toFixed(0), formed: s.formed, seated: s.seated, guides: s.guides, bandsOpen: s.bandsOpen, counts: s.ledger.counts, catFloor: sim.cats.filter((c) => !c.unit).length });
    }
  }
  console.log('firsts (s):', firsts);
  console.log('snapshots:', JSON.stringify(snapshots));
  console.log(`transitioning units: max ${maxTrans}, mean ${(sumTrans / steps).toFixed(2)}; distinct transition frames in use: max ${maxFrames}`);
  console.log(`draw calls worst case ≈ ${2 * 2 + 2 * maxFrames} groups, ${64 - maxTrans} steady units + ${maxTrans * 20} band placements`);
} finally {
  await server.close();
}
