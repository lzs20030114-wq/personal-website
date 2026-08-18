import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SKIN_REF_NAMES, SKIN_UNITS } from './skin-data';
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
    const sim = createSkinUnit(def.spec);
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
