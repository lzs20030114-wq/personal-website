import { describe, expect, it } from 'vitest';
import { buildLayerBands, layerBandPlan } from './skin-layers-bands';
import { layerBaseline, layerExample, LAYERS } from './skin-layers';
import { layerProfileAt, layerRadialOffset } from './skin-layers-surface';
import { buildLayerProfiles } from './skin-layers-forming';
import { createSkinTerminalLoader } from '../../../components/lab/skinTerminal';
import { RING } from './skin-ring';

describe('多层台 · 分开的窄带', () => {
  it('蒙皮接在条带外侧，半径变化不跨缺口、不修改原始截面', async () => {
    const defs = buildLayerProfiles(), { states } = await createSkinTerminalLoader()(defs);
    const before = states.map(f => ({ x: [...f.px], y: [...f.py] }));
    const s = layerExample('study');
    s.upper.radius = LAYERS.minRadius; s.lower.radius = LAYERS.maxRadius;
    const result = buildLayerBands(s, states, true, false);
    const narrower = buildLayerBands(s, states.map(f => ({ ...f, px: Float64Array.from(f.px, x => x * .8) })), true, false);
    expect(narrower.membranes[0].verts).not.toEqual(result.membranes[0].verts);
    expect(result.membranes).toHaveLength(layerBandPlan(s).filter(b => b.kind).length * 2);
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
