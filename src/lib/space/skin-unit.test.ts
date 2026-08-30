import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SKIN_REF_NAMES, SKIN_UNITS, SKIN_V7_SPECS, fan, skinSiteOpts } from './skin-data';
import { SKIN, SKIN_ROOT_FIX, coreY, createSkinUnit, renderSmooth, type SkinUnit } from './skin-unit';

/**
 * 守门：TS 引擎 = skin_sim_v7_final.py 的 1:1 移植。
 * 基准 skin-ref.json 由 scripts/skin-ref/dump_skin_ref.py 生成（物理逐字取自 v7），
 * 位置存 9 位小数 ⇒ 基准自身量化误差 5e-10；实测四单元全程最大偏差 ≈5e-10，
 * 即移植与 numpy 在基准精度内逐位一致。容差取 2e-9（量化 + 少许余量）——
 * 若将来有人「顺手改写」热循环里的运算次序（Jacobi 快照→Gauss–Seidel、
 * sqrt→hypot、均值求和序），这里会先红。
 */
const TOL = 2e-9;

interface RefUnit {
  n: number;
  glued: number[];
  chains: [number, number, number][][];
  panels: [number, number][];
  checkpoints: {
    step: number;
    r: number;
    len: number;
    pos: [number, number][];
    lockedCount: number;
  }[];
  lockedSeq: [number, number, number][];
}

const ref = JSON.parse(
  readFileSync(join(__dirname, 'skin-ref.json'), 'utf8'),
) as {
  units: Record<string, RefUnit>;
};

interface RunResult {
  sim: SkinUnit;
  /** 每个检查点处的位置最大偏差与锁定数 */
  cpDiffs: { step: number; maxDiff: number; locked: number }[];
  /** 每颗键锁定时的 step（与 sim.locked 同序） */
  lockSteps: number[];
}

const runs = new Map<string, RunResult>();

beforeAll(() => {
  for (const def of SKIN_UNITS) {
    const R = ref.units[SKIN_REF_NAMES[def.key]];
    // 对照永远跑 v7 原键谱（阶梯挑台的展示键谱已按用户拍板改比例，基准不动）
    const sim = createSkinUnit(SKIN_V7_SPECS[def.key]);
    const cpDiffs: RunResult['cpDiffs'] = [];
    const lockSteps: number[] = [];
    let ci = 0;
    let seen = 0;
    for (let step = 0; step < SKIN.STEPS; step++) {
      sim.advance();
      while (seen < sim.locked.length) {
        lockSteps.push(step);
        seen++;
      }
      const cp = R.checkpoints[ci];
      if (cp && cp.step === step) {
        let maxDiff = 0;
        for (let i = 0; i < sim.n; i++) {
          maxDiff = Math.max(
            maxDiff,
            Math.abs(sim.px[i] - cp.pos[i][0]),
            Math.abs(sim.py[i] - cp.pos[i][1]),
          );
        }
        cpDiffs.push({ step, maxDiff, locked: sim.locked.length });
        ci++;
      }
    }
    runs.set(def.key, { sim, cpDiffs, lockSteps });
  }
});

