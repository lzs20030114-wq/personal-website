import { PLAN, aisleLines, type Activation, type Catchment, type PlanLayout, type TraceField } from '../../src/lib/space/unit-activation';
import type { CatPose } from '../../src/lib/space/cat-rules';

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
  /** Optional animal rendering; human drawing remains the default. */
  kind?: 'cat';
  pose?: CatPose;
  motionTime?: number;
  bodyR?: number;
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
  /** 视线（弧度）；省略 = 朝向。视野扇形沿它，走廊沿朝向 */
  gaze?: number;
  /** 走 / 站 / 坐（Lab 2-14 「走 · 站 · 坐」规则，加法式）：走 = 灰空心 · 站 = 墨空心加粗 · 坐 = 墨实心。省略 = 旧画法 */
  posture?: 'walk' | 'stand' | 'sit';
  /** 同组编号（Lab 2-14 结伴，加法式）：同组的人之间画一条细线连到领头（组里排在最前的那位）。省略 = 不画 */
  party?: number;
  /** 猫在地面上（Lab 2-14 猫能下地，加法式）：身下画一圈灰虚线（台上的猫没有）。省略 = 旧画法 */
  onFloor?: boolean;
}

export interface PlanScene {
  /** Cat platforms: occupied units and the single next landing (not an exclusion zone). */
  supportIds?: readonly number[];
  landingId?: number | null;
  toy?: { x: number; y: number } | null;
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
  /** Lab 2-14 人猫同台（加法式，省略 = 旧画法逐位不变）：
   *  对人是墙的单元（程度 ≥ 墙线）画一圈实墨；被 R5 钉住的（想落、落了会困住人）芯上画一道短横；
   *  正在发生的事件在人猫之间连一条线（共视 绿虚 / 共温 紫 / 共触 粉 / 交接 墨细）；空房间档不画单元。 */
  walls?: Uint8Array | null;
  heldR5?: Uint8Array | null;
  links?: readonly { x1: number; y1: number; x2: number; y2: number; kind: 'gaze' | 'warmth' | 'touch' | 'pass' }[];
  hideUnits?: boolean;
  /** 让路只收挡路的带（Lab 2-14，加法式）：每单元 count 条带各自的收回程度 0–1——成形盘 / 紫环 / 墙圈逐条带画，
   *  收回的带画成缺口（半径退到芯上）；猫身下护住的带不另标（猫就画在那儿）。省略 = 整圈。 */
  bands?: { open: Float32Array; hold: Uint8Array; count: number } | null;
  /** 「走 · 站 · 坐」（Lab 2-14，加法式；省略 = 旧画法逐位不变）：家具是地面上独立的一层（画在单元底下，靠背在朝向的
   *  反侧，selected = 正被选中 / 拖动的那件加亮）与座位点；meet = 各座位前方那台（紫点线圈，有人坐时加重）；
   *  guides = 空间此刻铺的路（绿虚线串起单元中心：坐着 = 一路到座位前方那台，站定 = 只一步） */
  furniture?: {
    rects: readonly { x0: number; x1: number; y0: number; y1: number; face: readonly [number, number] }[];
    seats: readonly { x: number; y: number; meet: number; taken: boolean }[];
    selected?: number;
  } | null;
  guides?: readonly { kind: 'sit' | 'stand'; pts: readonly { x: number; y: number }[] }[];
}

