/** 离线线稿和守门共用；读原始解算节点，不作平滑或形态修正。 */
import { buildLayerProfile, LAYER_FORMING, type LayerProfileKind } from '../../src/lib/space/skin-layers-forming';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit';
import { silhouette } from '../../src/lib/space/skin-split';
import { sqSplitTarget } from '../../src/lib/space/skin-square-split';

type Point = [number, number];
function knotSpan(p: Point[]) {
  let span = 0;
  for (let i = 0; i + 1 < p.length; i++) for (let j = i + 2; j + 1 < p.length; j++) {
    const [a, b, c, d] = [p[i], p[i + 1], p[j], p[j + 1]];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1];
    const den = ux * vy - vx * uy;
    if (Math.abs(den) < 1e-12) continue;
    const s = (-uy * (a[0] - c[0]) + ux * (a[1] - c[1])) / den;
    const t = (vx * (a[1] - c[1]) - vy * (a[0] - c[0])) / den;
    if (s > 0 && s < 1 && t > 0 && t < 1) span = Math.max(span, j - i);
  }
  return span;
}

export function auditLayerProfile(kind: LayerProfileKind) {
  const build = buildLayerProfile(kind), sim = createSkinUnit(build.spec, build.opts);
  const m = build.marks;
  const frames: { step: number; points: Point[]; knot: number; top: number; bottom: number }[] = [];
  const point = (i: number): Point => [sim.px[i] * 100, -sim.py[i] * 100];
  const capture = () => {
    const points = Array.from({ length: build.free }, (_, j) => point(build.lead + j));
    frames.push({ step: sim.step, points, knot: knotSpan(points), top: point(m.faceA)[1], bottom: point(m.faceB)[1] });
  };
  capture();
  for (let step = 0; step < SKIN.STEPS; step++) { sim.advance(); if (sim.step % 10 === 0) capture(); }
  const last = frames[frames.length - 1];
  const center = (last.top + last.bottom) / 2;
  const reach = (point(m.faceA)[0] + point(m.faceB)[0]) / 2;
  const single = kind === 'upper' || kind === 'lower';
  const target = sqSplitTarget(kind === 'double' ? 1 : 0, LAYER_FORMING.reach, single ? 0 : LAYER_FORMING.gap, single ? 16 : LAYER_FORMING.height);
  const a = silhouette(last.points.map(p => [p[0], p[1] - center]), -70, 70);
  const b = silhouette(target, -70, 70);
  const silD = a.reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0) / a.length;
  const flat = (lo: number, hi: number) => {
    const yy = Array.from({ length: hi - lo + 1 }, (_, i) => point(lo + i))
      .filter(([x]) => x > reach * .35 && x < reach * .85).map(p => p[1]);
    return Math.max(...yy) - Math.min(...yy);
  };
  return {
    kind, reach, height: last.bottom - last.top, center, silD,
    topFlat: flat(m.outA, m.faceA), bottomFlat: flat(m.faceB, m.outB),
    locked: sim.locked.length, keys: sim.chains.reduce((sum, chain) => sum + chain.length, 0),
    gap: point(m.mouthB)[1] - point(m.mouthA)[1],
    frontStraight: Math.max(...Array.from({ length: m.faceB - m.faceA + 1 }, (_, i) => Math.abs(point(m.faceA + i)[0] - reach))),
    knot: Math.max(...frames.map(f => f.knot)),
    finite: frames.every(f => f.points.every(p => p.every(Number.isFinite))),
    frames, target,
  };
}
