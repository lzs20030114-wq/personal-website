import { SENSE_GEOM, unitOccluders, type Camera, type Cyl, type OBox } from '../../src/lib/space/cohabit-sense';
import type { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { PlanLayout } from '../../src/lib/space/unit-activation';
import type { ObservedBody, SenseObserver, SenseView } from '../../src/lib/space/sense-observer';
import { CAT_LINKS, DEPTH, PERSON_LINKS, camProject, hitPoint, type P3 } from '../../src/lib/space/sense-view';
import type { Palette } from './planDraw';

/**
 * Lab 2-17 · 空间怎么知道人和猫在哪：一张 2D canvas（逻辑 700×520，与平面台架同尺，/lab 的版式规则照用）。
 * 左边 = 方案 A 四台摄像头各自看到的画面（低保真：点和线），或方案 B 的俯视（量到固定点的距离画成圆）；
 * 右边 = 用点抽象出来的立体模型：A 每个人一副由点连成的骨架、每只猫几个点，B 每个身体一个点加朝向。
 */
export const SW = 700;
export const SH = 520;
/** 左边一列：A = 四台摄像头的画面竖排（4:3），B = 俯视 + 量到的四个距离 */
export const LEFT = { x: 8, y: 8, w: 162, h: 504 } as const;
const GAP = 6;
const VIEW_W = LEFT.w;
const VIEW_H = (LEFT.h - GAP * 3) / 4;
/** 右边立体模型 */
export const RIGHT = { x: 182, y: 8, w: 510, h: 504 } as const;
/** 立体模型绕着转的点：房间正中、半层高 */
export const PIVOT = { x: 0, y: 0, z: SENSE_GEOM.ceiling / 2 } as const;

/** 猫的颜色（人用 accent） */
export const CAT_COLOR = '#e3a857';

export interface SenseFrame {
  view: SenseView;
  obs: SenseObserver;
  layout: PlanLayout;
  degree: ArrayLike<number>;
  /** 每台单元此刻台面在哪（米） */
  topOf: (u: number) => number;
  furn: readonly OBox[];
  orbit: OrbitCamera;
  truth: boolean;
  /** 指针停在谁身上（'person:3'），null = 没有 */
  hover: string | null;
  /** B 的俯视画谁的距离圆 */
  focus: string | null;
  lang: 'zh' | 'en';
}

/**
 * 立体模型的机位：z 朝上的转盘姿态（OrbitCamera upAxis 'z' 的同一个式子 rotX(俯仰 + π/2)·rotZ(环绕)）。
 * elev = 视线高出水平的角（π/2 = 正俯视，此时画面与平面图同向）。
 */
export function zUpMatrix(yaw: number, elev: number): number[] {
  const p = Math.PI / 2 - elev;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // rotX(p) · rotZ(yaw)
  return [cy, -sy, 0, cp * sy, cp * cy, -sp, sp * sy, sp * cy, cp];
}

/** 立体视角预设（elev = 视线高出水平的角） */
export const SENSE_VIEWS = {
  axon: { yaw: 0.35, elev: 0.72 },
  top: { yaw: 0, elev: Math.PI / 2 },
  front: { yaw: 0, elev: 0.06 },
} as const;
export type SenseViewKey = keyof typeof SENSE_VIEWS;

/**
 * 让整间房（含 3.74 m 的天花）装进右边那块的缩放（像素 / 米）。斜视角按最不利的环绕角算，拖着转一圈也不出框；
 * 顶视 / 正视按预设的那个角算。
 */
export function senseFitScale(roomM: number, key: SenseViewKey): number {
  const v = SENSE_VIEWS[key];
  const half = roomM / 2;
  const H = SENSE_GEOM.ceiling;
  const yaws = key === 'axon' ? Array.from({ length: 19 }, (_, i) => (i / 18) * (Math.PI / 2)) : [v.yaw];
  let worst = Infinity;
  for (const yaw of yaws) {
    const m = zUpMatrix(yaw, v.elev);
    // 以枢轴为中心：横竖各取离中心最远的那个角 ×2
    let ax = 0;
    let ay = 0;
    for (const x of [-half, half])
      for (const y of [-half, half])
        for (const z of [0, H]) {
          ax = Math.max(ax, Math.abs(m[0] * x + m[1] * y + m[2] * (z - PIVOT.z)));
          ay = Math.max(ay, Math.abs(m[3] * x + m[4] * y + m[5] * (z - PIVOT.z)));
        }
    const wx = 2 * ax;
    const wy = 2 * ay;
    worst = Math.min(worst, (RIGHT.w * 0.95) / wx, (RIGHT.h * 0.95) / wy);
  }
  return worst;
}

/** 此刻突出画谁：指针停着的优先，否则台架轮着点名的那个 */
export const shownKey = (f: Pick<SenseFrame, 'hover' | 'focus'>): string | null => f.hover ?? f.focus;

export const bodyKey = (b: Pick<ObservedBody, 'kind' | 'id'>): string => `${b.kind}:${b.id}`;
export const bodyLabel = (b: Pick<ObservedBody, 'kind' | 'n'>, lang: 'zh' | 'en'): string =>
  lang === 'zh' ? `${b.kind === 'person' ? '人' : '猫'} ${b.n}` : `${b.kind === 'person' ? 'P' : 'C'}${b.n}`;

/** 第 i 台摄像头的画面框 */
export function viewRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: LEFT.x, y: LEFT.y + (i % 4) * (VIEW_H + GAP), w: VIEW_W, h: VIEW_H };
}

