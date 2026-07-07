import type { LinkageDef, Point } from './types';
import { LinkageSolver } from './solver';

// SPEC §4.1 / §6.2 —— 零依赖：教学页、主页、SVG 导出三处共用，不碰组件状态。

export interface TraceOpts {
  /** 曲柄整周采样数，默认 144。 */
  steps?: number;
  theta0?: number;
  settleSweeps?: number;
  stepSweeps?: number;
  /** 节点角色索引，默认 = SPEC §2.2 规范实例约定（0=A,1=B,2=C,3=D,4=P）。 */
  crankAnchor?: number;
  crankTip?: number;
  rockerTip?: number;
  rockerAnchor?: number;
  tracePoint?: number;
}

export interface CouplerTrace {
  /** 耦合点轨迹。grashof=true 时长度 = steps+1（首尾闭合）；false 时只含可装配段。 */
  points: Point[];
  /** 曲柄能否整周回转（SPEC §2.2 Grashof 校验）。 */
  grashof: boolean;
}

/** 从 def 出发收敛到静态构型，返回全部节点位置（教学/导出用）。 */
export function solveStatic(def: LinkageDef, sweeps = 240): Point[] {
  const s = new LinkageSolver(def);
  s.iterate(sweeps);
  return s.nodes.map((n) => ({ x: n.x, y: n.y }));
}

function restOf(def: LinkageDef, a: number, b: number): number {
  const bar = def.bars.find((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a));
  if (!bar) throw new Error(`找不到杆 (${a}, ${b})`);
  return (
    bar.rest ?? Math.hypot(def.nodes[b].x - def.nodes[a].x, def.nodes[b].y - def.nodes[a].y)
  );
}

/** 曲柄整周驱动，warm start 逐步求解，描出耦合点轨迹（教学模式 B / 导出共用）。 */
export function traceCouplerCurve(def: LinkageDef, opts: TraceOpts = {}): CouplerTrace {
  const {
    steps = 144,
    theta0 = -Math.PI / 3,
    settleSweeps = 240,
    stepSweeps = 24,
    crankAnchor = 0,
    crankTip = 1,
    rockerTip = 2,
    rockerAnchor = 3,
    tracePoint = 4,
  } = opts;

  const A = def.nodes[crankAnchor];
  const D = def.nodes[rockerAnchor];
  const crank = restOf(def, crankAnchor, crankTip);
  const coupler = restOf(def, crankTip, rockerTip);
  const rocker = restOf(def, rockerTip, rockerAnchor);
  const frame = Math.hypot(D.x - A.x, D.y - A.y);

  // Grashof 曲柄条件（SPEC §2.2）：s+l ≤ p+q 且最短杆是曲柄或机架
  const sorted = [crank, coupler, rocker, frame].sort((x, y) => x - y);
  const grashof =
    sorted[0] + sorted[3] <= sorted[1] + sorted[2] &&
    (sorted[0] === crank || sorted[0] === frame);

  const s = new LinkageSolver(def);
  s.setFixed(crankTip, true);
  const setCrank = (theta: number) =>
    s.setNode(crankTip, A.x + crank * Math.cos(theta), A.y + crank * Math.sin(theta));
  setCrank(theta0);
  s.iterate(settleSweeps);

  const points: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const theta = theta0 + (2 * Math.PI * k) / steps;
    // 可装配性（SPEC §2.2）：|BD| 必须落在 [|coupler−rocker|, coupler+rocker]
    const bx = A.x + crank * Math.cos(theta);
    const by = A.y + crank * Math.sin(theta);
    const bd = Math.hypot(D.x - bx, D.y - by);
    if (bd < Math.abs(coupler - rocker) || bd > coupler + rocker) continue; // 不可达段跳过，不污染 warm start
    setCrank(theta);
    s.iterate(stepSweeps);
    const p = s.nodes[tracePoint];
    points.push({ x: p.x, y: p.y });
  }
  s.setFixed(crankTip, false);
  return { points, grashof };
}

/**
 * 轨迹断笔（SPEC §5 条 2）：相邻点距 > breakDist 或遇 null 时重新 M 起笔，
 * 避免分支翻转/拖拽瞬移拉出难看的直线。
 */
export function buildTracePath(points: ReadonlyArray<Point | null>, breakDist = 34): string {
  let d = '';
  let prev: Point | null = null;
  for (const p of points) {
    if (!p) {
      prev = null;
      continue;
    }
    const jump = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > breakDist;
    d += `${jump ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    prev = p;
  }
  return d;
}
