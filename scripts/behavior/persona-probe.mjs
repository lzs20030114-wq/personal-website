// 人格对比探针（2026-10-14，人格分类重做的前后对照）。问的是：同一个人、同一只手，四种人格的反应差多少、
// 「回避」那一型到底看不看得出在躲人。
//
//   node scripts/behavior/persona-probe.mjs <outDir> [N=12] [vocabs=1,2]
//
// 引擎、台架换算、触手求解器、碰臂判定一律取站上模块（vite ssrLoadModule），这里不另写一份。
// 三个场景（每种人格 × 每个动作词汇 × N 个种子；成长段、生命钟 ×1、自发与转向照常）：
//   V  面板式来访：人从远到近（方位随机，0 / 3 / 6 s 远 · 中 · 近），近处停 30 s 后离开，隔 14 s 再来，共四次。不碰。
//   T  同 V，近处停留期间按时间表碰：12 s 拍朝人那半壳、18 s 摸、24 s 手碰臂 3 s、31 s 碰朝人那条触须。
//   H  指针 = 手（台架同式闭环：handReading → HAND · handBandOf → 在场 · contactStep → 碰臂）：手在机身此刻朝向
//      ±50° 处 1.2 m 出现，5 s 内移到 0.65 m，停 25 s（慢慢左右晃 ±8°），然后移出画布 15 s；三次，左右交替。
//   M  同 H 的来访，但手停下以后一直去够大触手（2026-10-15 加，问「臂躲不躲手」）：从 6 s 起，指针在画面上追着此刻的
//      臂梢走过去（400 mm/s，离梢不到 0.3 s 的路程时按距离减速，像人伸手），碰到就停 0.8 s，没碰到 3 s 就作罢；
//      然后 250 mm/s 退回停手的地方、等 1.5 s，再够下一次。
// 量（停留窗 = 近处的 30 s；对照窗 = 人不在的那 14 s）：
//   face   机身朝向与人 / 手方位夹角的余弦，窗内均值（+1 正对，−1 背对）
//   away   夹角 > 120° 的时间占比；toward = 夹角 < 45° 的占比
//   tTurn  人出现后机身第一次转过 30° 的时刻（没转 = 窗长）；turnSign = 那一下是朝人（+1）还是背人（−1）
//   yawAct 停留窗内机身转过的总角度（°/min）
//   open   呼吸行程（1 − s）的窗内均值：大 = 张开；breathSd = s 的标准差（起伏大小）
//   dOpen  open 停留窗 − 对照窗（人来了张开还是收拢）
//   bend / up  臂弯曲量均值、cos(弯向) 均值（+ = 臂梢朝上「伸 / 迎」，− = 朝下「缩」）
//   voice  发声占比
//   startle / respond  每次来访的惊跳 / 回应次数
//   H 场景另有：tipNear = 梢端离手 < 120 mm 的时间占比；dTip = 梢端离手距离（mm）均值；touch = 碰到次数；wrap = 缠的次数
//     armAway = 臂弯曲 × 弯向背着手的余弦（+ = 往背着手那边弯，− = 朝手弯；手在臂轴上读不准的那几帧用上一个弯向）
//     dodge = 梢端离手 − 同一朝向下笔直的臂梢离手（mm；+ = 臂把梢挪开了，− = 臂把梢凑过去了）
//   M 场景另有：reaches = 每次来访够了几次；touchRate = 够到（碰到臂）的比例；gapReach = 够的时候指针离臂（画面上
//     的脊线，换成 mm）的平均距离；tTouch = 够到用了几秒（没够到的不算）
// 汇总：每项指标的人格均值 ± 标准差、两两 Cohen's d；用标准化的指标向量做留一最近质心分类，正确率 = 「光看这些量
// 能认出是哪种人格」的比例（四选一，瞎猜 25%）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = resolve(process.argv[2] ?? 'persona-probe-out');
const N = Number(process.argv[3] ?? 12);
const VOCABS = (process.argv[4] ?? '1,2').split(',').map(Number);
const SCENS = (process.env.SCEN ?? 'V,T,H').split(',');

