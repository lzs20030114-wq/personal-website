// 大触手与转向的现状探针（轮回机器_触手与转向研究.md 的数字出处）。
//
//   node scripts/behavior/arm-yaw-probe.mjs [outDir]
//
// 引擎、台架换算、触手求解器一律取站上模块，这里不另写一份：
//   src/lib/linkage/behavior/engine.ts · machine-behavior.ts · tentacle3d-data.ts（Lab 1-3 同一个求解器）
// 访客是脚本里写死的一套（人来人走、方位随机、拍 / 摸 / 碰臂 / 敲），不是行为模型；数字随脚本变，
// 结论只认方向（五个种子同向）。四段：
//   A 转向与臂指令（四种人格 × 5 种子 × 成长段 240 s，只看引擎输出）
//   B 触手物理（单腱阶跃各关节谁先弯；引擎驱动 120 s 时梢端偏移与速度）
//   C 弯向（单腱各拉一次的实际方向；两种三腱分解的弯向误差：现行截零 vs 伪逆候选）
//   D 给 outDir 写一张图：四种人格 4 分钟的机身朝向（yaw-4min.html）
// 全跑约 4 分钟（C 段最慢）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] ? resolve(process.argv[2]) : null;

const HZ = 60;
const DT = 1 / HZ;
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (len(a) * len(b)))));
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
/** 梢端离电机轴的距离（mm）：基座离轴 236 + 臂长 358 + 梢端 6（行为引擎 spec §6.2） */
const R_TIP = 600;

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

/** 访客脚本：每次来访从远走到近（方位随机），停 20–50 s，其间拍 / 摸 / 碰臂 4 s / 敲，走后隔 10–35 s 再来 */
function visitor(seed, T) {
  const r = rng(seed * 7919 + 13);
  const inputs = [];
  const stays = [];
  let t = 3;
  while (t < T) {
    const bearing = (r() * 2 - 1) * Math.PI;
    const stay = 20 + r() * 30;
    inputs.push({ t, input: { kind: 'PRESENCE', band: 'far', bearing } });
    inputs.push({ t: t + 3, input: { kind: 'PRESENCE', band: 'mid', bearing } });
    inputs.push({ t: t + 6, input: { kind: 'PRESENCE', band: 'near', bearing } });
    stays.push({ t0: t, t1: Math.min(T, t + stay), bearing: bearing * DEG });
    for (let u = t + 8; u < t + stay; u += 6 + r() * 8) {
      const x = r();
      const half = r() < 0.5 ? 'L' : 'R';
      if (x < 0.45) inputs.push({ t: u, input: { kind: 'SHELL_STROKE', half, touch: 'pat' } });
      else if (x < 0.75) inputs.push({ t: u, input: { kind: 'SHELL_STROKE', half, touch: 'stroke' } });
      else if (x < 0.9) {
        inputs.push({ t: u, input: { kind: 'ARM_TOUCH', on: true } });
        inputs.push({ t: u + 4, input: { kind: 'ARM_TOUCH', on: false } });
      } else inputs.push({ t: u, input: { kind: 'KNOCK', intensity: 0.6 } });
    }
    inputs.push({ t: t + stay, input: { kind: 'PRESENCE', band: 'gone' } });
    t += stay + 10 + r() * 25;
  }
  return { inputs: inputs.sort((a, b) => a.t - b.t), stays };
}