/** 逐条带按半径围一圈：第 j 条带占 [j, j+1]·2π/count 的扇区（与 cohabit.bandAngle 同向），arc 之间自动连径向线 */
function ringPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radii: readonly number[]): void {
  const n = radii.length;
  ctx.beginPath();
  for (let j = 0; j < n; j++) ctx.arc(cx, cy, Math.max(0, radii[j]), (j * 2 * Math.PI) / n, ((j + 1) * 2 * Math.PI) / n);
  ctx.closePath();
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
  const gaze = p.gaze ?? p.heading;
  const a0 = gaze - fov / 2;
  const a1 = gaze + fov / 2;
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

  // 家具（「走 · 站 · 坐」）：淡墨面 + 发丝边，靠背 = 朝向反侧一道粗边；座位点 = 小虚线圈
  if (s.furniture) {
    s.furniture.rects.forEach((r, fi) => {
      const sel = s.furniture!.selected === fi;
      const x = X(r.x0);
      const y = Y(r.y0);
      const w = (r.x1 - r.x0) * sc;
      const hh = (r.y1 - r.y0) * sc;
      ctx.fillStyle = pal.ink;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, hh, 4);
      ctx.fill();
      ctx.strokeStyle = sel ? pal.accent : pal.ink;
      ctx.globalAlpha = sel ? 0.95 : 0.55;
      ctx.lineWidth = sel ? 1.8 : 0.9;
      ctx.stroke();
      ctx.strokeStyle = pal.ink;
      // 靠背：朝向反侧那条边，往里收一点
      const k = Math.min(w, hh) * 0.18;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      if (r.face[1] > 0) { ctx.moveTo(x + 3, y + k); ctx.lineTo(x + w - 3, y + k); }
      else if (r.face[1] < 0) { ctx.moveTo(x + 3, y + hh - k); ctx.lineTo(x + w - 3, y + hh - k); }
      else if (r.face[0] > 0) { ctx.moveTo(x + k, y + 3); ctx.lineTo(x + k, y + hh - 3); }
      else { ctx.moveTo(x + w - k, y + 3); ctx.lineTo(x + w - k, y + hh - 3); }
      ctx.stroke();
    });
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 2]);
    for (const q of s.furniture.seats) {
      ctx.globalAlpha = q.taken ? 0 : 0.45;
      ctx.beginPath();
      ctx.arc(X(q.x), Y(q.y), PLAN.BODY_R * sc * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

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
  const nb = s.bands?.count ?? 0;
  const radii: number[] = new Array(nb).fill(0);
  for (const u of s.hideUnits ? [] : L.units) {
    const cx = X(u.x);
    const cy = Y(u.y);
    const d = s.act.degree[u.i];
    const frac = Math.min(1, s.act.input[u.i] / scale);
    const gated = !!s.blocked && s.blocked[u.i] === 1;
    // 逐条带：第 j 条带此刻的伸展比例（1 = 全落、0 = 收直到芯上）
    const bandF = (j: number) => 1 - (s.bands ? s.bands.open[u.i * nb + j] : 0);
    const ring = (r: (j: number) => number) => {
      if (!s.bands) return false;
      for (let j = 0; j < nb; j++) radii[j] = r(j);
      ringPath(ctx, cx, cy, radii);
      return true;
    };
    // 潜在占位；闸住的（平台下来会打到人）画成莲粉虚线圈
    ctx.strokeStyle = gated ? pal.warn : pal.ink;
    ctx.globalAlpha = gated ? 0.85 : 0.2;
    ctx.lineWidth = gated ? 1 : 0.8;
    if (gated) ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, platPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 已成形：淡紫底（收回的带是缺口）
    if (d >= 1 - 1e-9) {
      ctx.fillStyle = pal.accent2;
      ctx.globalAlpha = 0.3;
      if (!ring((j) => mastPx + span * bandF(j))) {
        ctx.beginPath();
        ctx.arc(cx, cy, platPx, 0, Math.PI * 2);
      }
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
    // 成形进度：紫环（不回退；收回的带退到芯上）
    if (d > 1e-6) {
      ctx.strokeStyle = pal.accent2;
      ctx.globalAlpha = d >= 1 - 1e-9 ? 1 : 0.85;
      ctx.lineWidth = d >= 1 - 1e-9 ? 3 : 1.6;
      if (!ring((j) => mastPx + d * span * bandF(j))) {
        ctx.beginPath();
        ctx.arc(cx, cy, mastPx + d * span, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    // 墙（Lab 2-14）：对人过不去的那一圈画实墨；逐条带时只画还是墙的带（程度 × 伸展 ≥ 墙线）
    if (s.walls && s.walls[u.i]) {
      ctx.strokeStyle = pal.ink;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (s.bands) {
        for (let j = 0; j < nb; j++) {
          if (d * bandF(j) < 0.5) continue;
          ctx.moveTo(cx + Math.cos((j * 2 * Math.PI) / nb) * (platPx + 1.5), cy + Math.sin((j * 2 * Math.PI) / nb) * (platPx + 1.5));
          ctx.arc(cx, cy, platPx + 1.5, (j * 2 * Math.PI) / nb, ((j + 1) * 2 * Math.PI) / nb);
        }
      } else ctx.arc(cx, cy, platPx + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 芯
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, mastPx, 0, Math.PI * 2);
    ctx.fill();
    // R5 钉住：芯上一道短横（它想落，落了会把人困住）
    if (s.heldR5 && s.heldR5[u.i]) {
      const k = Math.max(4, mastPx * 1.8);
      ctx.strokeStyle = pal.accent2;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - k, cy);
      ctx.lineTo(cx + k, cy);
      ctx.stroke();
    }
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

  if (s.supportIds) {
    for (const id of new Set([...s.supportIds, ...(s.landingId == null ? [] : [s.landingId])])) {
      const u = L.units[id];
      const occupied = s.supportIds.includes(id);
      ctx.strokeStyle = occupied ? pal.ink : pal.accent;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = occupied ? 0.95 : 0.8;
      ctx.lineWidth = occupied ? 1.5 : 1;
      ctx.setLineDash(occupied ? [] : [3, 3]);
      ctx.beginPath(); ctx.arc(X(u.x), Y(u.y), platPx + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(id + 1).padStart(2, '0'), X(u.x), Y(u.y) + platPx + 15);
    }
    ctx.globalAlpha = 1;
  }

  // 座位前方那台（「走 · 站 · 坐」）：紫点线圈，有人坐着时加重
  if (s.furniture && !s.hideUnits) {
    ctx.strokeStyle = pal.accent2;
    ctx.setLineDash([2, 3]);
    for (const q of s.furniture.seats) {
      const u = L.units[q.meet];
      ctx.globalAlpha = q.taken ? 0.95 : 0.4;
      ctx.lineWidth = q.taken ? 1.6 : 0.9;
      ctx.beginPath();
      ctx.arc(X(u.x), Y(u.y), platPx + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  // 空间此刻铺的路：绿虚线串起单元中心，箭头指向下一步
  if (s.guides) {
    for (const g of s.guides) {
      if (g.pts.length < 2) continue;
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = g.kind === 'sit' ? 0.85 : 0.95;
      ctx.lineWidth = g.kind === 'sit' ? 1.4 : 2;
      ctx.setLineDash(g.kind === 'sit' ? [5, 4] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(X(g.pts[0].x), Y(g.pts[0].y));
      for (let k = 1; k < g.pts.length; k++) ctx.lineTo(X(g.pts[k].x), Y(g.pts[k].y));
      ctx.stroke();
      ctx.setLineDash([]);
      // 下一步那台的箭头
      const a = g.pts[0];
      const b = g.pts[1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const tx = X(b.x) - Math.cos(ang) * (platPx * 0.55);
      const ty = Y(b.y) - Math.sin(ang) * (platPx * 0.55);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(ang) * 6, ty + Math.sin(ang) * 6);
      ctx.lineTo(tx + Math.cos(ang + 2.5) * 6, ty + Math.sin(ang + 2.5) * 6);
      ctx.lineTo(tx + Math.cos(ang - 2.5) * 6, ty + Math.sin(ang - 2.5) * 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

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

  // 事件连线（Lab 2-14）
  if (s.links) {
    for (const k of s.links) {
      ctx.strokeStyle = k.kind === 'gaze' ? pal.accent : k.kind === 'warmth' ? pal.accent2 : k.kind === 'touch' ? pal.warn : pal.ink;
      ctx.globalAlpha = k.kind === 'pass' ? 0.5 : 0.85;
      ctx.lineWidth = k.kind === 'touch' ? 2.2 : k.kind === 'pass' ? 0.8 : 1.4;
      ctx.setLineDash(k.kind === 'gaze' ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(X(k.x1), Y(k.y1));
      ctx.lineTo(X(k.x2), Y(k.y2));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (s.toy) {
    ctx.strokeStyle = pal.warn;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(s.toy.x), Y(s.toy.y), 5, 0, Math.PI * 2);
    ctx.moveTo(X(s.toy.x) - 8, Y(s.toy.y));
    ctx.lineTo(X(s.toy.x) + 8, Y(s.toy.y));
    ctx.stroke();
  }

  // 同组的人（Lab 2-14 结伴）：细线连到领头
  const leaders = new Map<number, PlanPerson>();
  for (const p of s.people) {
    if (p.kind === 'cat' || p.party === undefined) continue;
    const L = leaders.get(p.party);
    if (!L) {
      leaders.set(p.party, p);
      continue;
    }
    ctx.strokeStyle = pal.muted;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(L.x), Y(L.y));
    ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Cats are drawn on the platform surface, without a human attention/clearance ring.
  for (const p of s.people) {
    const cx = X(p.x);
    const cy = Y(p.y);
    if (p.kind === 'cat') {
      const r = (p.bodyR ?? 0.14) * sc;
      if (p.onFloor) {
        // 在地面上：身下一圈灰虚线（台上的猫没有）
        ctx.strokeStyle = pal.muted;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawCat(ctx, p, cx, cy, r, pal);
      continue;
    }
    drawAttention(ctx, p, cx, cy, sc, pal);
    const r = PLAN.BODY_R * sc;
    // 走 / 站 / 坐（「走 · 站 · 坐」）：走 = 灰空心 · 站 = 墨空心加粗 · 坐 = 墨实心（朝向线改纸色）
    const sitting = p.posture === 'sit';
    ctx.fillStyle = sitting ? pal.ink : pal.paper;
    ctx.strokeStyle = p.held ? pal.accent : p.posture === 'walk' ? pal.muted : pal.ink;
    ctx.globalAlpha = 1;
    ctx.lineWidth = p.held ? 2.4 : p.posture === 'stand' ? 2.2 : 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (sitting) ctx.strokeStyle = pal.paper;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(p.heading) * r, cy + Math.sin(p.heading) * r);
    ctx.stroke();
    // 脸：身体圆周上视线那一侧加粗一段绿弧（站着转头时它离开朝向那条线，扇面跟着它走）
    const g = p.gaze ?? p.heading;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, g - 0.6, g + 0.6);
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

/** Same cat silhouette at map scale and in the readable action detail. */
export function drawCat(ctx: CanvasRenderingContext2D, p: PlanPerson, cx: number, cy: number, r: number, pal: Palette): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.heading);
  ctx.strokeStyle = p.held ? pal.accent : pal.ink;
  ctx.fillStyle = pal.paper;
  ctx.lineWidth = p.held ? 2.5 : 1.8;
  ctx.lineCap = 'round';
  // Schematic postures from the action definitions; animation amplitudes are illustrative.
  const pose = p.pose ?? 'stand', t = p.motionTime ?? 0;
  const lying = pose === 'lie', sitting = pose === 'sit', crouched = pose === 'crouch';
  const length = lying ? 1.02 : sitting ? 0.72 : pose === 'chase' ? 1.35 : 1.15;
  const width = lying ? 0.88 : sitting ? 0.8 : crouched ? 0.82 : 0.65;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  if (lying || sitting) ctx.bezierCurveTo(-r * 1.8, r * 1.6, r * 0.9, r * 1.5, r * 1.1, r * 0.45);
  else ctx.bezierCurveTo(-r * 2.5, -r * 0.2, -r * 2.1, r * 1.4, -r * 2.6, r * 0.8);
  ctx.stroke();
  if (!lying) {
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const stride = pose === 'walk' || pose === 'chase' ? Math.sin(t * (pose === 'chase' ? 20 : 10) + side * front) * 0.25 : 0;
      const paw = pose === 'paw' && front === 1 ? 0.3 + Math.sin(t * 8 + side) * 0.25 : 0;
      ctx.beginPath();
      ctx.moveTo(front * r * 0.6, side * r * 0.45);
      ctx.lineTo((front * 0.8 + stride + paw) * r, side * r * (crouched ? 0.85 : 0.72)); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * length, r * width, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.translate(r * (lying ? 0.5 : sitting ? 0.65 : 0.85), lying ? -r * 0.24 : 0);
  ctx.rotate(lying ? -0.6 : (p.gaze ?? p.heading) - p.heading);
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.55); ctx.lineTo(r * 0.15, -r * 0.85);
  ctx.lineTo(r * 0.45, -r * 0.35); ctx.lineTo(r * 0.65, 0);
  ctx.lineTo(r * 0.45, r * 0.35); ctx.lineTo(r * 0.15, r * 0.85);
  ctx.lineTo(-r * 0.35, r * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pal.accent;
  ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.22, 1.2, 0, Math.PI * 2); ctx.arc(r * 0.3, r * 0.22, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
