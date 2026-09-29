import { describe, expect, it } from 'vitest';
import { buildLayerGeometry, layerBaseline, layerExample, layerColumns, layerRadius, layerStats, LAYERS } from './skin-layers';
import { buildLayerBands, layerBandPlan } from './skin-layers-bands';
import { buildLayerProfiles } from './skin-layers-forming';
import { layerAssemblyProfiles } from './skin-layers-surface';
import { createSkinUnit } from './skin-unit';
import { createSkinTerminalLoader } from '../../../components/lab/skinTerminal';

describe('多层台 · 局部厚台连接深度', () => {
  it('20/50/100% 只改变连接的径向范围，0% 完全分开，上下平台外缘不动', () => {
    const s = layerExample('join');
    s.upper.radius = 70; s.lower.radius = 130;
    for (const morph of [0, 4]) for (const depth of [0, 20, 50, 100]) {
      s.morph = morph; s.joinDepth = depth;
      expect(layerColumns(s, 45, .1).map(c => [c.top, c.bottom])).toEqual(depth ? [[0, 3]] : [[0, 1], [2, 3]]);
      expect(layerColumns(s, 45, .75).map(c => [c.top, c.bottom])).toEqual(depth === 100 ? [[0, 3]] : [[0, 1], [2, 3]]);
      expect(layerStats(s).joined).toBe(depth ? 60 : 0);
      const geometry = buildLayerGeometry(s);
      for (const [y, surface] of [[-66, 0], [66, 2]]) {
        const rim = Object.values(geometry.meshes).flatMap(m => Array.from({ length: m.verts.length / 3 }, (_, i) =>
          [m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]])).filter(p => Math.abs(p[1] - y) < .001);
        expect(Math.max(...rim.map(p => Math.hypot(p[0], p[2])))).toBeCloseTo(surface === 0 ? 70 : 130, 4);
      }
      // 中间竖壁最深处跟随比例，不能只更改读数或把整块平台缩小。
      const join = geometry.meshes.join;
      if (!depth) expect(join.idx).toHaveLength(0);
      else {
        const wall = Array.from({ length: join.verts.length / 3 }, (_, i) => [join.verts[i * 3], join.verts[i * 3 + 1], join.verts[i * 3 + 2]])
          .filter(p => Math.abs(p[1] - 50) < .001 && Math.abs(Math.atan2(p[2], p[0]) * 180 / Math.PI - 45) < .001);
        expect(Math.max(...wall.map(p => Math.hypot(p[0], p[2])))).toBeCloseTo(LAYERS.inner + depth / 100 * (layerRadius(s, 2, 45) - LAYERS.inner), 4);
      }
    }
  });

  it('内缩连接在五档圆方、异径倾斜、缺口和对向扇区下仍闭合，无重叠内部面', () => {
    for (const example of ['join', 'opposed', 'study']) for (const morph of [0, 1, 2, 3, 4]) for (const depth of [5, 20, 50, 95]) {
      const s = layerExample(example); s.morph = morph; s.joinDepth = depth;
      s.upper.radius = 70; s.lower.radius = 130; s.upper.tilt = 20; s.lower.tilt = 19;
      const edges = new Map<string, number>();
      for (const mesh of Object.values(buildLayerGeometry(s).meshes)) {
        const key = (i: number) => [...mesh.verts.slice(i * 3, i * 3 + 3)].map(v => Math.round(v * 1000)).join(',');
        for (let i = 0; i < mesh.idx.length; i += 3) {
          const tri = [...mesh.idx.slice(i, i + 3)].map(key);
          expect(new Set(tri).size).toBe(3);
          for (let j = 0; j < 3; j++) {
            const edge = [tri[j], tri[(j + 1) % 3]].sort().join('|');
            edges.set(edge, (edges.get(edge) ?? 0) + 1);
          }
        }
      }
      expect([...edges.values()].every(n => n === 2), `${example}/${morph}/${depth}`).toBe(true);
    }
  }, 20000);

  it('成形内缩只映射双层截面凹口，保持台面与原解；100% 仍使用原厚台', async () => {
    const defs = buildLayerProfiles(), { states } = await createSkinTerminalLoader()(defs);
    const before = states.map(f => [...f.px]), s = layerExample('join'), m = defs[0].marks;
    for (const depth of [20, 50, 95]) {
      s.joinDepth = depth;
      const [{ frame: double }, { frame: join, k }] = layerAssemblyProfiles(s, states);
      expect(k).toBe(0);
      expect(double).toBe(states[0]);
      expect(join.px.slice(0, m.mouthA + 1)).toEqual(double.px.slice(0, m.mouthA + 1));
      expect(join.px.slice(m.mouthB)).toEqual(double.px.slice(m.mouthB));
      expect(join.py).toBe(double.py);
      expect(join.locked).toBe(double.locked);
      // 实际缝嘴约 82.5，保留与理想挑出 83.2 的原有误差。
      const mouth = (double.px[m.mouthA] + double.px[m.mouthB]) / 2;
      expect((join.px[m.center] - double.px[m.center]) / (mouth - double.px[m.center])).toBeCloseTo(depth / 100, 5);
    }
    s.joinDepth = 100;
    expect(layerAssemblyProfiles(s, states)[1]).toEqual({ frame: states[1], k: 1 });
    expect(states.map(f => [...f.px])).toEqual(before);
  });

  it('20/50% 侧膜封住内侧厚台，外侧层间仍留空，膜边与条带逐点接合', async () => {
    const { states } = await createSkinTerminalLoader()(buildLayerProfiles());
    const s = layerBaseline(); s.upper.outline = s.lower.outline = 'half'; s.joinSweep = 360;
    const contains = (m: ReturnType<typeof buildLayerBands>['membranes'][number], r: number, y: number) => {
      const p = (i: number) => [Math.hypot(m.verts[i * 3], m.verts[i * 3 + 2]), m.verts[i * 3 + 1]];
      const cross = (a: number[], b: number[]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (r - a[0]);
      for (let i = 0; i < m.idx.length; i += 3) {
        const [a, b, c] = [...m.idx.slice(i, i + 3)].map(p), signs = [cross(a, b), cross(b, c), cross(c, a)];
        if (signs.every(v => v >= -1e-5) || signs.every(v => v <= 1e-5)) return true;
      }
      return false;
    };
    for (const depth of [20, 50]) {
      s.joinDepth = depth;
      const result = buildLayerBands(s, states, false, false);
      for (const cap of result.membranes.slice(-2)) {
        expect(contains(cap, 35, 493)).toBe(true);
        expect(contains(cap, 100, 493)).toBe(false);
        expect(contains(cap, 100, 435)).toBe(true);
      }
      let mesh = 0, membrane = 0;
      for (const band of layerBandPlan(s)) {
        mesh++;
        if (!band.kind) continue;
        const v = result.meshes[mesh].verts, n = v.length / 12;
        expect(result.membranes[membrane++].verts.slice(0, n * 3)).toEqual(v.slice(n * 3, n * 6));
        expect(result.membranes[membrane++].verts.slice(0, n * 3)).toEqual(v.slice(0, n * 3));
        mesh += 2;
      }
    }
  });

  it('内缩的真实成形六时刻保持有限坐标、缺口、物理解与进度', () => {
    const sims = buildLayerProfiles().map(d => createSkinUnit(d.spec, d.opts));
    const s = layerExample('study'); s.upper.radius = 70; s.lower.radius = 130;
    for (const step of [0, 200, 500, 800, 1200, 1500]) {
      for (const sim of sims) while (sim.step < step) sim.advance();
      const before = sims.map(sim => ({ x: [...sim.px], y: [...sim.py], step: sim.step, locked: structuredClone(sim.locked) }));
      for (const depth of [20, 50]) for (const morph of [0, 4]) {
        s.joinDepth = depth; s.morph = morph;
        const result = buildLayerBands(s, sims, true, false);
        expect([...result.meshes, ...result.membranes].every(m => m.verts.every(Number.isFinite)), `${step}/${depth}/${morph}`).toBe(true);
        for (const m of result.membranes) for (let i = 0; i < m.verts.length; i += 3) {
          const a = (Math.atan2(m.verts[i + 2], m.verts[i]) * 180 / Math.PI + 360) % 360;
          expect(a > 245.01 && a < 359.99).toBe(false);
        }
      }
      expect(sims.map(sim => ({ x: [...sim.px], y: [...sim.py], step: sim.step, locked: sim.locked }))).toEqual(before);
    }
    const base = buildLayerBands(s, sims, false, false);
    const changed = buildLayerBands(s, sims.map(sim => ({ ...sim, px: Float64Array.from(sim.px, x => x * .8) })), false, false);
    expect(changed.membranes[4].verts).not.toEqual(base.membranes[4].verts);
  }, 30000);
});
