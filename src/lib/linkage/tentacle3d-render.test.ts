import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bakeIndexed, bakeSkinned } from './gl3d';
import { applyContraction3, createTentacle3, TENTACLE3D } from './tentacle3d-data';
import { MESH_GROUPS } from './tentacle3d-shape';
import { tentacleCellFrame } from './tentacle3d-render';

const asset = (): ArrayBuffer => {
  const bytes = readFileSync(new URL('../../demo/assets/tentacle3d-mesh.bin', import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const response = (buf: ArrayBuffer): Response => new Response(buf);
const bytes = (a: Float32Array): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

afterEach(() => vi.unstubAllGlobals());

describe('触手 CPU 网格缓存', () => {
  it('并发实例共用一次准备，全部组与原烘焙逐字节相同；后续挂载命中缓存', async () => {
    vi.resetModules();
    const { loadTentacleMeshes } = await import('./tentacle3d-render');
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetcher);
    const first = loadTentacleMeshes();
    const second = loadTentacleMeshes();
    expect(second).toBe(first);
    const buf = asset();
    resolve(response(buf));
    const meshes = await first;
    expect(await second).toBe(meshes);
    expect(await loadTentacleMeshes()).toBe(meshes);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(meshes).toHaveLength(MESH_GROUPS.length);
    MESH_GROUPS.forEach((g, i) => {
      const verts = new Float32Array(buf, g.vOff, g.verts * 3);
      const idx = g.idx32 ? new Uint32Array(buf, g.iOff, g.tris * 3) : new Uint16Array(buf, g.iOff, g.tris * 3);
      const expected = g.blend ? bakeSkinned(verts, idx, g.blend[0], g.blend[1]) : bakeIndexed(verts, idx);
      expect(meshes[i].name).toBe(g.name);
      expect(meshes[i].skinned).toBe(!!g.blend);
      expect(Buffer.compare(bytes(meshes[i].data), bytes(expected))).toBe(0);
    });
  });

  // 下载走共享层（mesh-fetch.ts，2026-11-08）：先拉 .gz，.gz 网络出错 / 非 2xx 时同一次里退回原文件。
  // 所以一轮失败 = 两个地址都失败（network / http 各 2 次请求）；截断 = .gz 拿到 4 个字节（不是 gzip 魔数，原样用）。
  it.each([
    ['network', 2],
    ['http', 2],
    ['truncated', 1],
  ] as const)('%s 失败后清缓存，所有等待者拒绝且下一次可重试', async (kind, firstRound) => {
    vi.resetModules();
    const { loadTentacleMeshes } = await import('./tentacle3d-render');
    let broken = true;
    const fetcher = vi.fn((_url: string): Promise<Response> => {
      if (!broken) return Promise.resolve(response(asset()));
      if (kind === 'network') return Promise.reject(new Error('offline'));
      return Promise.resolve(kind === 'http' ? new Response(null, { status: 503 }) : response(new ArrayBuffer(4)));
    });
    vi.stubGlobal('fetch', fetcher);
    const first = loadTentacleMeshes();
    const second = loadTentacleMeshes();
    const failed = await Promise.allSettled([first, second]);
    expect(failed.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(fetcher).toHaveBeenCalledTimes(firstRound);
    broken = false;
    expect(await loadTentacleMeshes()).toHaveLength(MESH_GROUPS.length);
    expect(fetcher).toHaveBeenCalledTimes(firstRound + 1);
  });
});

describe('触手局部刚架', () => {
  it('弯曲过程中保持节点原点与单位正交轴，读取不修改求解器', () => {
    const sim = createTentacle3();
    applyContraction3(sim.solver, sim.tendons[0], 0.9);
    for (let step = 0; step < 60; step++) sim.solver.step(1 / 60, TENTACLE3D.sweeps);
    const before = sim.solver.nodes.map((p) => ({ ...p }));
    for (let i = 0; i <= TENTACLE3D.segments; i++) {
      const f = tentacleCellFrame(sim.solver.nodes, i);
      expect(f.o).toBe(sim.solver.nodes[i]);
      expect(Math.hypot(f.ux, f.uy, f.uz)).toBeCloseTo(1, 12);
      expect(Math.hypot(f.ex, f.ey, f.ez)).toBeCloseTo(1, 12);
      expect(Math.hypot(f.fx, f.fy, f.fz)).toBeCloseTo(1, 12);
      expect(f.ux * f.ex + f.uy * f.ey + f.uz * f.ez).toBeCloseTo(0, 12);
      expect(f.ux * f.fx + f.uy * f.fy + f.uz * f.fz).toBeCloseTo(0, 12);
    }
    expect(sim.solver.nodes).toEqual(before);
  });
});
