import { describe, expect, it, vi } from 'vitest';
import { attachLabCamera, CAMERA_COMMAND, cameraWheelDelta, shouldZoomCamera } from './labCameraInput';

const wheel = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, cancelable: true };
describe('Lab camera input ownership', () => {
  it('leaves browsing wheel events with the page', () => {
    expect(shouldZoomCamera(false, wheel)).toBe(false);
    expect(shouldZoomCamera(true, wheel)).toBe(true);
  });
  it('preserves browser modifiers and refuses a wheel it cannot cancel', () => {
    for (const key of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) expect(shouldZoomCamera(true, { ...wheel, [key]: true })).toBe(false);
    expect(shouldZoomCamera(true, { ...wheel, cancelable: false })).toBe(false);
  });
  it('normalizes line and page wheels without reversing their direction', () => {
    expect(cameraWheelDelta({ deltaY: -3, deltaMode: 1 }, 500)).toBe(-48);
    expect(cameraWheelDelta({ deltaY: 1, deltaMode: 2 }, 500)).toBe(500);
    expect(cameraWheelDelta({ deltaY: 12, deltaMode: 0 }, 500)).toBe(12);
  });
  it('uses live panel state, keeps button zoom available, and removes all input on cleanup', () => {
    let expanded = false;
    const canvas = Object.assign(new EventTarget(), { dataset: {} as Record<string, string>, clientHeight: 520, closest: () => ({ hasAttribute: () => expanded }) });
    const actions = { wheel: vi.fn(), home: vi.fn() };
    const cleanup = attachLabCamera(canvas as unknown as HTMLCanvasElement, actions);
    // Event.cancelable is read-only; leave that native property on the event.
    const wheelEvent = (extra = {}) => Object.assign(new Event('wheel', { cancelable: true }), { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, deltaY: 3, deltaMode: 1 }, extra);
    const browse = wheelEvent(); canvas.dispatchEvent(browse);
    expect(browse.defaultPrevented).toBe(false); expect(actions.wheel).not.toHaveBeenCalled();
    canvas.dispatchEvent(new CustomEvent(CAMERA_COMMAND, { detail: 'in' }));
    expect(actions.wheel).toHaveBeenLastCalledWith(-150);
    expanded = true;
    const zoom = wheelEvent(); canvas.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true); expect(actions.wheel).toHaveBeenLastCalledWith(48);
    const pinch = wheelEvent({ ctrlKey: true }); canvas.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(false); expect(actions.wheel).toHaveBeenCalledTimes(2);
    canvas.dispatchEvent(new CustomEvent(CAMERA_COMMAND, { detail: 'home' }));
    expect(actions.home).toHaveBeenCalledOnce();
    cleanup(); canvas.dispatchEvent(wheelEvent()); canvas.dispatchEvent(new CustomEvent(CAMERA_COMMAND, { detail: 'home' }));
    expect(actions.wheel).toHaveBeenCalledTimes(2); expect(actions.home).toHaveBeenCalledOnce(); expect(canvas.dataset.labCamera).toBeUndefined();
  });
});
