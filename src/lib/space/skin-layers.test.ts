import { describe, expect, it } from 'vitest';
import { buildLayerGeometry, layerAngles, layerBaseline, layerColumns, layerCovers, layerExample,
  layerHeight, layersJoin, layerStats, LAYERS, LAYER_OUTLINES } from './skin-layers';

describe('多层台目标几何', () => {
  it('复用双层台尺寸，连接只把凹口变直边，最外顶底面不移动', () => {
    const s = layerBaseline();
    expect(layerHeight(s, 0, LAYERS.outer, 0)).toBe(-66);
    expect(layerHeight(s, 3, LAYERS.outer, 0)).toBe(66);
    expect(layerColumns(s, 40).map(c => [c.top, c.bottom])).toEqual([[0, 1], [2, 3]]);
    s.joinSweep = 60;
    expect(layerColumns(s, 40).map(c => [c.top, c.bottom])).toEqual([[0, 3]]);
    expect(layerHeight(s, 0, LAYERS.outer, 0)).toBe(-66);
    expect(layerHeight(s, 3, LAYERS.outer, 0)).toBe(66);
    expect(layerColumns(s, 180)).toHaveLength(2);
  });
  it('240° 精确收口，覆盖量不依赖圆周原有的二十个位置', () => {
    const s = layerBaseline(); s.upper.outline = 'thirds'; s.upper.rotation = 7;
    const aa = layerAngles(s);
    expect(aa).toContain(7); expect(aa).toContain(247);
    const covered = aa.slice(0, -1).reduce((sum, a, i) => sum + (layerCovers(s.upper, (a + aa[i + 1]) / 2) ? aa[i + 1] - a : 0), 0);
    expect(covered).toBe(240);
  });
  it('分离双扇区保持两段，上下层各自选择，不以百分比混成半圆', () => {
    const s = layerBaseline(); s.upper.outline = 'opposed';
    expect([45, 135, 225, 315].map(a => layerCovers(s.upper, a))).toEqual([true, false, true, false]);
    expect([45, 135, 225, 315].map(a => layerCovers(s.lower, a))).toEqual([true, true, true, true]);
  });
  it('连接区取实际重叠，处理绕过 0° 和没有重叠的情况', () => {
    const s = layerBaseline(); s.upper.outline = 'half'; s.joinStart = 330; s.joinSweep = 90;
    expect(layerStats(s).joined).toBe(60);
    expect(layersJoin(s, 355)).toBe(false); expect(layersJoin(s, 40)).toBe(true);
    s.lower.outline = 'half'; s.lower.rotation = 180;
    expect(layerStats(s).joined).toBe(0);
  });
  it('倾斜是整个平面，径向也有坡度，所有允许倾角都保留层间净空', () => {
    const s = layerExample('tilt'); s.upper.tilt = 20; s.lower.tilt = 20;
    const slope = Math.tan(Math.PI / 9);
    expect(layerHeight(s, 0, 80, 0) - layerHeight(s, 0, 10, 0)).toBeCloseTo(70 * slope);
    expect(layerHeight(s, 0, 80, 90)).toBeCloseTo(-66);
    expect(layerStats(s).clearance).toBeGreaterThan(17);
    for (let a = 0; a < 360; a++) expect(layerHeight(s, 2, LAYERS.outer, a) - layerHeight(s, 1, LAYERS.outer, a)).toBeGreaterThan(17);
  });
  it('所有轮廓组合在扇区端部和厚台交界处闭合，不跨缺口、不留开放边', () => {
    for (const upper of LAYER_OUTLINES) for (const lower of LAYER_OUTLINES) for (const width of [0, 95, 360]) {
      const s = layerBaseline();
      s.upper = { ...s.upper, outline: upper.key, rotation: 7, tilt: 12, direction: 35 };
      s.lower = { ...s.lower, outline: lower.key, rotation: 47, tilt: 19, direction: 215 };
      s.joinStart = 325; s.joinSweep = width;
      const g = buildLayerGeometry(s), edges = new Map<string, number>();
      for (const mesh of Object.values(g.meshes)) {
        const key = (i: number) => Array.from(mesh.verts.slice(i * 3, i * 3 + 3), v => Math.round(v * 1000)).join(',');
        for (let i = 0; i < mesh.idx.length; i += 3) {
          const tri = [key(mesh.idx[i]), key(mesh.idx[i + 1]), key(mesh.idx[i + 2])];
          expect(new Set(tri).size).toBe(3);
          for (let j = 0; j < 3; j++) { const e = [tri[j], tri[(j + 1) % 3]].sort().join('|'); edges.set(e, (edges.get(e) ?? 0) + 1); }
        }
      }
      expect([...edges.values()].every(v => v === 2), `${upper.key}/${lower.key}/${width}`).toBe(true);
    }
  });
});
