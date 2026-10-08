// 大触手的反应探针（轮回机器_触手与转向研究.md §8 的数字出处）。
//
//   node scripts/behavior/reaction-probe.mjs [outJson]
//
// 问题：用户说「大触手的运动不够有表现力，惊跳、回应这几种反应区别都不明显」。这里把每种反应
// 单独打出来，走完整条链量看得见的东西：引擎 → 三腱换算 → 三根肌肉（台架同式，临界阻尼 ω = 5）
// → Lab 1-3 触手求解器 → 梢端位置。引擎、换算、求解器一律取站上模块。
//
// 隔离：成长段开头起，关掉自发动作与定时转向（把下一次的时刻推到很远），静置 6 s 让臂与呼吸落定，
// 再注入一种刺激，记 10 s。每种人格 × 每种反应跑 N 个种子，报中位数与四分位。
//
// 反应本身的运动 = 同一个种子跑两遍（有刺激 / 不注入）逐帧相减：静息漂移、呼吸照常走，减掉以后
// 剩下的才是这次反应让梢端多走的那一段。量的东西（时刻都从刺激算起）：
//   peak   反应让梢端偏离「本来会在的位置」的最大距离（mm）
//   onset  梢端离开超过 max(5 mm, 两成峰值) 的时刻（s）——「多快看得出动了」
//   tPeak  到峰值的时刻（s）
//   vPeak  梢端峰值速度（mm/s）
//   dir    峰值时梢端位移的方向（臂截面里：0 = 上、180 = 下、左为正）
//   dYaw   机身转了多少（°）· dC 环身往收拢端的最大偏移（行程分数，输出减去刺激前的中心与呼吸摆动）· aMul 呼吸幅度最大倍数 · feel 触须最大摆角（°）
//   aPeak  反应部分的峰值加速度（m/s²）——「冲」不「冲」
// 本底 = 不注入时梢端 2 s 内自己晃多远（静息漂移）。反应要从这层晃动里跳出来：peak / 本底中位 = 「信噪比」。
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] ? resolve(process.argv[2]) : null;
const N = Number(process.env.N ?? 12);
/** 动作词汇：VOCAB=2 量研究原型（vocab2.ts），默认 1 = 现行 */
const VOCAB = Number(process.env.VOCAB ?? 1) === 2 ? 2 : 1;
/** 肌腱轴深卷：DEEP=0 量「深卷关着」（真机默认，执行层封顶 D 0.5），默认开（台架 Lab 1-6） */
const DEEP = process.env.DEEP !== '0';
const HZ = 60;
const DT = 1 / HZ;
const DEG = 180 / Math.PI;
const PRE = 6;
/** 记录窗口（s）与度量窗口（峰值只在前 MET 秒里找）：沉静型的回应要 6 s 以后才到峰 */
const WIN = 12;
const MET = 9;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const quart = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return [s[Math.floor(s.length * 0.25)], s[Math.floor(s.length / 2)], s[Math.min(s.length - 1, Math.floor(s.length * 0.75))]];
};