describe.each(SKIN_UNITS.map((d) => [d.key] as const))('skin unit %s', (key) => {
  const R = (): RefUnit => ref.units[SKIN_REF_NAMES[key]];
  const run = (): RunResult => runs.get(key)!;

  it('build 与参考一致（节点数 / 贴合段 / 键谱链序 / 面板）', () => {
    const { sim } = run();
    expect(sim.n).toBe(R().n);
    expect(sim.glued).toEqual(R().glued);
    expect(sim.chains).toEqual(R().chains);
    expect(sim.panels).toEqual(R().panels);
  });

  it(`全程位置与 Python 参考一致（各检查点 maxDiff < ${TOL}）`, () => {
    const { cpDiffs } = run();
    expect(cpDiffs.length).toBe(R().checkpoints.length);
    for (const cp of cpDiffs) expect(cp.maxDiff, `step ${cp.step}`).toBeLessThan(TOL);
  });

  it('锁定键序列与参考逐颗一致（含 rb 与追加序）', () => {
    const { sim, cpDiffs } = run();
    expect(sim.locked).toEqual(R().lockedSeq);
    for (let k = 0; k < cpDiffs.length; k++) {
      expect(cpDiffs[k].locked).toBe(R().checkpoints[k].lockedCount);
    }
  });

  it('拉链纪律：step≤950 的锁定按跨度从大到小逐颗放行', () => {
    const { sim, lockSteps } = run();
    let lastSpan = Infinity;
    for (let k = 0; k < sim.locked.length; k++) {
      if (lockSteps[k] > 950) continue; // 纪律解除期（排掉滞留气泡），允许越序
      const span = sim.locked[k][1] - sim.locked[k][0];
      expect(span).toBeLessThanOrEqual(lastSpan);
      lastSpan = span;
    }
  });

  it('终态：r=R1、贴合段钉死在芯上、锁定键保持在键长（滞回的物理来源）', () => {
    const { sim } = run();
    expect(sim.done).toBe(true);
    expect(sim.r).toBeCloseTo(SKIN.R1, 12);
    const ys = new Float64Array(sim.n);
    coreY(sim.spec, SKIN.R1, ys);
    for (const g of sim.glued) {
      expect(sim.px[g]).toBe(0);
      expect(sim.py[g]).toBe(ys[g]);
    }
    for (const [i, j, rb] of sim.locked) {
      const d = Math.hypot(sim.px[j] - sim.px[i], sim.py[j] - sim.py[i]);
      expect(Math.abs(d - rb), `bond ${i}-${j}`).toBeLessThan(0.02);
    }
  });
});

