import { PLAN, aisleLines, type Activation, type Catchment, type PlanLayout, type TraceField } from '../../src/lib/space/unit-activation';

/**
 * 平面台架共用的画法（Lab.14 一个人走过 / Lab.15 几个人在场）：房间 + 痕迹场 + 单元 + 人。
 * 2D canvas，逻辑 700×520（与 WebGL 台架同尺）；配色从容器 CSS 变量读，深色 /lab 与 on-light 各自解析。
 * 留两份画法必然漂（Lab.04/05 蒙皮的教训），所以抽到这里；两台的差别只在「几个人、有没有走过的路」。
 */
export const W = 700;
export const H = 520;
const PAD_Y = 48;

export interface Palette {
  ink: string;
  accent: string;
  accent2: string;
  muted: string;
  paper: string;
  /** 警示（闸住的单元 / 让位圈）：全站的莲粉高光 */
  warn: string;
}

export function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#e9efe6'),
    accent: v('--accent', '#7fbf8f'),
    accent2: v('--accent-2', '#c9b8ee'),
    muted: v('--n500', '#8a9a90'),
    paper: v('--paper', '#1b2a33'),
    warn: v('--rose', '#d98aa0'),
  };
}

/** 房间在画布上的位置与比例：以 (W/2, H/2) 为中心，纵向留 PAD_Y */
export function frame(roomM: number): { sc: number; ox: number; oy: number } {
  const sc = (H - 2 * PAD_Y) / roomM;
  return { sc, ox: W / 2, oy: H / 2 };
}

export interface PlanPerson {
  x: number;
  y: number;
  heading: number;
  reach: number;
  /** 被指针按着：画粗一圈 */
  held?: boolean;
  /** 视野全角（弧度）；省略 / ≥ 2π = 全圆 */
  fov?: number;
  /** 让位距离 D（m）；省略 / 0 = 不留 */
  keepOut?: number;
  /** 走着且走廊开着：正前方一条 2D 宽的道不落痕迹（画成胶囊缺口） */
  lane?: boolean;
}

export interface PlanScene {
  layout: PlanLayout;
  field: TraceField;
  catchment: Catchment;
  act: Activation;
  people: readonly PlanPerson[];
  /** 走过的路（x,y 交替；可省） */
  trail?: readonly number[];
  /** 路的末端接到这个人（省略 = 不接） */
  trailEnd?: { x: number; y: number } | null;
  showTrace: boolean;
  /** 此刻被身体让位闸住的单元（省略 = 没有） */
  blocked?: Uint8Array | null;
}

/** 注意力区域用的离屏画布（缺口要用 destination-out 抠，不能直接在主画布上擦——会把地板一起擦掉） */
let offscreen: HTMLCanvasElement | null = null;
function attentionLayer(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!offscreen) {
    offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
  }
  return offscreen.getContext('2d');
}

/**
 * 人的注意力区域：影响半径的扇形（视野）减去让位圈，走着时再减去正前方的走廊——痕迹只落在这块地上。
 * 画成淡绿面 + 虚线边，随人的朝向转；让位圈是一圈莲粉虚线。全圆、不让位时退化成旧的影响圈虚线。
 */