/** B 的俯视那一块（左列顶上的正方形） */
export const PLAN = { x: LEFT.x, y: LEFT.y, size: LEFT.w } as const;

/**
 * 站上的配色是 oklch 写的（readPalette 读到的是 oklch(…)）；这张图要按颜色加透明度，先在 1×1 的画布上把每个颜色画出来、
 * 读回成 #rrggbb。读不到（没有 canvas）时原样返回。
 */
export function solidPalette(pal: Palette): Palette {
  if (typeof document === 'undefined') return pal;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return pal;
  const hex = (color: string): string => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = color;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return `#${[r, gr, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  return { ink: hex(pal.ink), accent: hex(pal.accent), accent2: hex(pal.accent2), muted: hex(pal.muted), paper: hex(pal.paper), warn: hex(pal.warn) };
}

const alpha = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null, stroke?: string, lw = 1): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, color: string, lw = 1, dash: number[] = []): void {
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.setLineDash([]);
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x - r, y + r);
  ctx.lineTo(x + r, y - r);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 房间里挡视线的那些件（单元按程度与台面、家具）——画面与立体共用，和看见与否用的是同一份几何 */
function occluders(f: SenseFrame): { cyls: Cyl[]; boxes: OBox[] } {
  const cyls: Cyl[] = [];
  const boxes: OBox[] = [];
  for (const u of f.layout.units) unitOccluders(f.layout, u.x, u.y, f.degree[u.i], f.topOf(u.i), cyls, boxes);
  return { cyls, boxes };
}

const boxCorners = (b: OBox, z: number): P3[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = u * b.hx;
    const ly = v * b.hy;
    return { x: b.cx + lx * b.c + ly * b.s, y: b.cy - lx * b.s + ly * b.c, z };
  });

const colorOf = (b: ObservedBody, pal: Palette): string => (b.kind === 'person' ? pal.accent : CAT_COLOR);
const linksOf = (b: ObservedBody) => (b.kind === 'person' ? PERSON_LINKS : CAT_LINKS);

// ───────────────────────────────────────────────────────────── 方案 A：四台摄像头的画面

function drawCamView(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette, ci: number, occ: { cyls: Cyl[]; boxes: OBox[] }): void {
  const cam = f.obs.cams[ci];
  const r = viewRect(ci);
  ctx.save();
  ctx.fillStyle = alpha('#000000', 0.18);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const P = (p: P3): { x: number; y: number } | null => {
    const q = camProject(cam, p);
    if (!q.front) return null;
    return { x: r.x + ((q.u + 1) / 2) * r.w, y: r.y + ((1 - q.v) / 2) * r.h };
  };
  const seg = (a: P3, b: P3, color: string, lw = 1, dash: number[] = []) => {
    const pa = P(a);
    const pb = P(b);
    if (pa && pb) line(ctx, pa, pb, color, lw, dash);
  };
  const half = f.layout.roomM / 2;
  const H = SENSE_GEOM.ceiling;
  const fl = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => ({ x, y, z: 0 }));
  const muted = alpha(pal.muted, 0.55);
  for (let k = 0; k < 4; k++) {
    seg(fl[k], fl[(k + 1) % 4], muted);
    seg(fl[k], { ...fl[k], z: H }, alpha(pal.muted, 0.3));
  }
  // 过道交叉点
  const n = f.layout.n;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const g = { x: -half + (i * f.layout.roomM) / n, y: -half + (j * f.layout.roomM) / n, z: 0 };
      const p = P(g);
      const far = f.obs.kind === 'depth' && Math.hypot(g.x - cam.x, g.y - cam.y, cam.z) > DEPTH.far;
      if (p) dot(ctx, p.x, p.y, 0.8, alpha(pal.muted, far ? 0.2 : 0.6));
    }
  // 家具（顶面）
  for (const b of f.furn) {
    const c = boxCorners(b, b.z1);
    for (let k = 0; k < 4; k++) seg(c[k], c[(k + 1) % 4], alpha(pal.muted, 0.45));
  }
  // 单元：芯与吊杆画成竖线、台面画成方框
  for (const c of occ.cyls) seg({ x: c.x, y: c.y, z: c.z0 }, { x: c.x, y: c.y, z: Math.min(c.z1, cam.z) }, alpha(pal.ink, 0.22), c.r > 0.05 ? 1.6 : 0.8);
  for (const b of occ.boxes) {
    if (f.furn.includes(b)) continue;
    const c = boxCorners(b, b.z1);
    for (let k = 0; k < 4; k++) seg(c[k], c[(k + 1) % 4], alpha(pal.ink, 0.4));
  }
  // 人和猫：看见的点实心，在框里却被挡的点空心
  for (const b of f.obs.bodies) {
    const col = colorOf(b, pal);
    const hot = bodyKey(b) === shownKey(f);
    const pts = b.truth.map((p) => P(p));
    const seen = b.seen.by.map((v) => v.includes(ci));
    for (const [a, c] of linksOf(b)) {
      if (seen[a] && seen[c] && pts[a] && pts[c]) line(ctx, pts[a]!, pts[c]!, alpha(col, hot ? 1 : 0.8), hot ? 1.6 : 1.1);
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const depthKind = f.obs.kind === 'depth';
    pts.forEach((p, k) => {
      if (!p) return;
      if (seen[k] && depthKind) {
        // 深度相机：测距以内的点实心（有深度），超出的只剩彩色画面里的一个点（空心）
        const d = Math.hypot(b.truth[k].x - cam.x, b.truth[k].y - cam.y, b.truth[k].z - cam.z);
        const inR = d >= DEPTH.near && d <= DEPTH.far;
        if (inR) dot(ctx, p.x, p.y, hot ? 2.2 : 1.7, col);
        else dot(ctx, p.x, p.y, hot ? 2.2 : 1.7, null, alpha(col, 0.8), 0.9);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      } else if (seen[k]) {
        dot(ctx, p.x, p.y, hot ? 2.2 : 1.7, col);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      } else if (b.seen.blocked[k].includes(ci)) dot(ctx, p.x, p.y, 1.6, null, alpha(pal.warn, 0.75), 0.9);
    });
    if (x0 < Infinity) {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = alpha(col, hot ? 0.95 : 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
      ctx.setLineDash([]);
      if (hot) {
        ctx.fillStyle = col;
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(bodyLabel(b, f.lang), x0 - 4, y0 - 6);
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = alpha(pal.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = pal.warn;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`A${ci + 1}${f.obs.kind === 'depth' ? (f.lang === 'zh' ? ' · 深度' : ' · depth') : ''}`, r.x + 5, r.y + 12);
}

// ───────────────────────────────────────────────────────────── 方案 B：俯视，量到固定点的距离

function drawTagPlan(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette, occ: { cyls: Cyl[]; boxes: OBox[] }): void {
  const size = PLAN.size;
  const ox = PLAN.x;
  const oy = PLAN.y;
  const half = f.layout.roomM / 2;
  const sc = size / f.layout.roomM;
  const X = (x: number) => ox + (x + half) * sc;
  const Y = (y: number) => oy + (y + half) * sc;
  ctx.save();
  ctx.fillStyle = alpha('#000000', 0.18);
  ctx.fillRect(ox, oy, size, size);
  ctx.beginPath();
  ctx.rect(ox, oy, size, size);
  ctx.clip();
  for (const b of f.furn) {
    const c = boxCorners(b, 0);
    ctx.beginPath();
    c.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.fillStyle = alpha(pal.muted, 0.18);
    ctx.fill();
  }
  for (const b of occ.boxes) {
    if (f.furn.includes(b)) continue;
    const c = boxCorners(b, 0);
    ctx.beginPath();
    c.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.strokeStyle = alpha(pal.ink, 0.3);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  const focus = f.obs.bodies.find((b) => bodyKey(b) === shownKey(f));
  if (focus) {
    // 每段距离 = 一个球；这里画它在解出那一高度上的截面圆，几个圆交在哪就是解出的位置
    f.obs.anchors.forEach((a, i) => {
      const rH = sectionR(focus.ranges[i], focus.tagEst.z - a.z);
      ctx.beginPath();
      ctx.arc(X(a.x), Y(a.y), rH * sc, 0, Math.PI * 2);
      ctx.setLineDash(focus.los[i] ? [] : [4, 3]);
      ctx.strokeStyle = focus.los[i] ? alpha(pal.accent, 0.55) : alpha(pal.warn, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    });
    if (f.truth) dot(ctx, X(focus.tag.x), Y(focus.tag.y), 3, null, alpha(pal.muted, 0.9), 1.2);
  }
  for (const b of f.obs.bodies) {
    const col = colorOf(b, pal);
    const x = X(b.tagEst.x);
    const y = Y(b.tagEst.y);
    if (!b.consistent) dot(ctx, x, y, 4.5, null, alpha(pal.warn, 0.9), 1);
    dot(ctx, x, y, 2.4, col);
    if (b.kind === 'person') line(ctx, { x, y }, { x: x + Math.cos(b.headingEst) * 0.4 * sc, y: y + Math.sin(b.headingEst) * 0.4 * sc }, col, 1.3);
    if (bodyKey(b) === shownKey(f)) dot(ctx, x, y, 0.32 * sc, null, pal.ink, 1);
  }
  ctx.restore();
  ctx.strokeStyle = alpha(pal.ink, 0.35);
  ctx.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  f.obs.anchors.forEach((a, i) => {
    const x = Math.min(Math.max(X(a.x), ox + 5), ox + size - 5);
    const y = Math.min(Math.max(Y(a.y), oy + 5), oy + size - 5);
    diamond(ctx, x, y, 5, pal.ink);
    ctx.fillStyle = pal.ink;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(String(i + 1), x + (a.x < 0 ? 7 : -13), y + (a.y < 0 ? 12 : -6));
  });
  if (focus) drawRanges(ctx, f, pal, focus);
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 球（半径 r）在离球心竖直 dz 处的截面圆半径 */
const sectionR = (r: number, dz: number): number => Math.sqrt(Math.max(0, r * r - dz * dz));

const POSTURE_ZH: Record<string, string> = { walk: '走', stand: '站', sit: '坐', lie: '趴', unknown: '看不清' };
const POSTURE_EN: Record<string, string> = { walk: 'walk', stand: 'stand', sit: 'sit', lie: 'lie', unknown: 'unclear' };
const PLACE_ZH: Record<string, string> = { floor: '地上', furniture: '家具上', unit: '台上', unknown: '' };
const PLACE_EN: Record<string, string> = { floor: 'floor', furniture: 'on furniture', unit: 'on a unit', unknown: '' };

/** 读到的在做什么，写成一行：人「站 · 看猫 2 2.4 s」，猫「坐 · 台上」 */
export function doingText(b: ObservedBody, bodies: readonly ObservedBody[], lang: 'zh' | 'en', d = b.read): string {
  const zh = lang === 'zh';
  // 方案 B 读不到猫的姿势：只写在哪
  const parts = d.posture === 'unknown' && d.place !== 'unknown' && b.kind === 'cat' ? [] : [(zh ? POSTURE_ZH : POSTURE_EN)[d.posture]];
  if (b.kind === 'person') {
    if (d.lean) parts.push(zh ? '前倾' : 'lean');
    if (d.watching !== null) {
      const c = bodies.find((x) => x.kind === 'cat' && x.id === d.watching);
      const name = c ? (zh ? `猫 ${c.n}` : `C${c.n}`) : zh ? '猫' : 'a cat';
      const t = d === b.read && b.watchFor >= 0.5 ? ` ${b.watchFor.toFixed(1)} s` : '';
      parts.push(zh ? `看着${name}${t}` : `→ ${name}${t}`);
    }
  } else if (d.place !== 'unknown') parts.push((zh ? PLACE_ZH : PLACE_EN)[d.place]);
  return parts.join(' · ');
}

/** B 的左列下半：选中的那个身体量到四个固定点的距离、解出来对不对得上、高度读成坐还是站；人再加一个朝向盘 */
function drawRanges(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette, b: ObservedBody): void {
  const zh = f.lang === 'zh';
  const col = colorOf(b, pal);
  const x0 = LEFT.x;
  let y = PLAN.y + PLAN.size + 20;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = col;
  ctx.fillText(zh ? `${bodyLabel(b, f.lang)} · 量到四个固定点` : `${bodyLabel(b, f.lang)} · four distances`, x0, y);
  y += 15;
  const maxR = Math.hypot(f.layout.roomM, f.layout.roomM, SENSE_GEOM.ceiling);
  const barW = LEFT.w - 82;
  ctx.font = '9px ui-monospace, monospace';
  f.obs.anchors.forEach((_, i) => {
    const r = b.ranges[i];
    const los = b.los[i];
    diamond(ctx, x0 + 4, y - 3, 4, pal.ink);
    ctx.fillStyle = pal.ink;
    ctx.fillText(String(i + 1), x0 + 11, y);
    const bx = x0 + 20;
    line(ctx, { x: bx, y: y - 3 }, { x: bx + barW, y: y - 3 }, alpha(pal.muted, 0.25), 1);
    line(ctx, { x: bx, y: y - 3 }, { x: bx + (barW * Math.min(r, maxR)) / maxR, y: y - 3 }, los ? col : pal.warn, 2.2, los ? [] : [3, 2]);
    ctx.fillStyle = los ? alpha(pal.ink, 0.85) : pal.warn;
    ctx.fillText(`${r.toFixed(2)}`, bx + barW + 3, y);
    const e = b.resid[i];
    ctx.fillStyle = Math.abs(e) > 0.12 ? pal.warn : alpha(pal.muted, 0.95);
    ctx.fillText(`${e >= 0 ? '+' : '−'}${Math.abs(e).toFixed(2)}`, bx + barW + 32, y);
    y += 14;
  });
  ctx.fillStyle = alpha(pal.muted, 0.95);
  ctx.fillText(zh ? '距离 m · 残差 m · 虚线 = 其实隔着身体' : 'distance m · residual m · dashed = through a body', x0, y);
  y += 16;
  ctx.fillStyle = b.consistent ? alpha(pal.ink, 0.85) : pal.warn;
  ctx.fillText(
    b.consistent ? (zh ? '四段对得上' : 'the four distances agree') : zh ? '四段对不上：有一段读长了' : 'the four disagree: one reads long',
    x0,
    y,
  );
  y += 13;
  if (!b.consistent) {
    ctx.fillStyle = alpha(pal.muted, 0.95);
    ctx.fillText(zh ? '（看得出有错，看不出是哪一段）' : '(an error shows, not which one)', x0, y);
    y += 13;
  }
  const err = Math.hypot(b.tagEst.x - b.tag.x, b.tagEst.y - b.tag.y, b.tagEst.z - b.tag.z);
  ctx.fillStyle = alpha(pal.ink, 0.85);
  const like = b.kind === 'person' ? (zh ? ` · 像${b.tagHeightSit ? '坐' : '站'}` : ` · looks ${b.tagHeightSit ? 'seated' : 'standing'}`) : '';
  ctx.fillText(zh ? `解出高度 ${b.tagEst.z.toFixed(2)} m${like}` : `height ${b.tagEst.z.toFixed(2)} m${like}`, x0, y);
  y += 13;
  ctx.fillStyle = b.tagOk === false ? pal.warn : alpha(pal.ink, 0.85);
  const how = b.kind === 'person' ? (zh ? '（坐不坐看座位压力）' : ' (seat pad for sitting)') : zh ? '（在哪台看称重）' : ' (load cell for the unit)';
  ctx.fillText((zh ? '读成 ' : 'read: ') + doingText(b, f.obs.bodies, f.lang, b.tagRead) + how, x0, y);
  y += 13;
  ctx.fillStyle = alpha(pal.muted, 0.95);
  ctx.fillText(zh ? `与真实位置差 ${err.toFixed(2)} m` : `${err.toFixed(2)} m from the true position`, x0, y);
  if (b.kind !== 'person') return;
  // 朝向盘：真朝向（淡虚线）与读到的（实线）
  y += 20;
  ctx.fillStyle = col;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(zh ? '读到的朝向（身体）' : 'facing read (body)', x0, y);
  const cx = x0 + 30;
  const cy = y + 34;
  const R = 24;
  dot(ctx, cx, cy, R, null, alpha(pal.muted, 0.5), 1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    line(ctx, { x: cx + Math.cos(a) * (R - 3), y: cy + Math.sin(a) * (R - 3) }, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }, alpha(pal.muted, 0.6), 1);
  }
  line(ctx, { x: cx, y: cy }, { x: cx + Math.cos(b.heading) * R, y: cy + Math.sin(b.heading) * R }, alpha(pal.muted, 0.8), 1, [2, 2]);
  line(ctx, { x: cx, y: cy }, { x: cx + Math.cos(b.headingEst) * R, y: cy + Math.sin(b.headingEst) * R }, col, 1.8);
  dot(ctx, cx, cy, 2, col);
  let d = ((b.headingEst - b.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  d = (d * 180) / Math.PI;
  ctx.fillStyle = alpha(pal.ink, 0.75);
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(zh ? `差 ${d >= 0 ? '+' : ''}${d.toFixed(0)}°` : `off ${d >= 0 ? '+' : ''}${d.toFixed(0)}°`, cx + R + 10, cy - 4);
  ctx.fillStyle = alpha(pal.muted, 0.9);
  ctx.fillText(zh ? '虚线 = 真实' : 'dashed = true', cx + R + 10, cy + 10);
}

// ───────────────────────────────────────────────────────────── 右边：用点抽象的立体模型

function draw3D(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette, occ: { cyls: Cyl[]; boxes: OBox[] }): void {
  const o = f.orbit;
  const P = (p: P3) => o.project({ x: p.x, y: p.y, z: p.z });
  const half = f.layout.roomM / 2;
  const Hc = SENSE_GEOM.ceiling;
  ctx.save();
  ctx.beginPath();
  ctx.rect(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h);
  ctx.clip();
  const fl = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => ({ x, y, z: 0 }));
  for (let k = 0; k < 4; k++) {
    line(ctx, P(fl[k]), P(fl[(k + 1) % 4]), alpha(pal.muted, 0.7), 1);
    line(ctx, P(fl[k]), P({ ...fl[k], z: Hc }), alpha(pal.muted, 0.28), 1, [2, 3]);
    line(ctx, P({ ...fl[k], z: Hc }), P({ ...fl[(k + 1) % 4], z: Hc }), alpha(pal.muted, 0.22), 1, [2, 3]);
  }
  const n = f.layout.n;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const p = P({ x: -half + (i * f.layout.roomM) / n, y: -half + (j * f.layout.roomM) / n, z: 0 });
      dot(ctx, p.x, p.y, 0.9, alpha(pal.muted, 0.7));
    }
  for (const b of f.furn) {
    const c = boxCorners(b, b.z1).map(P);
    ctx.beginPath();
    c.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = alpha(pal.muted, 0.4);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // 单元：台面画成一圈点，芯与吊杆画成细竖线
  for (const c of occ.cyls) line(ctx, P({ x: c.x, y: c.y, z: c.z0 }), P({ x: c.x, y: c.y, z: c.z1 }), alpha(pal.ink, 0.13), 0.8);
  for (const b of occ.boxes) {
    if (f.furn.includes(b)) continue;
    const c = boxCorners(b, b.z1);
    for (let k = 0; k < 4; k++)
      for (let t = 0; t < 6; t++) {
        const a = c[k];
        const e = c[(k + 1) % 4];
        const p = P({ x: a.x + ((e.x - a.x) * t) / 6, y: a.y + ((e.y - a.y) * t) / 6, z: a.z });
        dot(ctx, p.x, p.y, 0.9, alpha(pal.ink, 0.5));
      }
  }
  if (f.view === 'camera') {
    // 视线：看见的点连到摄像头；指针停着的那个更亮，被挡的画到挡住处
    for (const b of f.obs.bodies) {
      const hot = bodyKey(b) === shownKey(f);
      if (!hot) continue;
      const col = colorOf(b, pal);
      b.est.forEach((p, k) => {
        for (const ci of b.seen.by[k]) line(ctx, P(f.obs.cams[ci]), P(p), alpha(col, 0.4), 0.9);
        if (hot)
          for (const ci of b.seen.blocked[k]) {
            const cam = f.obs.cams[ci];
            const h = hitPoint(f.obs.scene, cam, b.truth[k], b.kind === 'person' ? b.id : -1);
            const ph = P(h);
            line(ctx, P(cam), ph, alpha(pal.warn, 0.7), 1, [4, 3]);
            cross(ctx, ph.x, ph.y, 3, pal.warn);
          }
      });
    }
    for (const [i, cam] of f.obs.cams.entries()) {
      const p = P(cam);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 5, p.y + 4);
      ctx.lineTo(p.x - 5, p.y + 4);
      ctx.closePath();
      ctx.fillStyle = pal.warn;
      ctx.fill();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`A${i + 1}`, p.x + 7, p.y + 3);
    }
  } else {
    for (const b of f.obs.bodies) {
      const hot = bodyKey(b) === shownKey(f);
      if (!hot) continue;
      f.obs.anchors.forEach((a, i) => {
        const los = b.los[i];
        line(ctx, P(a), P(b.tagEst), los ? alpha(colorOf(b, pal), 0.6) : alpha(pal.warn, 0.85), 1.1, los ? [] : [4, 3]);
        {
          const pa = P(a);
          const pb = P(b.tagEst);
          ctx.fillStyle = los ? alpha(pal.ink, 0.8) : pal.warn;
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(`${b.ranges[i].toFixed(2)} m`, (pa.x + pb.x) / 2 + 3, (pa.y + pb.y) / 2 - 2);
        }
        // 这一段距离的球在解出那一高度上的截面，只画解出位置附近的一段弧：四段弧交在一点 = 对得上
        const rH = sectionR(b.ranges[i], b.tagEst.z - a.z);
        const th = Math.atan2(b.tagEst.y - a.y, b.tagEst.x - a.x);
        ctx.beginPath();
        for (let s2 = -12; s2 <= 12; s2++) {
          const q = P({ x: a.x + Math.cos(th + s2 * 0.03) * rH, y: a.y + Math.sin(th + s2 * 0.03) * rH, z: b.tagEst.z });
          if (s2 === -12) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.setLineDash(los ? [] : [3, 2]);
        ctx.strokeStyle = los ? alpha(colorOf(b, pal), 0.8) : pal.warn;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      });
      if (f.truth) {
        const q = P(b.tag);
        dot(ctx, q.x, q.y, 3.2, null, alpha(pal.muted, 0.95), 1.2);
      }
    }
    f.obs.anchors.forEach((a, i) => {
      const p = P(a);
      diamond(ctx, p.x, p.y, 6, pal.ink);
      ctx.fillStyle = pal.ink;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(String(i + 1), p.x + 8, p.y + 3);
    });
  }
  // 真实位置（淡灰虚线骨架）
  if (f.truth)
    for (const b of f.obs.bodies) for (const [a, c] of linksOf(b)) line(ctx, P(b.truth[a]), P(b.truth[c]), alpha(pal.muted, 0.75), 1, [2, 2]);
  // 身体
  for (const b of f.obs.bodies) {
    const col = colorOf(b, pal);
    const hot = bodyKey(b) === shownKey(f);
    if (f.view === 'camera') {
      const pts = b.est.map(P);
      const fixed = (k: number) => b.fix[k] === 'tri' || b.fix[k] === 'depth';
      for (const [a, c] of linksOf(b)) if (b.fix[a] !== 'none' && b.fix[c] !== 'none') line(ctx, pts[a], pts[c], alpha(col, fixed(a) && fixed(c) ? 0.95 : 0.45), hot ? 1.8 : 1.3);
      b.est.forEach((p, k) => {
        const s = pts[k];
        if (fixed(k)) dot(ctx, s.x, s.y, hot ? 3 : 2.4, col);
        else if (b.fix[k] === 'ray') {
          const d = b.ray[k]!.d;
          const a = P({ x: p.x - d.x * 0.3, y: p.y - d.y * 0.3, z: p.z - d.z * 0.3 });
          const e = P({ x: p.x + d.x * 0.3, y: p.y + d.y * 0.3, z: p.z + d.z * 0.3 });
          line(ctx, a, e, alpha(col, 0.7), 1.4);
          dot(ctx, s.x, s.y, 2.4, null, col, 1.1);
        } else if (b.lostFor[k] < 1.5) dot(ctx, s.x, s.y, 2, null, alpha(pal.muted, 0.6 * (1 - b.lostFor[k] / 1.5)), 1);
      });
      if (b.fix.every((x) => x === 'none')) {
        const s = pts[0];
        ctx.fillStyle = pal.warn;
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillText('?', s.x - 3, s.y + 4);
      }
      const head = pts[0];
      label(ctx, f, pal, b, head.x + 6, head.y - 6, hot, b.read, b.readOk);
    } else {
      const t = b.tagEst;
      const ring: { x: number; y: number }[] = [];
      const rr = b.consistent ? 0.12 : 0.25;
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        ring.push(P({ x: t.x + Math.cos(a) * rr, y: t.y + Math.sin(a) * rr, z: t.z }));
      }
      ctx.beginPath();
      ring.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.fillStyle = alpha(col, 0.14);
      ctx.fill();
      ctx.strokeStyle = alpha(col, 0.6);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      const s = P(t);
      // 一根落到地面的竖线，读得出这个点有多高
      line(ctx, s, P({ x: t.x, y: t.y, z: 0 }), alpha(col, 0.35), 1, [2, 2]);
      dot(ctx, s.x, s.y, hot ? 4 : 3.4, col);
      if (b.kind === 'person') {
        const e = P({ x: t.x + Math.cos(b.headingEst) * 0.45, y: t.y + Math.sin(b.headingEst) * 0.45, z: t.z });
        line(ctx, s, e, col, 1.6);
      }
      label(ctx, f, pal, b, s.x + 6, s.y - 6, hot, b.tagRead, b.tagOk);
    }
  }
  ctx.restore();
}

/** 身体旁的两行字：名字 + 读到的在做什么；读错了用粉色，指针停着的那个另写真实的 */
function label(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette, b: ObservedBody, x: number, y: number, hot: boolean, d: ObservedBody['read'], ok: boolean | null): void {
  const col = colorOf(b, pal);
  const name = bodyLabel(b, f.lang);
  const txt = doingText(b, f.obs.bodies, f.lang, d);
  // 别画出右边那一块：放不下就挪到点的左边
  const fit = (w: number) => (x + w > RIGHT.x + RIGHT.w - 4 ? Math.max(RIGHT.x + 4, RIGHT.x + RIGHT.w - 4 - w) : x);
  if (!hot) {
    // 不是指针停着的那个：名字与读数写成一行小字，免得一群人挤在一起时字叠成一片
    ctx.font = '9px ui-monospace, monospace';
    x = fit(ctx.measureText(`${name} ${txt}`).width);
    ctx.fillStyle = alpha(col, 0.8);
    ctx.fillText(name, x, y);
    ctx.fillStyle = ok === false ? pal.warn : alpha(pal.ink, 0.62);
    if (txt) ctx.fillText(txt, x + ctx.measureText(name + ' ').width, y);
    return;
  }
  ctx.font = '10px ui-monospace, monospace';
  const really = ok === false ? (f.lang === 'zh' ? '实为 ' : 'really ') + doingText(b, f.obs.bodies, f.lang, b.real) : '';
  x = fit(Math.max(ctx.measureText(txt).width, ctx.measureText(really).width));
  ctx.fillStyle = col;
  ctx.fillText(name, x, y);
  ctx.fillStyle = ok === false ? pal.warn : alpha(pal.ink, 0.95);
  ctx.fillText(txt, x, y + 12);
  if (ok === false) {
    ctx.fillStyle = alpha(pal.muted, 0.95);
    ctx.fillText(really, x, y + 24);
  }
}

export function drawSense(ctx: CanvasRenderingContext2D, f: SenseFrame, pal: Palette): void {
  ctx.clearRect(0, 0, SW, SH);
  const occ = occluders(f);
  if (f.view === 'camera') {
    const nc = f.obs.cams.length;
    for (let i = 0; i < 4; i++) {
      if (i < nc) drawCamView(ctx, f, pal, i, occ);
      else {
        const r = viewRect(i);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = alpha(pal.muted, 0.35);
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        ctx.setLineDash([]);
        ctx.fillStyle = alpha(pal.muted, 0.7);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(f.lang === 'zh' ? '这一布置只有两台' : 'this layout has two', r.x + 8, r.y + r.h / 2 + 3);
      }
    }
    if (nc > 4) {
      const r = viewRect(3);
      ctx.fillStyle = alpha(pal.ink, 0.75);
      ctx.font = '9px ui-monospace, monospace';
      const msg = f.lang === 'zh' ? `另 ${nc - 4} 台（墙中点）只在右边画` : `+${nc - 4} at wall midpoints, shown right`;
      ctx.fillText(msg, r.x + 4, r.y + r.h - 5);
    }
  } else drawTagPlan(ctx, f, pal, occ);
  // 左右分隔
  line(ctx, { x: RIGHT.x - 6, y: RIGHT.y + 6 }, { x: RIGHT.x - 6, y: RIGHT.y + RIGHT.h - 6 }, alpha(pal.ink, 0.15), 1);
  draw3D(ctx, f, pal, occ);
}

/** 指针停在谁身上：立体里按头 / 标签点，左边按画面里的框中心或俯视点；24 px 以内取最近的 */
export function pickBody(f: SenseFrame, px: number, py: number): string | null {
  let best: string | null = null;
  let bd = 24;
  const consider = (key: string, x: number, y: number) => {
    const d = Math.hypot(x - px, y - py);
    if (d < bd) {
      bd = d;
      best = key;
    }
  };
  for (const b of f.obs.bodies) {
    const p = f.view === 'camera' ? b.est[0] : b.tagEst;
    const s = f.orbit.project({ x: p.x, y: p.y, z: p.z });
    consider(bodyKey(b), s.x, s.y);
    if (f.view === 'camera') {
      f.obs.cams.slice(0, 4).forEach((cam, ci) => {
        const r = viewRect(ci);
        const q = camProject(cam, b.truth[0]);
        if (!q.front || Math.abs(q.u) > 1 || Math.abs(q.v) > 1) return;
        if (!b.seen.by.some((v) => v.includes(ci))) return;
        consider(bodyKey(b), r.x + ((q.u + 1) / 2) * r.w, r.y + ((1 - q.v) / 2) * r.h);
      });
    } else {
      const sc = PLAN.size / f.layout.roomM;
      const half = f.layout.roomM / 2;
      consider(bodyKey(b), PLAN.x + (b.tagEst.x + half) * sc, PLAN.y + (b.tagEst.y + half) * sc);
    }
  }
  return best;
}

/** 指针在不在立体那一块（拖动 = 转视角） */
export const inRight = (x: number, y: number): boolean => x >= RIGHT.x && x <= RIGHT.x + RIGHT.w && y >= RIGHT.y && y <= RIGHT.y + RIGHT.h;
export type { Camera };
