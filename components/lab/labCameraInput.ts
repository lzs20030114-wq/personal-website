/** Input belongs to the containing Lab panel; camera math remains in OrbitCamera. */
export type CameraCommand = 'in' | 'out' | 'home';
export const CAMERA_COMMAND = 'lab-camera-command';

export function cameraWheelDelta(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, pageHeight: number): number {
  return e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1);
}

export function shouldZoomCamera(expanded: boolean, e: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'cancelable'>): boolean {
  return expanded && e.cancelable && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
}

/** Element-local bridge lets the layout operate a camera without remounting its bench. */
export function attachLabCamera(canvas: HTMLCanvasElement, actions: { wheel: (delta: number) => void; home: () => void }) {
  canvas.dataset.labCamera = '';
  // Outside /lab (case pages), a pointer merely passing over the bench must not steal page scroll:
  // the wheel zooms only after the bench is pressed, and is released again when the pointer leaves.
  let engaged = false;
  const engage = () => { engaged = true; };
  const release = () => { engaged = false; };
  const wheel = (e: WheelEvent) => {
    const panel = canvas.closest('[data-lab-panel]');
    if (!shouldZoomCamera(panel ? panel.hasAttribute('data-expanded') : engaged, e)) return;
    e.preventDefault();
    actions.wheel(panel ? cameraWheelDelta(e, canvas.clientHeight) : e.deltaY);
  };
  const command = (e: Event) => {
    const action = (e as CustomEvent<CameraCommand>).detail;
    if (action === 'home') actions.home();
    else if (action === 'in' || action === 'out') actions.wheel(action === 'in' ? -150 : 150);
  };
  canvas.addEventListener('pointerdown', engage);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener(CAMERA_COMMAND, command);
  return () => {
    delete canvas.dataset.labCamera;
    canvas.removeEventListener('pointerdown', engage);
    canvas.removeEventListener('pointerleave', release);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener(CAMERA_COMMAND, command);
  };
}
