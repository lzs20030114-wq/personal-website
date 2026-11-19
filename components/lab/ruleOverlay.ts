import type { CohabitSim } from '../../src/lib/space/cohabit';
import type { RuleHit, RuleRow } from '../../src/lib/space/cohabit-reasons';
import { READOUT_ROW_OF, type ReadoutKind, type ReadoutLabels, type ReadoutLang } from '../../src/lib/space/cohabit-readout';
import { frame, type Palette } from './planDraw';

/**
 * Lab 2-14 平面图上的规则标注（2026-11-19，项目二_规则可视化方案.md §10，原型 scripts/rules-viz/proto.ts 的 drawOverlay 搬过来）：
 * 每台正在落的单元旁一个实心编号（第 4 节写数字、桌子写「桌」、被拦下的打 ×），一根细线连到引起它的人或猫
 * （走过的人用虚线，三道检查不连线）；读数里悬停或钉住一行时，画面只留这一行，并圈出牵涉的人和猫；
 * 人和猫标上读数里用的号（数字是访客、字母是猫）；点选的那台画一圈虚线。
 * 只画在 drawPlan 之后、不改 drawPlan（2-9 到 2-12 几台的画法不受影响）；坐标与 drawPlan 同一套 frame。
 */
export interface RuleOverlay {
  hits: readonly RuleHit[];
  /** 悬停或钉住的那一行（null = 全画） */
  focus: RuleRow | null;
  /** 点选的单元（null = 没有） */
  picked: number | null;
  labels: ReadoutLabels;
  lang: ReadoutLang;
}

export function kindInk(kind: ReadoutKind, pal: Palette): string {
  return kind === 'check' ? pal.warn : kind === 'rel' ? pal.accent2 : pal.ink;
}

export function drawRuleOverlay(ctx: CanvasRenderingContext2D, sim: CohabitSim, o: RuleOverlay, pal: Palette): void {
  const L = sim.layout;
  const { sc, ox, oy } = frame(L.roomM);
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy + y * sc;
  const posOf = new Map<number, { x: number; y: number }>();
  for (const p of sim.people) posOf.set(p.id, sim.drawPos(p));
  const catPos = new Map<number, { x: number; y: number }>();
  for (const c of sim.cats) catPos.set(c.id, { x: c.walker.x, y: c.walker.y });
  const r = L.platR * sc;
  const f = o.focus;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const drawn = new Set<string>();
  for (const h of o.hits) {
    const def = READOUT_ROW_OF.get(h.row)!;
    // 猫脚下那台本来就有紫环，第 7 节说的是人猫关系、不对应哪一台：两样都不标
    if (h.row === 'foot' || def.part === 7) continue;
    const hot = f === h.row;
    ctx.globalAlpha = f !== null && !hot ? 0.1 : 1;
    const ink = kindInk(def.kind, pal);
    const from = h.row === 'catMove' ? catPos.get(h.cats[0]) : h.people.length ? posOf.get(h.people[0]) : undefined;
    // ③ 只标猫的下一步（终点那台的紫点线圈 planDraw 已经画了）
    const targets = h.row === 'seatFar' ? [h.units[0]] : h.units;
    for (const u of targets) {
      const U = L.units[u];
      if (!U) continue;
      const bx = X(U.x) - r * 0.62;
      const by = Y(U.y) - r * 0.62;
      if (from && def.kind !== 'check') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.setLineDash(h.row === 'pass' ? [2, 3] : []);
        ctx.beginPath();
        ctx.moveTo(X(from.x), Y(from.y));
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const k = `${u}|${def.mark.en}`;
      if (drawn.has(k)) continue;
      drawn.add(k);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(bx, by, hot ? 9 : 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = pal.paper;
      ctx.stroke();
      ctx.fillStyle = pal.paper;
      ctx.font = '700 9.5px "JetBrains Mono", "Noto Sans SC", ui-monospace, monospace';
      ctx.fillText(def.mark[o.lang], bx, by + 0.5);
    }
  }
  // 聚焦一行：把牵涉的人和猫圈出来
  if (f) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = kindInk(READOUT_ROW_OF.get(f)!.kind, pal);
    ctx.lineWidth = 1.8;
    for (const h of o.hits) {
      if (h.row !== f) continue;
      for (const id of h.people) {
        const p = posOf.get(id);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const id of h.cats) {
        const p = catPos.get(id);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  // 人和猫的号（读数里用的就是这些号），描一圈底色防压线
  ctx.globalAlpha = 1;
  ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.lineJoin = 'round';
  const tag = (s: string, x: number, y: number, fill: string) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.paper;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  for (const p of sim.people) {
    if (!p.walker.present) continue;
    const q = posOf.get(p.id)!;
    tag(String(o.labels.personNo(p.id) || '?'), X(q.x) + 11, Y(q.y) - 11, pal.ink);
  }
  for (const c of sim.cats) tag(o.labels.catLetter(c.id), X(c.walker.x) + 10, Y(c.walker.y) - 10, pal.accent2);
  if (o.picked !== null && L.units[o.picked]) {
    const U = L.units[o.picked];
    ctx.strokeStyle = pal.ink;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(U.x), Y(U.y), r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** 点在平面图上的哪一台：离单元中心不到平台半径 1.2 倍的最近那台，没有返回 null */
export function unitAt(sim: CohabitSim, x: number, y: number): number | null {
  let best = -1;
  let bd = Infinity;
  for (const u of sim.layout.units) {
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u.i;
    }
  }
  return best >= 0 && bd < sim.layout.platR * 1.2 ? best : null;
}
