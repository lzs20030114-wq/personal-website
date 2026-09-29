import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import type { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { SkinTerminalResult } from '../../src/lib/space/skin-terminal';
import { SkinUnit } from '../../src/lib/space/skin-unit';
import { buildSplitRingUnits } from '../../src/lib/space/skin-split-ring';
import { createSkinTerminalLoader } from './skinTerminal';
import { SkinSolidBench } from './SkinSolidBench';

// 只替换 React 调度和 GPU 边界；运行组件真实的帧循环、相机、渲染几何与终态提交。
const host = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  frame: (_dt: number) => {},
  matrices: [] as number[][],
  meshes: [] as Float32Array[],
  alphas: [] as (number | undefined)[],
  hud: { step: 0, phase: '' },
  terminal: vi.fn<(...args: unknown[]) => Promise<SkinTerminalResult>>(),
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useContext: () => null, // No page language provider in this isolated bench harness.
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void)) => { host.effects.push(effect); },
  useState: (initial: unknown) => {
    let value = initial;
    return [value, (next: unknown) => {
      value = typeof next === 'function' ? next(value) : next;
      if (value && typeof value === 'object' && 'phase' in value)
        host.hud = value as typeof host.hud;
    }];
  },
}));
vi.mock('./useBenchLoop', () => ({
  useBenchLoop: (_ref: unknown, step: (dt: number) => void) => { host.frame = step; },
}));
vi.mock('./skinTerminal', async (original) => ({
  ...await original<typeof import('./skinTerminal')>(),
  requestSkinTerminal: (...args: unknown[]) => host.terminal(...args),
}));
vi.mock('../../src/lib/linkage/gl3d', async (original) => ({
  ...await original<typeof import('../../src/lib/linkage/gl3d')>(),
  FlatRenderer: class {
    beginFrame(cam: OrbitCamera) { host.matrices.push([...cam.matrix]); }
    addMesh() {}
    drawMesh() {}
    drawDynamicMesh(data: Float32Array, _dark: unknown, _light: unknown, alpha?: number) { host.meshes.push(data); host.alphas.push(alpha); }
    drawLines() {}
    setPerspective() {}
  },
}));

type Props = { children?: ReactNode; [key: string]: unknown };
function elements(node: ReactNode): { type: unknown; props: Props }[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Props>(child)) return [];
    return [child, ...elements(child.props.children)];
  });
}
const unit = buildSplitRingUnits()[0]; // Lab 2-5 双层台

function mount(options: Partial<Parameters<typeof SkinSolidBench>[0]> = {}) {
  const nodes = elements(SkinSolidBench({ units: [unit], ring: true, order: [0], ...options }));
  const events = new Map<string, (e: object) => void>();
  const canvas = {
    dataset: {},
    closest: () => null,
    clientHeight: 520,
    addEventListener: (name: string, fn: (e: object) => void) => events.set(name, fn),
    removeEventListener: (name: string) => events.delete(name),
    setPointerCapture() {},
  };
  (nodes.find((n) => n.type === 'canvas')!.props.ref as { current: unknown }).current = canvas;
  for (const effect of host.effects) {
    const cleanup = effect();
    if (cleanup) host.cleanups.push(cleanup);
  }
  const skipLabel = nodes.find((n) => n.type === 'label' && String(n.props.title).includes('直接载入'))!;
  const skipInput = elements(skipLabel.props.children).find((n) => n.type === 'input')!;
  return {
    skip: (checked: boolean) => (skipInput.props.onChange as (e: object) => void)({ target: { checked } }),
    view: () => (nodes.find((n) => n.type === 'button' && n.props.children === '顶')!.props.onClick as () => void)(),
    drag: () => {
      events.get('pointerdown')!({ pointerId: 1, clientX: 100, clientY: 100, button: 0 });
      events.get('pointermove')!({ pointerId: 1, clientX: 220, clientY: 145 });
      events.get('pointerup')!({ pointerId: 1 });
    },
  };
}

