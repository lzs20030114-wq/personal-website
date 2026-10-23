import { describe, expect, it, vi } from 'vitest';
import { FlatRenderer, type CellFrame } from './gl3d';
import type { OrbitCamera } from './camera3d';

interface Program { context: object; id: number }
interface Location { program: Program; name: string }

/** GPU boundary that rejects handles belonging to another context/program. */
function gpuBoundary() {
  const context = {};
  const programs: Program[] = [];
  let current: Program | null = null;
  const writes: { name: string; values: unknown[] }[] = [];
  const getUniformLocation = vi.fn((program: Program, name: string): Location => ({ program, name }));
  const getAttribLocation = vi.fn((program: Program, name: string) =>
    program.id * 4 + ['aPos', 'aNrm', 'aW', 'aT'].indexOf(name));
  const uniform = (location: Location | null, ...values: unknown[]) => {
    if (location === null) return;
    expect(location).toBeDefined();
    expect(location.program.context).toBe(context);
    expect(location.program).toBe(current);
    writes.push({ name: location.name, values });
  };
  const attribute = (location: number) => {
    expect(Math.floor(location / 4)).toBe(current?.id);
  };
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    TRIANGLES: 4, LINES: 1, POINTS: 0, BLEND: 3042, DEPTH_TEST: 2929, LESS: 513,
    COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771, ONE: 1,
    drawingBufferWidth: 1400, drawingBufferHeight: 1040,
    createShader: () => ({}), shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: () => true, getProgramParameter: () => true,
    createProgram: () => {
      const program = { context, id: programs.length };
      programs.push(program);
      return program;
    },
    attachShader: vi.fn(), linkProgram: vi.fn(),
    useProgram: (program: Program) => { expect(program.context).toBe(context); current = program; },
    getUniformLocation, getAttribLocation,
    uniform1f: uniform, uniform2f: uniform, uniform3f: uniform, uniformMatrix3fv: uniform,
    enableVertexAttribArray: attribute, disableVertexAttribArray: attribute, vertexAttribPointer: attribute,
    createBuffer: () => ({}), bindBuffer: vi.fn(), bufferData: vi.fn(), drawArrays: vi.fn(),
    enable: vi.fn(), disable: vi.fn(), depthFunc: vi.fn(), depthMask: vi.fn(),
    clearColor: vi.fn(), clear: vi.fn(), viewport: vi.fn(), blendFuncSeparate: vi.fn(),
  };
  const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement;
  return { gl, canvas, writes };
}

const frame: CellFrame = {
  o: { x: 2, y: 3, z: 4 }, ux: 1, uy: 0, uz: 0,
  ex: 0, ey: 1, ez: 0, fx: 0, fy: 0, fz: 1,
};
const camera = {
  matrix: [1, 2, 3, 4, 5, 6, 7, 8, 9], pivotPoint: { x: 11, y: 12, z: 13 },
  viewScale: 1.4, pan: { x: 15, y: 16 },
} as unknown as OrbitCamera;
const triangle = new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]);
const skinned = new Float32Array(21);
const color: [number, number, number] = [0.2, 0.3, 0.4];
const places = [{ x: 3, y: 4, z: 5, yaw: 0.2 }, { x: 6, y: 7, z: 8, yaw: -0.5, s: 0.8 }];

function drawAll(r: FlatRenderer) {
  r.beginFrame(camera);
  r.drawMesh('mesh', frame, color, [0.8, 0.9, 1]);
  r.drawMeshAt('mesh', places, color);
  r.drawDynamicMesh(triangle);
  r.drawDynamicMesh(triangle, color, [0.8, 0.9, 1], 0.35, places);
  r.drawSkinned('skin', frame, { ...frame, o: { x: 5, y: 3, z: 4 } }, 3);
  r.drawPointCloud(skinned, color, [0.8, 0.9, 1], 0.8, 0.4);
  r.drawLines([{ a: frame.o, b: { x: 6, y: 7, z: 8 } }], color, 0.005, places);
  r.drawDots([frame.o], 1.5, color);
}

describe('FlatRenderer program bindings', () => {
  it('reuses linked handles across all draw paths and keeps blend/depth restoration', () => {
    const { gl, canvas } = gpuBoundary();
    const r = new FlatRenderer(canvas);
    const uniformLookups = gl.getUniformLocation.mock.calls.length;
    const attributeLookups = gl.getAttribLocation.mock.calls.length;
    expect(uniformLookups).toBeGreaterThan(0);
    expect(attributeLookups).toBeGreaterThan(0);
    r.addMesh('mesh', triangle);
    r.addSkinnedMesh('skin', skinned);
    for (let i = 0; i < 3; i++) drawAll(r);
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(uniformLookups);
    expect(gl.getAttribLocation).toHaveBeenCalledTimes(attributeLookups);
    expect(gl.depthMask.mock.calls.map(([value]) => value)).toEqual([
      false, true, false, true, false, true, false, true, false, true, false, true,
    ]);
    expect(gl.disable).toHaveBeenLastCalledWith(gl.BLEND);
  });

  it('keeps each renderer program isolated, including renderers on the same context', () => {
    const first = gpuBoundary();
    const second = gpuBoundary();
    const renderers = [new FlatRenderer(first.canvas), new FlatRenderer(second.canvas), new FlatRenderer(first.canvas)];
    for (const r of renderers) { r.addMesh('mesh', triangle); r.addSkinnedMesh('skin', skinned); }
    for (const r of [...renderers, ...[...renderers].reverse()]) drawAll(r);
  });

  it('reads one camera matrix per frame and sends the same transposed values to all programs', () => {
    const { canvas, writes } = gpuBoundary();
    const r = new FlatRenderer(canvas);
    const matrix = vi.fn(() => camera.matrix);
    const cam = { ...camera, get matrix() { return matrix(); } } as unknown as OrbitCamera;
    r.beginFrame(cam);
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(writes.filter((write) => write.name === 'uView').map((write) => write.values)).toEqual(
      Array.from({ length: 4 }, () => [false, [1, 4, 7, 2, 5, 8, 3, 6, 9]]),
    );
  });
});