async function main() {
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { BehaviorEngine } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
    const { PERSONA_KEYS, PERSONAS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');
    const { tendonContractions } = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
    const T3 = await server.ssrLoadModule('/src/lib/linkage/tentacle3d-data.ts');
    const { CriticallyDamped } = await server.ssrLoadModule('/src/lib/linkage/motion.ts');
    const { ARM_IDLE } = await server.ssrLoadModule('/src/lib/linkage/machine-arm.ts');

    /** 成长段一场：引擎从诞生跳到成长，喂访客脚本，每个定步回调一次 */
    const growth = (P, seed, T, inputs, onTick) => {
      const order = [P, ...PERSONA_KEYS.filter((k) => k !== P)];
      const e = new BehaviorEngine({ seed, order, loop: false, lifeRate: 1 });
      e.skip();
      e.drain();
      const t0 = e.time;
      let i = 0;
      while (e.time - t0 < T) {
        const tt = e.time - t0;
        while (i < inputs.length && inputs[i].t <= tt) e.push(inputs[i++].input);
        e.tick();
        onTick(tt, e.targets(), e.drain());
      }
    };

    /** 与台架同式：三根肌肉各走临界阻尼 ω=5，再抽线；求解器每帧 36 遍 */
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
      const joints = () => {
        const n = arm.solver.nodes;
        const pts = [n[T3.ROOTB3()], ...Array.from({ length: T3.TIP3 + 1 }, (_, i) => n[T3.SPINE3(i)])];
        const out = [];
        for (let i = 1; i < pts.length - 1; i++) out.push(angle(sub(pts[i], pts[i - 1]), sub(pts[i + 1], pts[i])) * DEG);
        return out;
      };
      const tip = () => ({ ...arm.solver.nodes[T3.TIP3] });
      return { step, joints, tip };
    };
    /** 三腱拉到基线（= 引擎 tone 1、bend 0）后静置 */
    const settledArm = () => {
      const a = makeArm();
      const b = ARM_IDLE.base;
      for (let i = 0; i < 240; i++) a.step([b, b, b]);
      return a;
    };
    /** 实际弯向：0 = 上（腱 0），左为正（sim +x = 世界 +Y = 面朝 −X 时的右手边，故取负） */
    const bendDir = (d) => -Math.atan2(d.x, d.z);

    // ───────────────────────────────────────────── A
    console.log('## A 转向与臂指令（成长段 240 s × 5 种子）');
    const T = 240;
    for (const P of PERSONA_KEYS) {
      const moves = [];
      let turning = 0;
      let n = 0;
      let cMax = 0;
      const bendHist = [0, 0, 0, 0, 0];
      const orient = { toward: 0, away: 0, random: 0 };
      for (let seed = 1; seed <= 5; seed++) {
        const { inputs } = visitor(seed, T);
        let prevYaw = 0;
        let prevW = 0;
        let cur = null;
        growth(P, seed, T, inputs, (tt, tg, recs) => {
          for (const r of recs) if (r.ev === 'ORIENT') orient[r.p.mode] = (orient[r.p.mode] ?? 0) + 1;
          const w = (tg.yaw - prevYaw) * HZ;
          const acc = (w - prevW) * HZ;
          prevW = w;
          if (Math.abs(w) > 0.02) {
            if (!cur) cur = { t: tt, y0: prevYaw, wMax: 0, aMax: 0 };
            cur.wMax = Math.max(cur.wMax, Math.abs(w));
            cur.aMax = Math.max(cur.aMax, Math.abs(acc));
            turning++;
          } else if (cur) {
            cur.d = tg.yaw - cur.y0;
            cur.dur = tt - cur.t;
            if (Math.abs(cur.d) > 0.05) moves.push(cur);
            cur = null;
          }
          prevYaw = tg.yaw;
          bendHist[Math.min(4, Math.floor(tg.arm.bend * 5))]++;
          cMax = Math.max(cMax, ...tendonContractions(tg.arm));
          n++;
        });
      }
      const amp = moves.map((m) => Math.abs(m.d) * DEG).sort((a, b) => a - b);
      const longWay = moves.filter((m) => Math.abs(m.d) > Math.PI + 1e-3).length;
      const wMax = Math.max(...moves.map((m) => m.wMax));
      console.log(
        `${P} ${PERSONAS[P].zh}：每分钟转 ${(moves.length / ((5 * T) / 60)).toFixed(1)} 次 · 转身占时 ${Math.round((100 * turning) / n)}% · ` +
          `幅度中位 ${q(amp, 0.5).toFixed(0)}° / p90 ${q(amp, 0.9).toFixed(0)}° · 绕远路 ${longWay}/${moves.length} · ` +
          `峰值角速度 ${wMax.toFixed(2)} rad/s（梢端 ${Math.round(wMax * R_TIP)} mm/s）· 角加速度 ≤${Math.max(...moves.map((m) => m.aMax)).toFixed(2)} rad/s² · ` +
          `朝向来源 朝人 ${orient.toward} / 背人 ${orient.away} / 随便看 ${orient.random} | ` +
          `臂弯曲分布(0–0.2–0.4–0.6–0.8–1) ${bendHist.map((h) => Math.round((100 * h) / n)).join('/')}% · 最大腱收缩 ${cMax.toFixed(2)}`,
      );
    }

    // ───────────────────────────────────────────── B
    console.log('\n## B 触手物理（Lab 1-3 求解器）');
    for (const c of [0.5, 0.68, 1.0]) {
      const a = settledArm();
      const tip0 = a.tip();
      const j0 = a.joints();
      const trace = [];
      for (let i = 0; i < 6 * HZ; i++) {
        a.step([c, ARM_IDLE.base, ARM_IDLE.base]);
        trace.push({ t: (i + 1) * DT, j: a.joints(), tip: a.tip() });
      }
      const jEnd = trace[trace.length - 1].j;
      const t50 = jEnd.map((e, k) => {
        const goal = j0[k] + 0.5 * (e - j0[k]);
        return trace.find((s) => (e >= j0[k] ? s.j[k] >= goal : s.j[k] <= goal))?.t.toFixed(2) ?? '—';
      });
      const D = len(sub(trace[trace.length - 1].tip, tip0));
      let vMax = 0;
      for (let i = 1; i < trace.length; i++) vMax = Math.max(vMax, len(sub(trace[i].tip, trace[i - 1].tip)) * HZ);
      console.log(
        `单腱 0 拉到 ${c}：各关节（根 → 梢）终角 [${jEnd.map((x) => x.toFixed(0)).join(', ')}]° 合计 ${jEnd.reduce((s, x) => s + x, 0).toFixed(0)}° · ` +
          `到半程的时刻 [${t50.join(', ')}] s · 梢端位移 ${D.toFixed(0)} mm · 梢端峰速 ${vMax.toFixed(0)} mm/s`,
      );
    }
    {
      const a = settledArm();
      const rest = a.tip();
      let prev = a.tip();
      const defl = [];
      const v = [];
      const inputs = [
        { t: 4, input: { kind: 'PRESENCE', band: 'near', bearing: 1.2 } },
        { t: 10, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } },
        { t: 25, input: { kind: 'ARM_TOUCH', on: true } },
        { t: 31, input: { kind: 'ARM_TOUCH', on: false } },
        { t: 45, input: { kind: 'KNOCK', intensity: 0.6 } },
        { t: 60, input: { kind: 'SHELL_STROKE', half: 'R', touch: 'stroke' } },
        { t: 80, input: { kind: 'PRESENCE', band: 'gone' } },
      ];
      growth('C', 3, 120, inputs, (tt, tg) => {
        a.step(tendonContractions(tg.arm));
        const tip = a.tip();
        const d = sub(tip, rest);
        defl.push(Math.hypot(d.x, d.z));
        v.push(len(sub(tip, prev)) * HZ);
        prev = tip;
      });
      defl.sort((x, y) => x - y);
      v.sort((x, y) => x - y);
      console.log(
        `引擎驱动 120 s（好奇型，种子 3）：梢端偏离笔直 中位 ${q(defl, 0.5).toFixed(0)} / p90 ${q(defl, 0.9).toFixed(0)} / 最大 ${defl[defl.length - 1].toFixed(0)} mm · ` +
          `梢端速度 中位 ${q(v, 0.5).toFixed(0)} / p90 ${q(v, 0.9).toFixed(0)} / 最大 ${v[v.length - 1].toFixed(0)} mm/s`,
      );
    }

    // ───────────────────────────────────────────── C
    console.log('\n## C 弯向（0 = 上，左为正）');
    const settleTo = (c) => {
      const a = settledArm();
      const t0 = a.tip();
      for (let i = 0; i < 300; i++) a.step(c);
      return bendDir(sub(a.tip(), t0));
    };
    for (const k of [0, 1, 2]) {
      const c = [ARM_IDLE.base, ARM_IDLE.base, ARM_IDLE.base];
      c[k] = ARM_IDLE.base + ARM_IDLE.span;
      console.log(`单腱 ${k}：实际弯向 ${(settleTo(c) * DEG).toFixed(0)}°（引擎假设 ${(wrap((TAU * k) / 3) * DEG).toFixed(0)}°）`);
    }
    // 伪逆候选：份额按 cos 分配、允许拮抗腱回松，但不低于缆刚绷直的那一点；主腱峰值与现行同幅
    const slackC = T3.TENTACLE3D.slack / (T3.TENTACLE3D.slack + T3.TENTACLE3D.pullMax);
    const pinv = (arm) => {
      const raw = [0, 1, 2].map((k) => Math.cos(arm.dir - (TAU * k) / 3));
      const g = 1 / Math.max(...raw);
      let c = raw.map((r) => ARM_IDLE.base * arm.tone + ARM_IDLE.span * arm.bend * r * g);
      const lo = Math.min(...c);
      if (lo < slackC + 0.01) c = c.map((x) => x + (slackC + 0.01 - lo));
      return c.map((x) => Math.min(1, x));
    };
    for (const [name, fn] of [
      ['现行（负份额截零）', tendonContractions],
      ['伪逆候选（拮抗腱可回松到绷直点）', pinv],
    ]) {
      const rows = [];
      for (const bend of [0.3, 0.6, 1.0]) {
        const errs = [];
        for (let d = -180; d < 180; d += 15) {
          const dir = d / DEG;
          errs.push(Math.abs(wrap(settleTo(fn({ tone: 1, bend, dir })) - dir)) * DEG);
        }
        errs.sort((x, y) => x - y);
        rows.push(`弯曲 ${bend}：中位 ${q(errs, 0.5).toFixed(0)}° / 最大 ${errs[errs.length - 1].toFixed(0)}°`);
      }
      console.log(`${name}的弯向误差 · ${rows.join(' · ')}`);
    }

    // ───────────────────────────────────────────── D
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      const seed = 1;
      const { inputs, stays } = visitor(seed, T);
      const rows = {};
      for (const P of PERSONA_KEYS) {
        const pts = [];
        const spins = [];
        let prev = 0;
        let cur = null;
        let turning = 0;
        let n = 0;
        growth(P, seed, T, inputs, (tt, tg) => {
          const y = tg.yaw;
          if (Math.abs((y - prev) * HZ) > 0.02) {
            if (!cur) cur = { t0: tt, y0: prev };
            turning++;
          } else if (cur) {
            if (Math.abs(y - cur.y0) > Math.PI + 1e-3) spins.push({ t0: cur.t0, t1: tt });
            cur = null;
          }
          prev = y;
          if (n++ % 15 === 0) pts.push([tt, y * DEG]);
        });
        rows[P] = { name: PERSONAS[P].zh, pts, spins, share: turning / n };
      }
      writeFileSync(join(OUT, 'yaw-4min.html'), yawChart({ T, stays, rows }));
      console.log(`\n图：${join(OUT, 'yaw-4min.html')}`);
    }
  } finally {
    await server.close();
  }
}