function drawAttention(ctx: CanvasRenderingContext2D, p: PlanPerson, cx: number, cy: number, sc: number, pal: Palette): void {
  const R = p.reach * sc;
  const fov = p.fov ?? Math.PI * 2;
  const full = fov >= Math.PI * 2 - 1e-9;
  const D = (p.keepOut ?? 0) * sc;
  const off = attentionLayer();
  if (full && D <= 0) {
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }
  const a0 = p.heading - fov / 2;
  const a1 = p.heading + fov / 2;
  const wedge = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    if (full) c.arc(cx, cy, R, 0, Math.PI * 2);
    else {
      c.moveTo(cx, cy);
      c.arc(cx, cy, R, a0, a1);
      c.closePath();
    }
  };
  if (off) {
    off.setTransform(1, 0, 0, 1, 0, 0);
    off.clearRect(0, 0, W, H);
    off.globalCompositeOperation = 'source-over';
    off.fillStyle = pal.accent;
    off.globalAlpha = 0.16;
    wedge(off);
    off.fill();
    off.globalAlpha = 0.7;
    off.strokeStyle = pal.accent;
    off.lineWidth = 0.9;
    off.setLineDash([3, 4]);
    wedge(off);
    off.stroke();
    off.setLineDash([]);
    // 抠掉让位圈与走廊
    off.globalCompositeOperation = 'destination-out';
    off.globalAlpha = 1;
    if (D > 0) {
      off.beginPath();
      off.arc(cx, cy, D, 0, Math.PI * 2);
      off.fill();
      if (p.lane) {
        off.save();
        off.translate(cx, cy);
        off.rotate(p.heading);
        off.fillRect(0, -D, R + 2, 2 * D);
        off.restore();
      }
    }
    off.globalCompositeOperation = 'source-over';
    ctx.drawImage(offscreen!, 0, 0, W, H, 0, 0, W, H);
  }
  // 让位圈（莲粉虚线）；走着时走廊两条边也画出来
  if (D > 0) {
    ctx.strokeStyle = pal.warn;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, D, 0, Math.PI * 2);
    ctx.stroke();
    if (p.lane) {
      const hx = Math.cos(p.heading);
      const hy = Math.sin(p.heading);
      const len = Math.sqrt(Math.max(0, R * R - D * D));
      ctx.beginPath();
      ctx.moveTo(cx - hy * D, cy + hx * D);
      ctx.lineTo(cx - hy * D + hx * len, cy + hx * D + hy * len);
      ctx.moveTo(cx + hy * D, cy - hx * D);
      ctx.lineTo(cx + hy * D + hx * len, cy - hx * D + hy * len);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

/**
 * 画痕迹与绿盘用的量程（存在·秒）。痕迹封了顶（台架的「散掉」档 = 线性褪去）就用那个顶——
 * 读数满 = 绿盘满 = 刚好成形；没封顶（原型的指数衰减）读数会升到阈值之上，量程取 2×阈值，
 * 否则人一走的头几秒绿盘满着不动、看着像没在退。
 */
function traceScale(s: PlanScene): number {
  return Number.isFinite(s.field.cap) ? s.field.cap : 2 * s.act.threshold;
}

export function drawPlan(ctx: CanvasRenderingContext2D, s: PlanScene, pal: Palette): void {
  const L = s.layout;
  const { sc, ox, oy } = frame(L.roomM);
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy + y * sc;
  ctx.clearRect(0, 0, W, H);

  // 地板：极淡的墨
  const h = (L.roomM / 2) * sc;
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = pal.ink;
  ctx.fillRect(ox - h, oy - h, 2 * h, 2 * h);
  ctx.globalAlpha = 1;

  // 痕迹场：有痕迹的格子按浓度（存在·秒）画绿——**线性**映射，减半就淡一半
  // （首版用 1−e^(−v/12) 的指数压缩，痕迹减半透明度只从 0.74 掉到 0.49，用户看真机「衰减不明显」）
  if (s.showTrace) {
    const f = s.field;
    const cs = f.cell * sc;
    const cap = traceScale(s);
    // 开方是为了让走过留下的浅痕迹仍看得见（线性下只有 0.03）
    ctx.fillStyle = pal.accent;
    for (let idx = 0; idx < f.data.length; idx++) {
      const v = f.data[idx];
      if (v <= 1e-3) continue;
      const [x, y] = f.cellCenter(idx);
      ctx.globalAlpha = Math.max(0.04, 0.5 * Math.sqrt(Math.min(1, v / cap)));
      ctx.fillRect(X(x) - cs / 2, Y(y) - cs / 2, cs + 0.5, cs + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  // 按格读法的边界（格线）；脚下读法画平台圈本身就是边界
  if (s.catchment.reading === 'nearest') {
    const a = aisleLines(L);
    const fh = (L.fieldM / 2 + 0.12) * sc;
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (const x of a.x) {
      ctx.moveTo(X(x), oy - fh);
      ctx.lineTo(X(x), oy + fh);
    }
    for (const y of a.y) {
      ctx.moveTo(ox - fh, Y(y));
      ctx.lineTo(ox + fh, Y(y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // 墙 + 门（左右墙正中留门）
  const dw = (PLAN.DOOR_W / 2) * sc;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(ox - h, oy - h);
  ctx.lineTo(ox + h, oy - h);
  ctx.moveTo(ox - h, oy + h);
  ctx.lineTo(ox + h, oy + h);
  ctx.moveTo(ox - h, oy - h);
  ctx.lineTo(ox - h, oy - dw);
  ctx.moveTo(ox - h, oy + dw);
  ctx.lineTo(ox - h, oy + h);
  ctx.moveTo(ox + h, oy - h);
  ctx.lineTo(ox + h, oy - dw);
  ctx.moveTo(ox + h, oy + dw);
  ctx.lineTo(ox + h, oy + h);
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(ox - h, oy - dw);
  ctx.lineTo(ox - h - dw * 0.9, oy - dw * 0.1);
  ctx.moveTo(ox + h, oy - dw);
  ctx.lineTo(ox + h + dw * 0.9, oy - dw * 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 单元：两个量分开画（用户看真机「每个单元的状态显示不明显」——首版把当前读数画成芯外两像素的细弧，
  // 成形程度画成半透明紫盘压在绿痕迹上，两者糊成一团）：
  //   · **当前读数**（会退的量）= 实心绿盘，半径从芯长到平台外缘随「读数 / 阈值」涨缩——人走了它就缩回去；
  //   · **成形进度**（只涨不退的棘轮）= 紫环，半径同一尺子；长满 = 平台外缘上一圈粗紫环 + 淡紫底，
  //     读作「这台已经下来了」。绿盘缩回去而紫环留着，就是滞回本身。
  //   · 平台外缘发丝线 = 潜在占位；芯 = 墨点。
  //   · 绿盘与痕迹共用一把尺子 `traceScale`：痕迹**封顶**时（台架的「散掉」档）尺子就是那个顶，
  //     读数满 = 绿盘满 = 单元刚好成形；**不封顶**时（原型的指数衰减）站着的读数会升到阈值以上
  //     （稳态 16–20 s），按阈值封顶的话人一走开头几秒绿盘纹丝不动，故尺子取 2×阈值，读数一掉盘就缩。
  const platPx = L.platR * sc;
  const mastPx = Math.max(1.6, L.mastR * sc);
  const span = platPx - mastPx;
  const scale = traceScale(s);
  for (const u of L.units) {
    const cx = X(u.x);
    const cy = Y(u.y);
    const d = s.act.degree[u.i];
    const frac = Math.min(1, s.act.input[u.i] / scale);
    const gated = !!s.blocked && s.blocked[u.i] === 1;
    // 潜在占位；闸住的（平台下来会打到人）画成莲粉虚线圈
    ctx.strokeStyle = gated ? pal.warn : pal.ink;
    ctx.globalAlpha = gated ? 0.85 : 0.2;
    ctx.lineWidth = gated ? 1 : 0.8;
    if (gated) ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, platPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 已成形：淡紫底
    if (d >= 1 - 1e-9) {
      ctx.fillStyle = pal.accent2;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, platPx, 0, Math.PI * 2);
      ctx.fill();
    }
    // 当前读数：实心绿盘
    if (frac > 0.01) {
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, mastPx + frac * span, 0, Math.PI * 2);
      ctx.fill();
    }
    // 成形进度：紫环（不回退）
    if (d > 1e-6) {
      ctx.strokeStyle = pal.accent2;
      ctx.globalAlpha = d >= 1 - 1e-9 ? 1 : 0.85;
      ctx.lineWidth = d >= 1 - 1e-9 ? 3 : 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, mastPx + d * span, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 芯
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, mastPx, 0, Math.PI * 2);
    ctx.fill();
    // 闸住：芯上一个小 ×
    if (gated) {
      const k = Math.max(3, mastPx * 1.4);
      ctx.strokeStyle = pal.warn;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - k, cy - k);
      ctx.lineTo(cx + k, cy + k);
      ctx.moveTo(cx - k, cy + k);
      ctx.lineTo(cx + k, cy - k);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 走过的路
  if (s.trail && s.trail.length > 2) {
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(X(s.trail[0]), Y(s.trail[1]));
    for (let k = 2; k < s.trail.length; k += 2) ctx.lineTo(X(s.trail[k]), Y(s.trail[k + 1]));
    if (s.trailEnd) ctx.lineTo(X(s.trailEnd.x), Y(s.trailEnd.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 人：注意力区域（视野扇形 − 让位圈 − 走廊；全圆不让位时就是旧的影响圈虚线）+ 身体 + 朝向；被按着的画粗一圈
  for (const p of s.people) {
    const cx = X(p.x);
    const cy = Y(p.y);
    drawAttention(ctx, p, cx, cy, sc, pal);
    const r = PLAN.BODY_R * sc;
    ctx.fillStyle = pal.paper;
    ctx.strokeStyle = p.held ? pal.accent : pal.ink;
    ctx.globalAlpha = 1;
    ctx.lineWidth = p.held ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(p.heading) * r, cy + Math.sin(p.heading) * r);
    ctx.stroke();
  }

  // 比例尺 1 m（房间右上角内侧）
  const bx1 = ox + h - 0.3 * sc;
  const bx0 = bx1 - 1 * sc;
  const by = oy - h + 0.32 * sc;
  ctx.strokeStyle = pal.muted;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx0, by);
  ctx.lineTo(bx1, by);
  ctx.moveTo(bx0, by - 3);
  ctx.lineTo(bx0, by + 3);
  ctx.moveTo(bx1, by - 3);
  ctx.lineTo(bx1, by + 3);
  ctx.stroke();
  ctx.fillStyle = pal.muted;
  ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1 m', (bx0 + bx1) / 2, by - 5);
  ctx.globalAlpha = 1;
}

/** 画布 CSS 像素 → 房间坐标（m） */
export function canvasToRoom(canvas: HTMLCanvasElement, clientX: number, clientY: number, roomM: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const lx = ((clientX - rect.left) / rect.width) * W;
  const ly = ((clientY - rect.top) / rect.height) * H;
  const { sc, ox, oy } = frame(roomM);
  return { x: (lx - ox) / sc, y: (ly - oy) / sc };
}