/** 反应清单：刺激 = 注入的传感事件；spont = 强制一次自发动作（推到此刻、只收想要的那一种） */
const REACTIONS = [
  { key: 'rest', zh: '静息（不注入）' },
  { key: 'startle', zh: '惊跳（敲 0.95，高于所有阈值）', input: { kind: 'KNOCK', intensity: 0.95 } },
  { key: 'respond', zh: '回应（抚摸 0.1，低于所有阈值）', input: { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' } },
  { key: 'pat', zh: '轻拍 0.3', input: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } },
  { key: 'feeler', zh: '碰触须 0.4', input: { kind: 'FEELER_TOUCH', feeler: 0, side: 'L' } },
  { key: 'arm', zh: '碰臂 0.4（停 4 s）', input: { kind: 'ARM_TOUCH', on: true }, off: { t: 4, input: { kind: 'ARM_TOUCH', on: false } } },
  { key: 'knock', zh: '轻敲 0.15（低于所有阈值，没有方向）', input: { kind: 'KNOCK', intensity: 0.15 } },
  { key: 'sound', zh: '声音 0.15（找不到来源）', input: { kind: 'SOUND', level: 0.15 } },
  { key: 'approach', zh: '人走近（左前 60°）', input: { kind: 'PRESENCE', band: 'mid', bearing: 1.05 } },
  { key: 'curl', zh: '自发 · 卷臂', spont: 'curl' },
  { key: 'sway', zh: '自发 · 扫臂', spont: 'sway' },
  { key: 'flick', zh: '自发 · 触须抖', spont: 'flick' },
  { key: 'sigh', zh: '自发 · 叹气', spont: 'sigh' },
];

async function main() {
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { BehaviorEngine } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
    const { PERSONA_KEYS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');
    const { tendonContractions, feelerAngle } = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
    const T3 = await server.ssrLoadModule('/src/lib/linkage/tentacle3d-data.ts');
    const { CriticallyDamped } = await server.ssrLoadModule('/src/lib/linkage/motion.ts');

    const makeArm = () => {
      const arm = T3.createTentacle3();
      const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
      const step = (c) => {
        for (let k = 0; k < 3; k++) {
          muscles[k].target = c[k];
          if (muscles[k].update(DT)) T3.applyContraction3(arm.solver, arm.tendons[k], muscles[k].value);
        }
        arm.solver.step(DT, T3.TENTACLE3D.sweeps);
      };
      const tip = () => ({ ...arm.solver.nodes[T3.TIP3] });
      const spine = () => Array.from({ length: T3.TIP3 + 1 }, (_, i) => ({ ...arm.solver.nodes[T3.SPINE3(i)] }));
      return { step, tip, spine, muscles };
    };

    /** 一次试验：返回逐帧记录（刺激时刻 = 0），没打出想要的反应返回 null */
    const trial = (P, seed, R, keepFrames) => {
      const order = [P, ...PERSONA_KEYS.filter((k) => k !== P)];
      const e = new BehaviorEngine({ seed, order, loop: false, lifeRate: 1, vocab: VOCAB });
      const arm = makeArm();
      e.skip();
      e.tick();
      e.drain();
      const st = e.state;
      const quiet = () => {
        st.nextSpont = 1e9;
        st.nextOrient = 1e9;
      };
      quiet();
      // 给画图留 1 s 预卷（刺激前机器在干什么），不参与度量
      const pre = [];
      for (let i = 0; i < PRE * HZ; i++) {
        e.tick();
        e.drain();
        const tg = e.targets();
        arm.step(tendonContractions(tg.arm, { deep: DEEP }));
        if (keepFrames && i >= (PRE - 1) * HZ) pre.push({ t: (i + 1) * DT - PRE, tg, tip: arm.tip(), spine: arm.spine() });
      }
      const tip0 = arm.tip();
      const c0 = st.center.x;
      const a0 = Math.max(1e-3, st.amp.x);
      const y0 = e.targets().yaw;
      if (R.input) e.push(R.input);
      if (R.spont) st.nextSpont = e.time;
      const frames = [];
      const events = [];
      let ok = !R.spont;
      for (let i = 0; i < WIN * HZ; i++) {
        const t = i * DT;
        if (R.off && Math.abs(t - R.off.t) < DT / 2) e.push(R.off.input);
        e.tick();
        for (const r of e.drain()) {
          if (r.src === 'engine') events.push({ t, ev: r.ev, p: r.p });
          if (R.spont && r.ev === 'SPONTANEOUS') ok = r.p?.action === R.spont;
        }
        if (R.spont && i === 1 && !ok) return null;
        if (R.spont) quiet();
        const tg = e.targets();
        arm.step(tendonContractions(tg.arm, { deep: DEEP }));
        const tip = arm.tip();
        const d = sub(tip, tip0);
        frames.push({
          t,
          tip,
          d,
          disp: len(d),
          bend: tg.arm.bend,
          dir: tg.arm.dir,
          wrap: tg.arm.wrap,
          c: tendonContractions(tg.arm, { deep: DEEP }),
          // 环身往收拢端偏了多少：输出 − (刺激前的中心 + 此刻的呼吸摆动)。v1 = 中心的偏移；v2 的猛收叠在输出上，也算进来
          dC: tg.breath.s - (c0 + 0.5 * st.amp.x * Math.cos(2 * Math.PI * st.phi)),
          aMul: st.amp.x / a0,
          s: tg.breath.s,
          yaw: (tg.yaw - y0) * DEG,
          feel: Math.max(Math.abs(feelerAngle(tg.feelers[0])), Math.abs(feelerAngle(tg.feelers[1]))) * DEG,
          sound: tg.sound.on,
          spine: keepFrames ? arm.spine() : undefined,
        });
      }
      return { frames, events, pre };
    };

    /** fr = 有刺激那一遍，base = 同种子不注入那一遍；e(t) = 两者梢端之差 */
    const metrics = (fr, base) => {
      const e = fr.map((f, i) => sub(f.tip, base[i].tip));
      let peak = 0;
      let iPeak = 0;
      e.forEach((d, i) => {
        if (fr[i].t <= MET && len(d) > peak) {
          peak = len(d);
          iPeak = i;
        }
      });
      const th = Math.max(5, 0.2 * peak);
      const iOn = e.findIndex((d) => len(d) > th);
      const iOn5 = e.findIndex((d) => len(d) > 5);
      let vPeak = 0;
      let aPeak = 0;
      for (let i = 1; i < e.length && fr[i].t <= MET; i++) {
        vPeak = Math.max(vPeak, len(sub(e[i], e[i - 1])) * HZ);
        if (i > 1) {
          const a = { x: e[i].x - 2 * e[i - 1].x + e[i - 2].x, y: e[i].y - 2 * e[i - 1].y + e[i - 2].y, z: e[i].z - 2 * e[i - 1].z + e[i - 2].z };
          aPeak = Math.max(aPeak, (len(a) * HZ * HZ) / 1000);
        }
      }
      // 本底：不注入那一遍梢端 2 s 内自己晃多远
      const bg = Math.max(...base.filter((f) => f.t <= 2).map((f) => len(sub(f.tip, base[0].tip))));
      const dp = e[iPeak];
      return {
        bg,
        aPeak,
        peak,
        onset: iOn < 0 ? NaN : fr[iOn].t,
        on5: iOn5 < 0 ? NaN : fr[iOn5].t,
        tPeak: fr[iPeak].t,
        vPeak,
        dir: -Math.atan2(dp.x, dp.z) * DEG,
        dYaw: Math.max(...fr.map((f) => Math.abs(f.yaw))),
        dC: fr.reduce((m, f) => (Math.abs(f.dC) > Math.abs(m) ? f.dC : m), 0),
        aMul: Math.max(...fr.map((f) => f.aMul)),
        feel: Math.max(...fr.map((f) => f.feel)),
        bendMax: Math.max(...fr.map((f) => f.bend)),
        cMax: Math.max(...fr.map((f) => Math.max(...f.c))),
      };
    };

    const results = {};
    const examples = {};
    // 同一种子的「不注入」那一遍对所有反应都一样：每个 (人格, 种子) 只跑一次
    const baseCache = new Map();
    const baseOf = (P, seed) => {
      const k = `${P}:${seed}`;
      if (!baseCache.has(k)) baseCache.set(k, trial(P, seed, REACTIONS[0], false));
      return baseCache.get(k);
    };
    const ONLY = process.env.PERSONA ? process.env.PERSONA.split(',') : null;
    for (const P of PERSONA_KEYS.filter((k) => !ONLY || ONLY.includes(k))) {
      results[P] = {};
      examples[P] = {};
      for (const R of REACTIONS) {
        const ms = [];
        const evs = {};
        const kept = [];
        for (let seed = 1; ms.length < N && seed < 400; seed++) {
          const r = trial(P, seed, R, false);
          if (!r) continue;
          const b = R.key === 'rest' ? r : baseOf(P, seed);
          const m = metrics(r.frames, b.frames);
          // 这一次实际打出来的是惊跳还是回应（同一种刺激，不同人格 / 不同阈值抽样结果不同）
          m.startled = r.events.some((e) => e.ev === 'STARTLE' && e.t < 1) ? 1 : 0;
          ms.push(m);
          kept.push({ seed, m });
          for (const e of r.events) if (e.t < MET) evs[e.ev] = (evs[e.ev] ?? 0) + 1;
        }
        results[P][R.key] = { ms, evs };
        // 代表试验：peak 取中位的那个种子，逐帧（含脊线）留给画图
        const mid = [...kept].sort((a, b) => a.m.peak - b.m.peak)[Math.floor(kept.length / 2)];
        if (mid) {
          const r = trial(P, mid.seed, R, true);
          const b = trial(P, mid.seed, REACTIONS[0], true);
          const preFrames = r.pre.filter((_, i) => i % 2 === 0).map((f) => ({
            t: +f.t.toFixed(3),
            disp: 0,
            dz: 0,
            dx: 0,
            bend: +f.tg.arm.bend.toFixed(3),
            s: +f.tg.breath.s.toFixed(3),
            yaw: 0,
            feel: +(Math.max(Math.abs(feelerAngle(f.tg.feelers[0])), Math.abs(feelerAngle(f.tg.feelers[1]))) * DEG).toFixed(1),
            sound: f.tg.sound.on ? 1 : 0,
            spine: f.spine.map((q) => [+q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1)]),
          }));
          examples[P][R.key] = {
            seed: mid.seed,
            pre: preFrames,
            frames: r.frames.map((f, i) => ({ f, e: sub(f.tip, b.frames[i].tip) })).filter((_, i) => i % 2 === 0).map(({ f, e }) => ({
              t: +f.t.toFixed(3),
              disp: +len(e).toFixed(1),
              dz: +e.z.toFixed(1),
              dx: +e.x.toFixed(1),
              bend: +f.bend.toFixed(3),
              s: +f.s.toFixed(3),
              yaw: +f.yaw.toFixed(1),
              feel: +f.feel.toFixed(1),
              sound: f.sound ? 1 : 0,
              spine: f.spine.map((p) => [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]),
            })),
            events: r.events,
          };
        }
      }
    }

    if (OUT) {
      const summary = {};
      for (const P of Object.keys(results)) {
        summary[P] = {};
        for (const R of REACTIONS) summary[P][R.key] = results[P][R.key].ms;
      }
      writeFileSync(OUT, JSON.stringify({ reactions: REACTIONS.map(({ key, zh }) => ({ key, zh })), summary, examples }));
      console.log(`\n写出 ${OUT}`);
    }
    // ── 输出表
    const fmt = (q, d = 0) => (q[1] === undefined ? '—' : `${q[1].toFixed(d)} [${q[0].toFixed(d)}–${q[2].toFixed(d)}]`);
    const DONE = Object.keys(results);
    for (const P of DONE) {
      const bgMed = median(results[P].rest.ms.map((m) => m.bg));
      console.log(`\n## 人格 ${P}（本底：静息时梢端 2 s 内自己晃 ${bgMed.toFixed(0)} mm）`);
      console.log('| 反应 | peak mm | 信噪比 | on5 s | onset s | tPeak s | vPeak mm/s | aPeak m/s² | dir ° | dYaw ° | dC | aMul | feel ° | bendMax | cMax | 引擎事件 |');
      console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const R of REACTIONS) {
        const { ms, evs } = results[P][R.key];
        if (!ms.length) {
          console.log(`| ${R.zh} | — |`);
          continue;
        }
        const col = (k, d) => fmt(quart(ms.map((m) => m[k]).filter((x) => Number.isFinite(x))), d);
        const snr = median(ms.map((m) => m.peak)) / bgMed;
        const ev = Object.entries(evs)
          .map(([k, v]) => `${k}×${v}`)
          .join(' ');
        console.log(
          `| ${R.zh} | ${col('peak')} | ${snr.toFixed(1)} | ${col('on5', 2)} | ${col('onset', 2)} | ${col('tPeak', 2)} | ${col('vPeak')} | ${col('aPeak', 2)} | ${col('dir')} | ${col('dYaw')} | ${col('dC', 2)} | ${col('aMul', 2)} | ${col('feel')} | ${col('bendMax', 2)} | ${col('cMax', 2)} | ${ev} |`,
        );
      }
    }

    // ── 可分性：只看运动特征，用留一 1-近邻能不能认出是哪种反应（四种主要反应）
    const KEYS = ['startle', 'respond', 'curl', 'sway'];
    const feat = (m, all) => {
      const v = [m.peak / 100, m.tPeak / 2, m.vPeak / 300, m.aPeak / 2, Math.cos(m.dir / DEG), Math.sin(m.dir / DEG)];
      if (all) v.push(m.dYaw / 30, m.dC / 0.2, (m.aMul - 1) / 0.5, m.feel / 60);
      return v;
    };
    const loo = (P, all) => {
      const pts = KEYS.flatMap((k) => results[P][k].ms.map((m) => ({ k, v: feat(m, all) })));
      let hit = 0;
      const conf = {};
      for (let i = 0; i < pts.length; i++) {
        let best = Infinity;
        let bk = '';
        for (let j = 0; j < pts.length; j++) {
          if (i === j) continue;
          const d = pts[i].v.reduce((s, x, n) => s + (x - pts[j].v[n]) ** 2, 0);
          if (d < best) {
            best = d;
            bk = pts[j].k;
          }
        }
        if (bk === pts[i].k) hit++;
        else conf[`${pts[i].k}→${bk}`] = (conf[`${pts[i].k}→${bk}`] ?? 0) + 1;
      }
      return { acc: hit / pts.length, conf };
    };
    // 三大类：惊跳 / 回应（抚摸、轻拍、碰触须）/ 自发（卷臂、扫臂）——观众要分清的是这三件
    const CLASSES = { startle: ['startle'], respond: ['respond', 'pat', 'feeler', 'knock', 'sound', 'approach'], spont: ['curl', 'sway'] };
    const loo3 = (P) => {
      const pts = Object.entries(CLASSES).flatMap(([cls, keys]) =>
        keys.flatMap((k) => (results[P][k]?.ms ?? []).map((m) => ({ k: m.startled ? 'startle' : cls, v: feat(m, true) }))),
      );
      let hit = 0;
      for (let i = 0; i < pts.length; i++) {
        let best = Infinity;
        let bk = '';
        for (let j = 0; j < pts.length; j++) {
          if (i === j) continue;
          const d = pts[i].v.reduce((s, x, n) => s + (x - pts[j].v[n]) ** 2, 0);
          if (d < best) {
            best = d;
            bk = pts[j].k;
          }
        }
        if (bk === pts[i].k) hit++;
      }
      return pts.length ? hit / pts.length : NaN;
    };
    console.log('\n## 可分性（留一 1-近邻，四类：惊跳 / 回应 / 卷臂 / 扫臂；机会水平 25%）');
    for (const P of DONE) {
      const a = loo(P, false);
      const b = loo(P, true);
      const top = Object.entries(b.conf)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([k, v]) => `${k}×${v}`)
        .join(' ');
      console.log(`- ${P}: 只看臂 ${(a.acc * 100).toFixed(0)}% · 加上全通道 ${(b.acc * 100).toFixed(0)}%　混淆最多：${top}　｜ 三大类（惊跳 / 回应 / 自发，全通道）${(loo3(P) * 100).toFixed(0)}%`);
    }

  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
