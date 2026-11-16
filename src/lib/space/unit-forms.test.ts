import { describe, expect, it } from 'vitest';
import { createSkinUnit, SKIN } from './skin-unit';
import {
  UF,
  UF_DEPTH,
  bandOpts,
  bandSpec,
  configProgram,
  placeBand,
  plateKRange,
  readBand,
  readUnit,
  skinJoins,
  unitLayout,
  type BandProgram,
  type BandShape,
  type PlateH,
  type UnitForm,
} from './unit-forms';
import { MATRIX_OUTLINE_HEIGHT, MATRIX_SECTION_SELECT, UNIT_FORMS } from './unit-forms-atlas';

const solo = (prog: BandProgram): UnitForm => ({ key: 't', zh: 't', group: 't', how: '', bands: [prog, ...Array(UF.COUNT - 1).fill(null)] });

/** 按一台单元的排法（自由段 / 贴芯补齐到 layout）跑一条带 */
function run(prog: BandProgram, layout = unitLayout(solo(prog))): BandShape {
  const spec = bandSpec(prog, layout);
  const u = createSkinUnit(spec, bandOpts(prog));
  for (let i = 0; i < SKIN.STEPS; i++) u.advance();
  return readBand(spec, u.px, u.py, u.n, u.locked.length);
}
const plateProg = (k: number, h: PlateH, tail: number = UF.TAIL_MIN): BandProgram => ({ secs: [{ kind: 'plate', k, h }], gaps: [tail] });

function maxDev(a: BandShape, b: BandShape): number {
  let d = 0;
  a.structs.forEach((s, q) => s.pts.forEach((p, i) => (d = Math.max(d, Math.hypot(p[0] - b.structs[q].pts[i][0], p[1] - b.structs[q].pts[i][1])))));
  return d;
}

describe('一台单元的形态 · 深度表与引擎对得上', () => {
  it.each([
    [14, 16],
    [46, 16],
    [62, 16],
    [29, 36],
    [80, 56],
  ] as [number, PlateH][])('k %i 台厚 %i：挑出、台面、台底与表差 ≤ 0.05 px，键全锁、不打结', (k, h) => {
    const s = run(plateProg(k, h));
    const row = UF_DEPTH[h].rows[k - UF_DEPTH[h].klo];
    expect(Math.abs(s.structs[0].reach - row[0])).toBeLessThan(0.05);
    expect(Math.abs(s.structs[0].top - row[1])).toBeLessThan(0.05);
    expect(Math.abs(s.structs[0].bot - row[2])).toBeLessThan(0.05);
    expect(s.locked).toBe(s.bonds);
    expect(s.knot).toBe(0);
  }, 30_000);
  it('表的三段范围：台厚都到位、挑出随 k 单调增', () => {
    for (const h of [16, 36, 56] as PlateH[]) {
      const rows = UF_DEPTH[h].rows;
      rows.forEach((r, i) => {
        expect(Math.abs(r[1] - r[2] - h)).toBeLessThanOrEqual(1);
        if (i) expect(r[0]).toBeGreaterThan(rows[i - 1][0]);
      });
    }
    expect(plateKRange(16)).toEqual([14, 62]);
  });
});

describe('一台单元的形态 · 台沿芯挪是纯平移', () => {
  it('一块台：尾 120 节、上面补 40 节垫，与标准跑法平移后逐点差 < 0.1 px', () => {
    const prog = plateProg(40, 16, 120);
    const layout = { F: 113 + 40, G: 120 + UF.ISO + 20 };
    const real = run(prog, { ...unitLayout(solo(prog)), ...layout });
    const canon = placeBand(run(configProgram(prog)), prog);
    expect(maxDev(real, canon)).toBeLessThan(0.1);
    expect(Math.abs(real.structs[0].top - run(configProgram(prog)).structs[0].top - 115 * UF.GLUE_PX)).toBeLessThan(0.1);
  }, 60_000);
  it('两块台叠在一条带上：尾 60 节、补垫，与标准跑法平移后逐点差 < 0.1 px，两块都锁满', () => {
    const prog: BandProgram = { secs: [29, 29].map((k) => ({ kind: 'plate', k, h: 16 })), gaps: [60, 40] };
    const L = unitLayout(solo(prog));
    expect(L.B + 13).toBeLessThanOrEqual(UF.CUT);
    const real = run(prog, { ...L, F: L.F + 10, G: L.G + 3 });
    const canon = placeBand(run(configProgram(prog)), prog);
    expect(real.structs).toHaveLength(2);
    expect(real.locked).toBe(real.bonds);
    expect(maxDev(real, canon)).toBeLessThan(0.1);
  }, 60_000);
  it('浅台贴着钉住端时形状略有不同：k 22 尾 5 节与抬高 0.45 m 差约 1.2 px（5 mm）——线稿每条带按实际的谱现跑，不用平移', () => {
    const at = (tail: number) => run(plateProg(22, 16, tail));
    const lo = at(UF.TAIL_MIN);
    const hi = at(60);
    const d = maxDev(hi, placeBand(lo, plateProg(22, 16, 60)));
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(1.5);
  }, 60_000);
});

