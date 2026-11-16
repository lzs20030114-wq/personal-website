import { describe, expect, it } from 'vitest';
import { COHABIT, bandAngle, furnRect, type FurnRect, type Guide } from './cohabit';
import { DESIGN, designUnit, floorFor, heightToward, liftOf, meetDesign, riseLimit, roleOf, stepDesign, type DesignSim, type UnitDesign } from './cohabit-design';
import { FURN_ERGO, SHELTER, TABLE_TOP } from './cohabit-solid';
import { liftOf as vignetteLiftOf, vignetteLayout } from './cohabit-vignette';

const L = vignetteLayout(4);
const P = L.pitchM;
const unitAt = (r: number, c: number) => L.units[r * 4 + c];

/** 一个只有 4×4 格子、没有家具的假平面模型：一位坐着的人、一只猫、一条坐着引猫的路 */
function fakeSim(path: number[], catUnit: number | null, opts: { tableBy?: number[]; rects?: FurnRect[]; catAt?: { x: number; y: number } } = {}): DesignSim {
  const seat = { x: unitAt(0, 3).x + P, y: unitAt(0, 3).y };
  const tableBy = new Array(L.units.length).fill(-1);
  for (const u of opts.tableBy ?? []) tableBy[u] = 0;
  const cat = catUnit === null ? { id: 7, unit: null, state: 'walk', walker: opts.catAt ?? { x: unitAt(3, 0).x - 0.5, y: unitAt(3, 0).y } } : { id: 7, unit: L.units[catUnit], state: 'sit', walker: L.units[catUnit] };
  const guides: Guide[] = [{ kind: 'sit', person: 1, cat: 7, path }];
  return { layout: L, tableBy, furn: { rects: opts.rects ?? [] }, seats: [seat], people: [{ id: 1, seated: true, seat: 0 }], cats: [cat], guides };
}

/** 按路的先后一台一台落（台架就是这样：每台开始落下那一刻定形） */
function dropAlong(sim: DesignSim, path: number[]): (UnitDesign | null)[] {
  const formed: (UnitDesign | null)[] = new Array(L.units.length).fill(null);
  for (const u of path) if (!formed[u]) formed[u] = designUnit(sim, u, formed);
  return formed;
}
const dirTo = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);

describe('单元形态与 2-15 的对应 · 斜的台面', () => {
  it('一台能消化的高差：直走 0.39 m，拐 90° 时 0.39/√2', () => {
    expect(riseLimit(Math.PI, 0)).toBeCloseTo(DESIGN.RISE, 9);
    expect(riseLimit(Math.PI, Math.PI / 2)).toBeCloseTo(DESIGN.RISE / Math.SQRT2, 9);
  });
  it('直走的一步：进来那侧与出去那侧的高度对得上，各条带抬的量 = 台面高低差，不超过 0.39 m', () => {
    const at = unitAt(1, 1);
    const d = stepDesign({ at, prev: unitAt(1, 0), next: unitAt(1, 2), entryWant: 0.5, entryFrom: 0.5, target: 0.9, remaining: 1, floor: DESIGN.LOW });
    expect(d.slope).not.toBeNull();
    expect(heightToward(d, Math.PI)).toBeCloseTo(0.5, 9);
    expect(heightToward(d, 0)).toBeCloseTo(0.89, 9); // 0.5 + 0.39 截住
    const lift = d.form.lift!;
    expect(Math.min(...lift)).toBe(0);
    expect(Math.max(...lift)).toBeLessThanOrEqual(DESIGN.RISE + 1e-9);
    // 各条带的台面 = top + lift，正好落在斜面上
    lift.forEach((v, j) => expect(d.top + v).toBeCloseTo(heightToward(d, bandAngle(j)), 9));
    expect(d.jump).toBe(0);
  });
  it('平摊：离终点还有三台，每台各分三分之一的高差', () => {
    const d = stepDesign({ at: unitAt(1, 1), prev: unitAt(1, 0), next: unitAt(1, 2), entryWant: 0.42, entryFrom: 0.42, target: 0.9, remaining: 3, floor: DESIGN.LOW });
    expect(d.slope!.to - d.slope!.from).toBeCloseTo(0.16, 9);
  });
  it('liftOf 只有一份：小样与 2-15 用同一个函数', () => {
    expect(vignetteLiftOf).toBe(liftOf);
  });
});

