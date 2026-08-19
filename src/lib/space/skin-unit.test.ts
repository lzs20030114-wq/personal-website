import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SKIN_REF_NAMES, SKIN_UNITS, SKIN_V7_SPECS, skinSiteOpts } from './skin-data';
import { SKIN, coreY, createSkinUnit, renderSmooth, type SkinUnit } from './skin-unit';

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
});
