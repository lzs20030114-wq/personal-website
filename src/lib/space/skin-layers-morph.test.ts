import { describe, expect, it } from 'vitest';
import { buildLayerGeometry, layerBaseline, layerExample, layerRadius, layerStats, LAYERS, LAYER_EXAMPLES } from './skin-layers';
import { buildLayerBands, layerBandPlan } from './skin-layers-bands';
import { buildLayerProfiles } from './skin-layers-forming';
import { createSkinUnit } from './skin-unit';
import { createSkinTerminalLoader } from '../../../components/lab/skinTerminal';

describe('多层台圆方组合', () => {
  it('圆档保留原半径，五档保持最大外伸且逐渐收直，方档四条边严格共线', () => {
    const s = layerBaseline();
    s.upper.radius = 130; s.lower.radius = 70;
    for (const surface of [0, 2]) {
      const r = surface === 0 ? 130 : 70;
      let previous = r;
      for (let morph = 0; morph < 5; morph++) {
        s.morph = morph;
        expect(layerRadius(s, surface, 45)).toBeCloseTo(r, 12);
        expect(layerRadius(s, surface, 0)).toBeLessThanOrEqual(previous);
        previous = layerRadius(s, surface, 0);
        for (let a = 0; a < 360; a++) {
          const radius = layerRadius(s, surface, a);
          expect(radius).toBeLessThanOrEqual(r + 1e-10);
          expect(radius).toBeGreaterThan(LAYERS.inner);
          if (morph === 0) expect(radius).toBe(r);
          if (morph === 4) {
            const t = a * Math.PI / 180;
            expect(Math.max(Math.abs(radius * Math.cos(t)), Math.abs(radius * Math.sin(t)))).toBeCloseTo(r / Math.SQRT2, 10);
          }
        }
      }
    }
  });

  it('五档保留复杂参数和连接角度，异径倾斜厚台目标仍闭合，极限尺寸不碰层', () => {
    for (const preset of LAYER_EXAMPLES) for (const morph of [0, 1, 2, 3, 4]) {
      const s = layerExample(preset.key);
      s.upper.radius = 70; s.lower.radius = 130;
      const before = structuredClone(s), joined = layerStats(s).joined;
      s.morph = morph;
      const geometry = buildLayerGeometry(s), edges = new Map<string, number>();
      for (const m of Object.values(geometry.meshes)) {
        const key = (i: number) => [...m.verts.slice(i * 3, i * 3 + 3)].map(v => Math.round(v * 1000)).join(',');
        for (let i = 0; i < m.idx.length; i += 3) for (let j = 0; j < 3; j++) {
          const edge = [key(m.idx[i + j]), key(m.idx[i + (j + 1) % 3])].sort().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every(n => n === 2), `${preset.key}/${morph}`).toBe(true);
      expect(layerStats(s).joined).toBe(joined);
      expect(s).toEqual({ ...before, morph });
      s.upper.radius = 130; s.upper.tilt = s.lower.tilt = 20;
      expect(layerStats(s).clearance).toBeGreaterThan(5);
    }
  });

  it('方角显式分槽，旋转缺口和 5° 独占台面仍精确保留', () => {
    const s = layerBaseline();
    expect(layerBandPlan(s)).toHaveLength(20);
    s.morph = 4;
    const bands = layerBandPlan(s);
    expect(bands).toHaveLength(24);
    for (const angle of [45, 135, 225, 315]) {
      expect(bands.some(b => b.start === angle)).toBe(true);
      expect(bands.some(b => b.start < angle && b.end > angle)).toBe(false);
    }
    const study = layerExample('study'); study.morph = 4;
    const plan = layerBandPlan(study);
    expect(plan.filter(b => b.kind).reduce((sum, b) => sum + b.end - b.start, 0)).toBe(245);
    expect(plan.find(b => b.start === 0 && b.end === 5)?.kind).toBe('upper');
    expect(plan.find(b => b.start === 240 && b.end === 245)?.kind).toBe('lower');
  });

  it('方形膜保持四角、接在真实带边；同一截面相邻膜边完全接合', async () => {
    const defs = buildLayerProfiles(), { states } = await createSkinTerminalLoader()(defs);
    const s = layerBaseline(); s.morph = 4;
    const formed = buildLayerBands(s, states, false, false);
    const plan = layerBandPlan(s);
    for (let b = 0; b < plan.length; b++) {
      const v = formed.meshes[b * 3 + 1].verts, n = v.length / 12;
      // 实体剖口也在方边上；只把膜拉到方边会留下每条带的尖齿。
      const face = defs[0].marks.faceA - defs[0].lead;
      for (const side of [0, 1]) {
        const i = (side * n + face) * 3;
        expect(Math.abs(Math.max(Math.abs(v[i]), Math.abs(v[i + 2])) - LAYERS.outer / Math.SQRT2)).toBeLessThan(2);
      }
      expect(formed.membranes[2 * b].verts.slice(0, n * 3)).toEqual(v.slice(n * 3, n * 6));
      expect(formed.membranes[2 * b + 1].verts.slice(0, n * 3)).toEqual(v.slice(0, n * 3));
      const end = formed.membranes[2 * b + 1].verts.slice(n * 3);
      const next = formed.membranes[(2 * b + 2) % formed.membranes.length].verts.slice(n * 3);
      // 360° 与 0° 允许三角函数的浮点末位差。
      expect(Math.max(...end.map((x, i) => Math.abs(x - next[i])))).toBeLessThan(1e-4);
      const a = plan[b].end * Math.PI / 180;
      for (let i = 0; i < end.length; i += 3) {
        expect(Math.abs(end[i] * Math.sin(a) - end[i + 2] * Math.cos(a))).toBeLessThan(1e-4);
      }
    }
    const reach = Math.max(...formed.membranes.flatMap(m => Array.from({ length: m.verts.length / 3 }, (_, i) => Math.hypot(m.verts[i * 3], m.verts[i * 3 + 2]))));
    expect(Math.abs(reach - LAYERS.outer)).toBeLessThan(2);
  });

  it('真实成形六时刻支持全部圆方档、倾斜、异径与缺口，不改原解或进度', () => {
    const sims = buildLayerProfiles().map(d => createSkinUnit(d.spec, d.opts));
    const s = layerExample('study'); s.upper.radius = 70; s.lower.radius = 130;
    for (const step of [0, 200, 500, 800, 1200, 1500]) {
      for (const sim of sims) while (sim.step < step) sim.advance();
      const before = sims.map(sim => ({ x: [...sim.px], y: [...sim.py], step: sim.step, locked: structuredClone(sim.locked) }));
      for (const morph of [0, 1, 2, 3, 4]) {
        s.morph = morph;
        const result = buildLayerBands(s, sims, true, false);
        const finite = [...result.meshes, ...result.membranes].every(m => m.verts.every(Number.isFinite));
        expect(finite, `${step}/${morph}`).toBe(true);
        for (const m of result.membranes) for (let i = 0; i < m.verts.length; i += 3) {
          const a = (Math.atan2(m.verts[i + 2], m.verts[i]) * 180 / Math.PI + 360) % 360;
          expect(a > 245.01 && a < 359.99).toBe(false);
        }
      }
      expect(sims.map(sim => ({ x: [...sim.px], y: [...sim.py], step: sim.step, locked: sim.locked }))).toEqual(before);
    }
    const baseline = buildLayerBands(s, sims, false, false);
    const changed = buildLayerBands(s, sims.map(sim => ({ ...sim, px: Float64Array.from(sim.px, x => x * .8) })), false, false);
    expect(changed.meshes[1].verts).not.toEqual(baseline.meshes[1].verts);
    expect(changed.membranes[0].verts).not.toEqual(baseline.membranes[0].verts);
  }, 30000);
});
