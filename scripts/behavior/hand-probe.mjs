// 迎手链闭环探针（Lab 1-6 指针 = 人的手；现行 v1 与动作词汇 v2 各量一遍）。
// 量的是迎手链 v2 综合方案 §9.2 的验收指标：凡是能从闭环数据量出来的都算出来，量不出来的写「—」。
//
//   node scripts/behavior/hand-probe.mjs [outDir]               # 驱动：每种人格一个子进程并行，跑完写 outDir/tables.md
//   node scripts/behavior/hand-probe.mjs --aggregate [outDir]   # 只从 outDir/*.json 重算表
//   （子进程入口：--job <人格> <outDir>）                          # outDir 缺省 = 当前目录下的 hand-probe-out
//
// 环境变量：
//   SCEN            场景，逗号分隔（默认全部：K,R,S1,S1n,S1p,S2,S3,S3s,S4,S4b,S4s,S5,S6,S7,S8,S9,S10）
//   PERSONA         人格（默认 A,B,C,D）
//   N               每格保留的种子数（默认 8；尾部分位门 p10 / p90 建议 16）
//   VOCABS          动作词汇（默认 1,2）
//   HAND_V2_FIELDS  v2 的 HAND 带不带 touch / still / v：1 带、0 不带；缺省 = 看 events.ts 收不收（isSensorInput 试一条带字段的 HAND）
//   FRESH=1         不与 outDir 里已有的结果合并（默认合并：只覆盖这次跑的人格 × 版本 × 场景）
//   SPONT=1         所有场景在手出现时把自发动作（⑥）放回来（默认只有 S7 放：偷看走 ⑥ 的调度）
//   REPO            仓库根（默认本脚本所在仓库）
//
// 整条链全取站上模块（vite ssrLoadModule，不另写一份）：
//   引擎（BehaviorEngine）→ tendonContractions(arm, {deep: true})（台架同）→ 三根肌肉 CriticallyDamped(5)
//   → Lab 1-3 触手求解器（tentacle3d）→ 脊线 armPoint → yawPoint（此刻偏航）。
// 手 = 画面上的指针（台架同式）：
//   - 视角：sweepFraming(预设矩阵)（台架行为档取景），画布 712 CSS px 宽（桌面默认画幅），正交。
//   - 指针移动 = 台架的 pointermove：trackMove（machine-behavior.ts，台架同一份）。
//   - HAND：台架 syncHand ① 原样——handReading(此刻偏航, 上一个方位)，读数变化超过 HAND_UI 的阈值、且离上次 ≥ 0.1 s 才报；
//     侧偏 < 10 mm 沿用上一个弯向。v2 时多带 touch（有效碰到半径 mm，contactRadiusMm）· still（指针已静止多少秒，≤ 9.9，一位小数）
//     · v（指针 0.3 s 轨迹速度 mm/s）；v1 一字不带（v1 日志逐字不变）。是否带见 HAND_V2_FIELDS。
//   - 在场（只 S1p）：台架 syncHand ② 原样（handBandOf 滞回 + 驻留，面板在场 = 没人）。
//   - 碰臂：台架 syncHand ③ = machine-behavior.ts 的 contactStep（同一份代码）；画面距离 = 指针 ↔ 脊线投影（CSS px）。
//     v2 且场景要牵引（S5）时传 opts.traction（§7.2 第 3 条）。syncContact 同台架（by 'arm' / 'hand'；电极落下张力随之撤）。
//   - 张力（台架 stepEngine 同位置，引擎推进之后）：电极在、张力不在、抓握 WRAP 且（有 catchT ? t ≥ catchT : 缠到 60%）→ RESISTANCE on；
//     抓握进 RELEASE / IDLE → off。catchT 是迎手链 v2 新加的字段，现在的引擎没有时走老规则。
//   - 引擎构造：v2 时传 deepOk: true（台架开着肌腱轴深卷；引擎不认的字段会被忽略）。
// 隔离：skip 出诞生段，第一步前把自发与定时转向推到很远（nextSpont = nextOrient = 1e9）；看见手以后 ⑨ 由手的机制自己排。
//   代价：靠 ⑥ 调度的东西（握着时的小动作、躲时的偷看、够不着时 B 每 ⑥ 前倾）在隔离下不出现——S7 与 SPONT=1 时，
//   手出现那一刻把 nextSpont 放回「此刻 + 人格 ⑥（人在时）的下限」，之后由引擎自己排。
//   臂与肌肉从笔直起，先静置 PRE 秒，手在 PRE 时刻出现（时刻一律从手出现算，tr）。
// 种子：每格从 1 往上搜，只留「第一次看见手（HAND_SEEN again=false）时抽到想要的态度」的种子（默认迎；S7 躲），
//   要握住的场景（S4 / S4b / S4s / S5 / S8）再要求 30 s 内握住。同一「手族」（看见之前输入逐位相同）的场景共用已知结果跳过。
//
// 场景（axon = 轴测；手的世界点都在臂高水平面上，除非写明）：
//   K    惊跳参照：不放手，tr = 0 敲 0.95（高于所有阈值）；同种子不敲那一遍逐帧相减 → 峰速 / 峰加速 / 起动（§9.2 #1 #2 #3 #4 的分母）
//   R    回应参照：tr = 0 抚摸壳（0.1，低于所有阈值），同上相减（#4 #5 的分母）
//   S1   手停在笔直臂梢左 120 mm（画面瞄点离基座 430 mm，超出臂长：够不着）
//   S1n  同样左 120 mm、往基座退 100 mm（够得着；整条链看见 → 凑 → 碰到 → 缠 → 握）
//   S1p  S1n + 台架同式的在场档
//   S2   离臂基座 1.6 倍臂长、偏左 40°（够不着，要转身）
//   S3   绕臂基座半径 1 倍臂长的弧，从左 60° 匀速 100 mm/s 划到右 60°（跟）
//   S3s  同 S3，35 mm/s
//   S4   S1n 握住 3 s 后 0.5 s 内往左拉开 400 mm（快抽）
//   S4b  S1n 握住 3 s 后 0.5 s 内挪到镜像那一侧（右 120 mm、退 100 mm，够得着）停住（追能不能再碰到）
//   S4s  S1n 握住 3 s 后以 80 mm/s 往左慢慢抽走 400 mm（慢抽）
//   S5   S1n 握住 3 s 后以 40 mm/s 沿臂往基座牵 3 s（被牵着走；v2 开牵引锚点）
//   S6   正视，手在臂中段正上方 80 mm（读数饱和、弯向正上 = 腱轴 0：深卷几何），60 s
//   S7   手在正前方 0.9 m 不动 60 s（只跑 B、D，只留第一次看见是躲的种子）
//   S8   S1n 握住 3 s 后敲一下（0.95，惊跳让它松手），手不动、仍搭在臂上，再看 ≥ 10 s（重新武装）
//   S9   衰老进度 0.8 时跑 S1n（先 skip 到衰老段，生命钟 ×40 推到 80%，再把生命钟放到 ×0.001 冻住进度）
//   S10  正 / 左 / 顶视角跑 S1n（指针 = 画面上臂长 L−100 处往画面上方偏 120 mm；顶视等于 S1n 那一点）
//
// 拍（HAND_STAGE {stage, beat} 事件 / engine.handStage()）：迎手链 v2 加的；遇到就按拍统计（扑的峰速、转运峰速、最后一拍峰速、
// 停半拍期间梢端速度……），现在的引擎没有时这些指标写「—」。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(process.env.REPO ?? resolve(HERE, '../..'));
const N = Number(process.env.N ?? 8);
const ALL_SCENS = ['K', 'R', 'S1', 'S1n', 'S1p', 'S2', 'S3', 'S3s', 'S4', 'S4b', 'S4s', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
const SCENS = (process.env.SCEN ?? ALL_SCENS.join(',')).split(',').filter(Boolean);
const VOCABS = (process.env.VOCABS ?? '1,2').split(',').map(Number);
const PERSONAS = ['A', 'B', 'C', 'D'];

const HZ = 60;
const DEG = 180 / Math.PI;
/** 静置（秒）：臂、肌肉、呼吸落定，手在 PRE 时刻出现 */
const PRE = 4;
/** 帧记录从手出现前这么久开始（静息呼吸起伏要用） */
const REC_FROM = -3.5;
const SEED_MAX = 400;
/** 桌面默认画幅（CSS px 宽）：逻辑视口 700 px 铺满 → 一逻辑 px = 712/700 CSS px */
const CANVAS_W = 712;
const CSS = CANVAS_W / 700;
/** 台架的张力老规则：缠到几成算卡住（引擎没有 catchT 时） */
const CATCH_AT = 0.6;
/** 「臂在动」「停半拍期间几乎不动」的梢端速度线（mm/s，§9.2 #6 #18） */
const STILL_V = 15;

/**
 * 拍名（引擎 HAND_STAGE 的 beat；对着 vocab2-hand.ts 的 ApproachBeat / ChaseBeat 与 engine.ts 的 hcSet 写，
 * 多收几个综合方案 §4 里的别名）。撑那一段按阶段 strain 认（不论拍名）。
 */
const BEATS = {
  pounce: ['pounce'],
  crouch: ['crouch'],
  transport: ['transport', 'edge', 'edge2'],
  last: ['reach', 'touch', 'curl'],
  hover: ['hover'],
  retreat: ['retreat'],
  reach: ['reach'],
  deflate: ['deflate'],
  lunge: ['lunge'],
  reachAfter: ['reachAfter', 'letSlow', 'extend'],
  peek: ['peek', 'lean', 'glance'],
};
/** §9.2 #20：投入中（⑨ 不该重新决定）的阶段 */
const ENGAGED20 = ['approach', 'wrap', 'hold', 'chase'];
/** §9.2 #23：这些阶段 / 拍里深卷恒 0 */
const NO_DEEP_STAGES = ['chase', 'track', 'strain', 'avoid'];
/** 收尾（追的结局之后回到的阶段） */
const SETTLED_STAGES = ['track', 'watch', 'off', 'avoid', 'search'];

// ---------------------------------------------------------------- 小工具
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: (a.z ?? 0) * k });
const len = (a) => Math.hypot(a.x, a.y, a.z ?? 0);
const wrapPi = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fin = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
const median = (xs) => {
  const s = fin(xs).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quant = (xs, q) => {
  const s = fin(xs).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 3×3（行主序）——与 MachineBench 的 PRESET_VIEWS 逐字相同
const mul3 = (a, b) => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rxM = (t) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const ryM = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const rzM = (t) => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
const VIEW_FRONT = rxM(Math.PI / 2);
const VIEW_M = {
  axon: mul3(rzM(-1.053336), mul3(rxM(0.735843), ryM(0.867459))),
  front: VIEW_FRONT,
  left: mul3(VIEW_FRONT, rzM(-Math.PI / 2)),
  top: rzM(0),
};

/** 点到线段（2D）：距离与指针在线段哪一侧（叉积符号） */
function segSide(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const L2 = vx * vx + vy * vy || 1;
  const u = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1);
  const d = Math.hypot(p.x - (a.x + u * vx), p.y - (a.y + u * vy));
  const cr = vx * (p.y - a.y) - vy * (p.x - a.x);
  return { d, s: cr >= 0 ? 1 : -1 };
}
/** 点到折线：最近那一段的距离与侧别 */
function polySide(p, pts) {
  let best = { d: Infinity, s: 1 };
  for (let i = 1; i < pts.length; i++) {
    const r = segSide(p, pts[i - 1], pts[i]);
    if (r.d < best.d) best = r;
  }
  return best;
}

// ================================================================ 子进程：跑一种人格
async function job(P, OUT) {
  const { createServer } = await import(pathToFileURL(join(REPO, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({
    root: REPO,
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { BehaviorEngine } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
    const { PERSONA_KEYS, PERSONAS: PT } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');
    const { bandOf, isSensorInput } = await server.ssrLoadModule('/src/lib/linkage/behavior/events.ts');
    const MB = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
    const { armPoint } = await server.ssrLoadModule('/src/lib/linkage/machine-arm.ts');
    const T3 = await server.ssrLoadModule('/src/lib/linkage/tentacle3d-data.ts');
    const { CriticallyDamped } = await server.ssrLoadModule('/src/lib/linkage/motion.ts');
    const HAND_UI = MB.HAND_UI;

    // —— v2 的 HAND 带不带新字段：events.ts 收得下才带（它会被 sensorPayload 原样抄进日志）
    const probeHand = { kind: 'HAND', on: true, bearing: 0, dist: 500, face: 0, aimDir: 0, aimBend: 0.5, aimDist: 300 };
    const v2Accepted = isSensorInput({ ...probeHand, touch: 32, still: 0.5, v: 0 });
    const V2_FIELDS = process.env.HAND_V2_FIELDS === '1' ? true : process.env.HAND_V2_FIELDS === '0' ? false : v2Accepted;

    // —— 视角
    const VIEWS = {};
    for (const [k, m] of Object.entries(VIEW_M)) {
      const v = { ...MB.sweepFraming(m), m, pan: { x: 0, y: 0 }, persp: 0 };
      VIEWS[k] = { v, ppm: v.scale * CSS };
    }
    const cssOf = (view, w) => {
      const q = MB.projectLogical(view.v, w);
      return { x: q.x * CSS, y: q.y * CSS };
    };

    // —— 臂的几何（世界，未转）
    const GEOM = MB.ARM_GEOM;
    const L = GEOM.length;
    const B0 = GEOM.base;
    const T0 = GEOM.tip;
    const AXd = { x: (T0.x - B0.x) / L, y: (T0.y - B0.y) / L, z: 0 }; // 臂轴（水平）≈ 世界 −X
    const LEFT = { x: -AXd.y, y: AXd.x, z: 0 }; // 俯视逆时针 90° = 左（面朝 −X 时 = −Y）
    const atArc = (phiDeg, r) => {
      const a = phiDeg / DEG;
      return { x: B0.x + r * (Math.cos(a) * AXd.x + Math.sin(a) * LEFT.x), y: B0.y + r * (Math.cos(a) * AXd.y + Math.sin(a) * LEFT.y), z: B0.z };
    };
    const S1H = add(T0, mul(LEFT, 120));
    const S1nH = sub(S1H, mul(AXd, 100));
    const S4bH = sub(sub(T0, mul(LEFT, 120)), mul(AXd, 100)); // 镜像那一侧
    const S6H = { x: B0.x + 0.5 * (T0.x - B0.x), y: B0.y + 0.5 * (T0.y - B0.y), z: B0.z + 80 };
    const S7H = { x: MB.YAW_AXIS.x - 900, y: MB.YAW_AXIS.y, z: B0.z }; // FACING = π：方位 0 = 世界 −X
    /** S10：画面上臂长 L−100 处往画面上方（垂直于臂的投影、朝上那一侧）偏 120 mm；臂正对相机时直接往上 */
    const screenOffsetPtr = (view) => {
      const P0 = MB.projectLogical(view.v, sub(T0, mul(AXd, 100)));
      const pb = MB.projectLogical(view.v, B0);
      const pt = MB.projectLogical(view.v, T0);
      let nx = 0;
      let ny = -1;
      const ux = pt.x - pb.x;
      const uy = pt.y - pb.y;
      const n = Math.hypot(ux, uy);
      if (n > 0.3 * L * view.v.scale) {
        nx = -uy / n;
        ny = ux / n;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      const off = 120 * view.v.scale;
      return { x: P0.x + nx * off, y: P0.y + ny * off };
    };
    const S3cfg = (v) => {
      const hold0 = 1;
      const omega = (v / L) * DEG; // °/s
      const move = 120 / omega;
      return { hold0, omega, move, hold1: 2, v };
    };
    const S3a = S3cfg(100);
    const S3b = S3cfg(35);
    const sweep = (c) => (tr) => atArc(60 - c.omega * clamp(tr - c.hold0, 0, c.move), L);

    /**
     * 场景：hand(tr, m) → 世界点（画面指针 = 它的投影）；ptr(tr, m) → 直接给逻辑 px（S10 用）。
     * fam = 手族（看见之前的输入逐位相同 → 第一次看见抽到什么一样，种子结果可共用）。
     */
    const S1nFam = { fam: 'S1n', view: 'axon' };
    const SCEN = {
      K: { win: 10, ref: { kind: 'KNOCK', intensity: 0.95 }, met: 9 },
      R: { win: 12, ref: { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }, met: 9 },
      S1: { win: 16, view: 'axon', hand: () => S1H, kind: 'S1' },
      S1n: { win: 22, ...S1nFam, hand: () => S1nH, kind: 'S1' },
      S1p: { win: 22, view: 'axon', hand: () => S1nH, presence: true, kind: 'S1' },
      S2: { win: 20, view: 'axon', hand: () => atArc(40, 1.6 * L), kind: 'S2' },
      S3: { win: S3a.hold0 + S3a.move + S3a.hold1 + 1, view: 'axon', hand: sweep(S3a), kind: 'S3', s3: S3a },
      S3s: { win: S3b.hold0 + S3b.move + S3b.hold1 + 1, view: 'axon', hand: sweep(S3b), kind: 'S3', s3: S3b },
      S4: {
        win: 60,
        ...S1nFam,
        needHold: true,
        hand: (tr, m) => (m.tPull === undefined || tr < m.tPull ? S1nH : add(S1nH, mul(LEFT, 400 * clamp((tr - m.tPull) / 0.5, 0, 1)))),
        after: 12.5,
        kind: 'S4',
      },
      S4b: {
        win: 60,
        ...S1nFam,
        needHold: true,
        hand: (tr, m) => (m.tPull === undefined || tr < m.tPull ? S1nH : add(S1nH, mul(sub(S4bH, S1nH), clamp((tr - m.tPull) / 0.5, 0, 1)))),
        after: 10,
        kind: 'S4',
      },
      S4s: {
        win: 60,
        ...S1nFam,
        needHold: true,
        hand: (tr, m) => (m.tPull === undefined || tr < m.tPull ? S1nH : add(S1nH, mul(LEFT, Math.min(400, 80 * (tr - m.tPull))))),
        after: 13,
        kind: 'S4',
      },
      S5: {
        win: 60,
        ...S1nFam,
        needHold: true,
        traction: true,
        hand: (tr, m) => (m.tPull === undefined || tr < m.tPull ? S1nH : sub(S1nH, mul(AXd, 40 * clamp(tr - m.tPull, 0, 3)))),
        after: 7,
        kind: 'S5',
      },
      S6: { win: 60, view: 'front', hand: () => S6H, kind: 'S6' },
      S7: { win: 60, view: 'axon', hand: () => S7H, want: 'away', only: ['B', 'D'], kind: 'S7', spont: true },
      S8: { win: 60, ...S1nFam, needHold: true, hand: () => S1nH, knock: true, after: 16, kind: 'S8' },
      S9: { win: 22, view: 'axon', hand: () => S1nH, age: 0.8, kind: 'S1' },
      S10: { multi: ['front', 'left', 'top'] },
    };
    for (const vk of SCEN.S10.multi) {
      const vw = VIEWS[vk];
      const p = screenOffsetPtr(vw);
      SCEN[`S10${vk}`] = { win: 22, view: vk, ptr: () => p, kind: 'S1' };
    }

    const makeArm = () => {
      const arm = T3.createTentacle3();
      const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
      return {
        step(c) {
          for (let k = 0; k < 3; k++) {
            muscles[k].target = c[k];
            if (muscles[k].update(1 / HZ)) T3.applyContraction3(arm.solver, arm.tendons[k], muscles[k].value);
          }
          arm.solver.step(1 / HZ, T3.TENTACLE3D.sweeps);
        },
        tipSim: () => ({ ...arm.solver.nodes[T3.TIP3] }),
        spineSim: () => Array.from({ length: T3.TIP3 + 1 }, (_, i) => ({ ...arm.solver.nodes[T3.SPINE3(i)] })),
      };
    };

    /** 台架的在场档（MachineBench handBandOf 原样）：离开当前档要越过边界 bandHys 才算 */
    const handBandOf = (distMm, cur) => {
      const raw = bandOf(distMm / 1000);
      if (cur === null || cur === 'gone' || raw === cur) return raw;
      const h = HAND_UI.bandHys / 1000;
      const m = distMm / 1000;
      if (cur === 'near' && m < 0.6 + h) return 'near';
      if (cur === 'far' && m > 1.5 - h) return 'far';
      if (cur === 'mid' && m > 0.6 - h && m < 1.5 + h) return 'mid';
      return raw;
    };

    /** 引擎的手链阶段（迎手链 v2 的 getter；没有 = null） */
    const stageOf = (e) => {
      if (typeof e.handStage !== 'function') return null;
      const hs = e.handStage();
      if (!hs) return null;
      return typeof hs === 'string' ? { stage: hs, beat: null } : { stage: hs.stage ?? null, beat: hs.beat ?? null };
    };

    /**
     * 一次试验。withHand = false：同种子不放手（基线）。inject = 参照场景在 tr = 0 注入的刺激（null = 不注入）。
     * 返回 { rejected } = 种子不合格（第一次看见不是想要的态度 / 没看见 / 要握没握住）。
     */
    const trial = (vocab, seed, sc, { withHand = true, inject = null, untilRel = null } = {}) => {
      const SC = SCEN[sc];
      const view = VIEWS[SC.view ?? 'axon'];
      const ppm = view.ppm;
      const order = [P, ...PERSONA_KEYS.filter((k) => k !== P)];
      const opts = { seed, order, loop: false, lifeRate: 1, vocab };
      if (vocab === 2) opts.deepOk = true;
      const e = new BehaviorEngine(opts);
      const st = e.state;
      e.skip();
      if (SC.age !== undefined) {
        // 衰老段：先进成长段、再跳到衰老段，生命钟 ×40 推到目标进度，再 ×0.001 把进度冻住（行为照真实秒走）
        e.tick();
        e.skip();
        e.tick();
        e.setLifeRate(40);
        for (let i = 0; i < 20 * HZ && e.status().phaseElapsed / e.status().phaseLen < SC.age; i++) e.tick();
        e.setLifeRate(0.001);
      }
      st.nextSpont = 1e9;
      st.nextOrient = 1e9;
      e.drain();
      const tA = e.time + PRE;
      const winRel = untilRel ?? SC.win;
      const nSteps = Math.round((PRE + winRel) * HZ);
      const arm = makeArm();
      const frames = [];
      const events = [];
      const stages = []; // {tr, stage, beat}
      const m = {}; // 场景内的时刻（相对手出现）
      // 台架的状态
      const track = MB.pointerTrack();
      let contact = MB.contactIdle();
      let electrodeSent = false;
      let tensionOn = false;
      let handSent = null;
      let lastAimDir = 0;
      let handBand = null;
      let bandCand = null;
      let bandCandAt = 0;
      let lastPtr = null;
      let firstSeen = null;
      let curStage = null;
      let knocked = false;
      let handSends = 0;
      const want = SC.want ?? 'toward';
      const traction = vocab === 2 && !!SC.traction;
      for (let i = 0; i < nSteps; i++) {
        const t = e.time;
        const tr = t - tA;
        const yaw0 = e.targets().yaw;
        let H = null;
        if (withHand && !SC.ref && tr >= -1e-9) {
          let ptrL;
          if (SC.ptr) ptrL = SC.ptr(tr, m);
          else {
            H = SC.hand(tr, m);
            ptrL = MB.projectLogical(view.v, H);
          }
          const pc = { x: ptrL.x * CSS, y: ptrL.y * CSS };
          // 指针移动（台架 onPointerMove）
          if (!lastPtr || pc.x !== lastPtr.x || pc.y !== lastPtr.y) MB.trackMove(track, t, pc.x, pc.y);
          lastPtr = pc;
          // ① 手的读数（台架 syncHand ①）
          const rd = MB.handReading(view.v, ptrL, yaw0, handSent?.bearing);
          if (rd.side >= HAND_UI.sideMin || !handSent) lastAimDir = rd.aimDir;
          const last = handSent;
          const moved =
            !last ||
            ang(rd.bearing, last.bearing) > HAND_UI.dBearing ||
            ang(rd.face, last.face) > HAND_UI.dBearing ||
            Math.abs(rd.dist - last.dist) > HAND_UI.dDist ||
            Math.abs(rd.aimBend - last.aimBend) > HAND_UI.dAimBend ||
            (rd.aimBend > 0.05 && ang(lastAimDir, last.aimDir) > HAND_UI.dAimDir);
          if (moved && (!last || t - last.at >= HAND_UI.send)) {
            const send = {
              bearing: r3(rd.bearing),
              dist: Math.round(rd.dist),
              face: r3(rd.face),
              aimDir: r3(lastAimDir),
              aimBend: r3(rd.aimBend),
              aimDist: Math.round(rd.aimDist),
            };
            handSent = { ...send, at: t, onBody: rd.onBody };
            const ev = { kind: 'HAND', on: true, ...send };
            if (e.vocab() === 2 && V2_FIELDS) {
              ev.touch = Math.round(MB.contactRadiusMm(ppm, false));
              ev.still = Math.round(Math.min(9.9, t - track.lastMoveAt) * 10) / 10;
              ev.v = Math.round(MB.trackSpeed(track, t, pc.x, pc.y) / ppm);
            }
            e.push(ev);
            handSends++;
          }
          // ② 在场档（台架 syncHand ②；面板在场 = 没人）
          if (SC.presence) {
            const hb = handBandOf(rd.dist, handBand);
            if (hb !== handBand) {
              if (bandCand !== hb) {
                bandCand = hb;
                bandCandAt = t;
              }
              if (handBand === null || t - bandCandAt >= HAND_UI.bandDwell) {
                const before = handBand === null ? 'gone' : handBand;
                handBand = hb;
                bandCand = null;
                if (hb !== before) e.push({ kind: 'PRESENCE', band: hb });
              }
            } else bandCand = null;
          }
          // ③ 碰臂（台架 syncHand ③ = contactStep）
          MB.trackTrim(track, t);
          const spC = arm.spineSim().map((n) => cssOf(view, MB.yawPoint(armPoint(n), yaw0)));
          contact = MB.contactStep(
            contact,
            {
              now: t,
              x: pc.x,
              y: pc.y,
              d: MB.polylineDist(pc, spC),
              pxPerMm: ppm,
              finger: false,
              speed: MB.trackSpeed(track, t, pc.x, pc.y),
              lastMoveAt: track.lastMoveAt,
              grasp: st.grasp.phase,
            },
            { traction },
          ).next;
          // syncContact（台架同式；没勾「留物件」）
          const on = contact.touching || contact.held;
          if (on !== electrodeSent) {
            electrodeSent = on;
            e.push(on && contact.touching && !contact.held && contact.by === 'arm' ? { kind: 'ARM_TOUCH', on, by: 'arm' } : { kind: 'ARM_TOUCH', on });
            events.push({ t: tr, ev: on ? 'TOUCH_ON' : 'TOUCH_OFF', p: on ? { by: contact.by } : {} });
            if (!on && tensionOn) {
              tensionOn = false;
              e.push({ kind: 'RESISTANCE', on: false });
              events.push({ t: tr, ev: 'TENSION_OFF' });
            }
          }
        }
        // 自发动作放回来（S7 / SPONT=1）：手出现那一刻起按人格 ⑥（人在时）的下限排第一次，之后引擎自己排
        if ((SC.spont || process.env.SPONT === '1') && withHand && !SC.ref && !m.spontOn && tr >= -1e-9) {
          st.nextSpont = e.time + (PT[P].spontPresent ?? PT[P].spont)[0];
          m.spontOn = true;
        }
        // 参照场景的刺激；S8 握住 3 s 后的敲击
        if (inject && !m.injected && tr >= -1e-9) {
          e.push(inject);
          m.injected = true;
        }
        if (SC.knock && !knocked && m.tPull !== undefined && tr >= m.tPull) {
          e.push({ kind: 'KNOCK', intensity: 0.95 });
          knocked = true;
          events.push({ t: tr, ev: 'KNOCKED' });
        }
        e.tick();
        for (const r of e.drain()) {
          const rt = r.t - tA;
          if (r.ev === 'HAND_STAGE') {
            stages.push({ tr: rt, stage: r.p?.stage ?? null, beat: r.p?.beat ?? null });
            curStage = { stage: r.p?.stage ?? null, beat: r.p?.beat ?? null };
          }
          if (r.src === 'engine' || r.ev === 'ARM_TOUCH' || r.ev === 'RESISTANCE' || r.ev === 'PRESENCE' || r.ev === 'KNOCK' || r.ev === 'SHELL_STROKE') {
            events.push({ t: rt, ev: r.ev, p: r.p, out: r.out, I: r.I });
          }
          if (r.ev === 'HAND_SEEN' && !r.p?.again && firstSeen === null) {
            firstSeen = { t: rt, mode: r.p?.mode };
            if (withHand && r.p?.mode !== want) return { rejected: 'mode', mode: r.p?.mode };
          }
          if (r.ev === 'GRASP_HOLD_HUMAN' && m.tHold === undefined) {
            m.tHold = rt;
            if (SC.needHold) m.tPull = m.tHold + 3;
          }
        }
        if (withHand && !SC.ref) {
          if (firstSeen === null && tr > 10) return { rejected: 'unseen' };
          if (SC.needHold && m.tHold === undefined && tr > 30) return { rejected: 'nohold' };
          if (SC.after !== undefined && m.tPull !== undefined && tr > m.tPull + SC.after) break;
        }
        // 张力开关（台架 stepEngine 引擎推进之后；catchT 有就用新规则）
        const gr = st.grasp;
        if (electrodeSent && !tensionOn && gr.phase === 'WRAP' && (gr.catchT !== undefined ? e.time >= gr.catchT : (e.time - gr.t0) / gr.dur >= CATCH_AT)) {
          tensionOn = true;
          e.push({ kind: 'RESISTANCE', on: true });
          events.push({ t: tr, ev: 'TENSION_ON' });
        } else if (tensionOn && (gr.phase === 'RELEASE' || gr.phase === 'IDLE')) {
          tensionOn = false;
          e.push({ kind: 'RESISTANCE', on: false });
          events.push({ t: tr, ev: 'TENSION_OFF' });
        }
        const tg = e.targets();
        const c = MB.tendonContractions(tg.arm, { deep: true });
        arm.step(c);
        if (tr >= REC_FROM - 1e-9) {
          const tipS = arm.tipSim();
          const tipW = MB.yawPoint(armPoint(tipS), tg.yaw);
          const sg = stageOf(e) ?? curStage;
          const D = MB.ARM_DRIVE;
          const fr = {
            tr: e.time - tA,
            tipS,
            tipW,
            yaw: tg.yaw,
            bend: tg.arm.bend,
            dir: tg.arm.dir,
            wrap: tg.arm.wrap ?? 0,
            deep: tg.arm.deep ?? 0,
            De: Math.min(D.span * tg.arm.bend + D.wrapSpan * (tg.arm.wrap ?? 0), D.dMax) + (tg.arm.deep ? D.deepSpan * tg.arm.deep : 0),
            Dt: Math.max(...c) - Math.min(...c),
            cMax: Math.max(...c),
            s: tg.breath.s,
            phi: st.phi,
            gp: st.grasp.phase,
            mode: st.hand?.mode ?? null,
            seen: !!st.hand?.seen,
            turning: !!st.hand?.turning,
            touch: contact.touching,
            ten: tensionOn,
            prog: e.motion?.() ? `${e.motion().name}:${e.motion().phase}` : null,
            stage: sg?.stage ?? null,
            beat: sg?.beat ?? null,
          };
          if (lastPtr) {
            const spC = arm.spineSim().map((n) => cssOf(view, MB.yawPoint(armPoint(n), tg.yaw)));
            const ps = polySide(lastPtr, spC);
            const tipC = cssOf(view, tipW);
            fr.ptr = lastPtr;
            fr.dScr = ps.d / ppm;
            fr.side = ps.s;
            fr.dScrTip = Math.hypot(tipC.x - lastPtr.x, tipC.y - lastPtr.y) / ppm;
            fr.touchMm = MB.contactRadiusMm(ppm, false);
            fr.aimBend = handSent?.aimBend;
            fr.aimDir = handSent?.aimDir;
            fr.aimDist = handSent?.aimDist;
            fr.face = handSent?.face;
            fr.onBody = handSent?.onBody;
            fr.Bw = MB.yawPoint(B0, tg.yaw);
            if (H) {
              fr.H = H;
              fr.dW = len(sub(tipW, H));
              fr.hBearing = wrapPi(Math.atan2(H.y - MB.YAW_AXIS.y, H.x - MB.YAW_AXIS.x) - MB.FACING);
            }
          }
          frames.push(fr);
        }
      }
      if (withHand && !SC.ref && firstSeen === null) return { rejected: 'unseen' };
      if (withHand && SC.needHold && m.tHold === undefined) return { rejected: 'nohold' };
      return { frames, events, stages, firstSeen, m, k: Math.sqrt(st.speedBase), view: SC.view ?? 'axon', ppm, handSends };
    };

    // ---------------------------------------------------------- 度量
    const speedSeries = (fr, key) => {
      const v = new Array(fr.length).fill(0);
      const a = new Array(fr.length).fill(0);
      for (let i = 1; i < fr.length; i++) v[i] = len(sub(fr[i][key], fr[i - 1][key])) * HZ;
      for (let i = 2; i < fr.length; i++) a[i] = (len(add(sub(fr[i][key], mul(fr[i - 1][key], 2)), fr[i - 2][key])) * HZ * HZ) / 1000;
      return { v, a };
    };
    const ev1 = (evs, name, pred = () => true) => evs.find((x) => x.ev === name && pred(x));
    const win = (fr, t0, t1) => {
      const out = [];
      for (let i = 0; i < fr.length; i++) if (fr[i].tr >= t0 - 1e-9 && fr[i].tr <= t1 + 1e-9) out.push(i);
      return out;
    };
    const maxOver = (arr, idx) => (idx.length ? idx.reduce((mx, i) => Math.max(mx, arr[i]), -Infinity) : NaN);
    const frAt = (fr, t) => fr.find((f) => f.tr >= t - 1e-9) ?? fr[fr.length - 1];
    const iAt = (fr, t) => {
      const i = fr.findIndex((f) => f.tr >= t - 1e-9);
      return i < 0 ? fr.length - 1 : i;
    };
    const frac = (fr, idx, pred) => (idx.length ? idx.filter((i) => pred(fr[i])).length / idx.length : NaN);

    /** 拍段：HAND_STAGE 事件起止；没有事件但有 getter 时按逐帧变化切 */
    const segmentsOf = (r) => {
      const fr = r.frames;
      const end = fr.length ? fr[fr.length - 1].tr : 0;
      let src = r.stages;
      if (!src.length) {
        src = [];
        let prev = null;
        for (const f of fr) {
          const key = `${f.stage}|${f.beat}`;
          if (f.stage !== null && key !== prev) src.push({ tr: f.tr, stage: f.stage, beat: f.beat });
          prev = key;
        }
      }
      return src.map((s, i) => ({ ...s, t0: s.tr, t1: i + 1 < src.length ? src[i + 1].tr : end }));
    };

    /** PCA 第一主轴上的峰峰值（mm）与它和呼吸行程 s（滞后 lag 秒）的相关系数 */
    const oscOf = (fr, idx, lag = 0) => {
      if (idx.length < 20) return { p2p: NaN, r: NaN };
      const pts = idx.map((i) => fr[i].tipS);
      const c = mul(
        pts.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }),
        1 / pts.length,
      );
      const X = pts.map((p) => sub(p, c));
      let v = { x: 1, y: 0.3, z: 0.2 };
      for (let it = 0; it < 30; it++) {
        let w = { x: 0, y: 0, z: 0 };
        for (const q of X) w = add(w, mul(q, q.x * v.x + q.y * v.y + q.z * v.z));
        v = mul(w, 1 / (len(w) || 1));
      }
      const proj = X.map((q) => q.x * v.x + q.y * v.y + q.z * v.z);
      const L0 = Math.round(lag * HZ);
      const sArr = idx.map((i) => fr[Math.max(0, i - L0)].s);
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const mp = mean(proj);
      const ms = mean(sArr);
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let j = 0; j < proj.length; j++) {
        sxy += (proj[j] - mp) * (sArr[j] - ms);
        sxx += (proj[j] - mp) ** 2;
        syy += (sArr[j] - ms) ** 2;
      }
      return { p2p: Math.max(...proj) - Math.min(...proj), r: sxx > 0 && syy > 0 ? Math.abs(sxy / Math.sqrt(sxx * syy)) : NaN };
    };
    /** t 之后第 n 口气结束的时刻（呼吸相位回绕） */
    const afterBreaths = (fr, t, n) => {
      let k = 0;
      for (let i = iAt(fr, t) + 1; i < fr.length; i++) {
        if (fr[i].phi < fr[i - 1].phi - 0.5 && ++k >= n) return fr[i].tr;
      }
      return fr[fr.length - 1].tr;
    };
    /**
     * 「从触发到梢端动 5 mm」（§9.2 #3）。触发之后没有「本来会怎样」的基线（引擎里的事，分不出岔），
     * 改量梢端（臂坐标）偏离触发前 0.2 s 的二次外推 ≥ 5 mm 的时刻：静息随呼吸的晃是光滑的，外推吃得掉大半，
     * 新起的动作吃不掉。最多看 3 s。触发离记录开头不到 0.2 s 时退回「离触发那一刻的位置」。
     */
    const moveOnset = (fr, t) => {
      const i0 = iAt(fr, t);
      const k = Math.round(0.1 * HZ);
      const p0 = fr[i0].tipS;
      const ok = i0 - 2 * k >= 0;
      const p1 = ok ? fr[i0 - k].tipS : p0;
      const p2 = ok ? fr[i0 - 2 * k].tipS : p0;
      for (let i = i0; i < fr.length && fr[i].tr - fr[i0].tr <= 3; i++) {
        // 过 (−2k, p2) (−k, p1) (0, p0) 的二次插值在 u = (i − i0)/k 处的值
        const u = (i - i0) / k;
        const pred = ok ? add(add(mul(p0, ((u + 1) * (u + 2)) / 2), mul(p1, -u * (u + 2))), mul(p2, (u * (u + 1)) / 2)) : p0;
        if (len(sub(fr[i].tipS, pred)) >= 5) return fr[i].tr - fr[i0].tr;
      }
      return NaN;
    };
    /** 越过：窗口里指针换到脊线另一侧（相对起点那一侧）时离脊线的最大画面距离（mm；没越过 = 0） */
    const crossOver = (fr, tRef, t0, t1) => {
      // 起点那一侧：tRef 那一帧（手还没出现时取手出现后的第一帧）
      const f0 = frAt(fr, tRef);
      const s0 = f0.side ?? fr.find((f) => f.side !== undefined)?.side;
      if (s0 === undefined) return NaN;
      let best = 0;
      for (const i of win(fr, t0, t1)) if (fr[i].side !== s0 && Number.isFinite(fr[i].dScr)) best = Math.max(best, fr[i].dScr);
      return best;
    };
    /** 深卷：总时长、任意 49 s 窗内最大占比、最长一段、深卷时最大 D、深卷时弯向离腱轴 0 最远 */
    const deepStats = (fr, idx0) => {
      // 惊跳本来就深卷（全场唯一深卷到 0.45 以上的动作），不算进迎手链的深卷预算
      const idx = idx0.filter((i) => !isStartle(fr[i]));
      const on = idx.filter((i) => fr[i].deep > 1e-3);
      let longest = 0;
      let run = 0;
      for (const i of idx) {
        run = fr[i].deep > 1e-3 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      let win49 = 0;
      const W = 49 * HZ;
      let cnt = 0;
      for (let j = 0; j < idx.length; j++) {
        if (fr[idx[j]].deep > 1e-3) cnt++;
        if (j >= W && fr[idx[j - W]].deep > 1e-3) cnt--;
        win49 = Math.max(win49, cnt / Math.min(W, j + 1));
      }
      return {
        deepS: on.length / HZ,
        deepFrac: idx.length ? on.length / idx.length : NaN,
        deepWin49: idx.length >= W ? win49 : NaN,
        deepLongest: longest / HZ,
        deepMaxDe: on.length ? Math.max(...on.map((i) => fr[i].De)) : NaN,
        deepAxisOff: on.length ? Math.max(...on.map((i) => Math.abs(wrapPi(fr[i].dir)) * DEG)) : NaN,
        maxDeep: idx.length ? Math.max(...idx.map((i) => fr[i].deep)) : NaN,
      };
    };

    /** 这一帧在做惊跳（v2 的惊跳程序名是 startle…） */
    const isStartle = (f) => typeof f.prog === 'string' && f.prog.startsWith('startle');

    /** 参照（K / R）：有刺激 − 同种子没刺激，逐帧相减 */
    const metricsRef = (r, base, met) => {
      const n = Math.min(r.frames.length, base.frames.length);
      const diff = [];
      for (let i = 0; i < n; i++) diff.push({ tr: r.frames[i].tr, d: sub(r.frames[i].tipS, base.frames[i].tipS) });
      const idx = diff.map((_, i) => i).filter((i) => diff[i].tr >= 0 && diff[i].tr <= met);
      const v = new Array(n).fill(0);
      const a = new Array(n).fill(0);
      for (let i = 1; i < n; i++) v[i] = len(sub(diff[i].d, diff[i - 1].d)) * HZ;
      for (let i = 2; i < n; i++) a[i] = (len(add(sub(diff[i].d, mul(diff[i - 1].d, 2)), diff[i - 2].d)) * HZ * HZ) / 1000;
      const peak = Math.max(...idx.map((i) => len(diff[i].d)));
      // 起动两种口径（与 reaction-probe 同）：梢端偏 5 mm（研究笔记 §8 表里的「起动」）· 偏过两成峰值
      const on5 = idx.find((i) => len(diff[i].d) > 5);
      const on = idx.find((i) => len(diff[i].d) > Math.max(5, 0.2 * peak));
      const vS = speedSeries(r.frames, 'tipS').v;
      return {
        peakD: peak,
        peakV: maxOver(v, idx),
        peakA: maxOver(a, idx),
        onset5: on5 !== undefined ? diff[on5].tr : NaN,
        onset: on !== undefined ? diff[on].tr : NaN,
        rawV: maxOver(vS, win(r.frames, 0, met)),
        startles: r.events.filter((x) => x.ev === 'STARTLE').length,
        responses: r.events.filter((x) => x.ev === 'RESPONSE').length,
      };
    };

    /** 迎手链共有：拍、深卷、⑨ 有没有打断投入、看见以后的 approach 程序、碰臂排队 */
    const common = (r) => {
      const fr = r.frames;
      const evs = r.events;
      const segs = segmentsOf(r);
      const hasStage = segs.length > 0;
      const winEnd = fr[fr.length - 1].tr;
      const tSeen = r.firstSeen ? r.firstSeen.t : NaN;
      const beatCount = {};
      for (const s of segs) if (s.beat) beatCount[s.beat] = (beatCount[s.beat] ?? 0) + 1;
      const engagedAt = (t) => {
        const f = frAt(fr, t);
        return hasStage ? ENGAGED20.includes(f.stage) : f.gp === 'WRAP' || f.gp === 'HOLD_HUMAN' || f.gp === 'HOLD_OBJECT';
      };
      const again = evs.filter((x) => x.ev === 'HAND_SEEN' && x.p?.again);
      const ds = deepStats(fr, win(fr, 0, winEnd));
      const noDeep = hasStage
        ? win(fr, 0, winEnd).filter((i) => fr[i].deep > 1e-3 && !isStartle(fr[i]) && (NO_DEEP_STAGES.includes(fr[i].stage) || BEATS.pounce.includes(fr[i].beat))).length
        : NaN;
      // 迎手链（看见以后）梢端世界峰速，除去惊跳（STARTLE 后 3 s）
      const startT = evs.filter((x) => x.ev === 'STARTLE').map((x) => x.t);
      const { v: vW } = speedSeries(fr, 'tipW');
      const chainIdx = Number.isFinite(tSeen) ? win(fr, tSeen, winEnd).filter((i) => !startT.some((s) => fr[i].tr >= s && fr[i].tr <= s + 3)) : [];
      return {
        hasStage: hasStage ? 1 : 0,
        beats: Object.entries(beatCount)
          .map(([k, v]) => `${k}×${v}`)
          .join(' '),
        againEngaged: again.filter((x) => engagedAt(x.t)).length,
        again: again.length,
        approachResp: Number.isFinite(tSeen) ? evs.filter((x) => x.ev === 'RESPONSE' && x.t >= tSeen && typeof x.p?.motion === 'string' && x.p.motion.startsWith('respond.approach')).length : NaN,
        busyTouch: evs.filter((x) => x.ev === 'ARM_TOUCH' && x.p?.on && x.out === 'busy').length,
        startles: startT.length,
        responses: evs.filter((x) => x.ev === 'RESPONSE').length,
        worldPeak: maxOver(vW, chainIdx),
        noDeepFrames: noDeep,
        ...ds,
        segs,
      };
    };

    /** 按拍：扑 / 转运 / 最后一拍 / 停半拍 / 退 / 精确伸 / 撑与泄气 / 触发起动 */
    const beatMetrics = (r, cm) => {
      const fr = r.frames;
      const segs = cm.segs;
      if (!segs.length) return {};
      const { v: vS, a: aS } = speedSeries(fr, 'tipS');
      const of = (names) => segs.filter((s) => names.includes(s.beat));
      const out = {};
      const pounce = of(BEATS.pounce)[0];
      if (pounce) {
        const iw = win(fr, pounce.t0, pounce.t1);
        out.pounceV = maxOver(vS, iw);
        out.pounceA = maxOver(aS, iw);
        out.prePounceV = maxOver(vS, win(fr, pounce.t0 - 0.3, pounce.t0));
        out.pounceOver = crossOver(fr, pounce.t0, pounce.t0, pounce.t1 + 0.5);
      }
      // 转运：命令平面里的路程 ≥ 0.15 D 的那些
      const tr = of(BEATS.transport).filter((s) => {
        let path = 0;
        const iw = win(fr, s.t0, s.t1);
        for (let j = 1; j < iw.length; j++) {
          const a = fr[iw[j - 1]];
          const b = fr[iw[j]];
          path += Math.hypot(b.De * Math.cos(b.dir) - a.De * Math.cos(a.dir), b.De * Math.sin(b.dir) - a.De * Math.sin(a.dir));
        }
        return path >= 0.15;
      });
      if (tr.length) out.transportV = Math.max(...tr.map((s) => maxOver(vS, win(fr, s.t0, s.t1))));
      const trAll = of(BEATS.transport);
      if (trAll.length) out.transportVall = Math.max(...trAll.map((s) => maxOver(vS, win(fr, s.t0, s.t1))));
      const last = of(BEATS.last);
      if (last.length) out.lastBeatV = maxOver(vS, win(fr, last[last.length - 1].t0, last[last.length - 1].t1));
      const hov = of(BEATS.hover);
      if (hov.length) {
        let best = 0;
        for (const s of hov) {
          let run = 0;
          for (const i of win(fr, s.t0, s.t1)) {
            run = vS[i] <= STILL_V ? run + 1 : 0;
            best = Math.max(best, run);
          }
        }
        out.hoverStill = best / HZ;
      }
      const reach = of(BEATS.reach)[0];
      if (reach) out.reachOver = crossOver(fr, reach.t0, reach.t0, reach.t1 + 0.5);
      const ret = of(BEATS.retreat)[0];
      if (ret) {
        const d0 = frAt(fr, ret.t0).dScrTip;
        out.retreatAway = Math.max(...win(fr, ret.t0, ret.t1).map((i) => fr[i].dScrTip - d0));
      }
      // 撑 → 泄气（看见后 8 s 内走完）；泄气后弯曲 ÷ 撑时弯曲
      const strain = segs.filter((s) => s.stage === 'strain');
      const defl = of(BEATS.deflate);
      if (Number.isFinite(r.firstSeen?.t)) {
        const tS = r.firstSeen.t;
        out.strainDone = defl.some((s) => s.t1 <= tS + 8) || segs.some((s) => s.stage === 'watch' && s.t0 <= tS + 8) ? 1 : 0;
        if (strain.length && defl.length) {
          const bMax = Math.max(...strain.flatMap((s) => win(fr, s.t0, s.t1).map((i) => fr[i].bend)));
          out.deflateRatio = frAt(fr, defl[0].t1).bend / (bMax || 1);
        }
      }
      // 触发起动：外来触发（看见手、脱手）到梢端动 5 mm——§9.2 #3 要的是「对人的事迎手链永远比惊跳慢」。
      // 不算内部换阶段（陪着 → 凑是它自己等手停稳后的决定）和碰到 → 缠（碰到时臂本来就在动，缠的第一拍是定住）
      const trig = [];
      for (const e of r.events) {
        if ((e.ev === 'HAND_SEEN' && e.p?.again === false) || e.ev === 'GRASP_LOST') trig.push(moveOnset(fr, e.t));
      }
      out.trigOnsetMin = fin(trig).length ? Math.min(...fin(trig)) : NaN;
      out.lunge = of(BEATS.lunge).length ? 1 : 0;
      out.reachAfter = of(BEATS.reachAfter).length ? 1 : 0;
      out.peeks = of(BEATS.peek).length;
      out.pounces = of(BEATS.pounce).length;
      out.crouches = of(BEATS.crouch).length;
      return out;
    };

    /** S1 族（S1 / S1n / S1p / S9 / S10×）：看见 → 凑 → 碰到 → 缠 → 握 */
    const metricsS1 = (r, base) => {
      const fr = r.frames;
      const evs = r.events;
      const tSeen = r.firstSeen.t;
      const winEnd = fr[fr.length - 1].tr;
      const { v: vS, a: aS } = speedSeries(fr, 'tipS');
      const touch = ev1(evs, 'TOUCH_ON');
      const tTouch = touch ? touch.t : NaN;
      const gs = ev1(evs, 'GRASP_START', (x) => !x.p?.chase && (!touch || x.t >= tTouch - 1e-9));
      const tGS = gs ? gs.t : NaN;
      const ten = ev1(evs, 'TENSION_ON');
      const hold = ev1(evs, 'GRASP_HOLD_HUMAN');
      const tHold = hold ? hold.t : NaN;
      const empty = ev1(evs, 'GRASP_EMPTY');
      // 开始朝手动：同种子不放手那一遍逐帧相减，画面上朝指针方向的分量 > 5 mm（§9.2 #7）
      let onset = NaN;
      let onset3 = NaN;
      if (base) {
        const iSeen = iAt(fr, tSeen);
        const f0 = fr[iSeen];
        const tip0 = { x: f0.ptr.x, y: f0.ptr.y };
        const tipC0 = base.frames[iSeen] ? cssOfFrame(r, base.frames[iSeen].tipW) : null;
        if (tipC0) {
          const u0 = { x: tip0.x - tipC0.x, y: tip0.y - tipC0.y };
          const n0 = Math.hypot(u0.x, u0.y) || 1;
          const u = { x: u0.x / n0, y: u0.y / n0 };
          for (let i = iSeen; i < fr.length && i < base.frames.length; i++) {
            const a = cssOfFrame(r, fr[i].tipW);
            const b = cssOfFrame(r, base.frames[i].tipW);
            const toward = ((a.x - b.x) * u.x + (a.y - b.y) * u.y) / r.ppm;
            if (!Number.isFinite(onset) && toward > 5) onset = fr[i].tr - tSeen;
            if (!Number.isFinite(onset3) && len(sub(fr[i].tipW, base.frames[i].tipW)) > 5) onset3 = fr[i].tr - tSeen;
            if (Number.isFinite(onset) && Number.isFinite(onset3)) break;
          }
        }
      }
      const reachEnd = Number.isFinite(tTouch) ? tTouch : tSeen + 8;
      const iReach = win(fr, tSeen, reachEnd);
      // 缠的过冲（§9.2 #11）：碰到以后指针被脊线越过多远（侧别以碰到前 0.3 s 那一侧为准）；另记碰到以后脊线↔指针最大画面距离
      const ovEnd = Number.isFinite(tHold) ? Math.min(tHold + 3, (Number.isFinite(tTouch) ? tTouch : 0) + 6) : (Number.isFinite(tTouch) ? tTouch : 0) + 4;
      const overshoot = Number.isFinite(tTouch) ? crossOver(fr, tTouch - 0.3, tTouch, ovEnd) : NaN;
      const overAbs = Number.isFinite(tTouch) ? maxOver(fr.map((f) => f.dScr ?? NaN), win(fr, tTouch, ovEnd)) : NaN;
      // 握着时脊线↔指针（前 4 口气，§9.2 #12）；握着在动（前 3 口气 vs 手出现前 3 s 的静息，§9.2 #13）
      let holdDmed = NaN;
      let holdDp95 = NaN;
      let holdP2P = NaN;
      let holdR = NaN;
      let holdP2Pss = NaN;
      if (Number.isFinite(tHold)) {
        const i4 = win(fr, tHold, afterBreaths(fr, tHold, 4));
        holdDmed = median(i4.map((i) => fr[i].dScr));
        holdDp95 = quant(
          i4.map((i) => fr[i].dScr),
          0.95,
        );
        // 前 3 口气从握持控制器接手算（有 hold 阶段就从它开始，没有就从握住那一刻）——缠的余振也在里面；
        // 另记稳态（握住 4 s 后的 3 口气，与 scratch 版「稳态峰峰」同口径）
        const hs = r.stages.find((x) => x.stage === 'hold' && x.tr >= tHold - 1e-9)?.tr ?? tHold;
        const o = oscOf(fr, win(fr, hs, afterBreaths(fr, hs, 3)), 0.45);
        holdP2P = o.p2p;
        holdR = o.r;
        holdP2Pss = oscOf(fr, win(fr, tHold + 4, afterBreaths(fr, tHold + 4, 3))).p2p;
      }
      // 静息呼吸起伏：同种子不放手那一遍、臂从笔直落定以后（手出现前 4 s 起就在落定，取 tr ≥ 1 s 那一段）
      const rest = base ? oscOf(base.frames, win(base.frames, 1, base.frames[base.frames.length - 1].tr)) : { p2p: NaN };
      const cnt = (name) => evs.filter((x) => x.ev === name).length;
      return {
        tSeen,
        onset,
        onset3,
        reachV: maxOver(vS, iReach),
        reachA: maxOver(aS, iReach),
        tTouch: tTouch - tSeen,
        touchBy: touch?.p?.by ?? null,
        tGS: tGS - tTouch,
        tTen: ten ? ten.t - tTouch : NaN,
        tHold: tHold - tTouch,
        held: Number.isFinite(tHold) ? 1 : 0,
        empty: empty ? 1 : 0,
        overshoot,
        overAbs,
        holdDmed,
        holdDp95,
        holdP2P,
        holdR,
        holdP2Pss,
        restP2P: rest.p2p,
        minScr: Math.min(...iReach.map((i) => fr[i].dScr ?? Infinity)),
        touchBeforeSeen: Number.isFinite(tTouch) && tTouch < tSeen ? 1 : 0,
        contacts: cnt('CONTACT'),
        touchMm: fr[fr.length - 1].touchMm,
        aimBendSeen: frAt(fr, tSeen).aimBend,
      };
    };
    const cssOfFrame = (r, w) => cssOf(VIEWS[r.view], w);

    /** S2：够不着 → 转身 → 再够 */
    const metricsS2 = (r) => {
      const fr = r.frames;
      const evs = r.events;
      const tSeen = r.firstSeen.t;
      const iS = win(fr, tSeen, fr[fr.length - 1].tr);
      const yr = fr.map((f, i) => (i ? wrapPi(f.yaw - fr[i - 1].yaw) * HZ : 0));
      const iStart = iS.find((i) => Math.abs(yr[i]) > 0.05);
      const faceEnd = frAt(fr, tSeen + 0.5).face ?? fr[fr.length - 1].face;
      const iDone = iS.find((i) => i >= (iStart ?? Infinity) && Math.abs(wrapPi(faceEnd - fr[i].yaw)) < 4 / DEG);
      const meanOf = (k, idx) => (idx.length ? idx.reduce((s, i) => s + fr[i][k], 0) / idx.length : NaN);
      const tDone = iDone !== undefined ? fr[iDone].tr : fr[fr.length - 1].tr - 2;
      const tail = win(fr, tDone + 2, tDone + 4);
      return {
        tSeen,
        tTurn0: iStart !== undefined ? fr[iStart].tr - tSeen : NaN,
        tTurn1: iDone !== undefined ? fr[iDone].tr - tSeen : NaN,
        turnDeg: iDone !== undefined ? (fr[iDone].yaw - frAt(fr, tSeen).yaw) * DEG : NaN,
        yawVmax: maxOver(yr.map(Math.abs), iS) * DEG,
        bendEnd: meanOf('bend', tail),
        dEndW: meanOf('dW', tail),
        dEndScr: meanOf('dScr', tail),
        touched: evs.some((x) => x.ev === 'TOUCH_ON') ? 1 : 0,
      };
    };

    /** S3 / S3s：手划过臂前方 */
    const metricsS3 = (r, c3) => {
      const fr = r.frames;
      const evs = r.events;
      const tSeen = r.firstSeen.t;
      const tMove0 = Math.max(c3.hold0, tSeen) + 1;
      const tMove1 = c3.hold0 + c3.move;
      const iM = win(fr, tMove0, tMove1);
      const az = (p, B) => Math.atan2(p.y - B.y, p.x - B.x);
      const lag = iM.map((i) => wrapPi(az(fr[i].tipW, fr[i].Bw) - az(fr[i].H, fr[i].Bw)) * DEG);
      const absLag = lag.map(Math.abs);
      const { v: vS } = speedSeries(fr, 'tipS');
      const touches = evs.filter((x) => x.ev === 'TOUCH_ON');
      // 意外碰到（§9.2 #19）：碰到时不在凑 / 撑 / 追 / 缠（没有拍就写「—」）
      const hasStage = r.stages.length > 0 || fr.some((f) => f.stage !== null);
      const accidental = hasStage ? touches.filter((x) => !['approach', 'strain', 'chase', 'wrap'].includes(frAt(fr, x.t).stage)).length : NaN;
      return {
        tSeen,
        lagMed: median(lag),
        lagAbsMed: median(absLag),
        lagP90: quant(absLag, 0.9),
        farFrac: frac(fr, iM, (f) => f.dScrTip >= f.touchMm + 10),
        movingFrac: iM.length ? iM.filter((i) => vS[i] > STILL_V).length / iM.length : NaN,
        dScrMed: median(iM.map((i) => fr[i].dScr)),
        touches: touches.length,
        accidental,
        grasps: evs.filter((x) => x.ev === 'GRASP_START').length,
        modeSwitch: frac(fr, iM, (f) => f.mode !== 'toward'),
      };
    };

    /** S4 / S4b / S4s / S5 / S8：握住之后手怎么动 */
    const metricsPull = (r, sc) => {
      const fr = r.frames;
      const evs = r.events;
      const tPull = r.m.tPull;
      const winEnd = fr[fr.length - 1].tr;
      const lost = ev1(evs, 'GRASP_LOST', (x) => x.t >= tPull);
      const off = ev1(evs, 'TOUCH_OFF', (x) => x.t >= tPull);
      const chase = ev1(evs, 'GRASP_START', (x) => x.t >= tPull && x.p?.chase);
      const emptyC = chase ? ev1(evs, 'GRASP_EMPTY', (x) => x.t >= chase.t) : null;
      const holdC = ev1(evs, 'GRASP_HOLD_HUMAN', (x) => x.t >= tPull);
      const rel = ev1(evs, 'RELEASE_DONE', (x) => x.t >= tPull);
      const touch2 = lost ? ev1(evs, 'TOUCH_ON', (x) => x.t >= lost.t) : ev1(evs, 'TOUCH_ON', (x) => x.t >= tPull);
      const { v: vS } = speedSeries(fr, 'tipS');
      const out = {
        tHold: r.m.tHold,
        tOff: off ? off.t - tPull : NaN,
        tLost: lost ? lost.t - tPull : NaN,
        reaction: lost?.p?.reaction ?? null,
        tChase: chase && lost ? chase.t - lost.t : NaN,
        chaseResult: chase ? (holdC && holdC.t >= chase.t ? 'hold' : emptyC ? 'empty' : 'running') : lost ? 'none' : 'nolost',
        retouch: touch2 ? 1 : 0,
        tRetouch: touch2 && lost ? touch2.t - lost.t : NaN,
        tRelease: rel ? rel.t - tPull : NaN,
        startleAfter: evs.some((x) => x.ev === 'STARTLE' && x.t >= tPull) ? 1 : 0,
        searches: evs.filter((x) => x.ev === 'SPONTANEOUS' && x.p?.action === 'search' && x.t >= tPull).length,
        tipVmaxAfter: maxOver(vS, win(fr, tPull, winEnd)),
        modeEnd: fr[fr.length - 1].mode,
      };
      // 追的结局与收尾（§9.2 #15）：碰到 / 撑 / 搜寻 / 放开之一，或回到 track / watch / off / avoid；拉开起 12.5 s 内要有
      out.outcome = touch2 && lost ? 'retouch' : emptyC ? 'empty' : out.searches ? 'search' : lost ? 'none' : 'nolost';
      const segs = segmentsOf(r);
      const tL = lost ? lost.t : tPull;
      const ends = [
        touch2 && lost ? touch2.t : Infinity,
        rel ? rel.t : Infinity,
        evs.find((x) => x.ev === 'SPONTANEOUS' && x.p?.action === 'search' && x.t >= tL)?.t ?? Infinity,
        segs.find((s) => s.t0 > tL && (SETTLED_STAGES.includes(s.stage) || s.stage === 'strain'))?.t0 ?? Infinity,
      ];
      out.closed = Math.min(...ends) - tPull <= 12.5 ? 1 : 0;
      if (sc === 'S5') {
        // 被牵着走（§9.2 #14）：牵的 3 s 里不脱手；脊线↔指针（画面）中位
        out.lostInPull = evs.some((x) => x.ev === 'GRASP_LOST' && x.t >= tPull && x.t <= tPull + 3) ? 1 : 0;
        out.offInPull = evs.some((x) => x.ev === 'TOUCH_OFF' && x.t >= tPull && x.t <= tPull + 3) ? 1 : 0;
        out.dPull = median(win(fr, tPull, tPull + 3).map((i) => fr[i].dScr));
      }
      if (sc === 'S8') {
        // 重新武装（§9.2 #22）：敲击松手以后（RELEASE_DONE 起）10 s 内重新缠几次；有没有「缠 → 抓空 → 缠」
        const t0 = rel ? rel.t : tPull;
        const starts = evs.filter((x) => x.ev === 'GRASP_START' && x.t > t0 && x.t <= t0 + 10);
        const empties = evs.filter((x) => x.ev === 'GRASP_EMPTY' && x.t > t0 && x.t <= t0 + 10);
        out.reWraps = starts.length;
        out.tReWrap = starts.length ? starts[0].t - t0 : NaN;
        out.empties = empties.length;
        out.loop = starts.length >= 2 && empties.some((x) => x.t > starts[0].t && x.t < starts[1].t) ? 1 : 0;
        out.touchOnAtRel = frAt(fr, t0).touch ? 1 : 0;
      }
      return out;
    };

    /** S6：深卷几何 */
    const metricsS6 = (r) => {
      const fr = r.frames;
      const evs = r.events;
      const tSeen = r.firstSeen.t;
      return {
        tSeen,
        touched: evs.some((x) => x.ev === 'TOUCH_ON') ? 1 : 0,
        held: evs.some((x) => x.ev === 'GRASP_HOLD_HUMAN') ? 1 : 0,
        aimBendSeen: frAt(fr, tSeen).aimBend,
        aimDirSeen: (frAt(fr, tSeen).aimDir ?? NaN) * DEG,
        holdDmed: median(fr.filter((f) => f.gp === 'HOLD_HUMAN').map((f) => f.dScr)),
      };
    };

    /** S7：躲（侧身警戒、不丢手、偷看） */
    const metricsS7 = (r) => {
      const fr = r.frames;
      const evs = r.events;
      const winEnd = fr[fr.length - 1].tr;
      // 手的相对方位：看见 3 s 以后（转身做完）、还在躲（mode = away）的那些帧；⑨ 到点改成迎以后的不算
      const rel = win(fr, r.firstSeen.t + 3, winEnd)
        .filter((i) => fr[i].mode === 'away')
        .map((i) => Math.abs(wrapPi(fr[i].hBearing - fr[i].yaw)) * DEG);
      const lost = evs.filter((x) => x.ev === 'HAND_LOST');
      return {
        tSeen: r.firstSeen.t,
        lostUnseen: lost.filter((x) => x.p?.reason === 'unseen').length,
        tLost: lost.length ? lost[0].t : NaN,
        relBearing: median(rel),
        awayFrac: frac(fr, win(fr, r.firstSeen.t, winEnd), (f) => f.mode === 'away'),
        modeEnd: fr[fr.length - 1].mode,
        seenEnd: fr[fr.length - 1].seen ? 1 : 0,
      };
    };

    // 下采样（10 Hz）留给画图 / 复核
    const pick = (f) => {
      const o = {
        t: +f.tr.toFixed(3),
        tip: [+f.tipW.x.toFixed(1), +f.tipW.y.toFixed(1), +f.tipW.z.toFixed(1)],
        yaw: +(f.yaw * DEG).toFixed(2),
        bend: +f.bend.toFixed(3),
        dir: +(f.dir * DEG).toFixed(1),
        wrap: +f.wrap.toFixed(3),
        deep: +f.deep.toFixed(3),
        De: +f.De.toFixed(3),
        s: +f.s.toFixed(3),
        gp: f.gp,
        mode: f.mode,
        touch: f.touch ? 1 : 0,
        ten: f.ten ? 1 : 0,
        prog: f.prog,
        stage: f.stage,
        beat: f.beat,
      };
      if (f.ptr) {
        o.dScr = +f.dScr.toFixed(1);
        o.dScrTip = +f.dScrTip.toFixed(1);
        if (f.H) o.dW = +f.dW.toFixed(1);
      }
      return o;
    };

    // ---------------------------------------------------------- 跑
    const result = {
      P,
      v2Fields: V2_FIELDS,
      v2Accepted,
      view: Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, { scale: v.v.scale, ppm: v.ppm, touchMm: MB.contactRadiusMm(v.ppm, false) }])),
      s3: { S3: S3a, S3s: S3b },
      data: {},
    };
    const t0all = performance.now();
    const runList = SCENS.flatMap((s) => (s === 'S10' ? SCEN.S10.multi.map((v) => `S10${v}`) : [s]));
    for (const vocab of VOCABS) {
      const key = `v${vocab}`;
      result.data[key] = {};
      const famMode = new Map(); // `${fam}:${seed}` → 第一次看见抽到的态度
      const famHeld = new Map(); // `${fam}:${seed}` → 握没握住
      for (const sc of runList) {
        const SC = SCEN[sc];
        if (!SC) {
          console.log(`[${P} v${vocab}] 没有场景 ${sc}`);
          continue;
        }
        if (SC.only && !SC.only.includes(P)) {
          result.data[key][sc] = { skipped: true, runs: [], rejected: { mode: {}, unseen: 0, nohold: 0 }, ranAt: new Date().toISOString() };
          continue;
        }
        const runs = [];
        const rejected = { mode: {}, unseen: 0, nohold: 0 };
        const t0 = performance.now();
        const fam = SC.fam ?? sc;
        const want = SC.want ?? 'toward';
        for (let seed = 1; runs.length < N && seed <= SEED_MAX; seed++) {
          let r;
          let met;
          if (SC.ref) {
            r = trial(vocab, seed, sc, { withHand: false, inject: SC.ref });
            const base = trial(vocab, seed, sc, { withHand: false });
            met = metricsRef(r, base, SC.met);
          } else {
            const kf = `${fam}:${seed}`;
            if (famMode.has(kf) && famMode.get(kf) !== want) {
              const md = famMode.get(kf);
              if (md === 'unseen') rejected.unseen++;
              else rejected.mode[md] = (rejected.mode[md] ?? 0) + 1;
              continue;
            }
            if (SC.needHold && famHeld.get(kf) === false) {
              rejected.nohold++;
              continue;
            }
            r = trial(vocab, seed, sc);
            if (r.rejected !== 'nohold') famMode.set(kf, r.rejected === 'mode' ? r.mode : r.rejected === 'unseen' ? 'unseen' : want);
            if (r.rejected === 'nohold') famHeld.set(kf, false);
            if (r.rejected) {
              if (r.rejected === 'mode') rejected.mode[r.mode] = (rejected.mode[r.mode] ?? 0) + 1;
              else rejected[r.rejected]++;
              continue;
            }
            const cm = common(r);
            const bm = beatMetrics(r, cm);
            let sm;
            if (SC.kind === 'S1') {
              const base = trial(vocab, seed, sc, { withHand: false, untilRel: Math.min(SC.win, r.firstSeen.t + 5) });
              sm = metricsS1(r, base);
              // 只记「握住了」：S1n 的窗口（22 s）比要握住的场景（30 s）短，没握住不能当成定论
              if (sm.held === 1) famHeld.set(kf, true);
            } else if (SC.kind === 'S2') sm = metricsS2(r);
            else if (SC.kind === 'S3') sm = metricsS3(r, SC.s3);
            else if (SC.kind === 'S6') sm = metricsS6(r);
            else if (SC.kind === 'S7') sm = metricsS7(r);
            else sm = metricsPull(r, sc);
            const { segs, ...cmRest } = cm;
            met = { ...cmRest, ...bm, ...sm };
          }
          runs.push({
            seed,
            k: r.k,
            metrics: met,
            events: r.events.filter((x) => x.ev !== 'HAND'),
            stages: r.stages,
            series: r.frames.filter((_, i) => i % 6 === 0).map(pick),
          });
        }
        result.data[key][sc] = { runs, rejected, ms: performance.now() - t0, ranAt: new Date().toISOString() };
        const tried = runs.length + Object.values(rejected.mode).reduce((a, b) => a + b, 0) + rejected.unseen + rejected.nohold;
        console.log(`[${P} v${vocab} ${sc}] kept ${runs.length}/${tried} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
      }
    }
    result.totalS = (performance.now() - t0all) / 1000;
    // 与已有结果合并（只覆盖这次跑的版本 × 场景）
    const file = join(OUT, `${P}.json`);
    if (process.env.FRESH !== '1' && existsSync(file)) {
      try {
        const old = JSON.parse(readFileSync(file, 'utf8'));
        for (const [v, byS] of Object.entries(old.data ?? {})) {
          result.data[v] = { ...byS, ...(result.data[v] ?? {}) };
        }
      } catch {
        /* 旧文件坏了就不合并 */
      }
    }
    writeFileSync(file, JSON.stringify(result));
  } finally {
    await server.close();
  }
}

// ================================================================ 汇总表
function aggregate(OUT) {
  const res = {};
  for (const P of PERSONAS) {
    const f = join(OUT, `${P}.json`);
    if (existsSync(f)) res[P] = JSON.parse(readFileSync(f, 'utf8'));
  }
  const fmt = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');
  const runsOf = (P, v, sc) => res[P]?.data?.[`v${v}`]?.[sc]?.runs ?? [];
  const vals = (P, v, sc, k) => runsOf(P, v, sc).map((r) => r.metrics[k]);
  const med = (P, v, sc, k) => median(vals(P, v, sc, k));
  const q = (P, v, sc, k, p) => quant(vals(P, v, sc, k), p);
  const rate = (P, v, sc, k) => {
    const R = runsOf(P, v, sc);
    if (!R.length) return '—';
    return `${R.filter((r) => r.metrics[k] === 1).length}/${R.length}`;
  };
  const rateNum = (P, v, sc, k) => {
    const R = runsOf(P, v, sc);
    return R.length ? R.filter((r) => r.metrics[k] === 1).length / R.length : NaN;
  };
  const sum = (P, v, sc, k) => {
    const xs = fin(vals(P, v, sc, k));
    return xs.length ? xs.reduce((a, b) => a + b, 0) : NaN;
  };
  const countBy = (P, v, sc, k) => {
    const c = {};
    for (const r of runsOf(P, v, sc)) {
      const x = r.metrics[k] ?? 'null';
      c[x] = (c[x] ?? 0) + 1;
    }
    return Object.entries(c)
      .map(([a, b]) => `${a}×${b}`)
      .join(' ') || '—';
  };
  const has = (P, v, sc) => runsOf(P, v, sc).length > 0;
  /** 看见以后才碰到的那些场（看见之前臂就碰到手了，「看见 → 碰到」这类指标不适用） */
  const afterSeen = (P, v, sc) => runsOf(P, v, sc).filter((r) => !r.metrics.touchBeforeSeen);
  const medA = (P, v, sc, k) => median(afterSeen(P, v, sc).map((r) => r.metrics[k]));
  const qA = (P, v, sc, k, p) => quant(
    afterSeen(P, v, sc).map((r) => r.metrics[k]),
    p,
  );
  const preSeen = (P, v, sc) => {
    const n = runsOf(P, v, sc).length - afterSeen(P, v, sc).length;
    return n ? `；看见前就碰到 ${n}/${runsOf(P, v, sc).length}，不计` : '';
  };
  const lines = [];
  const any = Object.values(res)[0];
  lines.push('# 迎手链闭环探针表（scripts/behavior/hand-probe.mjs 自动生成）');
  lines.push('');
  if (any) {
    const ax = any.view.axon;
    lines.push(
      `碰臂判定 = 台架同一份 contactStep（画面：指针 ↔ 脊线投影）；桌面画幅 ${CANVAS_W} px、轴测 ${ax.ppm.toFixed(3)} CSS px/mm、有效碰到半径 ${ax.touchMm.toFixed(1)} mm。` +
        `v2 的 HAND ${any.v2Fields ? '带' : '不带'} touch / still / v（events.ts ${any.v2Accepted ? '收' : '不收'}这三个字段）。`,
    );
    lines.push('每格 = 中位数（另注者除外）；时刻单位 s，速度 mm/s，加速度 m/s²，距离 mm（画面距离按臂梢处换成 mm）。「—」= 量不出来（没有数据 / 引擎还没有这一拍）。');
    const times = Object.entries(res)
      .map(([P, r]) => `${P} ${r.totalS?.toFixed(0)} s`)
      .join(' · ');
    lines.push(`子进程用时（最近一次）：${times}`);
  }

  // —— §9.2 验收总表
  const TH = {
    7: { A: [0.7, 1.0], C: [0.7, 1.0], D: [0.9, 1.0], B: [1.3, 1.5] },
    8: { A: 2.0, C: 2.6, D: 3.5, B: 8.5 },
    10: { A: 1.8, C: 2.2, D: 2.6, B: 3.2 },
    11: { A: 35, B: 15, C: 15, D: 25 },
    18: { A: 10, C: 10, D: 15, B: 20 },
    '18s': { A: 0.75, C: 0.6, D: 0.6, B: 0.35 },
    16: { A: 3, D: 3, C: 6 },
  };
  const verdict = (ok) => (ok === null || ok === undefined || Number.isNaN(ok) ? '—' : ok ? '过' : '不过');
  const allOk = (...xs) => (xs.some((x) => x === null) ? null : xs.every(Boolean));
  const okNum = (x, f) => (Number.isFinite(x) ? f(x) : null);
  /** 每条：(人格, 版本) → { val: 文字, ok: true / false / null } */
  const ITEMS = [
    {
      no: 1,
      name: '扑 ÷ 同人格惊跳（臂坐标）',
      th: 'p90(扑峰速) ≤ 0.5·p10(惊跳峰速)；p90(扑峰加速) ≤ 0.35·p10(惊跳峰加速)（A、快 D）',
      who: ['A', 'D'],
      f: (P, v) => {
        const a = q(P, v, 'S1n', 'pounceV', 0.9) / q(P, v, 'K', 'peakV', 0.1);
        const b = q(P, v, 'S1n', 'pounceA', 0.9) / q(P, v, 'K', 'peakA', 0.1);
        return { val: `${fmt(a, 2)} / ${fmt(b, 2)}`, ok: allOk(okNum(a, (x) => x <= 0.5), okNum(b, (x) => x <= 0.35)) };
      },
    },
    {
      no: 2,
      name: '世界系：迎手链梢端世界峰速 ÷ 惊跳',
      th: 'p90 ≤ 0.6·p10(惊跳峰速)（S1n / S2 / S4，含转身；除去惊跳后 3 s）',
      f: (P, v) => {
        const k = q(P, v, 'K', 'peakV', 0.1);
        const xs = ['S1n', 'S2', 'S4'].map((sc) => q(P, v, sc, 'worldPeak', 0.9) / k);
        const mx = fin(xs).length ? Math.max(...fin(xs)) : NaN;
        return { val: xs.map((x) => fmt(x, 2)).join(' / '), ok: okNum(mx, (x) => x <= 0.6) };
      },
    },
    {
      no: 3,
      name: '惊跳不动；迎手链触发 → 梢端动 5 mm',
      th: '惊跳起动（偏 5 mm，相减）0.22–0.27 s；迎手链各阶段触发 → 梢端偏离外推 5 mm 的最小值，p10 ≥ 0.30 s',
      f: (P, v) => {
        const k = med(P, v, 'K', 'onset5');
        const c = quant(['S1n', 'S2', 'S3', 'S4'].flatMap((sc) => vals(P, v, sc, 'trigOnsetMin')), 0.1);
        return { val: `${fmt(k, 2)} / ${fmt(c, 2)}`, ok: Number.isFinite(c) ? c >= 0.3 : null };
      },
    },
    {
      no: 4,
      name: '扑像一下',
      th: 'p50(扑峰加速) ≥ 1.8·p50(回应峰加速)；扑前 0.3 s 梢端速度 ≤ 0.35·扑峰速（A、快 D）',
      who: ['A', 'D'],
      f: (P, v) => {
        const a = med(P, v, 'S1n', 'pounceA') / med(P, v, 'R', 'peakA');
        const R = runsOf(P, v, 'S1n').map((r) => r.metrics.prePounceV / r.metrics.pounceV);
        const b = median(R);
        return { val: `${fmt(a, 2)} / ${fmt(b, 2)}`, ok: allOk(okNum(a, (x) => x >= 1.8), okNum(b, (x) => x <= 0.35)) };
      },
    },
    {
      no: 5,
      name: '凑比回应主动',
      th: '转运（路程 ≥ 0.15 D）峰速 ≥ 1.2·同人格回应峰速',
      f: (P, v) => {
        const a = med(P, v, 'S1n', 'transportV') / med(P, v, 'R', 'peakV');
        return {
          val: `${fmt(med(P, v, 'S1n', 'transportV'), 0)} ÷ ${fmt(med(P, v, 'R', 'peakV'), 0)} = ${fmt(a, 2)}（不论路程的转运 ${fmt(med(P, v, 'S1n', 'transportVall'), 0)}）`,
          ok: okNum(a, (x) => x >= 1.2),
        };
      },
    },
    {
      no: 6,
      name: '最后一段放慢',
      th: '最后一拍峰速 ≤ 0.4·转运峰速；停半拍期间梢端 ≤ 15 mm/s 的时间 ≥ 0.25 s（C、B、慢 D）',
      who: ['B', 'C', 'D'],
      f: (P, v) => {
        const R = runsOf(P, v, 'S1n').filter((r) => !r.metrics.pounces);
        const a = median(R.map((r) => r.metrics.lastBeatV / r.metrics.transportVall));
        const b = median(R.map((r) => r.metrics.hoverStill));
        return { val: `${fmt(a, 2)} / ${fmt(b, 2)} s`, ok: allOk(okNum(a, (x) => x <= 0.4), okNum(b, (x) => x >= 0.25)) };
      },
    },
    {
      no: 7,
      name: '看见 → 梢端朝手动 5 mm（S1n）',
      th: 'p50 / p90 ≤ A、C 0.7 / 1.0 · D 0.9 / 1.0 · B 1.3 / 1.5 s',
      f: (P, v) => {
        const a = med(P, v, 'S1n', 'onset');
        const b = q(P, v, 'S1n', 'onset', 0.9);
        const [ta, tb] = TH[7][P];
        return { val: `${fmt(a, 2)} / ${fmt(b, 2)}`, ok: allOk(okNum(a, (x) => x <= ta), okNum(b, (x) => x <= tb)) };
      },
    },
    {
      no: 8,
      name: '看见 → 碰到（S1n）',
      th: 'p50 ≤ A 2.0 · C 2.6 · D 3.5 · B 8.5 s',
      f: (P, v) => {
        const a = medA(P, v, 'S1n', 'tTouch');
        return {
          val: `${fmt(a, 2)}（碰到 ${runsOf(P, v, 'S1n').filter((r) => Number.isFinite(r.metrics.tTouch)).length}/${runsOf(P, v, 'S1n').length}${preSeen(P, v, 'S1n')}）`,
          ok: okNum(a, (x) => x <= TH[8][P]),
        };
      },
    },
    {
      no: 9,
      name: '碰到 → 缠程序起；S1p 正忙碰臂；看见后 approach 程序',
      th: 'p50 = 0 s（同一步，只计看见以后才碰到的场）；S1p busy 碰臂 = 0；看见手以后 0 个 respond.approach.*',
      f: (P, v) => {
        const a = medA(P, v, 'S1n', 'tGS');
        const b = sum(P, v, 'S1p', 'busyTouch');
        const c = sum(P, v, 'S1n', 'approachResp') + (sum(P, v, 'S1p', 'approachResp') || 0);
        return { val: `${fmt(a, 2)} / ${fmt(b, 0)} / ${fmt(c, 0)}`, ok: allOk(okNum(a, (x) => x <= 1 / HZ + 1e-9), okNum(b, (x) => x === 0), okNum(c, (x) => x === 0)) };
      },
    },
    {
      no: 10,
      name: '碰到 → 卡住（张力）',
      th: 'p50 ≤ A 1.8 · C 2.2 · D 2.6 · B 3.2 s',
      f: (P, v) => {
        const a = medA(P, v, 'S1n', 'tTen');
        return { val: `${fmt(a, 2)}${preSeen(P, v, 'S1n')}`, ok: okNum(a, (x) => x <= TH[10][P]) };
      },
    },
    {
      no: 11,
      name: '缠的过冲（脊线越过指针）',
      th: 'p90 ≤ B、C 15 · D 25 · A 35 mm（括号 = 碰到后脊线↔指针最大画面距离 p90）',
      f: (P, v) => {
        const a = qA(P, v, 'S1n', 'overshoot', 0.9);
        return { val: `${fmt(a, 0)}（${fmt(qA(P, v, 'S1n', 'overAbs', 0.9), 0)}）${preSeen(P, v, 'S1n')}`, ok: okNum(a, (x) => x <= TH[11][P]) };
      },
    },
    {
      no: 12,
      name: '握着时脊线↔指针（前 4 口气）',
      th: '中位 ≤ 15 mm，p95 ≤ 28 mm（逐场的中位 / p95 再取中位）',
      f: (P, v) => {
        const a = med(P, v, 'S1n', 'holdDmed');
        const b = med(P, v, 'S1n', 'holdDp95');
        return { val: `${fmt(a, 0)} / ${fmt(b, 0)}`, ok: allOk(okNum(a, (x) => x <= 15), okNum(b, (x) => x <= 28)) };
      },
    },
    {
      no: 13,
      name: '握着在动（前 3 口气）',
      th: '梢端峰峰（握持控制器接手后前 3 口气）≥ 1.3·静息起伏且 ≥ 12 mm（B 8）；与呼吸 s（滞后 0.45 s）相关 ≥ 0.6',
      f: (P, v) => {
        const R = runsOf(P, v, 'S1n');
        const ratio = median(R.map((r) => r.metrics.holdP2P / r.metrics.restP2P));
        const p2p = med(P, v, 'S1n', 'holdP2P');
        const rr = med(P, v, 'S1n', 'holdR');
        const mn = P === 'B' ? 8 : 12;
        return { val: `${fmt(p2p, 1)} mm · ×${fmt(ratio, 2)} · r ${fmt(rr, 2)}`, ok: allOk(okNum(ratio, (x) => x >= 1.3), okNum(p2p, (x) => x >= mn), okNum(rr, (x) => x >= 0.6)) };
      },
    },
    {
      no: 14,
      name: '被牵着走（S5）',
      th: '牵 3 s 内不脱手；脊线↔指针中位 ≤ 30 mm',
      f: (P, v) => {
        if (!has(P, v, 'S5')) return { val: '—', ok: null };
        const lost = sum(P, v, 'S5', 'lostInPull');
        const d = med(P, v, 'S5', 'dPull');
        return { val: `脱手 ${rate(P, v, 'S5', 'lostInPull')} · ${fmt(d, 0)} mm`, ok: allOk(okNum(lost, (x) => x === 0), okNum(d, (x) => x <= 30)) };
      },
    },
    {
      no: 15,
      name: '慢抽 / 快抽（S4s / S4）',
      th: 'S4s：送一下（reachAfter）、不扑（lunge）；S4：扑，12.5 s 内必有收尾',
      f: (P, v) => {
        if (!has(P, v, 'S4') && !has(P, v, 'S4s')) return { val: '—', ok: null };
        const anyStage = runsOf(P, v, 'S4').concat(runsOf(P, v, 'S4s')).some((r) => r.metrics.hasStage);
        const sA = rateNum(P, v, 'S4s', 'reachAfter');
        const sL = rateNum(P, v, 'S4s', 'lunge');
        const fL = rateNum(P, v, 'S4', 'lunge');
        const cl = rateNum(P, v, 'S4', 'closed');
        const val = `S4s 送 ${rate(P, v, 'S4s', 'reachAfter')} 扑 ${rate(P, v, 'S4s', 'lunge')} · S4 扑 ${rate(P, v, 'S4', 'lunge')} 收尾 ${rate(P, v, 'S4', 'closed')} · 结局 ${countBy(P, v, 'S4', 'outcome')}`;
        if (P === 'B') return { val, ok: null };
        return { val, ok: anyStage ? allOk(okNum(sA, (x) => x === 1), okNum(sL, (x) => x === 0), okNum(fL, (x) => x === 1), okNum(cl, (x) => x === 1)) : null };
      },
    },
    {
      no: 16,
      name: '追能真的再碰到（S4b）',
      th: '再碰到率 ≥ 2/3（A、D）且 ≤ 3 s；C ≤ 6 s',
      who: ['A', 'C', 'D'],
      f: (P, v) => {
        if (!has(P, v, 'S4b')) return { val: '—', ok: null };
        const rt = rateNum(P, v, 'S4b', 'retouch');
        const t = med(P, v, 'S4b', 'tRetouch');
        const val = `${rate(P, v, 'S4b', 'retouch')} · ${fmt(t, 1)} s`;
        if (P === 'C') return { val, ok: okNum(t, (x) => x <= 6) };
        return { val, ok: allOk(okNum(rt, (x) => x >= 2 / 3), okNum(t, (x) => x <= 3)) };
      },
    },
    {
      no: 17,
      name: '够不着有收尾（S1、S2）',
      th: '看见后 ≤ 8 s 内走完 strain → deflate（B 进 watch）；泄气后弯曲 ≤ 0.6·撑时',
      f: (P, v) => {
        const anyStage = runsOf(P, v, 'S1').concat(runsOf(P, v, 'S2')).some((r) => r.metrics.hasStage);
        if (!anyStage) return { val: '—（没有拍）', ok: null };
        const a = rateNum(P, v, 'S1', 'strainDone');
        const b = rateNum(P, v, 'S2', 'strainDone');
        const c = median([...vals(P, v, 'S1', 'deflateRatio'), ...vals(P, v, 'S2', 'deflateRatio')]);
        return { val: `S1 ${rate(P, v, 'S1', 'strainDone')} · S2 ${rate(P, v, 'S2', 'strainDone')} · ×${fmt(c, 2)}`, ok: allOk(okNum(a, (x) => x === 1), okNum(b, (x) => x === 1), P === 'B' ? true : okNum(c, (x) => x <= 0.6)) };
      },
    },
    {
      no: 18,
      name: '跟（S3、S3s）',
      th: 'S3 滞后中位 ≤ A、C 10° · D 15° · B 20°；梢端↔指针 ≥ 碰到圈 + 10 mm 的占时 ≥ 90%；S3s 臂在动（> 15 mm/s）占时 ≤ A 75% · C、D 60% · B 35%（触须指向误差：—，见注）',
      f: (P, v) => {
        const lag = med(P, v, 'S3', 'lagMed');
        const far = med(P, v, 'S3', 'farFrac');
        const mv = med(P, v, 'S3s', 'movingFrac');
        return {
          val: `${fmt(lag, 1)}° · ${fmt(far, 2)} · ${fmt(mv, 2)}`,
          ok: allOk(okNum(Math.abs(lag), (x) => x <= TH[18][P]), okNum(far, (x) => x >= 0.9), has(P, v, 'S3s') ? okNum(mv, (x) => x <= TH['18s'][P]) : null),
        };
      },
    },
    {
      no: 19,
      name: '意外碰到（S3）',
      th: '迎着时惊跳 = 0；意外碰到（没在凑 / 撑 / 追 / 缠时碰到）≤ 1/8 场',
      f: (P, v) => {
        if (!has(P, v, 'S3')) return { val: '—', ok: null };
        const st = sum(P, v, 'S3', 'startles');
        const R = runsOf(P, v, 'S3');
        const accRuns = R.filter((r) => r.metrics.accidental > 0).length;
        const anyStage = R.some((r) => r.metrics.hasStage);
        return { val: `惊跳 ${fmt(st, 0)} · 意外 ${anyStage ? `${accRuns}/${R.length}` : '—'}`, ok: anyStage ? allOk(st === 0, accRuns / R.length <= 1 / 8 + 1e-9) : st === 0 ? null : false };
      },
    },
    {
      no: 20,
      name: '⑨ 不打断投入',
      th: '凑 / 缠 / 握 / 追期间 HAND_SEEN again = 0（没有拍时按抓握 WRAP / HOLD 算）',
      f: (P, v) => {
        const s = ['S1n', 'S4', 'S4b', 'S4s', 'S5'].reduce((a, sc) => a + (sum(P, v, sc, 'againEngaged') || 0), 0);
        const n = ['S1n', 'S4', 'S4b', 'S4s', 'S5'].reduce((a, sc) => a + runsOf(P, v, sc).length, 0);
        return { val: `${s}（${n} 场）`, ok: n ? s === 0 : null };
      },
    },
    {
      no: 21,
      name: '躲的那一路（S7）',
      th: '60 s 内 HAND_LOST unseen = 0；转完后（看见 3 s 起、仍在躲的帧）手的相对方位 95°–115°；B 偷看 ≥ 2 次',
      who: ['B', 'D'],
      f: (P, v) => {
        if (!has(P, v, 'S7')) return { val: '—', ok: null };
        const lost = sum(P, v, 'S7', 'lostUnseen');
        const rel = med(P, v, 'S7', 'relBearing');
        const pk = med(P, v, 'S7', 'peeks');
        const anyStage = runsOf(P, v, 'S7').some((r) => r.metrics.hasStage);
        return {
          val: `丢手 ${fmt(lost, 0)} · ${fmt(rel, 0)}° · 偷看 ${anyStage ? fmt(pk, 0) : '—'}`,
          ok: allOk(okNum(lost, (x) => x === 0), okNum(rel, (x) => x >= 95 && x <= 115), P === 'B' ? (anyStage ? okNum(pk, (x) => x >= 2) : null) : true),
        };
      },
    },
    {
      no: 22,
      name: '重新武装（S8）',
      th: '松手后手不动 10 s 内至多 1 次重新缠；不出现「缠 → 抓空 → 缠」',
      f: (P, v) => {
        if (!has(P, v, 'S8')) return { val: '—', ok: null };
        const mx = Math.max(...fin(vals(P, v, 'S8', 'reWraps')));
        const lp = sum(P, v, 'S8', 'loop');
        return { val: `重缠 ${countBy(P, v, 'S8', 'reWraps')} · 循环 ${fmt(lp, 0)} · 首次 ${fmt(med(P, v, 'S8', 'tReWrap'), 1)} s`, ok: allOk(okNum(mx, (x) => x <= 1), okNum(lp, (x) => x === 0)) };
      },
    },
    {
      no: 23,
      name: '深卷',
      th: '轴测全部场景 deep > 0 占时 = 0；S6 任意 49 s ≤ 8.2%、D ≤ 0.62、弯向离腱轴 0 ≤ 8°；扑 / 追 / 跟 / 撑 / 躲期间 deep 恒 0',
      f: (P, v) => {
        const axon = ['S1', 'S1n', 'S1p', 'S2', 'S3', 'S3s', 'S4', 'S4b', 'S4s', 'S5', 'S7', 'S8', 'S9'];
        const axVals = axon.flatMap((sc) => fin(vals(P, v, sc, 'deepFrac')));
        const ax = axVals.length ? Math.max(...axVals) : NaN;
        const w = Math.max(...fin(vals(P, v, 'S6', 'deepWin49')), -Infinity);
        const de = Math.max(...fin(vals(P, v, 'S6', 'deepMaxDe')), -Infinity);
        const off = Math.max(...fin(vals(P, v, 'S6', 'deepAxisOff')), -Infinity);
        const nd = [...axon, 'S6'].reduce((a, sc) => a + (sum(P, v, sc, 'noDeepFrames') || 0), 0);
        const ok6 = has(P, v, 'S6') ? allOk(Number.isFinite(w) ? w <= 0.082 : true, Number.isFinite(de) ? de <= 0.62 + 1e-9 : true, Number.isFinite(off) ? off <= 8 : true) : null;
        return {
          val: `轴测 ${fmt(ax * 100, 1)}% · S6 ${fmt(w * 100, 1)}% D ${fmt(de, 3)} ${fmt(off, 1)}° · 禁区 ${nd}`,
          ok: allOk(Number.isFinite(ax) ? ax === 0 : null, ok6, nd === 0),
        };
      },
    },
    {
      no: 24,
      name: '人格结构看得见',
      th: 'A 扑后越过指针 ≥ 10 mm；B 凑里背离手 ≥ 10 mm（retreat）；C 精确伸过冲 ≤ 8 mm；D 握住率 ≈ 0.5（⑤ 为正，± 2/8）',
      f: (P, v) => {
        if (P === 'A') {
          const a = med(P, v, 'S1n', 'pounceOver');
          return { val: `${fmt(a, 0)} mm`, ok: okNum(a, (x) => x >= 10) };
        }
        if (P === 'B') {
          const a = med(P, v, 'S1n', 'retreatAway');
          return { val: `${fmt(a, 0)} mm`, ok: okNum(a, (x) => x >= 10) };
        }
        if (P === 'C') {
          const a = med(P, v, 'S1n', 'reachOver');
          return { val: `${fmt(a, 0)} mm`, ok: okNum(a, (x) => x <= 8) };
        }
        const h = rateNum(P, v, 'S1n', 'held');
        return { val: `握住 ${rate(P, v, 'S1n', 'held')}`, ok: okNum(h, (x) => Math.abs(x - 0.5) <= 0.25 + 1e-9) };
      },
    },
    {
      no: 25,
      name: '视角（S10：正 / 左 / 顶）',
      th: '#7 #9 #12 照样成立（值 = 起动 p50 · 碰到→缠 p50 · 握时脊线↔指针中位）',
      f: (P, v) => {
        const parts = [];
        const oks = [];
        for (const vk of ['front', 'left', 'top']) {
          const sc = `S10${vk}`;
          if (!has(P, v, sc)) continue;
          const a = med(P, v, sc, 'onset');
          const b = med(P, v, sc, 'tGS');
          const c = med(P, v, sc, 'holdDmed');
          parts.push(`${vk} ${fmt(a, 2)}·${fmt(b, 2)}·${fmt(c, 0)}`);
          oks.push(okNum(a, (x) => x <= TH[7][P][0]), okNum(b, (x) => x <= 1 / HZ + 1e-9), okNum(c, (x) => x <= 15));
        }
        return { val: parts.join(' / ') || '—', ok: oks.length ? allOk(...oks) : null };
      },
    },
    {
      no: 26,
      name: '衰老（S9：衰老进度 0.8 跑 S1n）',
      th: '没有扑与蹲；握的挤压按握力缩小（值 = 扑 / 蹲次数 · 握着峰峰 S9 ÷ S1n）；追是 reachAfter（S9 不拉开，量不到）',
      f: (P, v) => {
        if (!has(P, v, 'S9')) return { val: '—', ok: null };
        const anyStage = runsOf(P, v, 'S9').some((r) => r.metrics.hasStage);
        const pc = sum(P, v, 'S9', 'pounces') + sum(P, v, 'S9', 'crouches');
        const ratio = med(P, v, 'S9', 'holdP2P') / med(P, v, 'S1n', 'holdP2P');
        return { val: `${anyStage ? fmt(pc, 0) : '—'} · ×${fmt(ratio, 2)}`, ok: anyStage ? okNum(pc, (x) => x === 0) : null };
      },
    },
  ];
  lines.push('');
  lines.push('## §9.2 验收总表（阈值是给 v2 的；v1 列是现行的对照）');
  lines.push('');
  lines.push('| # | 指标 | 阈值 | 人格 | v1 | v2 | v2 判定 |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const it of ITEMS) {
    for (const P of PERSONAS) {
      if (!res[P]) continue;
      if (it.who && !it.who.includes(P)) continue;
      const cell = (v) => {
        try {
          return it.f(P, v);
        } catch {
          return { val: '—', ok: null };
        }
      };
      const a = cell(1);
      const b = cell(2);
      lines.push(`| ${it.no} | ${it.name} | ${it.th} | ${P} | ${a.val} | ${b.val} | ${verdict(b.ok)} |`);
    }
  }
  lines.push('');
  lines.push('注：#18 的触须指向误差没算——触须舵机角到「指向手」的换算没有定义（引擎只给侧别 / 基角），量不出来。#26 的「追是 reachAfter」要拉开，S9 只跑 S1n。');

  // —— 逐场景明细
  const SC_TITLE = {
    K: 'K：惊跳参照（敲 0.95，有刺激 − 同种子没刺激）',
    R: 'R：回应参照（抚摸壳 0.1，相减）',
    S1: 'S1：手停在笔直臂梢左 120 mm（够不着）',
    S1n: 'S1n：左 120 mm、往基座退 100 mm（够得着）',
    S1p: 'S1p：S1n + 台架同式的在场档',
    S2: 'S2：离臂基座 1.6 倍臂长、偏左 40°（够不着，要转身）',
    S3: 'S3：沿弧（半径 1 倍臂长）从左 60° 匀速 100 mm/s 划到右 60°',
    S3s: 'S3s：同 S3，35 mm/s',
    S4: 'S4：握住 3 s 后 0.5 s 内往左拉开 400 mm',
    S4b: 'S4b：握住 3 s 后 0.5 s 内挪到镜像那一侧停住（够得着）',
    S4s: 'S4s：握住 3 s 后以 80 mm/s 往左慢慢抽走 400 mm',
    S5: 'S5：握住 3 s 后以 40 mm/s 沿臂往基座牵 3 s（v2 开牵引锚点）',
    S6: 'S6：正视，手在臂中段正上方 80 mm（深卷几何）',
    S7: 'S7：手在正前方 0.9 m 不动 60 s（B、D，第一次看见是躲）',
    S8: 'S8：握住 3 s 后敲一下（惊跳松手），手不动仍搭在臂上',
    S9: 'S9：衰老进度 0.8 跑 S1n',
    S10front: 'S10：正视跑 S1n（指针在臂上方 120 mm）',
    S10left: 'S10：左视跑 S1n（臂正对相机，指针在臂梢上方 120 mm）',
    S10top: 'S10：顶视跑 S1n（= S1n 那一点）',
  };
  const COLS = {
    ref: [
      ['峰值 mm', 'peakD', 0],
      ['峰速（相减）', 'peakV', 0],
      ['峰加速', 'peakA', 2],
      ['起动（偏 5 mm）s', 'onset5', 2],
      ['起动（偏两成峰值）s', 'onset', 2],
      ['原始峰速', 'rawV', 0],
      ['惊跳', 'startles', 0, 'sum'],
      ['回应', 'responses', 0, 'sum'],
    ],
    S1: [
      ['看见 s', 'tSeen', 2],
      ['朝手动 5 mm s', 'onset', 2, 'iqr'],
      ['够手峰速', 'reachV', 0],
      ['碰到', 'tTouch', 0, 'count'],
      ['看见→碰到 s', 'tTouch', 2, 'iqr'],
      ['by', 'touchBy', 0, 'by'],
      ['碰到→缠 s', 'tGS', 2],
      ['碰到→卡住 s', 'tTen', 2],
      ['握住', 'held', 0, 'rate'],
      ['抓空', 'empty', 0, 'rate'],
      ['过冲 p90', 'overshoot', 0, 'p90'],
      ['握时↔指针 中位', 'holdDmed', 0],
      ['握时 p95', 'holdDp95', 0],
      ['握着峰峰（前 3 口）', 'holdP2P', 1],
      ['稳态峰峰', 'holdP2Pss', 1],
      ['静息峰峰', 'restP2P', 1],
      ['与呼吸 |r|', 'holdR', 2],
      ['扑峰速', 'pounceV', 0],
      ['转运峰速', 'transportV', 0],
      ['转运峰速（不论路程）', 'transportVall', 0],
      ['最后一拍峰速', 'lastBeatV', 0],
      ['停半拍静止 s', 'hoverStill', 2],
      ['触发起动最小 s', 'trigOnsetMin', 2],
      ['世界峰速', 'worldPeak', 0],
      ['惊跳', 'startles', 0, 'sum'],
      ['补认', 'contacts', 0, 'sum'],
      ['busy 碰臂', 'busyTouch', 0, 'sum'],
      ['again（投入中）', 'againEngaged', 0, 'sum'],
      ['deep 占时', 'deepFrac', 3],
      ['拍', 'beats', 0, 'first'],
    ],
    S2: [
      ['看见 s', 'tSeen', 2],
      ['开始转 s', 'tTurn0', 2],
      ['转到位 s', 'tTurn1', 2],
      ['转了 °', 'turnDeg', 1],
      ['偏航峰速 °/s', 'yawVmax', 1],
      ['转完臂弯曲', 'bendEnd', 2],
      ['转完梢端↔手 3D', 'dEndW', 0],
      ['转完梢端↔指针', 'dEndScr', 0],
      ['碰到', 'touched', 0, 'rate'],
      ['撑→泄气', 'strainDone', 0, 'rate'],
      ['泄气 ÷ 撑', 'deflateRatio', 2],
      ['世界峰速', 'worldPeak', 0],
      ['惊跳', 'startles', 0, 'sum'],
      ['deep 占时', 'deepFrac', 3],
      ['拍', 'beats', 0, 'first'],
    ],
    S3: [
      ['看见 s', 'tSeen', 2],
      ['滞后中位 °', 'lagMed', 1],
      ['|滞后| p90 °', 'lagP90', 1],
      ['梢端离指针够远占时', 'farFrac', 2],
      ['臂在动占时', 'movingFrac', 2],
      ['脊线↔指针中位', 'dScrMed', 0],
      ['碰到次数', 'touches', 0, 'sum'],
      ['意外碰到', 'accidental', 0, 'sum'],
      ['缠', 'grasps', 0, 'sum'],
      ['惊跳', 'startles', 0, 'sum'],
      ['迎被改掉占时', 'modeSwitch', 2],
      ['触发起动最小 s', 'trigOnsetMin', 2],
      ['deep 占时', 'deepFrac', 3],
      ['禁区 deep 帧', 'noDeepFrames', 0, 'sum'],
      ['拍', 'beats', 0, 'first'],
    ],
    S4: [
      ['握住 s', 'tHold', 1],
      ['松电极 s', 'tOff', 2],
      ['脱手 s', 'tLost', 2],
      ['反应', 'reaction', 0, 'by'],
      ['脱手→追 s', 'tChase', 2],
      ['追的结果', 'chaseResult', 0, 'by'],
      ['结局', 'outcome', 0, 'by'],
      ['再碰到', 'retouch', 0, 'rate'],
      ['脱手→再碰到 s', 'tRetouch', 1],
      ['扑（lunge）', 'lunge', 0, 'rate'],
      ['送（reachAfter）', 'reachAfter', 0, 'rate'],
      ['收尾', 'closed', 0, 'rate'],
      ['松开完 s', 'tRelease', 1],
      ['惊跳', 'startleAfter', 0, 'rate'],
      ['搜寻', 'searches', 0, 'sum'],
      ['拉开后峰速', 'tipVmaxAfter', 0],
      ['世界峰速', 'worldPeak', 0],
      ['again（投入中）', 'againEngaged', 0, 'sum'],
      ['deep 占时', 'deepFrac', 3],
      ['禁区 deep 帧', 'noDeepFrames', 0, 'sum'],
      ['末了态度', 'modeEnd', 0, 'by'],
      ['拍', 'beats', 0, 'first'],
    ],
    S5: [
      ['握住 s', 'tHold', 1],
      ['牵时脱手', 'lostInPull', 0, 'rate'],
      ['牵时松电极', 'offInPull', 0, 'rate'],
      ['牵时脊线↔指针', 'dPull', 0],
      ['脱手 s', 'tLost', 2],
      ['again（投入中）', 'againEngaged', 0, 'sum'],
      ['deep 占时', 'deepFrac', 3],
      ['拍', 'beats', 0, 'first'],
    ],
    S6: [
      ['看见 s', 'tSeen', 2],
      ['aimBend', 'aimBendSeen', 3],
      ['弯向 °', 'aimDirSeen', 1],
      ['碰到', 'touched', 0, 'rate'],
      ['握住', 'held', 0, 'rate'],
      ['握时↔指针', 'holdDmed', 0],
      ['deep 总 s', 'deepS', 1],
      ['任意 49 s 占比', 'deepWin49', 3],
      ['最长一段 s', 'deepLongest', 1],
      ['deep 时最大 D', 'deepMaxDe', 3],
      ['deep 时离腱轴 0 °', 'deepAxisOff', 1],
      ['最大 deep', 'maxDeep', 2],
      ['禁区 deep 帧', 'noDeepFrames', 0, 'sum'],
      ['拍', 'beats', 0, 'first'],
    ],
    S7: [
      ['看见 s', 'tSeen', 2],
      ['丢手（unseen）', 'lostUnseen', 0, 'sum'],
      ['丢手 s', 'tLost', 1],
      ['躲着时手的相对方位 °', 'relBearing', 0],
      ['躲着的占时', 'awayFrac', 2],
      ['偷看', 'peeks', 0],
      ['末了态度', 'modeEnd', 0, 'by'],
      ['末了还看见', 'seenEnd', 0, 'rate'],
      ['deep 占时', 'deepFrac', 3],
      ['拍', 'beats', 0, 'first'],
    ],
    S8: [
      ['握住 s', 'tHold', 1],
      ['松开完 s（敲起）', 'tRelease', 1],
      ['松手时电极还在', 'touchOnAtRel', 0, 'rate'],
      ['10 s 内重缠', 'reWraps', 0, 'by'],
      ['首次重缠 s', 'tReWrap', 1],
      ['抓空', 'empties', 0, 'sum'],
      ['循环', 'loop', 0, 'sum'],
      ['deep 占时', 'deepFrac', 3],
      ['拍', 'beats', 0, 'first'],
    ],
  };
  const colsOf = (sc) => {
    if (sc === 'K' || sc === 'R') return COLS.ref;
    if (sc.startsWith('S10') || sc === 'S1' || sc === 'S1n' || sc === 'S1p' || sc === 'S9') return COLS.S1;
    if (sc === 'S3' || sc === 'S3s') return COLS.S3;
    if (sc === 'S4' || sc === 'S4b' || sc === 'S4s') return COLS.S4;
    return COLS[sc];
  };
  const cellOf = (P, v, sc, [, k, d, kind]) => {
    const R = runsOf(P, v, sc);
    if (!R.length) return '—';
    if (kind === 'sum') return fmt(sum(P, v, sc, k), d);
    if (kind === 'rate') return rate(P, v, sc, k);
    if (kind === 'by') return countBy(P, v, sc, k);
    if (kind === 'count') return `${R.filter((r) => Number.isFinite(r.metrics[k])).length}/${R.length}`;
    if (kind === 'p90') return fmt(q(P, v, sc, k, 0.9), d);
    if (kind === 'first') return R[0].metrics[k] || '—';
    if (kind === 'iqr') return `${fmt(med(P, v, sc, k), d)} [${fmt(q(P, v, sc, k, 0.25), d)}–${fmt(q(P, v, sc, k, 0.75), d)}]`;
    return fmt(med(P, v, sc, k), d);
  };
  const scSeen = new Set();
  for (const P of Object.keys(res)) for (const byS of Object.values(res[P].data)) for (const sc of Object.keys(byS)) scSeen.add(sc);
  const ORDER = ['K', 'R', 'S1', 'S1n', 'S1p', 'S2', 'S3', 'S3s', 'S4', 'S4b', 'S4s', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10front', 'S10left', 'S10top'];
  for (const sc of ORDER.filter((s) => scSeen.has(s))) {
    const cols = colsOf(sc);
    if (!cols) continue;
    lines.push('');
    lines.push(`## ${SC_TITLE[sc] ?? sc}`);
    lines.push('');
    lines.push(`| 人格 | 版本 | 种子 | ${cols.map((c) => c[0]).join(' | ')} |`);
    lines.push(`|${'---|'.repeat(cols.length + 3)}`);
    const notes = [];
    for (const P of PERSONAS) {
      for (const v of VOCABS) {
        const d = res[P]?.data?.[`v${v}`]?.[sc];
        if (!d) continue;
        if (d.skipped) {
          notes.push(`- ${P} v${v}：不跑这个场景`);
          continue;
        }
        lines.push(`| ${P} | v${v} | ${d.runs.length} | ${cols.map((c) => cellOf(P, v, sc, c)).join(' | ')} |`);
        const m = Object.entries(d.rejected?.mode ?? {})
          .map(([a, b]) => `${a}×${b}`)
          .join(' ');
        const rj = [m && `第一次看见是 ${m}`, d.rejected?.unseen && `没看见 ×${d.rejected.unseen}`, d.rejected?.nohold && `没握住 ×${d.rejected.nohold}`].filter(Boolean).join('、');
        notes.push(`- ${P} v${v}：保留 ${d.runs.length}${rj ? `；剔除：${rj}` : ''}（${d.ranAt ?? ''}）`);
      }
    }
    lines.push('');
    lines.push(...notes);
  }
  // 逐场拆开（runs/{场景}-{人格}-v{版本}.json：每个种子的指标、引擎事件、拍与 10 Hz 序列）
  mkdirSync(join(OUT, 'runs'), { recursive: true });
  for (const [P, r] of Object.entries(res)) {
    for (const [v, byS] of Object.entries(r.data)) {
      for (const [sc, d] of Object.entries(byS)) {
        writeFileSync(join(OUT, 'runs', `${sc}-${P}-${v}.json`), JSON.stringify({ P, v, sc, v2Fields: r.v2Fields, rejected: d.rejected, ranAt: d.ranAt, runs: d.runs }));
      }
    }
  }
  writeFileSync(join(OUT, 'tables.md'), lines.join('\n') + '\n');
  console.log(`写出 ${join(OUT, 'tables.md')}`);
}

// ================================================================ 入口
const args = process.argv.slice(2);
if (args[0] === '--job') {
  const OUT = resolve(args[2] ?? 'hand-probe-out');
  mkdirSync(OUT, { recursive: true });
  await job(args[1], OUT);
} else if (args[0] === '--aggregate') {
  const OUT = resolve(args[1] ?? 'hand-probe-out');
  aggregate(OUT);
} else {
  const OUT = resolve(args[0] ?? 'hand-probe-out');
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const only = process.env.PERSONA ? process.env.PERSONA.split(',') : PERSONAS;
  await Promise.all(
    only.map(
      (P) =>
        new Promise((ok, fail) => {
          const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--job', P, OUT], { stdio: 'inherit', env: process.env });
          ch.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`job ${P} exit ${code}`))));
        }),
    ),
  );
  aggregate(OUT);
  console.log(`总用时 ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
