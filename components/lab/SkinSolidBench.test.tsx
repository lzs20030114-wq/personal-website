import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import type { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { SkinTerminalResult } from '../../src/lib/space/skin-terminal';
import { SkinUnit } from '../../src/lib/space/skin-unit';
import * as skinMath from '../../src/lib/space/skin-unit';
import * as solidMath from '../../src/lib/space/skin-solid';
import { buildRingUnits, RING } from '../../src/lib/space/skin-ring';
import { buildSplitRingUnits } from '../../src/lib/space/skin-split-ring';
import { comboBuild, comboForms, comboPlan } from '../../src/lib/space/unit-combo';
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
  hooks: [] as { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }[],
  cursor: 0,
  places: [] as (readonly { x: number; z: number; yaw: number }[] | undefined)[],
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useContext: () => null, // No page language provider in this isolated bench harness.
  useRef: (current: unknown) => {
    const i = host.cursor++;
    host.hooks[i] ??= { value: { current } };
    return host.hooks[i].value;
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
    const i = host.cursor++;
    const old = host.hooks[i];
    if (old && deps && old.deps && deps.length === old.deps.length && deps.every((d, j) => Object.is(d, old.deps![j]))) return;
    const hook = host.hooks[i] = { deps, cleanup: old?.cleanup };
    host.effects.push(() => {
      hook.cleanup?.();
      const cleanup = effect();
      hook.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    });
  },
  useState: (initial: unknown) => {
    const i = host.cursor++;
    const hook = host.hooks[i] ??= { value: initial };
    return [hook.value, (next: unknown) => {
      const value = hook.value = typeof next === 'function' ? next(hook.value) : next;
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
    drawDynamicMesh(data: Float32Array, _dark: unknown, _light: unknown, alpha?: number, places?: readonly { x: number; z: number; yaw: number }[]) { host.meshes.push(data); host.alphas.push(alpha); host.places.push(places); }
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
  let props = { units: [unit], ring: true, order: [0], ...options };
  const render = () => {
    host.cursor = 0;
    return elements(SkinSolidBench(props));
  };
  let nodes = render();
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
  const flush = () => { for (const effect of host.effects.splice(0)) effect(); };
  flush();
  const skipLabel = nodes.find((n) => n.type === 'label' && String(n.props.title).includes('直接载入'))!;
  const skipInput = elements(skipLabel.props.children).find((n) => n.type === 'input')!;
  return {
    rerender: (next: Partial<Parameters<typeof SkinSolidBench>[0]>) => {
      props = { ...props, ...next };
      nodes = render();
      (nodes.find((n) => n.type === 'canvas')!.props.ref as { current: unknown }).current = canvas;
      flush();
    },
    skip: (checked: boolean) => (skipInput.props.onChange as (e: object) => void)({ target: { checked } }),
    radius: (value: number) => (nodes.find(n => n.type === 'input' && n.props.type === 'range' && n.props.max === RING.RADIUS_MAX)!.props.onChange as (e: object) => void)({ target: { value: String(value) } }),
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
  host.hooks = []; host.cursor = 0; host.places = [];
  host.alphas = [];
  host.hud = { step: 0, phase: '' };
  host.terminal.mockReset();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  host.cleanups.forEach((fn) => fn());
  host.hooks.forEach((hook) => hook?.cleanup?.());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('SkinSolidBench 跳过成形', () => {
  it('阵列同谱只填一次局部几何；相机/零步重绘共用字节，推进/半径/终态/重播正确失效', async () => {
    const def = buildRingUnits()[3];
    host.terminal.mockResolvedValue(await createSkinTerminalLoader()([def]));
    const fill = vi.spyOn(solidMath, 'fillSolidVerts');
    const smooth = vi.spyOn(skinMath, 'renderSmooth');
    const bench = mount({ units: [def], order: undefined, ringPlans: [Array(20).fill(0)], cells: () => [{ x: 0, z: 0, plan: 0 }, { x: 200, z: 0, plan: 0 }], radius: { min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: 30 }, depth: RING.DEPTH, thick: RING.THICK, skin: { def: .35 } });
    expect(fill).toHaveBeenCalledTimes(1);
    expect(smooth).toHaveBeenCalledTimes(1);
    const start = host.meshes[0];
    expect(host.meshes[3]).toBe(start); // 下一方位的条纹 A 共用本地数据，摆位仍各自提交。
    const panel = host.meshes[host.meshes.length - 1];
    const orderBefore = host.places[host.places.length - 1]!.map(p => p.yaw);
    host.meshes = []; host.places = [];
    bench.drag(); host.frame(0);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(smooth).toHaveBeenCalledTimes(1);
    expect(host.meshes[0]).toBe(start);
    expect(host.meshes[host.meshes.length - 1]).toBe(panel);
    expect(host.places[host.places.length - 1]!.map(p => p.yaw)).not.toEqual(orderBefore);
    host.meshes = [];
    host.frame(.05);
    expect(fill).toHaveBeenCalledTimes(2);
    expect(host.meshes[0]).not.toBe(start);
    host.meshes = [];
    bench.skip(true); await Promise.resolve();
    const terminal = host.meshes[0];
    expect(fill).toHaveBeenCalledTimes(3);
    host.frame(.05);
    expect(fill).toHaveBeenCalledTimes(3);
    host.meshes = [];
    bench.radius(60);
    expect(fill).toHaveBeenCalledTimes(4);
    expect(host.meshes[0]).not.toEqual(terminal);
    host.meshes = [];
    bench.radius(30);
    expect(host.meshes[0]).toEqual(terminal);
    host.meshes = [];
    bench.skip(false);
    expect(host.meshes[0]).toEqual(start);
  });

  it('领先单元已 done、其他单元仍运行时，继续更新 EMA，不能以相同 step 复用旧画面', () => {
    const def = buildRingUnits()[3];
    // 给末步一段可见位移，隔离“done 后 EMA 尚未追上”的边界，不依赖某谱何时收敛。
    const advance = vi.spyOn(SkinUnit.prototype, 'advance').mockImplementation(function (this: SkinUnit) {
      if (this.done) return;
      this.px[25] += .15;
      this.step = 1500;
    });
    mount({ units: [def, { ...def, delay: 150 }], order: [0, 1], ring: false });
    host.meshes = [];
    host.frame(.05);
    const leading = advance.mock.contexts[0] as SkinUnit;
    expect(leading.done).toBe(true);
    const px = [...leading.px];
    const previous = host.meshes[0];
    host.meshes = [];
    host.frame(.05);
    expect([...leading.px]).toEqual(px);
    expect(host.meshes[0]).not.toBe(previous);
    expect(host.meshes[0]).not.toEqual(previous);
  });
  it('台阶切拱只更新环编制，两格都绘出，保留同谱求解进度与终态', async () => {
    const form = comboForms()[2];
    const step = comboBuild(comboPlan('step'), 'round', form, 2);
    const arch = comboBuild(comboPlan('arch'), 'round', form, 2);
    expect(step.keys).toEqual(arch.keys);
    expect(step.plans).toHaveLength(1);
    expect(arch.plans).toHaveLength(2);
    const cells = (plans: readonly number[]) => () => plans.map((plan, i) => ({ x: i * 200, z: 0, plan }));
    const advance = vi.spyOn(SkinUnit.prototype, 'advance');
    const bench = mount({ units: step.units, unitsKey: step.keys.join('|'), ringPlans: step.plans, cells: cells(step.cellPlan), cellsKey: 'step', order: undefined });
    host.frame(.05);
    const sims = [...new Set(advance.mock.contexts)] as SkinUnit[];
    const positions = sims.map(s => [...s.px]);
    const steps = sims.map(s => s.step);
    host.meshes = []; host.places = [];
    bench.rerender({ units: arch.units, ringPlans: arch.plans, cells: cells(arch.cellPlan), cellsKey: 'arch' });
    host.frame(0);
    expect(sims.map(s => s.step)).toEqual(steps);
    expect(sims.map(s => [...s.px])).toEqual(positions);
    expect(host.places.some(p => p?.some(q => q.x === 200))).toBe(true);
    expect(host.places.filter(p => p?.length === 0)).toHaveLength(0);
    host.terminal.mockResolvedValue(await createSkinTerminalLoader()(arch.units));
    bench.skip(true); await Promise.resolve();
    const apply = vi.spyOn(SkinUnit.prototype, 'applyTerminalState');
    host.meshes = []; host.places = [];
    bench.rerender({ units: step.units, ringPlans: step.plans, cells: cells(step.cellPlan), cellsKey: 'step' });
    host.frame(0);
    expect(apply).not.toHaveBeenCalled();
    expect(host.hud.step).toBe(1500);
    expect(host.places.filter(p => p?.length === 0)).toHaveLength(0);
    expect(host.places.some(p => p?.length === 2)).toBe(true);
  });
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