/** 四种人格 4 分钟的机身朝向：小多图（每行一种人格，单色线 + 在场灰带 + 人的方位虚线 + 绕远路橙段） */
function yawChart({ T, stays, rows }) {
  const W = 1100;
  const left = 150;
  const right = 24;
  const top = 92;
  const rowH = 118;
  const gap = 22;
  const keys = Object.keys(rows);
  const H = top + keys.length * rowH + (keys.length - 1) * gap + 54;
  const plotW = W - left - right;
  const x = (t) => left + (t / T) * plotW;
  const yOf = (row) => (deg) => top + row * (rowH + gap) + ((180 - deg) / 360) * rowH;
  const pl = (pts, y) => pts.map(([t, d]) => `${x(t).toFixed(1)},${y(d).toFixed(1)}`).join(' ');
  let svg = `<text x="${left}" y="30" font-size="17" font-weight="600" fill="var(--text-primary)">四种人格各 4 分钟：机身朝向随时间的变化（同一份访客脚本，种子 1，成长段）</text>
<g font-size="13" fill="var(--text-secondary)">
  <line x1="${left}" y1="58" x2="${left + 28}" y2="58" stroke="var(--series-1)" stroke-width="2"/>
  <text x="${left + 36}" y="62">机身朝向（度，0 = 初始正前方，左为正）</text>
  <rect x="${left + 330}" y="51" width="28" height="14" fill="var(--band)"/>
  <line x1="${left + 330}" y1="58" x2="${left + 358}" y2="58" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="3 3"/>
  <text x="${left + 366}" y="62">有人在场（虚线 = 人的方位）</text>
  <line x1="${left + 590}" y1="58" x2="${left + 618}" y2="58" stroke="var(--series-2)" stroke-width="5" stroke-linecap="round"/>
  <text x="${left + 626}" y="62">一次转过 180° 以上（±180° 限位逼着绕远路）</text>
</g>`;
  keys.forEach((k, row) => {
    const r = rows[k];
    const y = yOf(row);
    const y0 = top + row * (rowH + gap);
    for (const s of stays) {
      svg += `<rect x="${x(s.t0)}" y="${y0}" width="${x(s.t1) - x(s.t0)}" height="${rowH}" fill="var(--band)"/>`;
      svg += `<line x1="${x(s.t0)}" y1="${y(s.bearing)}" x2="${x(s.t1)}" y2="${y(s.bearing)}" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    }
    for (const g of [-180, -90, 0, 90, 180]) {
      const limit = Math.abs(g) === 180;
      svg += `<line x1="${left}" y1="${y(g)}" x2="${W - right}" y2="${y(g)}" stroke="var(${limit ? '--axis' : '--grid'})" stroke-width="1"${limit ? ' stroke-dasharray="6 4"' : ''}/>`;
      if (g % 180 === 0) svg += `<text x="${left - 8}" y="${y(g) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${g > 0 ? '+' : ''}${g}°</text>`;
    }
    for (const s of r.spins) {
      const seg = r.pts.filter(([t]) => t >= s.t0 && t <= s.t1);
      if (seg.length > 1) svg += `<polyline points="${pl(seg, y)}" fill="none" stroke="var(--series-2)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    }
    svg += `<polyline points="${pl(r.pts, y)}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>`;
    svg += `<text x="16" y="${y0 + 26}" font-size="15" font-weight="600" fill="var(--text-primary)">${k} · ${r.name}</text>`;
    svg += `<text x="16" y="${y0 + 48}" font-size="12.5" fill="var(--text-secondary)">转身占时 ${Math.round(r.share * 100)}%</text>`;
    svg += `<text x="16" y="${y0 + 67}" font-size="12.5" fill="var(--text-secondary)">绕远路 ${r.spins.length} 次</text>`;
  });
  const yAxis = top + keys.length * rowH + (keys.length - 1) * gap;
  for (let t = 0; t <= T; t += 30) {
    svg += `<line x1="${x(t)}" y1="${yAxis}" x2="${x(t)}" y2="${yAxis + 5}" stroke="var(--axis)"/>`;
    svg += `<text x="${x(t)}" y="${yAxis + 20}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${t}</text>`;
  }
  svg += `<text x="${left + plotW / 2}" y="${yAxis + 42}" text-anchor="middle" font-size="12" fill="var(--text-secondary)">时间（秒）</text>`;
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>机身朝向</title>
<style>
.viz-root { color-scheme: light; --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --series-1: #2a78d6; --series-2: #eb6834; --band: #f0efec; }
body { margin: 0; background: #fcfcfb; font-family: system-ui, -apple-system, "Segoe UI", "WenQuanYi Zen Hei", sans-serif; }
</style></head><body><div class="viz-root"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="四种人格 4 分钟的机身朝向曲线">${svg}</svg></div></body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