describe('一台单元的形态 · 排法', () => {
  it('目录里每一种、两张组合格每一格都排得进 338 节的布', () => {
    const all = [
      ...UNIT_FORMS,
      ...MATRIX_OUTLINE_HEIGHT.rows.flatMap((r) => MATRIX_OUTLINE_HEIGHT.cols.map((c) => MATRIX_OUTLINE_HEIGHT.form(r, c))),
      ...MATRIX_SECTION_SELECT.rows.flatMap((r) => MATRIX_SECTION_SELECT.cols.map((c) => MATRIX_SECTION_SELECT.form(r, c))),
    ];
    for (const f of all) {
      expect(f.bands).toHaveLength(UF.COUNT);
      expect(unitLayout(f).errors, f.key).toEqual([]);
    }
    expect(new Set(UNIT_FORMS.map((f) => f.key)).size).toBe(UNIT_FORMS.length);
  });
  it('做不出来的会报出来：四块深台排不下、两块贴太近、袋与台混用', () => {
    const four: BandProgram = { secs: [40, 40, 40, 40].map((k) => ({ kind: 'plate', k, h: 16 })), gaps: [5, 29, 29, 29] };
    expect(unitLayout(solo(four)).errors.join()).toMatch(/超过预裁/);
    const close: BandProgram = { secs: [29, 29].map((k) => ({ kind: 'plate', k, h: 16 })), gaps: [5, 20] };
    expect(unitLayout(solo(close)).errors.join()).toMatch(/< 29/);
    const mixed: UnitForm = { ...solo(plateProg(29, 16)), bands: [{ secs: [{ kind: 'cat', key: 'pocket' }], gaps: [5] }, plateProg(29, 16), ...Array(UF.COUNT - 2).fill(plateProg(29, 16))] };
    expect(unitLayout(mixed).errors.join()).toMatch(/整台都得是袋/);
  });
  it('螺旋转回起点那一道不拉膜，其余相邻带照拉；不拉膜的形一道都不拉', () => {
    const helix = UNIT_FORMS.find((x) => x.key === 'height-helix')!;
    expect(helix.cuts).toHaveLength(1);
    const joined = Array.from({ length: UF.COUNT }, (_, j) => skinJoins(helix, j).length);
    expect(joined.filter((v) => v === 0)).toHaveLength(1);
    const fins = UNIT_FORMS.find((x) => x.key === 'gap-fins')!;
    expect(Array.from({ length: UF.COUNT }, (_, j) => skinJoins(fins, j).length).every((v) => v === 0)).toBe(true);
  });
  it('对称读数：圆 20 重、方 4 重、五角星 5 重、齿 10 重，舌只有镜像、螺旋两样都没有', () => {
    const sym = (key: string) => {
      const f = UNIT_FORMS.find((x) => x.key === key)!;
      const r = readUnit(f, Array(UF.COUNT).fill(null));
      return [r.rotOrder, r.mirror];
    };
    expect(sym('outline-circle')).toEqual([20, true]);
    expect(sym('outline-square')).toEqual([4, true]);
    expect(sym('outline-star')).toEqual([5, true]);
    expect(sym('outline-gear')).toEqual([10, true]);
    expect(sym('outline-tongue')).toEqual([1, true]);
    expect(sym('height-helix')).toEqual([1, false]);
  });
});
