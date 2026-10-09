import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MACHINE_GROUPS } from './machine-shape';
import { MACHINE_BASE_AXIS, MACHINE_PLINTH, machineBaseGeometry, splitMachineFrame } from './machine-base';
import { yawPoint, sweepFraming } from './machine-behavior';

const bytes = readFileSync(new URL('../../demo/assets/machine-mesh.bin', import.meta.url));
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const frame = MACHINE_GROUPS.find(g => g.name === 'frame')!;
const verts = new Float32Array(buf, frame.vOff, frame.verts * 3);
const idx = new Uint16Array(buf, frame.iOff, frame.tris * 3);

describe('固定底座与旋转上部（815 实际载荷）', () => {
  it('拆分不丢不重任何三角，四只脚与立柱归固定底座，五环滑轨架归上部', () => {
    const { base, body } = splitMachineFrame(verts, idx);
    const triangles = (a: Uint16Array | Uint32Array): string[] => Array.from({ length: a.length / 3 }, (_, i) => `${a[i*3]},${a[i*3+1]},${a[i*3+2]}`);
    expect([...triangles(base), ...triangles(body)].sort()).toEqual(triangles(idx).sort());
    const fixed = new Set(base);
    const rotating = new Set(body);
    // 图纸四脚的范围，取每脚接地圆垫中心附近的顶点，而非按实现阈值抽样。
    for (const [x,y] of [[181.47,179.86],[-169.82,179.86],[-169.82,-171.43],[181.47,-168.02]]) {
      const foot = Array.from({ length: frame.verts }, (_, i) => i).filter(i => Math.hypot(verts[i*3]-x,verts[i*3+1]-y)<20 && verts[i*3+2]<-144);
      expect(foot.length).toBeGreaterThan(20);
      expect(foot.every(i => fixed.has(i) && !rotating.has(i))).toBe(true);
    }
    expect([...fixed].some(i => verts[i*3+2]>-30)).toBe(true); // 承托立柱也固定
    expect([...rotating].some(i => verts[i*3+2]>200)).toBe(true); // 上部滑轨
  });

  it('圆柱轴心全角度不漂，机身围绕它转而非围绕世界原点', () => {
    const axis = { ...MACHINE_BASE_AXIS, z: -20.06 };
    for (const a of [-Math.PI, -1.3, 0, 1.3, Math.PI]) expect(yawPoint(axis, a)).toEqual(axis);
    const p = { x: axis.x + 100, y: axis.y, z: 40 };
    expect(yawPoint(p, Math.PI / 2)).toEqual({ x: axis.x + Math.cos(Math.PI/2)*100, y: axis.y + 100, z: 40 });
  });

  it('实体展台承托所有底座顶点，轴承中心同旋转轴，任意预设视角都装得下台面', () => {
    const { base } = splitMachineFrame(verts, idx);
    for (const i of base) {
      expect(Math.abs(verts[i*3] - MACHINE_BASE_AXIS.x)).toBeLessThan(MACHINE_PLINTH.half);
      expect(Math.abs(verts[i*3+1] - MACHINE_BASE_AXIS.y)).toBeLessThan(MACHINE_PLINTH.half);
      expect(verts[i*3+2]).toBeGreaterThanOrEqual(MACHINE_PLINTH.top);
    }
    const g = machineBaseGeometry();
    expect(g.grid.length).toBeGreaterThan(0);
    for (const data of Object.values(g)) expect([...data].every(Number.isFinite)).toBe(true);
    const xs = Array.from(g.bearing).filter((_, i) => i%3===0);
    const ys = Array.from(g.bearing).filter((_, i) => i%3===1);
    expect((Math.min(...xs)+Math.max(...xs))/2).toBeCloseTo(MACHINE_BASE_AXIS.x,5);
    expect((Math.min(...ys)+Math.max(...ys))/2).toBeCloseTo(MACHINE_BASE_AXIS.y,5);
    for (const a of [0,0.8,1.6]) {
      const m = [Math.cos(a),-Math.sin(a),0,Math.sin(a),Math.cos(a),0,0,0,1];
      const { pivot, scale } = sweepFraming(m);
      for (let i=0; i<g.plinth.length; i+=3) {
        const p = [g.plinth[i]-pivot.x,g.plinth[i+1]-pivot.y,g.plinth[i+2]-pivot.z];
        expect(Math.abs((m[0]*p[0]+m[1]*p[1]+m[2]*p[2])*scale)).toBeLessThan(350);
        expect(Math.abs((m[3]*p[0]+m[4]*p[1]+m[5]*p[2])*scale)).toBeLessThan(260);
      }
    }
  });
});