describe('skin unit 引擎公共行为', () => {
  it('done 后 advance 是 no-op（位置与锁定不再变）', () => {
    const { sim } = runs.get('pocket')!;
    const px = Float64Array.from(sim.px);
    const py = Float64Array.from(sim.py);
    const nLocked = sim.locked.length;
    sim.advance();
    expect(sim.step).toBe(SKIN.STEPS);
    expect(sim.locked.length).toBe(nLocked);
    expect(Array.from(sim.px)).toEqual(Array.from(px));
    expect(Array.from(sim.py)).toEqual(Array.from(py));
  });

  it('renderSmooth 只用于绘图：长度不变、无 NaN、端点做 edge 补边平均', () => {
    const px = Float64Array.from([0, 0, 0, 3, 0, 0]);
    const py = Float64Array.from([0, 1, 2, 3, 4, 5]);
    const s = renderSmooth(px, py);
    expect(s.x.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(Number.isFinite(s.x[i])).toBe(true);
      expect(Number.isFinite(s.y[i])).toBe(true);
    }
    // w=3 edge 补边：q[0] = (p0+p0+p1)/3；中点 = 三点平均
    expect(s.y[0]).toBeCloseTo((0 + 0 + 1) / 3, 12);
    expect(s.x[3]).toBeCloseTo((0 + 3 + 0) / 3, 12);
    // 物理数据不做美化：输入数组原样
    expect(px[3]).toBe(3);
  });

  it('站方修正（skinSiteOpts，台架实际跑的路径）：贴轴、不穿芯、键照锁、r1 到位', () => {
    // 用户 2026-08-18/19 数轮拍板：根部贴轴（芯墙+硬贴轴）+ 袋收缩终点 r1=0.66 +
    // 阶梯方箱整形与近方比例。跑到 step 1000（键全部锁完、r 已到终点）断言全部性质。
    for (const def of SKIN_UNITS) {
      const sim = createSkinUnit(def.spec, skinSiteOpts(def));
      for (let s = 0; s < 1000; s++) sim.advance();
      // 键照锁：键谱全员锁定（对自己的键位图数，不对 v7 基准——阶梯键谱已改比例）
      const allBonds = sim.chains.flat();
      const key = (b: readonly number[]): string => `${b[0]}-${b[1]}`;
      expect(sim.locked.length, def.key).toBe(allBonds.length);
      expect(new Set(sim.locked.map(key)), def.key).toEqual(new Set(allBonds.map(key)));
      // 每单元一个收缩自由度 ℓ：r 落在该单元自己的终点（袋 0.66，其余全深 R1）
      expect(sim.r, def.key).toBeCloseTo(def.r1 ?? SKIN.R1, 12);
      // 芯墙：全程投影后任何节点不越到轴左侧
      for (let i = 0; i < sim.n; i++) expect(sim.px[i], `${def.key} node ${i}`).toBeGreaterThanOrEqual(0);
      // 硬贴轴：根部缓冲料（键谱围合区之外的自由节点）迭代收尾时 x 恰为 0
      expect(sim.rootFree.length, def.key).toBeGreaterThan(0);
      for (const i of sim.rootFree) expect(sim.px[i], `${def.key} root ${i}`).toBe(0);
    }
  });

  it('方箱整形（boxSquare，阶梯挑台）：贴轴方正、端面平直、面无斜率、键长全等', () => {
    // 用户 2026-08-19 拍板「最终的形态应该是一个方形」。三个「不方」来源的守门：
    // 浮轴（嘴角 x=0）/ 端面鼓弧（x 波动 <2px）/ 顶底面倾斜（斜率 <1.5px）。
    const def = SKIN_UNITS.find((d) => d.key === 'stepped')!;
    expect(def.boxSquare).toBe(true);
    const sim = createSkinUnit(def.spec, skinSiteOpts(def));
    for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
    const outer = sim.chains[0][0]; // 最外键对 = 嘴角
    expect(sim.px[outer[0]]).toBe(0);
    expect(sim.px[outer[1]]).toBe(0);
    const [pa, pb] = sim.panels[0]; // 端面
    let xMin = Infinity;
    let xMax = -Infinity;
    for (let i = pa; i <= pb; i++) {
      xMin = Math.min(xMin, sim.px[i]);
      xMax = Math.max(xMax, sim.px[i]);
    }
    expect((xMax - xMin) * 100).toBeLessThan(0.5); // px（世界 ×100）；硬投影后实测 0.0
    // 顶/底面斜率（内角 vs 外角的 y 差）
    expect(Math.abs(sim.py[pa] - sim.py[outer[0]]) * 100).toBeLessThan(1.5);
    expect(Math.abs(sim.py[pb] - sim.py[outer[1]]) * 100).toBeLessThan(1.5);
    // 顶/底面平直（用户 2026-08-19 拍板「不够平直」→ 压平后 y 波动 ≤2.5px；
    // 此前 ±2.3px 的键间起伏当织物质感保留过一轮，被否）
    for (const [a, b] of [
      [outer[0], pa],
      [pb, outer[1]],
    ]) {
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = a; i <= b; i++) {
        mn = Math.min(mn, sim.py[i]);
        mx = Math.max(mx, sim.py[i]);
      }
      expect((mx - mn) * 100, `face ${a}-${b}`).toBeLessThan(0.5); // 硬投影后实测 0.0
    }
    // 梯挡键长全等（矩形的高）
    for (const [i, j, rb] of sim.locked) {
      const d = Math.hypot(sim.px[j] - sim.px[i], sim.py[j] - sim.py[i]);
      expect(Math.abs(d - rb) * 100, `bond ${i}-${j}`).toBeLessThan(0.5);
    }
    // 根部缓冲沿轴均匀排布（用户「左侧不要收紧，做到 P2 那样」）：贴轴 + 等距 +
    // 单调——富余褶皱不许在嘴角背后拱成折返疙瘩
    for (let k = 0; k < sim.rootFree.length; ) {
      const a = sim.rootFree[k];
      let b = a;
      while (k + 1 < sim.rootFree.length && sim.rootFree[k + 1] === b + 1) {
        b++;
        k++;
      }
      k++;
      const step = (sim.py[b + 1] - sim.py[a - 1]) / (b + 1 - (a - 1));
      for (let i = a; i <= b; i++) {
        expect(sim.px[i], `root ${i}`).toBe(0);
        expect(sim.py[i], `root ${i}`).toBeCloseTo(sim.py[a - 1] + step * (i - (a - 1)), 9);
      }
    }
  });

  it('anchorEnd（收缩注册在底端）= 纯平移：形态逐位不变，只是底端钉住、顶端下降',
     { timeout: 30000 }, () => {
    // 用户 2026-08-22「把收缩的固定点和方向反转」。默认路径 = v7 原行为
    // （顶端钉在天花、下缘随收缩上跑）；anchorEnd 反过来。因为约束全是相对量、
    // 重力逐节点均匀，两条路径的解只差一个逐帧统一的纵向偏移——这条守门就是
    // 那句话的硬证据（若哪天引擎引入了与绝对 y 相关的项，这里先红）。
    const spec = SKIN_UNITS[1].spec;
    const a = createSkinUnit(spec, { ...SKIN_ROOT_FIX });
    const b = createSkinUnit(spec, { ...SKIN_ROOT_FIX, anchorEnd: true });
    const foot0 = b.py[b.n - 1]; // 底端的初始位（锚）
    for (let s = 0; s < 600; s++) {
      a.advance();
      b.advance();
    }
    expect(Math.abs(a.py[0])).toBe(0); // 默认：顶端钉在天花（钉轴给的是 −0）
    expect(b.coreTop).toBeLessThan(-0.1); // 反转：顶端已经降下来
    expect(b.py[b.n - 1]).toBe(foot0); // 底端一动不动
    const d = b.py[0] - a.py[0];
    expect(d).toBeLessThan(0); // 整体下移
    // 容差 2e-4 世界单位 = 0.02px：两条路径不是逐位相同——每帧被「传送」的是
    // 哪一段贴合料不一样（默认是下面那段往上跑、反转后是上面那段往下走），
    // Verlet 的隐式速度会因此有极小差别。四个单元全程实测最大偏差 4.85e-5
    // （= 0.005px，蘑菇挑台 step 899），远在任何可见量之下；形态实测（终态
    // 高度 / 凸出宽度 / 锁定键集合）逐位相同。
    for (let i = 0; i < a.n; i++) {
      expect(Math.abs(b.px[i] - a.px[i]), `px ${i}`).toBeLessThan(2e-4);
      expect(Math.abs(b.py[i] - a.py[i] - d), `py ${i}`).toBeLessThan(2e-4);
    }
  });

  it('SKIN_ROOT_FIX 是可选项：默认构造不带修正（v7 逐字路径，对照测试跑的就是它）', () => {
    // 参考数据里 v7 全程会轻微越轴（实测 minX≈-0.005…-0.012）；默认路径若被
    // 修正污染，这里与上方的逐位对照会先后变红。
    const sim = createSkinUnit(SKIN_UNITS[3].spec);
    for (let s = 0; s < 3; s++) sim.advance();
    let minX = Infinity;
    for (let i = 0; i < sim.n; i++) minX = Math.min(minX, sim.px[i]);
    expect(minX).toBeLessThan(0); // v7 在 step 2 就有节点越到轴左（参考实测）
  });

  it('四形态终点确实互异（键谱是设计对象：同协议不同键位图 → 不同形态）', () => {
    const spans = SKIN_UNITS.map((d) => {
      const { sim } = runs.get(d.key)!;
      let maxX = 0;
      let minY = 0;
      for (let i = 0; i < sim.n; i++) {
        maxX = Math.max(maxX, sim.px[i]);
        minY = Math.min(minY, sim.py[i]);
      }
      return `${maxX.toFixed(2)}/${minY.toFixed(2)}`;
    });
    expect(new Set(spans).size).toBe(SKIN_UNITS.length);
  });

  it('boxSquare 强度真实分级（Lab.08 过渡的机理）：sq 0 → 0.5 → 1 垂度单调收平、' +
     '键照锁；true 与 1 等价', () => {
    // 固定键谱（Lab.08 中后段量级），只变强度——分级若失效（任何 sq>0 都收敛成
    // 全量方箱），过渡会退回二值切换，正是用户否决的首版毛病。
    const spec: Parameters<typeof createSkinUnit>[0] = [
      ['g', 53],
      ['f', 65, fan(32, 8, 27, 2, 0.27), [[24, 40]]],
      ['g', 50],
    ];
    const droopOf = (sq: number | true | undefined): { droop: number; locked: number } => {
      const opts = { ...SKIN_ROOT_FIX, ...(sq !== undefined ? { boxSquare: sq } : {}) };
      const sim = createSkinUnit(spec, opts);
      for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
      const ch = sim.chains[0];
      let minY = Infinity;
      for (let i = ch[0][0]; i <= ch[0][1]; i++) minY = Math.min(minY, sim.py[i]);
      return { droop: sim.py[ch[0][1]] - minY, locked: sim.locked.length };
    };
    const s0 = droopOf(undefined);
    const s5 = droopOf(0.5);
    const s1 = droopOf(1);
    const sT = droopOf(true);
    expect(s0.locked).toBe(10);
    expect(s5.locked).toBe(10);
    expect(s1.locked).toBe(10);
    expect(s5.droop).toBeLessThan(s0.droop * 0.6); // 半强度显著收平……
    expect(s5.droop).toBeGreaterThan(s1.droop); // ……但还没到全量（分级真实）
    expect(sT.droop).toBe(s1.droop); // true ≡ 1
    // 四条 168 节的带各跑满 1500 步 ≈ 5.8s，正卡在 vitest 5s 默认预算上：
    // 套件并行负载一高就超时（2026-08-29 加进第十二台后实测）。给显式预算，
    // 与本仓库其它引擎用例同款做法——它不是慢，是预算给小了。
  }, 60_000);

  it('端面投影的几何门（candC 崩法回归）：rb 远小于端面弧长时渐入档不硬压——' +
     '形态有界、键照锁、端面保留鼓弧', () => {
    // 弦弧比 0.22/0.32 ≈ 0.69 << 0.85：投影必须不参与，否则每迭代把富余材料
    // 挤出端面，线稿实验实测形态直接崩（相邻距离 11+）。键谱 = Lab.08 定版系列
    // 6 号单元（真实走这条路径的单元，锁定完备性已由阵列物理冒烟另行守住）。
    const spec: Parameters<typeof createSkinUnit>[0] = [
      ['g', 53],
      ['f', 64, fan(32, 8, 27, 2, 0.22), [[24, 40]]],
      ['g', 50],
    ];
    const run = (opts: Parameters<typeof createSkinUnit>[1]): SkinUnit => {
      const sim = createSkinUnit(spec, opts);
      for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
      return sim;
    };
    const base = run({ ...SKIN_ROOT_FIX }); // 无 box 基线
    const sim = run({ ...SKIN_ROOT_FIX, boxSquare: 0.4 });
    expect(sim.locked.length).toBe(10);
    // 与基线对照：门关闭时只剩温和的贴轴/压肩，量级必须与基线同款
    // （candC 崩法 = 材料被逐迭代挤出端面，范围会偏离基线一个量级）
    const extent = (s: SkinUnit): [number, number] => {
      let mx = -Infinity;
      let mnY = Infinity;
      for (let i = 0; i < s.n; i++) {
        mx = Math.max(mx, s.px[i]);
        mnY = Math.min(mnY, s.py[i]);
      }
      return [mx, mnY];
    };
    const [bx, by] = extent(base);
    const [sx, sy] = extent(sim);
    expect(Math.abs(sx - bx)).toBeLessThan(0.05);
    expect(Math.abs(sy - by)).toBeLessThan(0.05);
    // 端面（最内键 24..40，链内下标 +lead）应仍外鼓：没被硬拉成直线
    let fMin = Infinity;
    let fMax = -Infinity;
    for (let i = 53 + 24; i <= 53 + 40; i++) {
      fMin = Math.min(fMin, sim.px[i]);
      fMax = Math.max(fMax, sim.px[i]);
    }
    expect(fMax - fMin).toBeGreaterThan(0.02); // 鼓弧仍在（≥2px 站上尺度）
  });

  it('renderSmooth 不改变尺度：常量场与线性场逐位复原（偶数窗口曾放大 1.5×）', () => {
    // 2026-08-30：窗口是 half=w>>1 的对称窗（2·half+1 个样本），此前除以 w
    // ⇒ 偶数 w 整幅放大 (w+1)/w。Lab.12 九个刻缝级用的正是 [2,1]，被放大
    // 1.5 倍画出来，同台 L0（[3,1]）却是真尺寸——用户一眼看出「没同步」。
    for (const w of [1, 2, 3, 4, 5]) {
      const n = 40;
      const cx = new Float64Array(n).fill(2.5);
      const cy = new Float64Array(n).fill(-1.25);
      const c = renderSmooth(cx, cy, w, 2);
      for (let i = 0; i < n; i++) {
        expect(c.x[i], `w=${w} 常量场 x`).toBeCloseTo(2.5, 12);
        expect(c.y[i], `w=${w} 常量场 y`).toBeCloseTo(-1.25, 12);
      }
      // 线性场：端点被 edge 补边影响，中段应逐位复原（平滑不搬家、不缩放）
      const rx = Float64Array.from({ length: n }, (_, i) => i * 0.02);
      const ry = new Float64Array(n);
      const r = renderSmooth(rx, ry, w, 1);
      for (let i = w; i < n - w; i++) expect(r.x[i], `w=${w} 线性场`).toBeCloseTo(i * 0.02, 12);
    }
  });
});
