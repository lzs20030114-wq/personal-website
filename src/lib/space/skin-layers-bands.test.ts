import { describe, expect, it } from 'vitest';
import { buildLayerBands, layerBandPlan } from './skin-layers-bands';
import { layerBaseline, layerExample, LAYERS } from './skin-layers';
import { layerProfileAt, layerRadialOffset } from './skin-layers-surface';
import { buildLayerProfiles } from './skin-layers-forming';
import { createSkinTerminalLoader } from '../../../components/lab/skinTerminal';
import { RING } from './skin-ring';

describe('多层台 · 分开的窄带', () => {
  it('暴露截面补膜与带间膜逐点相接，圆方与异径倾斜下均无遗漏的大侧面', async () => {
    const { states } = await createSkinTerminalLoader()(buildLayerProfiles());
    for (const morph of [0, 1, 2, 3, 4]) for (const depth of [20, 50, 100]) {
      const s = layerExample('study'); s.morph = morph; s.joinDepth = depth;
      s.upper.radius = 70; s.lower.radius = 130;
      const result = buildLayerBands(s, states, true, false);
      const plan = layerBandPlan(s), strips = plan.filter(p => p.kind).length * 2;
      const caps = result.membranes.slice(strips);
      expect(caps).toHaveLength(12); // 两个缺口端 + 五处异截面交界各两侧。
      let panel = 0, cap = 0;
      for (let b = 0; b < plan.length; b++) {
        if (!plan[b].kind) continue;
        for (const side of [-1, 1]) {
          const membrane = result.membranes[panel++];
          if (plan[(b + side + plan.length) % plan.length].kind === plan[b].kind) continue;
          const end = caps[cap++], boundary = membrane.verts.slice(membrane.verts.length / 2);
          expect(end.verts.slice(3, -3)).toEqual(boundary);
          const p = Array.from({ length: end.verts.length / 3 }, (_, i) =>
            [Math.hypot(end.verts[i * 3], end.verts[i * 3 + 2]), end.verts[i * 3 + 1]]);
          // 按轮廓的奇偶规则独立取内部采样，再检查三角面覆盖；不能只有端框。
          // 折回处 3 单位厚带的法向偏移会局部重叠，排除距边不足半个带厚的点。
          for (let r = 34; r < 132; r += 4) for (let y = 370; y < 620; y += 4) {
            let inside = false, distance = Infinity;
            for (let i = 0; i < p.length; i++) {
              const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1];
              if ((a[1] > y) !== (b[1] > y) && r < dx * (y - a[1]) / dy + a[0]) inside = !inside;
              const t = Math.max(0, Math.min(1, ((r - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
              distance = Math.min(distance, Math.hypot(r - a[0] - t * dx, y - a[1] - t * dy));
            }
            if (!inside || distance < RING.THICK / 2) continue;
            let covered = false;
            const cross = (a: number[], b: number[]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (r - a[0]);
            for (let i = 0; i < end.idx.length && !covered; i += 3) {
              const [a, b, c] = [p[end.idx[i]], p[end.idx[i + 1]], p[end.idx[i + 2]]];
              const signs = [cross(a, b), cross(b, c), cross(c, a)];
              covered = signs.every(x => x >= -1e-5) || signs.every(x => x <= 1e-5);
            }
            expect(covered, `${morph}/${depth}/${cap}: ${r},${y}`).toBe(true);
          }
        }
      }
      const changed = buildLayerBands(s, states.map(f => ({ ...f, px: Float64Array.from(f.px, x => x * .8) })), true, false);
      expect(changed.membranes[strips].verts).not.toEqual(caps[0].verts);
    }
  }, 20000); // 15 组形态 × 12 个侧面的密集覆盖检查；保留判据，允许全套并行运行。

  it('半环端面封住厚台内部，但不填满双层之间的设计空隙；整环没有内部隔墙', async () => {
    const { states } = await createSkinTerminalLoader()(buildLayerProfiles());
    const s = layerBaseline(); s.upper.outline = s.lower.outline = 'half';
    const contains = (m: ReturnType<typeof buildLayerBands>['membranes'][number], r: number, y: number) => {
      const p = (i: number) => [Math.hypot(m.verts[i * 3], m.verts[i * 3 + 2]), m.verts[i * 3 + 1]];
      const cross = (a: number[], b: number[]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (r - a[0]);
      for (let i = 0; i < m.idx.length; i += 3) {
        const [a, b, c] = [p(m.idx[i]), p(m.idx[i + 1]), p(m.idx[i + 2])];
        const signs = [cross(a, b), cross(b, c), cross(c, a)];
        if (signs.every(x => x >= -1e-5) || signs.every(x => x <= 1e-5)) return true;
      }
      return false;
    };
    for (const join of [0, 360]) {
      s.joinSweep = join;
      const result = buildLayerBands(s, states, false, false), caps = result.membranes.slice(-2);
      expect(result.membranes).toHaveLength(22);
      for (const m of caps) {
        expect(contains(m, 70, 435)).toBe(true);
        expect(contains(m, 70, 493)).toBe(join > 0);
      }
    }
    const closed = buildLayerBands(layerBaseline(), states, false, false);
    expect(closed.membranes).toHaveLength(40);
  });

  it('蒙皮接在条带外侧，半径变化不跨缺口、不修改原始截面', async () => {
    const defs = buildLayerProfiles(), { states } = await createSkinTerminalLoader()(defs);
    const before = states.map(f => ({ x: [...f.px], y: [...f.py] }));
    const s = layerExample('study');
    s.upper.radius = LAYERS.minRadius; s.lower.radius = LAYERS.maxRadius;
    const result = buildLayerBands(s, states, true, false);
    const narrower = buildLayerBands(s, states.map(f => ({ ...f, px: Float64Array.from(f.px, x => x * .8) })), true, false);
    expect(narrower.membranes[0].verts).not.toEqual(result.membranes[0].verts);
    expect(result.membranes.length).toBeGreaterThan(layerBandPlan(s).filter(b => b.kind).length * 2);
    for (const m of result.membranes) {
      expect([...m.verts].every(Number.isFinite)).toBe(true);
      for (let i = 0; i < m.verts.length; i += 3) {
        const a = (Math.atan2(m.verts[i + 2], m.verts[i]) * 180 / Math.PI + 360) % 360;
        expect(a > 245.01 && a < 359.99).toBe(false);
      }
    }
    // 蒙皮的条带端与实体外前/外后边逐点重合，不能盖一层目标外壳冒充布。
    let mesh = 0, panel = 0;
    for (const band of layerBandPlan(s)) {
      mesh++; // 立杆
      if (!band.kind) continue;
      const v = result.meshes[mesh].verts, n = v.length / 12;
      expect(result.membranes[panel++].verts.slice(0, n * 3)).toEqual(v.slice(n * 3, 2 * n * 3));
      expect(result.membranes[panel++].verts.slice(0, n * 3)).toEqual(v.slice(0, n * 3));
      mesh += 2;
    }
    const up = defs[2].marks.faceA, down = defs[3].marks.faceA;
    expect(layerRadialOffset(s, states[2], 2, up)).toBeLessThan(-30);
    expect(layerRadialOffset(s, states[3], 3, down)).toBeGreaterThan(10);
    s.upper.radius = LAYERS.outer;
    expect(layerRadialOffset(s, states[2], 2, up)).toBe(0);
    expect(layerRadialOffset(s, states[3], 3, down)).toBeGreaterThan(10);
    expect(states.map(f => ({ x: [...f.px], y: [...f.py] }))).toEqual(before);
  });
  it('完整基准摆 20 条；轮廓边界分槽，窄带不跨缺口，也不遗漏 5° 独占区', () => {
    const base = layerBandPlan(layerBaseline());
    expect(base).toHaveLength(20);
    expect(base.every(b => b.kind === 'double')).toBe(true);
    const s = layerExample('study'), plan = layerBandPlan(s);
    expect(new Set(plan.map(b => b.kind))).toEqual(new Set(['upper', 'lower', 'double', 'solid', null]));
    expect(plan.filter(b => b.kind).reduce((sum, b) => sum + b.end - b.start, 0)).toBe(245);
    for (const b of plan) {
      expect(layerProfileAt(s, b.start + .001)).toBe(b.kind);
      expect(layerProfileAt(s, b.end - .001)).toBe(b.kind);
      expect(b.depth).toBeLessThanOrEqual(RING.DEPTH);
      const halfAngle = Math.atan2(b.depth / 2, LAYERS.inner - RING.THICK / 2) * 180 / Math.PI;
      expect(halfAngle).toBeLessThan((b.end - b.start) / 2);
    }
  });
  it('真实终态挤成有厚度的独立条带；三角形不跨带间空隙，键在两侧剖口', async () => {
    const { states } = await createSkinTerminalLoader()(buildLayerProfiles());
    const before = states.map(f => [...f.py]);
    const s = layerBaseline(), plan = layerBandPlan(s), result = buildLayerBands(s, states, false);
    expect(result.meshes).toHaveLength(20 * 3 + 1); // 每处：立杆 + 两组条纹；最后一块天花环。
    expect(result.bonds.length).toBeGreaterThan(20);
    for (let j = 0; j < 20; j++) {
      const a = result.meshes[j * 3 + 1], b = result.meshes[j * 3 + 2], slot = plan[j];
      expect(a.verts).toBe(b.verts);
      expect(a.idx).not.toBe(b.idx); // 共享顶点不等于重复画同一组面。
      expect(a.verts.length).toBe(4 * states[0].px.length * 3);
      for (let i = 0; i < a.verts.length; i += 3) {
        const [x, y, z] = a.verts.slice(i, i + 3);
        expect([x, y, z].every(Number.isFinite)).toBe(true);
        const angle = (Math.atan2(z, x) * 180 / Math.PI + 360) % 360;
        expect(angle).toBeGreaterThan(slot.start);
        expect(angle).toBeLessThan(slot.end);
      }
    }
    // 更改输入节点必须改变成形条带，不能仍返回目标形体。
    const smaller = buildLayerBands(s, states.map(f => ({ ...f, px: Float64Array.from(f.px, x => x * .5) })), false);
    const radius = (v: Float32Array) => Math.max(...Array.from({ length: v.length / 3 }, (_, i) => Math.hypot(v[i * 3], v[i * 3 + 2])));
    expect(radius(result.meshes[1].verts) - radius(smaller.meshes[1].verts)).toBeGreaterThan(40);
    const tilted = buildLayerBands(layerExample('study'), states, true, false);
    expect(tilted.meshes.every(m => Array.from(m.verts).every(Number.isFinite))).toBe(true);
    expect(states.map(f => [...f.py])).toEqual(before);
  });
});