beforeEach(() => {
  host.effects = []; host.cleanups = []; host.matrices = []; host.meshes = [];
  host.alphas = [];
  host.hud = { step: 0, phase: '' };
  host.terminal.mockReset();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  host.cleanups.forEach((fn) => fn());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('SkinSolidBench 跳过成形', () => {
  it.each([0, .35, 1])('自定义表面的蒙皮沿用透明度 %s，实体先画且零透明度不绘制', alpha => {
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), idx = new Uint32Array([0, 1, 2]);
    mount({ skin: { def: alpha }, surface: () => ({
      meshes: [{ verts, idx, dark: [0, 0, 0], light: [1, 1, 1] }],
      membranes: [{ verts, idx, center: { x: 0, y: 0, z: 0 } }],
    }) });
    expect(host.alphas).toEqual(alpha === 0 ? [undefined] : [undefined, alpha]);
  });
  it('双色条带共用顶点时，两组索引仍各自烘焙，重画不丢掉半条带', () => {
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
    const result = { meshes: [new Uint32Array([0, 1, 2]), new Uint32Array([0, 1, 3])].map(idx => ({ verts, idx, dark: [0, 0, 0] as [number, number, number], light: [1, 1, 1] as [number, number, number] })) };
    mount({ surface: () => result });
    const [a, b] = host.meshes;
    expect(a).not.toEqual(b);
    host.frame(.01);
    expect(host.meshes.slice(-2)).toEqual([a, b]);
  });
  it.each(['pending', 'failed'])('%s 期间相机持续绘制，拖拽与预设仍有效', async (status) => {
    host.terminal.mockImplementation(() => status === 'failed'
      ? Promise.reject(new Error('fixture failure')) : new Promise(() => {}));
    const bench = mount();
    host.frame(0.05);
    const advance = vi.spyOn(SkinUnit.prototype, 'advance');
    bench.skip(true);
    await Promise.resolve();
    const before = host.matrices[host.matrices.length - 1];
    bench.drag(); host.frame(0.05);
    expect(host.matrices[host.matrices.length - 1]).not.toEqual(before);
    const dragged = host.matrices[host.matrices.length - 1];
    bench.view(); host.frame(0.05);
    expect(host.matrices[host.matrices.length - 1]).not.toEqual(dragged);
    expect(advance).not.toHaveBeenCalled();
    if (status === 'failed') expect(host.hud.phase).toContain('失败');
  });

  it('半成品一步提交真实终态，视角仍可用，不自动重播；取消后从头推进', async () => {
    const result = await createSkinTerminalLoader()([unit]);
    host.terminal.mockResolvedValue(result);
    const bench = mount();
    host.frame(0.05);
    const apply = vi.spyOn(SkinUnit.prototype, 'applyTerminalState');
    const advance = vi.spyOn(SkinUnit.prototype, 'advance');
    bench.skip(true);
    await Promise.resolve();
    expect(apply).toHaveBeenCalledExactlyOnceWith(result.states[0]);
    expect(host.hud.step).toBe(1500);
    const before = host.matrices[host.matrices.length - 1];
    bench.drag(); host.frame(0.05);
    expect(host.matrices[host.matrices.length - 1]).not.toEqual(before);
    for (let i = 0; i < 80; i++) host.frame(0.05);
    expect(host.hud.step).toBe(1500);
    expect(advance).not.toHaveBeenCalled();
    bench.skip(false); host.frame(0.05);
    expect(advance).toHaveBeenCalled();
    expect(host.hud.step).toBeLessThan(10);
  });

  it('取消后迟到的终态不能覆盖正在播放的新实例', async () => {
    const result = await createSkinTerminalLoader()([unit]);
    let finish!: (value: SkinTerminalResult) => void;
    host.terminal.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const bench = mount();
    const apply = vi.spyOn(SkinUnit.prototype, 'applyTerminalState');
    bench.skip(true); bench.skip(false);
    finish(result); await Promise.resolve();
    host.frame(0.05);
    expect(apply).not.toHaveBeenCalled();
    expect(host.hud.step).toBeLessThan(10);
  });
});
