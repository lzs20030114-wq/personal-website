/**
 * 固定步计时器的纯函数核心。调用方持有 remainder；本函数只决定本帧应推进几步。
 * 大 dt 只接纳 maxSteps 个子步的时间，避免切后台后长期追赶积压。
 */
export function consumeFixedSteps(
  remainder: number,
  dt: number,
  step: number,
  maxSteps: number,
): { steps: number; remainder: number } {
  if (!Number.isFinite(dt) || dt <= 0) return { steps: 0, remainder };
  const maxElapsed = step * maxSteps;
  const elapsed = Math.min(dt, maxElapsed);
  const total = Math.min(remainder + elapsed, maxElapsed);
  // 浮点护栏：让 1/60 ÷ 1/120 这类理论整数不会因末位误差少走一步。
  const steps = Math.min(maxSteps, Math.floor((total + step * 1e-9) / step));
  return { steps, remainder: Math.max(0, total - steps * step) };
}
