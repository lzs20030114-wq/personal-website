import { describe, expect, it } from 'vitest';
import { createSkinUnit } from './skin-unit';
import { buildLayerProfiles } from './skin-layers-forming';
import { buildLayerSurface, layerProfileAt } from './skin-layers-surface';
import { layerExample, LAYER_EXAMPLES, LAYERS } from './skin-layers';
import { auditLayerProfile } from '../../../scripts/skin-layers/audit';
import { sqSplitWrap } from './skin-square-split';

describe('多层台完整成形表面', () => {
  it('图示组合精确保留 5° 错位区、240° 缺口和对向连接，不把单层伪装成双层', () => {
    const s = layerExample('study');
    expect(layerProfileAt(s, 2)).toBe('upper');
    expect(layerProfileAt(s, 7)).toBe('double');
    expect(layerProfileAt(s, 45)).toBe('solid');
    expect(layerProfileAt(s, 225)).toBe('solid');
    expect(layerProfileAt(s, 242)).toBe('lower');
    expect(layerProfileAt(s, 300)).toBeNull();
  });
  it('单层区真跑到自己的物理高度，键全锁且原始过程不打结', () => {
    const up = auditLayerProfile('upper'), down = auditLayerProfile('lower');
    for (const r of [up, down]) {
      expect(r.finite).toBe(true);
      expect(r.locked).toBe(r.keys);
      expect(r.height).toBeCloseTo(16, 2);
      expect(Math.abs(r.reach - 83.2)).toBeLessThan(1);
      expect(r.knot).toBe(0);
      expect(r.silD).toBeLessThan(1);
    }
    expect(Math.abs(up.center - (493.39 - 58))).toBeLessThan(.6);
    expect(Math.abs(down.center - (493.39 + 58))).toBeLessThan(.6);
    expect(() => sqSplitWrap(['f', 151, []], 305, 'invalid', 78)).toThrow();
    expect(() => sqSplitWrap(['f', 151, []], 305, 'invalid', .5)).toThrow();
  });
  it('整件逐帧读取实际节点；开口没有跨角度的面，姿态映射不修改物理解', () => {
    const sims = buildLayerProfiles().map(b => createSkinUnit(b.spec, b.opts));
    const s = layerExample('study');
    for (const step of [0, 200, 500, 800, 1200, 1500]) {
      for (const sim of sims) while (sim.step < step) sim.advance();
      const before = sims.map(sim => [...sim.py]);
      const raw = buildLayerSurface(s, sims, false), tilted = buildLayerSurface(s, sims, true);
      expect(tilted.meshes.some((m, k) => m.verts.some((v, i) => v !== raw.meshes[k].verts[i]))).toBe(true);
      for (const m of raw.meshes) expect(Array.from(m.verts).every(Number.isFinite)).toBe(true);
      expect(sims.map(sim => [...sim.py])).toEqual(before);
      // 300° 在两层共同缺口内，连蒙皮也不能从这里经过。
      for (const m of raw.meshes.slice(0, 3)) for (let i = 0; i < m.verts.length; i += 3) {
        if (Math.hypot(m.verts[i], m.verts[i + 2]) <= LAYERS.inner) continue;
        const a = (Math.atan2(m.verts[i + 2], m.verts[i]) * 180 / Math.PI + 360) % 360;
        expect(a > 245.01 && a < 359.99).toBe(false);
      }
    }
    const final = buildLayerSurface(s, sims, false);
    const reach = Math.max(...Array.from(final.meshes[0].verts).filter((_, i) => i % 3 === 0));
    expect(reach).toBeGreaterThan(100);
    const changed = sims.map(sim => ({ ...sim, px: Float64Array.from(sim.px, v => v * .8) }));
    const smaller = buildLayerSurface(s, changed, false);
    expect(Math.max(...Array.from(smaller.meshes[0].verts).filter((_, i) => i % 3 === 0))).toBeLessThan(reach - 10);
    for (const p of LAYER_EXAMPLES) for (const whole of [true, false]) {
      const result = buildLayerSurface(layerExample(p.key), sims, true, whole);
      expect(result.meshes.every(m => Array.from(m.verts).every(Number.isFinite))).toBe(true);
    }
  }, 30000);
});
