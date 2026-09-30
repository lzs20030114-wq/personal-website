import { describe, expect, it, vi } from 'vitest';
import { FlatRenderer, type CellFrame } from './gl3d';

const frame: CellFrame = { o: { x: 0, y: 0, z: 0 }, ux: 1, uy: 0, uz: 0, ex: 0, ey: 1, ez: 0, fx: 0, fy: 0, fz: 1 };
function renderer() {
  // 运行真实的注册和绘制入口，只替换 GPU 边界。
  const gpu = {
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, TRIANGLES: 4,
    createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(), bufferData: vi.fn(), drawArrays: vi.fn(),
    createShader: vi.fn(() => ({})), createProgram: vi.fn(() => ({})),
    getShaderParameter: vi.fn(() => true), getProgramParameter: vi.fn(() => true),
  };
  const noop = vi.fn();
  const gl = new Proxy(gpu, { get: (target, key) => Reflect.get(target, key) ?? noop });
  const r = new FlatRenderer({ getContext: () => gl } as unknown as HTMLCanvasElement);
  gpu.createBuffer.mockClear(); // 不把构造时的三个公共缓冲算进网格注册
  return { r, gpu };
}
const cases = [
  { kind: '刚体', stride: 6, add: 'addMesh', draw: (r: FlatRenderer, id: string) => r.drawMesh(id, frame) },
  { kind: '蒙皮', stride: 7, add: 'addSkinnedMesh', draw: (r: FlatRenderer, id: string) => r.drawSkinned(id, frame, frame, 0) },
] as const;

describe('FlatRenderer 网格缓冲复用', () => {
  it.each(cases)('$kind 同名更新复用缓冲，上传新数据并按新顶点数绘制', ({ stride, add, draw }) => {
    const { r, gpu } = renderer();
    r[add]('part', new Float32Array(3 * stride));
    const buffer = gpu.createBuffer.mock.results[0].value;
    for (let n = 2; n <= 20; n++) {
      const data = new Float32Array(n * 3 * stride).fill(n);
      r[add]('part', data);
      expect(gpu.bufferData).toHaveBeenLastCalledWith(gpu.ARRAY_BUFFER, data, gpu.STATIC_DRAW);
      draw(r, 'part');
      expect(gpu.bindBuffer).toHaveBeenLastCalledWith(gpu.ARRAY_BUFFER, buffer);
      expect(gpu.drawArrays).toHaveBeenLastCalledWith(gpu.TRIANGLES, 0, n * 3);
    }
    expect(gpu.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('不同 id 与同名不同网格类型独立保存，更新其中一个不覆盖其他网格', () => {
    const { r, gpu } = renderer();
    r.addMesh('a', new Float32Array(18));
    r.addMesh('b', new Float32Array(36));
    r.addSkinnedMesh('a', new Float32Array(63));
    r.addMesh('a', new Float32Array(72));
    const buffers = gpu.createBuffer.mock.results.map((call) => call.value);
    expect(new Set(buffers).size).toBe(3);
    for (const [i, count] of [12, 6, 9].entries()) {
      if (i === 2) r.drawSkinned('a', frame, frame, 0);
      else r.drawMesh(i === 0 ? 'a' : 'b', frame);
      expect(gpu.bindBuffer).toHaveBeenLastCalledWith(gpu.ARRAY_BUFFER, buffers[i]);
      expect(gpu.drawArrays).toHaveBeenLastCalledWith(gpu.TRIANGLES, 0, count);
    }
  });
});