const HZ = 60;
const DEG = 180 / Math.PI;
const TAU = 2 * Math.PI;
const CANVAS_W = 712;
const CSS = CANVAS_W / 700;
const CATCH_AT = 0.6;
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mul3 = (a, b) => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rxM = (t) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const ryM = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const rzM = (t) => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
const AXON = mul3(rzM(-1.053336), mul3(rxM(0.735843), ryM(0.867459)));

const { createServer } = await import(pathToFileURL(join(REPO, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: REPO,
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const { BehaviorEngine } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
const { PERSONA_KEYS, PERSONAS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');
const { bandOf } = await server.ssrLoadModule('/src/lib/linkage/behavior/events.ts');
const MB = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
const { armPoint } = await server.ssrLoadModule('/src/lib/linkage/machine-arm.ts');
const T3 = await server.ssrLoadModule('/src/lib/linkage/tentacle3d-data.ts');
const { CriticallyDamped } = await server.ssrLoadModule('/src/lib/linkage/motion.ts');
const HAND_UI = MB.HAND_UI;
const VIEW = { ...MB.sweepFraming(AXON), m: AXON, pan: { x: 0, y: 0 }, persp: 0 };
const PPM = VIEW.scale * CSS;
const cssOf = (w) => {
  const q = MB.projectLogical(VIEW, w);
  return { x: q.x * CSS, y: q.y * CSS };
};
const Z_ARM = MB.ARM_GEOM.base.z;
const HSC = (sc) => sc === 'H' || sc === 'M';
/** 够臂（M）：指针追臂梢的速度、减速段、够不着作罢、碰到后停、退回速度、两次之间等（mm/s 与秒） */
const REACH = { v: 400, slow: 0.3, giveUp: 3, hold: 0.8, back: 250, wait: 1.5, first: 6 };
/** 世界系方位 β（0 = 机器初始正前方 = 世界 −X，逆时针为正）、离电机轴 r mm 的点（臂高水平面） */
const worldAt = (beta, r) => ({ x: MB.YAW_AXIS.x - r * Math.cos(beta), y: MB.YAW_AXIS.y - r * Math.sin(beta), z: Z_ARM });

const makeArm = () => {
  const arm = T3.createTentacle3();
  const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
  return {
    step(c) {
      for (let k = 0; k < 3; k++) {
        muscles[k].target = c[k];
        if (muscles[k].update(1 / HZ)) T3.applyContraction3(arm.solver, arm.tendons[k], muscles[k].value);
      }
      arm.solver.step(1 / HZ, T3.TENTACLE3D.sweeps);
    },
    tipSim: () => ({ ...arm.solver.nodes[T3.TIP3] }),
    spineSim: () => Array.from({ length: T3.TIP3 + 1 }, (_, i) => ({ ...arm.solver.nodes[T3.SPINE3(i)] })),
  };
};
/** 笔直的臂梢（臂系 → 世界，未转）：dodge 拿它当「臂不弯的话梢在哪」 */
const TIP0 = armPoint(makeArm().tipSim());
const handBandOf = (distMm, cur) => {
  const raw = bandOf(distMm / 1000);
  if (cur === null || cur === 'gone' || raw === cur) return raw;
  const h = HAND_UI.bandHys / 1000;
  const m = distMm / 1000;
  if (cur === 'near' && m < 0.6 + h) return 'near';
  if (cur === 'far' && m > 1.5 - h) return 'far';
  if (cur === 'mid' && m > 0.6 - h && m < 1.5 + h) return 'mid';
  return raw;
};

/** 一次试验：返回每次来访的指标 */
function trial(P, vocab, seed, sc) {
  const order = [P, ...PERSONA_KEYS.filter((k) => k !== P)];
  const opts = { seed, order, loop: false, lifeRate: 1, vocab };
  if (vocab === 2) opts.deepOk = true;
  const e = new BehaviorEngine(opts);
  e.skip();
  e.tick();
  e.drain();
  const st = e.state;
  const r = rng(seed * 104729 + sc.charCodeAt(0));
  const t0 = e.time + 4;
  const visits = [];
  if (HSC(sc)) {
    for (let k = 0; k < 3; k++) visits.push({ at: t0 + k * 45, side: k % 2 ? -1 : 1, reaches: [] });
  } else {
    for (let k = 0; k < 4; k++) visits.push({ at: t0 + k * 50, bearing: (r() * 2 - 1) * Math.PI });
  }
  const tEnd = HSC(sc) ? t0 + 3 * 45 : t0 + 4 * 50;
  const inputs = [];
  if (!HSC(sc)) {
    for (const v of visits) {
      const b = v.bearing;
      inputs.push({ t: v.at, i: { kind: 'PRESENCE', band: 'far', bearing: b } });
      inputs.push({ t: v.at + 3, i: { kind: 'PRESENCE', band: 'mid', bearing: b } });
      inputs.push({ t: v.at + 6, i: { kind: 'PRESENCE', band: 'near', bearing: b } });
      inputs.push({ t: v.at + 36, i: { kind: 'PRESENCE', band: 'gone' } });
      if (sc === 'T') {
        inputs.push({ t: v.at + 12, i: () => ({ kind: 'SHELL_STROKE', half: MB.halfTowardPerson(b, e.targets().yaw), touch: 'pat' }) });
        inputs.push({ t: v.at + 18, i: () => ({ kind: 'SHELL_STROKE', half: MB.halfTowardPerson(b, e.targets().yaw), touch: 'stroke' }) });
        inputs.push({ t: v.at + 24, i: { kind: 'ARM_TOUCH', on: true } });
        inputs.push({ t: v.at + 27, i: { kind: 'ARM_TOUCH', on: false } });
        inputs.push({
          t: v.at + 31,
          i: () => {
            const half = MB.halfTowardPerson(b, e.targets().yaw);
            return { kind: 'FEELER_TOUCH', feeler: half === 'L' ? 0 : 1, side: half };
          },
        });
      }
    }
    inputs.sort((a, b) => a.t - b.t);
  }
  const arm = HSC(sc) ? makeArm() : null;
  let tipCss = null;
  // H 的台架状态
  const track = MB.pointerTrack();
  let contact = MB.contactIdle();
  let electrodeSent = false;
  let tensionOn = false;
  let handSent = null;
  let lastAimDir = 0;
  let handBand = null;
  let bandCand = null;
  let bandCandAt = 0;
  let lastPtr = null;
  let handOn = false;
  let ii = 0;
  const frames = [];
  const log = [];
  /** H：每次来访的手（出现时按此刻朝向定方位，之后固定在世界里） */
  const handOf = (v, t) => {
    const u = t - v.at;
    if (u < 0 || u >= 30) return null;
    if (v.beta === undefined) v.beta = wrapPi(e.targets().yaw + v.side * (50 / DEG));
    const rr = u < 5 ? 1200 - (1200 - 650) * (u / 5) : 650;
    const wob = u < 5 ? 0 : (8 / DEG) * Math.sin((TAU * (u - 5)) / 12);
    return { beta: wrapPi(v.beta + wob), r: rr };
  };
  /** M：手停下以后在画面上追臂梢（CSS px）；返回此刻指针的画面位置 */
  const reachStep = (v, t, rest) => {
    const m = (v.m ??= { phase: 'wait', until: v.at + REACH.first, p: { ...rest }, cur: null });
    const dt = 1 / HZ;
    const toward = (to, vMm) => {
      const dx = to.x - m.p.x;
      const dy = to.y - m.p.y;
      const d = Math.hypot(dx, dy);
      const stepPx = Math.min(d, vMm * PPM * dt);
      if (d > 1e-9) {
        m.p.x += (dx / d) * stepPx;
        m.p.y += (dy / d) * stepPx;
      }
      return d;
    };
    if (m.phase === 'wait' && t >= m.until && tipCss) {
      m.phase = 'reach';
      m.until = t + REACH.giveUp;
      m.cur = { t0: t, touched: false, tTouch: null, gaps: [] };
      v.reaches.push(m.cur);
    }
    if (m.phase === 'reach') {
      const d = Math.hypot(tipCss.x - m.p.x, tipCss.y - m.p.y) / PPM;
      toward(tipCss, Math.min(REACH.v, d / REACH.slow + 20));
      if (contact.touching) {
        m.cur.touched = true;
        m.cur.tTouch = t - m.cur.t0;
        m.phase = 'hold';
        m.until = t + REACH.hold;
      } else if (t >= m.until) m.phase = 'back';
    } else if (m.phase === 'hold') {
      if (t >= m.until) m.phase = 'back';
    } else if (m.phase === 'back') {
      if (toward(rest, REACH.back) < 1) {
        m.phase = 'wait';
        m.until = t + REACH.wait;
      }
    }
    return { x: m.p.x, y: m.p.y, phase: m.phase };
  };
  while (e.time < tEnd) {
    const t = e.time;
    while (ii < inputs.length && inputs[ii].t <= t + 1e-9) {
      const it = inputs[ii++].i;
      e.push(typeof it === 'function' ? it() : it);
    }
    let handNow = null;
    if (HSC(sc)) {
      const yaw0 = e.targets().yaw;
      const v = visits.find((x) => t >= x.at && t < x.at + 30);
      const hp = v ? handOf(v, t) : null;
      handNow = hp;
      if (hp) {
        let W = worldAt(hp.beta, hp.r);
        let ptrL = MB.projectLogical(VIEW, W);
        let pc = { x: ptrL.x * CSS, y: ptrL.y * CSS };
        if (sc === 'M' && t - v.at >= 5) {
          // 停手的地方（不晃）：够完退回这里
          const R = MB.projectLogical(VIEW, worldAt(v.beta, 650));
          const q = reachStep(v, t, { x: R.x * CSS, y: R.y * CSS });
          pc = { x: q.x, y: q.y };
          ptrL = { x: pc.x / CSS, y: pc.y / CSS };
          W = MB.rayHitZ(VIEW, ptrL, Z_ARM) ?? W;
          hp.phase = q.phase;
        }
        hp.W = W;
        if (!lastPtr || pc.x !== lastPtr.x || pc.y !== lastPtr.y) MB.trackMove(track, t, pc.x, pc.y);
        lastPtr = pc;
        const rd = MB.handReading(VIEW, ptrL, yaw0, handSent?.bearing);
        hp.rd = rd;
        if (rd.side >= HAND_UI.sideMin || !handSent) lastAimDir = rd.aimDir;
        const v2f = e.vocab() === 2;
        if (MB.handSendDue(rd, handSent, lastAimDir, t, { v2: v2f, lastMoveAt: track.lastMoveAt })) {
          const send = {
            bearing: Math.round(rd.bearing * 1000) / 1000,
            dist: Math.round(rd.dist),
            face: Math.round(rd.face * 1000) / 1000,
            aimDir: Math.round(lastAimDir * 1000) / 1000,
            aimBend: Math.round(rd.aimBend * 1000) / 1000,
            aimDist: Math.round(rd.aimDist),
          };
          handSent = { ...send, at: t, onBody: rd.onBody };
          const ev = { kind: 'HAND', on: true, ...send };
          if (v2f) {
            ev.touch = Math.round(MB.contactRadiusMm(PPM, false));
            ev.still = Math.round(Math.min(9.9, t - track.lastMoveAt) * 10) / 10;
            ev.v = Math.round(MB.trackSpeed(track, t, pc.x, pc.y) / PPM);
          }
          e.push(ev);
          handOn = true;
        }
        const hb = handBandOf(rd.dist, handBand);
        if (hb !== handBand) {
          if (bandCand !== hb) {
            bandCand = hb;
            bandCandAt = t;
          }
          if (handBand === null || t - bandCandAt >= HAND_UI.bandDwell) {
            const before = handBand === null ? 'gone' : handBand;
            handBand = hb;
            bandCand = null;
            if (hb !== before) e.push({ kind: 'PRESENCE', band: hb });
          }
        } else bandCand = null;
        MB.trackTrim(track, t);
        const spC = arm.spineSim().map((n) => cssOf(MB.yawPoint(armPoint(n), yaw0)));
        hp.gap = MB.polylineDist(pc, spC) / PPM;
        if (hp.phase === 'reach' && v.m?.cur) v.m.cur.gaps.push(hp.gap);
        contact = MB.contactStep(
          contact,
          {
            now: t,
            x: pc.x,
            y: pc.y,
            d: MB.polylineDist(pc, spC),
            pxPerMm: PPM,
            finger: false,
            speed: MB.trackSpeed(track, t, pc.x, pc.y),
            lastMoveAt: track.lastMoveAt,
            grasp: st.grasp.phase,
          },
          { traction: false },
        ).next;
        const on = contact.touching || contact.held;
        if (on !== electrodeSent) {
          electrodeSent = on;
          e.push(on && contact.touching && !contact.held && contact.by === 'arm' ? { kind: 'ARM_TOUCH', on, by: 'arm' } : { kind: 'ARM_TOUCH', on });
          if (!on && tensionOn) {
            tensionOn = false;
            e.push({ kind: 'RESISTANCE', on: false });
          }
        }
      } else if (handOn) {
        // 指针离开画布：台架同式——手没了、在场归无人、电极落下
        e.push({ kind: 'HAND', on: false });
        handOn = false;
        handSent = null;
        if (handBand !== null && handBand !== 'gone') e.push({ kind: 'PRESENCE', band: 'gone' });
        handBand = null;
        bandCand = null;
        lastPtr = null;
        contact = MB.contactIdle();
        if (electrodeSent) {
          electrodeSent = false;
          e.push({ kind: 'ARM_TOUCH', on: false });
        }
        if (tensionOn) {
          tensionOn = false;
          e.push({ kind: 'RESISTANCE', on: false });
        }
      }
    }
    e.tick();
    for (const rec of e.drain()) log.push(rec);
    if (HSC(sc)) {
      const gr = st.grasp;
      if (electrodeSent && !tensionOn && gr.phase === 'WRAP' && (gr.catchT !== undefined ? e.time >= gr.catchT : (e.time - gr.t0) / gr.dur >= CATCH_AT)) {
        tensionOn = true;
        e.push({ kind: 'RESISTANCE', on: true });
      } else if (tensionOn && (gr.phase === 'RELEASE' || gr.phase === 'IDLE')) {
        tensionOn = false;
        e.push({ kind: 'RESISTANCE', on: false });
      }
    }
    const tg = e.targets();
    let tipW = null;
    if (arm) {
      arm.step(MB.tendonContractions(tg.arm, { deep: true }));
      tipW = MB.yawPoint(armPoint(arm.tipSim()), tg.yaw);
      tipCss = cssOf(tipW);
    }
    frames.push({
      t: e.time,
      yaw: tg.yaw,
      s: tg.breath.s,
      bend: tg.arm.bend,
      dir: tg.arm.dir,
      voice: tg.sound.on ? 1 : 0,
      hand: handNow ? { beta: handNow.beta, r: handNow.r, rd: handNow.rd, W: handNow.W, gap: handNow.gap, phase: handNow.phase } : null,
      aim: lastAimDir,
      tipW,
    });
  }
  // —— 指标
  const out = [];
  for (const v of visits) {
    const stay = HSC(sc) ? [v.at + 5, v.at + 30] : [v.at + 6, v.at + 36];
    const ctrl = HSC(sc) ? [v.at + 31, v.at + 44] : [v.at + 37, v.at + 50];
    const inW = (w) => frames.filter((f) => f.t >= w[0] && f.t < w[1]);
    const S = inW(stay);
    const C = inW(ctrl);
    const bearingOf = (f) => (HSC(sc) ? (f.hand ? f.hand.rd?.bearing ?? f.hand.beta : null) : v.bearing);
    const ang = S.map((f) => {
      const b = bearingOf(f);
      return b === null ? null : Math.abs(wrapPi(f.yaw - b));
    }).filter((x) => x !== null);
    const face = mean(ang.map(Math.cos));
    const away = mean(ang.map((a) => (a > (120 / DEG) ? 1 : 0)));
    const toward = mean(ang.map((a) => (a < (45 / DEG) ? 1 : 0)));
    // 第一次转过 30°（从人出现那刻算）
    const W0 = frames.filter((f) => f.t >= v.at && f.t < stay[1]);
    let tTurn = stay[1] - v.at;
    let turnSign = 0;
    if (W0.length) {
      const y0 = W0[0].yaw;
      for (const f of W0) {
        if (Math.abs(wrapPi(f.yaw - y0)) > 30 / DEG) {
          tTurn = f.t - v.at;
          const b = bearingOf(f) ?? bearingOf(W0[W0.length - 1]);
          if (b !== null) turnSign = Math.abs(wrapPi(f.yaw - b)) < Math.abs(wrapPi(y0 - b)) ? 1 : -1;
          break;
        }
      }
    }
    let yawSum = 0;
    for (let i = 1; i < S.length; i++) yawSum += Math.abs(wrapPi(S[i].yaw - S[i - 1].yaw));
    const yawAct = (yawSum * DEG) / ((stay[1] - stay[0]) / 60);
    const openS = mean(S.map((f) => 1 - f.s));
    const openC = mean(C.map((f) => 1 - f.s));
    const row = {
      face,
      away,
      toward,
      tTurn,
      turnSign,
      yawAct,
      open: openS,
      dOpen: openS - openC,
      breathSd: sd(S.map((f) => f.s)),
      bend: mean(S.map((f) => f.bend)),
      up: mean(S.map((f) => f.bend * Math.cos(f.dir))),
      voice: mean(S.map((f) => f.voice)),
      startle: log.filter((x) => x.ev === 'STARTLE' && x.t >= v.at && x.t < v.at + 40).length,
      respond: log.filter((x) => x.ev === 'RESPONSE' && x.t >= v.at && x.t < v.at + 40).length,
    };
    if (HSC(sc)) {
      const HF = S.filter((f) => f.hand && f.tipW && f.hand.W);
      const dd = HF.map((f) => {
        const W = f.hand.W;
        return Math.hypot(f.tipW.x - W.x, f.tipW.y - W.y, f.tipW.z - W.z);
      });
      row.dTip = mean(dd);
      row.tipNear = mean(dd.map((d) => (d < 120 ? 1 : 0)));
      row.armAway = mean(HF.map((f) => -f.bend * Math.cos(f.dir - f.aim)));
      row.dodge = mean(
        HF.map((f, i) => {
          const W = f.hand.W;
          const T = MB.yawPoint(TIP0, f.yaw);
          return dd[i] - Math.hypot(T.x - W.x, T.y - W.y, T.z - W.z);
        }),
      );
      if (sc === 'M') {
        const R = v.reaches;
        row.reaches = R.length;
        row.touchRate = R.length ? R.filter((x) => x.touched).length / R.length : NaN;
        row.gapReach = mean(R.flatMap((x) => x.gaps));
        const tt = R.filter((x) => x.touched).map((x) => x.tTouch);
        row.tTouch = tt.length ? mean(tt) : NaN;
      }
      row.touch = log.filter((x) => x.ev === 'ARM_TOUCH' && x.p?.on && x.t >= v.at && x.t < v.at + 31).length;
      row.wrap = log.filter((x) => x.ev === 'GRASP_START' && x.t >= v.at && x.t < v.at + 31).length;
      const seen = log.find((x) => x.ev === 'HAND_SEEN' && x.t >= v.at && x.t < v.at + 31);
      row.seenT = seen ? seen.t - v.at : 30;
      row.seenMode = seen?.p?.mode ?? null;
    }
    out.push(row);
  }
  return out;
}

const METRICS = {
  V: ['face', 'away', 'toward', 'tTurn', 'turnSign', 'yawAct', 'open', 'dOpen', 'breathSd', 'bend', 'up', 'voice'],
  T: ['face', 'away', 'tTurn', 'open', 'dOpen', 'breathSd', 'bend', 'up', 'voice', 'startle', 'respond'],
  H: ['face', 'away', 'toward', 'seenT', 'dTip', 'tipNear', 'armAway', 'dodge', 'touch', 'wrap', 'startle', 'open', 'dOpen', 'up', 'voice'],
  M: ['face', 'away', 'armAway', 'dodge', 'dTip', 'touchRate', 'gapReach', 'tTouch', 'touch', 'wrap', 'startle'],
};

mkdirSync(OUT, { recursive: true });
const results = {};
const t00 = Date.now();
for (const sc of SCENS) {
  for (const vocab of VOCABS) {
    for (const P of PERSONA_KEYS) {
      const rows = [];
      for (let seed = 1; seed <= N; seed++) {
        // 每个种子的来访平均成一行（种子 = 一个被试）
        const vs = trial(P, vocab, seed, sc);
        const agg = {};
        for (const k of Object.keys(vs[0])) {
          const xs = vs.map((x) => x[k]).filter((x) => typeof x === 'number' && Number.isFinite(x));
          agg[k] = xs.length ? mean(xs) : NaN;
        }
        if (HSC(sc)) agg.modes = vs.map((x) => x.seenMode);
        rows.push(agg);
      }
      results[`${sc}|v${vocab}|${P}`] = rows;
      process.stderr.write(`${sc} v${vocab} ${P} done (${((Date.now() - t00) / 1000).toFixed(0)} s)\n`);
    }
  }
}
writeFileSync(join(OUT, 'raw.json'), JSON.stringify(results));

// —— 汇总
const lines = [];
const name = (P) => `${P} ${PERSONAS[P].zh}`;
for (const sc of SCENS) {
  for (const vocab of VOCABS) {
    const ms = METRICS[sc];
    lines.push(`\n### ${sc} · 动作 v${vocab}（N = ${N}）\n`);
    lines.push(`| 指标 | ${PERSONA_KEYS.map(name).join(' | ')} | 两两 d 最小 | 最小那对 |`);
    lines.push(`|---|${PERSONA_KEYS.map(() => '---').join('|')}|---|---|`);
    for (const m of ms) {
      const cols = PERSONA_KEYS.map((P) => {
        const xs = results[`${sc}|v${vocab}|${P}`].map((r) => r[m]).filter(Number.isFinite);
        return { m: mean(xs), s: sd(xs), xs };
      });
      let dMin = Infinity;
      let pair = '';
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          const a = cols[i];
          const b = cols[j];
          const pooled = Math.sqrt((a.s ** 2 + b.s ** 2) / 2) || 1e-9;
          const d = Math.abs(a.m - b.m) / pooled;
          if (d < dMin) {
            dMin = d;
            pair = `${PERSONA_KEYS[i]}–${PERSONA_KEYS[j]}`;
          }
        }
      lines.push(`| ${m} | ${cols.map((c) => `${r2(c.m)} ± ${r2(c.s)}`).join(' | ')} | ${r2(dMin)} | ${pair} |`);
    }
    // 留一最近质心
    const vecs = [];
    for (const [pi, P] of PERSONA_KEYS.entries())
      for (const r of results[`${sc}|v${vocab}|${P}`]) vecs.push({ y: pi, x: ms.map((m) => (Number.isFinite(r[m]) ? r[m] : 0)) });
    const mu = ms.map((_, k) => mean(vecs.map((v) => v.x[k])));
    const sg = ms.map((_, k) => sd(vecs.map((v) => v.x[k])) || 1);
    for (const v of vecs) v.z = v.x.map((x, k) => (x - mu[k]) / sg[k]);
    let ok = 0;
    const conf = PERSONA_KEYS.map(() => PERSONA_KEYS.map(() => 0));
    for (const [i, v] of vecs.entries()) {
      const cents = PERSONA_KEYS.map((_, pi) => {
        const pts = vecs.filter((w, j) => w.y === pi && j !== i);
        return ms.map((_, k) => mean(pts.map((w) => w.z[k])));
      });
      let best = 0;
      let bd = Infinity;
      cents.forEach((c, pi) => {
        const d = c.reduce((a, ck, k) => a + (ck - v.z[k]) ** 2, 0);
        if (d < bd) {
          bd = d;
          best = pi;
        }
      });
      conf[v.y][best]++;
      if (best === v.y) ok++;
    }
    lines.push(`\n留一最近质心认人格：${((100 * ok) / vecs.length).toFixed(0)}%（瞎猜 25%）；混淆（行 = 真，列 = 认成）：`);
    lines.push(`| | ${PERSONA_KEYS.join(' | ')} |`);
    lines.push(`|---|${PERSONA_KEYS.map(() => '---').join('|')}|`);
    PERSONA_KEYS.forEach((P, i) => lines.push(`| ${P} | ${conf[i].join(' | ')} |`));
    if (HSC(sc)) {
      lines.push('\n第一次看见手时的态度（每次来访）：');
      for (const P of PERSONA_KEYS) {
        const ms2 = results[`${sc}|v${vocab}|${P}`].flatMap((r) => r.modes ?? []);
        const cnt = {};
        for (const x of ms2) cnt[x ?? '没看见'] = (cnt[x ?? '没看见'] ?? 0) + 1;
        lines.push(`- ${name(P)}：${Object.entries(cnt).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
      }
    }
  }
}
writeFileSync(join(OUT, 'tables.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
await server.close();