describe('单元形态与 2-15 的对应 · 一条路从地面接到座位前方那台', () => {
  it('地面上的猫：第一台低的那一端 0.42 m，路上每道接缝两边一样高，最后接到下层 0.90 m', () => {
    const path = [12, 13, 14, 15, 11, 7, 3].map((i) => i); // 第 3 行往右，再往上拐到座位旁
    const sim = fakeSim(path, null);
    const formed = dropAlong(sim, path);
    const first = formed[path[0]]!;
    expect(first.role).toBe('step');
    expect(first.jump).toBeCloseTo(DESIGN.LOW, 9); // 从地面跳 0.42 m，原来要跳 1.05 m
    for (let k = 1; k < path.length; k++) {
      const a = L.units[path[k - 1]];
      const b = L.units[path[k]];
      const hA = heightToward(formed[a.i]!, dirTo(a, b));
      const d = formed[b.i]!;
      if (k < path.length - 1) expect(heightToward(d, dirTo(b, a))).toBeCloseTo(hA, 9);
      expect(Math.abs(d.jump)).toBeLessThan(k === path.length - 1 ? 0.2 : 1e-9);
    }
    const meet = formed[path[path.length - 1]]!;
    expect(meet.role).toBe('meet');
    expect(meet.top).toBe(SHELTER.lowerTop);
    expect(meet.form.bands).not.toBeNull();
    // 每台从一侧到对侧都不超过它能消化的高差
    for (const u of path.slice(0, -1)) {
      const d = formed[u]!;
      expect(Math.abs(d.slope!.to - d.slope!.from)).toBeLessThanOrEqual(riseLimit(d.slope!.inDir, d.slope!.outDir) + 1e-9);
    }
  });
  it('猫在台上：它脚下那台不重新定形，路从它朝下一台那侧的高度接下去', () => {
    const path = [4, 5, 6, 7, 3];
    const sim = fakeSim(path, 4);
    expect(roleOf(sim, 4).role).toBe('rest');
    const formed: (UnitDesign | null)[] = new Array(L.units.length).fill(null);
    formed[4] = designUnit(sim, 4, formed);
    expect(formed[4]!.top).toBe(TABLE_TOP.stand);
    for (const u of path.slice(1)) formed[u] = designUnit(sim, u, formed);
    expect(formed[5]!.jump).toBeCloseTo(0, 9);
    expect(heightToward(formed[5]!, Math.PI)).toBeCloseTo(TABLE_TOP.stand, 9);
  });
  it('只有一台：地面上的猫直接跳上座位前方那台的下层', () => {
    const sim = fakeSim([3], null, { catAt: { x: unitAt(0, 3).x, y: unitAt(0, 3).y + 0.6 } });
    const d = designUnit(sim, 3, new Array(L.units.length).fill(null));
    expect(d.role).toBe('meet');
    expect(d.jump).toBeCloseTo(SHELTER.lowerTop, 9);
  });
});

describe('单元形态与 2-15 的对应 · 先后与限制', () => {
  it('桌子那台优先：一台既是桌子又在路上，按桌子定', () => {
    const sim = fakeSim([12, 13, 14], null, { tableBy: [13] });
    expect(roleOf(sim, 13).role).toBe('table');
  });
  it('压着家具的台：按家具的块算——只擦到坐垫前沿的台落到坐垫以上，压着靠背的台落到靠背以上；斜面最低处也守住', () => {
    const u = unitAt(2, 1);
    // 一张面朝 +y 的双人沙发：靠背在 y 小的那边
    const sofaAt = (y: number): FurnRect => furnRect({ kind: 'sofa', x: u.x, y, face: [0, 1], ergo: true });
    const pad = DESIGN.PLATE + DESIGN.CLEAR;
    const reach = L.platR + COHABIT.TABLE.FURN_GAP;
    // 沙发整个在台的 +y 外面、只有坐垫前沿伸进台下：落到坐垫以上（不是靠背以上）
    const front = sofaAt(u.y - reach - 0.4 + 0.05); // 沙发进深 0.80，前缘伸进台下 5 cm
    expect(floorFor(L, u, [front])).toBeCloseTo(FURN_ERGO.sofa.seatH + pad, 9);
    // 沙发靠背正压在台下：落到靠背以上
    const back = sofaAt(u.y + 0.3);
    expect(floorFor(L, u, [back])).toBeCloseTo(FURN_ERGO.sofa.backH + pad, 9);
    // 不压家具：LOW
    expect(floorFor(L, u, [sofaAt(u.y + 3)])).toBe(DESIGN.LOW);
    const f = floorFor(L, u, [back]);
    const d = stepDesign({ at: u, prev: unitAt(2, 0), next: unitAt(2, 2), entryWant: DESIGN.LOW, entryFrom: 0, target: 0.9, remaining: 2, floor: f });
    const hs = Array.from({ length: COHABIT.FACES.BANDS }, (_, j) => heightToward(d, bandAngle(j)));
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(f - 1e-9);
  });
  it('座位前方那台下面是餐椅（椅背比下层底高）：不成两层，1.05 m 的平台', () => {
    const u = unitAt(0, 3);
    const chair: FurnRect = { kind: 'chair', ergo: true, x0: u.x - 0.25, x1: u.x + 0.25, y0: u.y - 0.25, y1: u.y + 0.25, face: [0, 1] } as unknown as FurnRect;
    const d = meetDesign(L, u, { x: u.x + 1, y: u.y }, [chair], 1.0);
    expect(d.form.bands).toBeNull();
    expect(d.top).toBe(TABLE_TOP.stand);
  });
});
