// 三腱换算的标定（machine-behavior.ts 的 ARM_DRIVE / ARM_CHORD / bendDirError 的数字出处）。
//
//   node scripts/behavior/arm-drive-calib.mjs
//
// 触手求解器与肌肉取站上模块（Lab 1-3 同一个，tentacle3d-data.ts + motion.ts），不另写一份。
// 每个工况：三腱拉到基线 0.34 静置 4 s，再按指令拉 6 s，量稳态：
//   弦角 = 基座 → 梢端连线偏离静息臂轴的角；卷曲 = 梢端切线相对根部切线转过的角；
//   弯向误差 = 梢端位移的方位 − 指令方位（0 = 上，左为正）。
// 两段：
//   1 三种分解对照（现行截零 / 2/3 余弦 + 绷直点抬升 / 同上 + 弯向补偿）：12 个方向 × 4 档差动
//   2 新分解（带补偿）的弦角表：各方向平均
// 全跑约 3 分钟。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HZ = 60;
const DT = 1 / HZ;
const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (len(a) * len(b)))));

async function main() {
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const T3 = await server.ssrLoadModule('/src/lib/linkage/tentacle3d-data.ts');
    const { CriticallyDamped } = await server.ssrLoadModule('/src/lib/linkage/motion.ts');
    const { ARM_IDLE } = await server.ssrLoadModule('/src/lib/linkage/machine-arm.ts');
    const MB = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
    const BASE = ARM_IDLE.base;
    const SPAN = ARM_IDLE.span;

    /** 与台架同式：三根肌肉各走临界阻尼 ω=5，再抽线；求解器每帧 36 遍 */
    const makeArm = () => {
      const arm = T3.createTentacle3();
      const m = [0, 1, 2].map(() => new CriticallyDamped(5));
      const step = (c) => {
        for (let k = 0; k < 3; k++) {
          m[k].target = c[k];
          if (m[k].update(DT)) T3.applyContraction3(arm.solver, arm.tendons[k], m[k].value);
        }
        arm.solver.step(DT, T3.TENTACLE3D.sweeps);
      };
      return { arm, step };
    };
    const settled = () => {
      const a = makeArm();
      for (let i = 0; i < 240; i++) a.step([BASE, BASE, BASE]);
      return a;
    };
    const rest = settled();
    const N = rest.arm.solver.nodes;
    const tip0 = { ...N[T3.TIP3] };
    const axis = sub(tip0, N[T3.SPINE3(0)]);
    const tan0 = sub(N[T3.SPINE3(1)], N[T3.SPINE3(0)]);
    const measure = (c) => {
      const a = settled();
      for (let i = 0; i < 360; i++) a.step(c);
      const n = a.arm.solver.nodes;
      const tip = n[T3.TIP3];
      const d = sub(tip, tip0);
      return {
        chord: angle(sub(tip, n[T3.SPINE3(0)]), axis) * DEG,
        curl: angle(sub(tip, n[T3.SPINE3(T3.TIP3 - 1)]), tan0) * DEG,
        // sim +x = 世界 +Y = 机身朝 −X 时的右手边，故左为正要取负
        dir: -Math.atan2(d.x, d.z),
      };
    };
    // 差动 D 直接给：bend = D/span（D > span 的部分走 wrap）
    const cmd = (D, dir) => {
      const bend = Math.min(1, D / SPAN);
      return { tone: 1, bend, dir, wrap: Math.max(0, D - SPAN) / MB.ARM_DRIVE.wrapSpan };
    };
    const raw23 = (D, dir) => {
      let c = [0, 1, 2].map((k) => BASE + D * (2 / 3) * Math.cos(dir - (TAU * k) / 3));
      const lo = Math.min(...c);
      if (lo < MB.ARM_DRIVE.floor) c = c.map((x) => x + (MB.ARM_DRIVE.floor - lo));
      return c.map((x) => Math.min(1, x));
    };
    const DIRS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
    const DS = [0.2, 0.34, 0.45, 0.5];
    const variants = [
      ['现行截零（M2–10-06）', (D, dir) => MB.tendonContractionsClip({ tone: 1, bend: D / SPAN, dir })],
      ['2/3 余弦 + 绷直点抬升（无补偿）', raw23],
      ['2/3 余弦 + 抬升 + 弯向补偿（现行）', (D, dir) => MB.tendonContractions(cmd(D, dir))],
    ];
    console.log('## 1 三种分解：弦角（°）/ 弯向误差（°）');
    const chordSum = DS.map(() => 0);
    for (const [name, fn] of variants) {
      console.log(`\n### ${name}`);
      let worst = 0;
      for (const deg of DIRS) {
        const row = DS.map((D, j) => {
          const r = measure(fn(D, deg / DEG));
          const e = wrap(r.dir - deg / DEG) * DEG;
          worst = Math.max(worst, Math.abs(e));
          if (fn === variants[2][1]) chordSum[j] += r.chord;
          return `D${D}: ${r.chord.toFixed(0)}° / ${e >= 0 ? '+' : ''}${e.toFixed(0)}°`;
        });
        console.log(`  ${String(deg).padStart(4)}°  ${row.join('  ·  ')}`);
      }
      console.log(`  最大弯向误差 ${worst.toFixed(0)}°`);
    }
    console.log('\n## 2 现行分解的弦角表（各方向平均）');
    DS.forEach((D, j) => console.log(`  D ${D} → ${(chordSum[j] / DIRS.length).toFixed(1)}°（表内 ${MB.chordOfDrive(D).toFixed(1)}°）`));
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
