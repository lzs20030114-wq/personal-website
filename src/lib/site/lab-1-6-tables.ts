// Lab 1-6 的附件：交互机制表（2026-10-18 用户「把这些表格整理成表格成果推上去 附在 lab6 里面作为附件」）。
//
// 内容 = 轮回机器_交互机制参数表.md 的整理版，按「人做了什么 → 机器怎么判 → 会怎样」重排；
// **数一律从引擎模块现算**（人格表、常量块、限速与等待的函数都是 import 进来的那一份），
// 文字中英两份手写。改了代码，这里跟着变，不会像手抄的表那样漂。
// 结构 = 日志条目的表格块（LogTableBlock：表头 + 行 + 说明，单元格可中英双语），
// 卡片与展开视图复用 components/site/LogBody 导出的 BlockRail / BlockView。
//
// 纯数据、零 DOM；守门 = lab-1-6-tables.test.ts（形状按日志的 schema 校、与引擎的判定一致）。
import type { Bilingual, LogCell, LogTableBlock } from './log-schema';
import { PERSONAS, PERSONA_KEYS, type PersonaKey, type PersonaSpec, type Range, isRandom } from '../linkage/behavior/persona';
import { ENGINE, HAND, MOTION, SOCIAL, WINCE_KINDS } from '../linkage/behavior/engine';
import { TAU_FAST, TAU_SLOW, V2, byTau, respD, slowness, spontE, tierSpeed, type BuildCtx, type Tier } from '../linkage/behavior/vocab2';
import { DIST, HC, strainTries } from '../linkage/behavior/vocab2-hand';
import { INTENSITY, type SensorKind } from '../linkage/behavior/events';
import { AGEING_PLACEHOLDER, LIFE } from '../linkage/behavior/life';
import { GRASP } from '../linkage/behavior/grasp';
import { D_DEEP_SPAN, D_FLAT_MAX, D_MAX, D_SPAN } from '../linkage/behavior/programs';
import { BENCH_INPUT, CATCH_AT, CRANK, HAND_FAR, HAND_MM, HAND_PX, HAND_UI, HULL_Z, R_HULL, TRACK } from '../linkage/machine-behavior';

// ------------------------------------------------------------------ 小工具

const t = (en: string, zh: string): Bilingual => ({ en, zh });
/** 数字：最多 d 位小数、去掉尾零；负号用 U+2212 */
export const num = (x: number, d = 2): string => {
  const s = x.toFixed(d);
  const trimmed = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return trimmed.replace(/^-/, '−');
};
const range = (v: Range, d = 2): string => (v[0] === v[1] ? num(v[0], d) : `${num(v[0], d)}–${num(v[1], d)}`);
const two = (lo: number, hi: number, d = 2): string => (num(lo, d) === num(hi, d) ? num(lo, d) : `${num(lo, d)}–${num(hi, d)}`);
const DEG = 180 / Math.PI;
const deg = (rad: number, d = 0): string => `${num(rad * DEG, d)}°`;
const signed = (x: number): string => (x > 0 ? `+${num(x)}` : num(x));

const P = PERSONAS;
const NAME: Record<PersonaKey, Bilingual> = {
  A: t(`A ${P.A.en}`, `A ${P.A.zh}`),
  B: t(`B ${P.B.en}`, `B ${P.B.zh}`),
  C: t(`C ${P.C.en}`, `C ${P.C.zh}`),
  D: t(`D ${P.D.en}`, `D ${P.D.zh}`),
};
const PERSONA_HEAD = PERSONA_KEYS.map((k) => NAME[k]);
/** 一行四格：每种人格算一个值 */
const per = (f: (p: PersonaSpec) => LogCell): LogCell[] => PERSONA_KEYS.map((k) => f(P[k]));

/** k = √(速度 ③ ÷ 刻度)；乱序随机取区间两端 */
const kOf = (speed: number): number => Math.sqrt(speed / ENGINE.speedRef);
const kRange = (p: PersonaSpec): [number, number] => [kOf(p.speed[0]), kOf(p.speed[1])];
/** 只给要用的几个字段的 BuildCtx（派生量的函数只读它们） */
const ctx = (o: Partial<BuildCtx>): BuildCtx => ({ vigor: 1, gAbs: 0, breathAmp: 0.5, temper: 'warm', ...o }) as BuildCtx;

const SAME_AS = (n: string): Bilingual => t(`same as ${n}`, `同 ${n}`);
const OTHERWISE: Record<PersonaSpec['otherwise'], Bilingual> = {
  random: t('looks anywhere', '随便看'),
  away: t('turns away', '背向人'),
};
const DEATH: Record<PersonaSpec['death']['kind'], Bilingual> = {
  turn: t('energy runs out, ends facing the person', '精力渐尽，最后朝向人停下'),
  quiet: t('settles quietly', '安静慢慢停下'),
  withdraw: t('turns away and slows to a stop', '背过身慢慢停下'),
  arrhythmia: t('rhythm breaks up, then fades', '节律紊乱后渐弱'),
};

// ------------------------------------------------------------------ 表

/** 表 02 · 人格：每一世从这里抽 */
function personaTable(): LogTableBlock {
  const row = (no: string, label: Bilingual, f: (p: PersonaSpec) => LogCell): LogCell[] => [no, label, ...per(f)];
  return {
    kind: 'table',
    head: ['#', t('Parameter', '参数'), ...PERSONA_HEAD],
    rows: [
      row('1', t('Breath period (s)', '呼吸周期（s）'), (p) => range(p.breathPeriod)),
      row('2', t('Breath depth (share of the stroke)', '呼吸幅度（行程分数）'), (p) => range(p.breathAmp)),
      row('3', t('Movement speed (cm/s)', '运动速度（cm/s）'), (p) => range(p.speed)),
      row('4', t('Reaction time τ (s)', '响应延迟 τ（s）'), (p) => range(p.latency)),
      row('5', t('Response strength', '响应强度'), (p) => (isRandom(p) ? `±${range(p.gain)}` : `+${range(p.gain)}`)),
      row('6', t('Spontaneous movement every (s)', '自发动作间隔（s）'), (p) => range(p.spont)),
      row('6′', t('… while someone is present (any band)', '… 有人在时（任一档）'), (p) => (p.spontPresent ? range(p.spontPresent) : SAME_AS('6'))),
      row('7', t('Voice pitch (Hz)', '声音基频（Hz）'), (p) => range(p.voiceFreq, 0)),
      row('8', t('Voice duty (share of each breath)', '声音占空比'), (p) => range(p.voiceDuty)),
      row('9', t('Changes heading every (s)', '朝向变化间隔（s）'), (p) => range(p.orient)),
      row('9′', t('… while someone or a hand is present', '… 有人或有手时'), (p) => (p.orientPresent ? range(p.orientPresent) : SAME_AS('9'))),
      row('10', t('Chance of turning toward the person', '朝向偏向人的概率'), (p) => num(p.toward)),
      row('10′', t('Otherwise', '不朝人时'), (p) => OTHERWISE[p.otherwise]),
      row('11', t('Startle threshold θ', '惊吓阈值 θ'), (p) => range(p.startle)),
      row('12', t('How it dies (s)', '死法（s）'), (p) => t(`${DEATH[p.death.kind].en} · ${p.death.dur}`, `${DEATH[p.death.kind].zh} · ${p.death.dur}`)),
      row('13', t('Toward or away from people', '对人的趋避'), (p) => (isRandom(p) ? `±${range(p.stance)}` : signed(p.stance[0]))),
      row('14', t('Recovers after people leave (s)', '人走后多久恢复（s）'), (p) => range(p.settle)),
    ],
    caption: t(
      'Personas: the numbers each life is drawn from. One persona per life; the letters are slots (A Warm, B Calm, C Avoidant, D Random). D redraws every range each breath, movement or response, biased towards both ends, and the sign of its strength and of row 13 is drawn too. Row 13 is multiplied by how near the person is (Tab. 07).',
      '人格：每一世从这张表里抽数。一世一种人格，字母是槽位（A 热情 · B 沉静 · C 回避 · D 乱序随机）。D 每次呼吸、动作或响应都重抽区间，偏向两端；它的响应强度与第 13 行的正负也随机。第 13 行再乘「人有多近」（表 07）。',
    ),
  };
}

/** 表 03 · 按人格算出来的量：速度、反应快慢、动作有多大 */
function derivedTable(): LogTableBlock {
  const kv = (p: PersonaSpec) => two(p.speed[0] / ENGINE.speedRef, p.speed[1] / ENGINE.speedRef);
  const k = (p: PersonaSpec) => {
    const [a, b] = kRange(p);
    return two(a, b);
  };
  const tier = (tr: Tier) => (p: PersonaSpec) => {
    const [a, b] = kRange(p);
    return two(tierSpeed(tr, a), tierSpeed(tr, b));
  };
  // 档位用在哪：按程序表里实际传的档写，举主要的几处（同一种动作在不同人格、不同怕的程度下可能落在不同档）
  const TIERS: [Tier, Bilingual][] = [
    ['recover', t('recovering after a startle (× vigor, below)', '惊跳后的恢复（再乘精力，见下）')],
    ['strike', t('strike at the hand · dodge', '扑手 · 躲开')],
    ['pursue', t('fast: e.g. Warm/Random following, carrying in, chasing, withdrawing when N > 0.5, Random’s peek', '快：如热情 / 乱序随机陪着、转运、追、N > 0.5 时的收、乱序随机偷看')],
    ['deliberate', t('deliberate: e.g. responses, Calm/Avoidant following, withdrawing, letting go, searching', '刻意：如回应、沉静 / 回避陪着、收、放开、找')],
    ['spont', t('spontaneous moves, sagging, Avoidant’s peek', '自发动作、垂下、回避偷看')],
    ['creep', t('slow touch · seating · tightening · nudges', '慢碰 · 贴上 · 收紧 · 推一下')],
  ];
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('How', '式子'), ...PERSONA_HEAD],
    rows: [
      [t('Speed factor k_v', '速度系数 k_v'), t(`row 3 ÷ ${num(ENGINE.speedRef)} cm/s`, `第 3 行 ÷ ${num(ENGINE.speedRef)} cm/s`), ...per(kv)],
      [t('Tempo k', '节奏 k'), '√k_v', ...per(k)],
      [
        t('Slowness u', '迟钝度 u'),
        `clamp((τ − ${num(TAU_FAST)}) / ${num(TAU_SLOW - TAU_FAST)})`,
        ...per((p) => two(slowness(p.latency[0]), slowness(p.latency[1]))),
      ],
      [
        t('Body turn speed (rad/s)', '偏航限速（rad/s）'),
        `${num(MOTION.yawRate)}·k × (1 + ${num(SOCIAL.yawOpen)}P + ${num(SOCIAL.yawClose)}N)`,
        ...per((p) => {
          const [a, b] = kRange(p);
          return two(MOTION.yawRate * a, MOTION.yawRate * b);
        }),
      ],
      [
        t('Response size (differential)', '回应幅度（差动）'),
        `${num(V2.respD0)} + ${num(V2.respD1)}·min(1, |g| / 0.5)`,
        ...per((p) => two(respD(ctx({ gAbs: p.gain[0] })), respD(ctx({ gAbs: p.gain[1] })), 3)),
      ],
      [
        t('Spontaneous size (differential)', '自发幅度（差动）'),
        `${num(V2.spontE0)} + ${num(V2.spontE1)}·clamp((② − 0.2) / 0.7)`,
        ...per((p) =>
          two(spontE(ctx({ breathAmp: p.breathAmp[0], temper: p.temper })), spontE(ctx({ breathAmp: p.breathAmp[1], temper: p.temper })), 3),
        ),
      ],
      ...TIERS.map(([tr, label]): LogCell[] => [
        t(`Speed cap · ${label.en} (differential/s)`, `限速 · ${label.zh}（差动/秒）`),
        tr === 'strike' ? `clamp(1.2k, 0.8, 1.5)` : tr === 'recover' ? `clamp(0.9k, 0.45, 1.2) × (0.5 + 0.5·vigor)` : tr === 'pursue' ? `clamp(0.42k, 0.2, 0.5)` : tr === 'deliberate' ? `clamp(0.2k, 0.15, 0.26)` : tr === 'spont' ? `clamp(0.11k, 0.07, 0.15)` : `clamp(0.08k, 0.05, 0.1)`,
        ...per(tier(tr)),
      ]),
    ],
    caption: t(
      `Derived per persona. Deliberate movements take their time ÷ k, reflexes do not. P and N are the two halves of row 13 at this moment (P = drawn toward the person, N = afraid), each 0–1. Differential ${num(D_SPAN)} = full bend; reaching for and wrapping a hand go on to ${num(D_FLAT_MAX)} through the wrap stroke; only the startle's deep curl along a tendon axis reaches ${num(D_SPAN + D_DEEP_SPAN, 3)}. A startle's flexion is never capped; the recovery cap is also × (0.5 + 0.5·vigor), vigor falling with ageing.`,
      `按人格算出的量。刻意的动作时长 ÷ k，反射不除。P、N 是第 13 行此刻的两半（P = 迎、N = 怕），各 0–1。差动 ${num(D_SPAN)} = 满弯；迎手、缠手经深缠行程到 ${num(D_FLAT_MAX)}；只有惊跳沿腱轴的深卷到 ${num(D_SPAN + D_DEEP_SPAN, 3)}。惊跳的屈曲不限速；恢复的限速再 × (0.5 + 0.5·精力)，精力随衰老下降。`,
    ),
  };
}

/** 表 04 · 等多久：按本回合抽到的反应时间 τ，在两端之间插值 */
function waitsTable(): LogTableBlock {
  // 第三项：只有这几种人格走得到（其余填「—」）；第四项：某个人格不按 τ、用定值
  const ITEMS: [Bilingual, readonly [number, number], PersonaKey[] | null, Partial<Record<PersonaKey, LogCell>>?][] = [
    [t('Sees the hand → first hop', '看见 → 第一跳'), HC.take, null],
    [t('Pause after each hop', '跳完停多久'), HC.dwell, null],
    [t('Hand must hold still before approaching', '手停稳多久才凑'), HC.still, null],
    [t('Half-beat pause: gap beyond touch radius (mm)', '停半拍：碰到半径之外再留（mm）'), HC.hover, null],
    [t('Half-beat pause: at least', '停半拍至少'), HC.hoverMin, null],
    [t('Holds still to feel before wrapping', '缠前定住感觉'), HC.feel, null],
    // 热情、沉静从不躲（不朝人时看别处），这两行只有回避与乱序随机走得到；乱序随机的偷看是定长的一瞥
    [t('Freezes when it decides to avoid', '决定躲那一下定住'), HC.avoidFreeze, ['C', 'D']],
    // 只有回避型按这两个数走（乱序随机的偷看是定长 0.4 s 的一瞥），定值不按 τ
    [t('Peek lasts (fixed)', '偷看看多久（定值）'), [HC.peekLook, HC.peekLook], ['C', 'D'], { D: t('0.4 (fixed)', '0.4（定值）') }],
    [t('Second wait before approaching (fixed)', '凑之前第二次等（定值）'), [HC.wait2, HC.wait2], ['C']],
    [t('Balks when its strength comes out negative', '响应强度抽到负时愣住'), HC.stall, ['D']],
    [t('Startle freeze, base', '惊跳凝住的基数'), V2.freeze, null],
  ];
  return {
    kind: 'table',
    head: [t('Wait (s unless noted)', '等什么（未注明单位为 s）'), t('Fastest', '最快'), t('Slowest', '最慢'), ...PERSONA_HEAD],
    rows: ITEMS.map(([label, ends, only, fixed]): LogCell[] => [
      label,
      num(ends[0]),
      num(ends[1]),
      ...PERSONA_KEYS.map((k) => fixed?.[k] ?? (only && !only.includes(k) ? '—' : two(byTau(ends, P[k].latency[0]), byTau(ends, P[k].latency[1])))),
    ]),
    caption: t(
      `How long it waits. Waits scale with this turn's reaction time τ: each is given as a fastest and a slowest value and interpolated by slowness u (Tab. 03), so the Warm and Calm columns are the two ends. The startle freeze is then × (0.6 + 0.4·how far the stimulus exceeded θ) × (1 + 0.5·ageing), at most ${num(V2.freezeCap)} s, and halved for a repeat startle within ${V2.repeatWindow} s. “—” = that persona never gets there.`,
      `等多久。等待随本回合的反应时间 τ 变：每一项给最快、最慢两个值，按迟钝度 u（表 03）插值，所以热情、沉静两列就是两端。惊跳凝住再 × (0.6 + 0.4·超出阈值的程度) × (1 + 0.5·衰老)，封顶 ${num(V2.freezeCap)} s；${V2.repeatWindow} s 内再吓一次减半。「—」= 这种人格走不到这一步。`,
    ),
  };
}

/** 热情型衰老到多少（0–1）时 k 跌破弹回的门：k = k₀·√(1 − a·u)，a = 衰老对速度的压低（life.ts 占位斜坡） */
function warmSpringUntil(): number {
  const k0 = kOf(P.A.speed[0]);
  return Math.min(1, Math.max(0, (1 - (V2.springK / k0) ** 2) / AGEING_PLACEHOLDER.speed));
}

/** 表 05 · 结构不同的地方（不是数大小，是做法不同） */
function structureTable(): LogTableBlock {
  const r = (label: Bilingual, a: Bilingual, b: Bilingual, c: Bilingual, d: Bilingual): LogCell[] => [label, a, b, c, d];
  return {
    kind: 'table',
    head: [t('Situation', '场合'), ...PERSONA_HEAD],
    rows: [
      r(
        t(`Startle: the recoil (by tempo k, not persona: k ≥ ${num(V2.springK)} springs back, k < ${num(V2.zvSlow)} two steps, in between one go)`, `惊跳的猛缩（按节奏 k 分、不按人格：k ≥ ${num(V2.springK)} 弹回，k < ${num(V2.zvSlow)} 分两步，其间一下缩到底）`),
        t(
          `bottoms out, springs back to ${num(V2.recoilTo)} after ${num(V2.recoilAt)} s; one go once ageing has slowed k below ${num(V2.springK)} (after about ${num(warmSpringUntil() * 100, 0)}% of ageing)`,
          `缩到底后 ${num(V2.recoilAt)} s 弹回到 ${num(V2.recoilTo)}；衰老过约 ${num(warmSpringUntil() * 100, 0)}%、k 跌破 ${num(V2.springK)} 后改为一下缩到底`,
        ),
        t(`in two steps, ${num(V2.zvDelay)} s apart`, `分两步缩（隔 ${num(V2.zvDelay)} s）`),
        t('all the way in one go', '一下缩到底'),
        t(`by this draw's k: springs back, two steps, or one go`, '看这一次抽到的 k：弹回、分两步或一下缩到底'),
      ),
      r(
        t('Startle: recovery', '惊跳后的恢复'),
        t('turns back to inspect: probes toward the stimulus twice', '回头去查看：朝刺激那边探两下再回来'),
        t('pauses, sighs deeply, eases back', '停一下、深叹一口气，慢慢放回'),
        t('creeps out: a little, pause, back a little, pause, open', '一步一步探出来：伸一点、停、又缩一点、停、再展开'),
        t('loosens halfway; 35% recoils again, 65% trembles; then drops back stiffly', '先松一半，35% 再猛缩一次、65% 停着发抖，最后生硬落回'),
      ),
      r(
        t('Approaching a hand it chose to reach for', '决定迎以后怎么凑'),
        t('carry → crouch → settle → strike; when the strike will not fit (hand near the arm base) or past half of ageing, as Calm', '转运 → 蹲 → 停稳 → 扑；扑不下（手离臂根近）或衰老过半时同沉静'),
        t('carry → half-beat pause → aim → precise reach', '转运 → 停半拍 → 瞄准 → 精确伸'),
        t('in → pause → back → pause → in → half-beat → slow touch', '进 → 停 → 退 → 停 → 再进 → 停半拍 → 慢碰'),
        t(`fast draw strikes; slow draw slow-touches; negative strength = stops, balks, withdraws`, '快的扑；慢的停半拍后慢碰；强度抽到负 = 停住 → 愣住 → 撤开'),
      ),
      r(
        t('Holding a hand that twitches', '握着时手微动'),
        t('squeezes once', '攥一下'),
        t('holds its breath', '屏气定住'),
        t('holds its breath', '屏气定住'),
        t('squeeze, hold its breath or give way', '攥 / 屏气 / 让，三选一'),
      ),
      r(
        t('The hand pulls free', '脱手'),
        t('chases', '追'),
        t('gives up', '放弃'),
        t('gives up, then turns aside', '放弃，之后侧身躲'),
        t('chases half the time', '一半追一半放弃'),
      ),
      r(
        t('Grasped nothing', '抓空那一拍'),
        t('grabs again', '再抓一次'),
        t('feels around', '摸一摸'),
        t('opens slowly', '慢慢张开'),
        t('one of the four', '四选一'),
      ),
      r(t('Searches after grasping nothing', '抓空后找几次'), t('2', '2'), t('1', '1'), t('0', '0'), t('0–2', '0–2')),
      r(
        t('Cannot reach the hand', '够不着手'),
        t(`leans and strains ${strainTries(P.A.toward)} more times, then sags`, `探身、再撑 ${strainTries(P.A.toward)} 次，垂下来`),
        t('does not strain: watches, leaning in a little once per row 6', '不探身：看着，每个第 6 行前倾一点'),
        t('does not strain: watches, leaning in a little once per row 6', '不探身：看着，每个第 6 行前倾一点'),
        t(`leans and strains ${strainTries(P.D.toward)} more time, then sags`, `探身、再撑 ${strainTries(P.D.toward)} 次，垂下来`),
      ),
    ],
    caption: t(
      'Where the personas do things differently, not just faster or slower. In a startle the 0.1 s latency and the direction and timing of the 0.15 s flexion are the same for all four; how deep the first flexion goes and what follows depend on k (row 1) and the persona (row 2).',
      '人格之间做法不同的地方（不是快慢）。惊跳的 0.1 s 潜伏与 0.15 s 屈曲的方向、时刻四种人格相同；第一下缩多深、之后怎样，看 k（第 1 行）与人格（第 2 行）。',
    ),
  };
}

/** 刺激进来时引擎的判定（与 engine.ts evaluate / respond 同一条规矩；守门测试拿引擎实跑对照） */
export type Judgement = 'startle' | 'flinch' | 'respond';
export function judge(kind: SensorKind, I: number, theta: number): Judgement {
  if (I > theta) return 'startle';
  if (WINCE_KINDS.has(kind) && theta > 0 && I / theta >= V2.nearThreshold) return 'flinch';
  return 'respond';
}
const JUDGEMENT: Record<Judgement, Bilingual> = {
  startle: t('startle', '惊跳'),
  flinch: t('flinch, then respond', '一缩，再回应'),
  respond: t('respond', '回应'),
};

/** 刺激清单：引擎事件 + 强度（INTENSITY、台架按钮的读数 BENCH_INPUT），表 01 与表 06 共用 */
export const STIMULI: { kind: SensorKind; I: number; label: Bilingual }[] = [
  { kind: 'PRESENCE', I: INTENSITY.approach, label: t('Person comes closer (a nearer band)', '人走近（档位变近）') },
  { kind: 'SHELL_STROKE', I: INTENSITY.stroke, label: t('Stroke the shell', '摸壳') },
  { kind: 'SHELL_HOLD', I: INTENSITY.hold, label: t('Hold the shell', '按住壳') },
  { kind: 'SHELL_STROKE', I: INTENSITY.pat, label: t('Tap the shell', '拍壳') },
  { kind: 'FEELER_TOUCH', I: INTENSITY.feeler, label: t('Touch a small arm', '碰小触手') },
  { kind: 'ARM_TOUCH', I: INTENSITY.arm, label: t('Hand touches the large arm', '手碰大触手') },
  { kind: 'ARM_TOUCH', I: INTENSITY.armReach, label: t('Arm reaches a still hand', '臂碰到不动的手') },
  { kind: 'SHELL_STROKE', I: INTENSITY.poke, label: t('Poke the shell', '戳壳') },
  { kind: 'LIFT', I: INTENSITY.lift, label: t('Lift the machine', '抱起') },
  { kind: 'KNOCK', I: BENCH_INPUT.knock, label: t('Knock (bench button)', '敲（台架按钮）') },
  { kind: 'SOUND', I: BENCH_INPUT.clap, label: t('Clap (bench button)', '拍手（台架按钮）') },
  { kind: 'SOUND', I: BENCH_INPUT.talk, label: t('Talk (bench button)', '说话（台架按钮）') },
];

/** 某个刺激下哪几种人格惊跳（A、B 用表里的 θ，C 分「没人在近处」与「手在近处」两档，D 每次重抽 θ）；没有 = 「无」 */
function startlers(kind: SensorKind, I: number): Bilingual {
  const thC0 = P.C.startle[0];
  const thC1 = thC0 * (1 - SOCIAL.startleClose);
  const en: string[] = [];
  const zh: string[] = [];
  for (const k of ['A', 'B'] as const) {
    if (judge(kind, I, P[k].startle[0]) === 'startle') {
      en.push(k);
      zh.push(k);
    }
  }
  if (judge(kind, I, thC0) === 'startle') {
    en.push('C');
    zh.push('C');
  } else if (judge(kind, I, thC1) === 'startle') {
    // C 怕到多少（N）以上才惊跳：I > θ·(1 − 0.4N) ⇔ N > (1 − I/θ) / 0.4
    const nStar = num((1 - I / thC0) / SOCIAL.startleClose);
    en.push(`C once afraid (N > ${nStar})`);
    zh.push(`C（怕到 N > ${nStar}）`);
  }
  // D 每次重抽 θ，也会怕（趋避抽到负的回合）：θ·(1 − 0.4N) 低于 I 就惊跳
  if (I > P.D.startle[0] * (1 - SOCIAL.startleClose)) {
    en.push(`D (when its θ·(1 − ${num(SOCIAL.startleClose)}N) < ${num(I)})`);
    zh.push(`D（θ·(1 − ${num(SOCIAL.startleClose)}N) < ${num(I)} 时）`);
  }
  return en.length ? t(en.join(', '), zh.join('、')) : t('none', '无');
}
/** 哪几种人格先「一缩」（没到惊跳、但 I/θ 够近的触碰类）；没有 = null */
function flinchers(kind: SensorKind, I: number): string | null {
  const who = (['A', 'B', 'C'] as const).filter((k) => judge(kind, I, P[k].startle[0]) === 'flinch');
  return who.length ? who.join(', ') : null;
}
const stim = (label: string): { kind: SensorKind; I: number } => {
  const x = STIMULI.find((s) => s.label.en === label);
  if (!x) throw new Error(`no stimulus ${label}`);
  return x;
};

/** 有方向的回应按 ⑩ 抽变体：迎（概率第 10 行；乱序随机先要抽到正的强度），否则热情 / 沉静原地做、回避 / 乱序随机躲 */
function variantShares(): Bilingual {
  const towardOf = (k: PersonaKey) => P[k].toward * (isRandom(P[k]) ? 0.5 : 1);
  const pct = (x: number) => `${num(x * 100, 0)}%`;
  const parts = PERSONA_KEYS.map((k) => {
    const tw = towardOf(k);
    const other = P[k].otherwise === 'away' || isRandom(P[k]) ? t('avoids', '躲') : t('does it in place', '原地做');
    return t(`${k} ${pct(tw)} toward, else ${other.en}`, `${k} ${pct(tw)} 迎、否则${other.zh}`);
  });
  return t(parts.map((x) => x.en).join(' · '), parts.map((x) => x.zh).join(' · '));
}

/** 表 01 · 交互总览：按人做了什么排，台架发什么、引擎怎么判、会怎样、人格差在哪 */
function interactionMap(): LogTableBlock {
  const near = stim('Person comes closer (a nearer band)');
  const feeler = stim('Touch a small arm');
  const stroke = stim('Stroke the shell');
  const pat = stim('Tap the shell');
  const hold = stim('Hold the shell');
  const poke = stim('Poke the shell');
  const arm = stim('Hand touches the large arm');
  const lift = stim('Lift the machine');
  const knock = stim('Knock (bench button)');
  const clap = stim('Clap (bench button)');
  const talk = stim('Talk (bench button)');
  const I = (x: { I: number }): string => `I ${num(x.I)}`;
  const list = (x: { kind: SensorKind; I: number }): Bilingual => startlers(x.kind, x.I);
  const st = (x: { kind: SensorKind; I: number }): Bilingual => t(`startles: ${list(x).en}`, `惊跳：${list(x).zh}`);
  const elseSt = (x: { kind: SensorKind; I: number }): Bilingual => t(`otherwise judged as usual — startles: ${list(x).en}`, `其余照常判——惊跳：${list(x).zh}`);
  const both = (a: Bilingual, b: Bilingual): Bilingual => t(`${a.en}; ${b.en}`, `${a.zh}；${b.zh}`);
  const row = (you: Bilingual, sends: LogCell, judged: LogCell, happens: LogCell, differs: LogCell): LogCell[] => [you, sends, judged, happens, differs];
  return {
    kind: 'table',
    head: [t('You do', '人做了什么'), t('Bench sends', '台架发给引擎'), t('Engine judges', '引擎怎么判'), t('What happens', '会怎样'), t('Personas', '人格的差别')],
    rows: [
      row(
        t('Nobody there', '没人'),
        '—',
        '—',
        t('breathes; a small spontaneous movement every row 6; changes heading every row 9', '呼吸；每隔第 6 行做一个小的自发动作；每隔第 9 行换一次朝向'),
        t('Tab. 02 rows 1, 2, 6, 9', '表 02 第 1、2、6、9 行'),
      ),
      row(
        t('Come closer (panel “Presence”, or the pointer’s distance)', '走近（面板「在场」，或指针的远近）'),
        t(`PRESENCE: the panel sends band + bearing, the pointer only a band (the machine must see the hand to know where it is); ${I(near)} whenever the band gets closer, moving away is 0`, `PRESENCE：面板发档位 + 方位，指针只发档位（要先看见手才知道人在哪）；档位变近就有强度（${I(near)}），退远为 0`),
        both(t('absorbed if a hand is seen or in view', '手已看见或在视野里：只吸收、不起动作'), elseSt(near)),
        t('a short response (toward, in place or avoiding: see the caption), then the whole body keeps shifting with how near the person is (Tab. 07); while someone is present, rows 6 and 9 switch to 6′ and 9′', '一个短回应（迎、原地或躲，见表注）；之后整个身体随人有多近持续变化（表 07）；人在时第 6、9 行换成 6′、9′'),
        t(`Warm opens up and lifts the arm toward the person; Calm does not change; Avoidant closes up, arm low and away; Random draws a sign each heading`, '热情张开、臂朝人抬；沉静不变；回避收拢、臂往下背着人；乱序随机每次定朝向时抽正负'),
      ),
      row(
        t('Move the pointer over the bench', '在画面上移动指针'),
        t(`HAND reading at most every ${num(HAND_UI.send)} s: bearing, distance, how the arm would bend to reach it, touch radius, still for, speed; plus a presence band from its distance (Tab. 09)`, `HAND 读数，至多每 ${num(HAND_UI.send)} s 一条：方位、距离、臂要怎么弯才碰得到、碰到半径、静止多久、速度；外加按距离给的在场档（表 09）`),
        t(`seen one τ after it enters ± ${deg(HAND.fov)}; then decides: reach (row 10 × (1 − N)), otherwise row 10′`, `进 ± ${deg(HAND.fov)} 视野、过一个 τ 才看见；然后决定：按第 10 行 × (1 − N) 迎，否则看第 10′ 行`),
        t('reach = follows the hand hop by hop; avoid = withdraws the arm and turns side-on; look elsewhere = glances, turns away from it', '迎 = 一跳一停地陪着手；躲 = 收臂、侧过身；看别处 = 瞥一眼再转开'),
        t(`Warm reaches ${num(P.A.toward * 100, 0)}%; Calm ${num(P.B.toward * 100, 0)}%, otherwise looks elsewhere; Avoidant avoids (reaches ${num(P.C.toward * 100, 0)}% × (1 − N)); Random ${num(P.D.toward * 100, 0)}%, otherwise avoids`, `热情 ${num(P.A.toward * 100, 0)}% 迎；沉静 ${num(P.B.toward * 100, 0)}% 迎、否则看别处；回避躲（迎 ${num(P.C.toward * 100, 0)}% × (1 − N)）；乱序随机 ${num(P.D.toward * 100, 0)}% 迎、否则躲`),
      ),
      row(
        t('Hold the pointer still within the arm’s reach', '指针停在臂够得着的地方'),
        t(`HAND with speed below ${HC.vStill} mm/s`, `HAND，速度 < ${HC.vStill} mm/s`),
        t('if it is reaching: the hand has been still long enough (Tab. 04) → approach', '在迎、手静够了（表 04）→ 凑'),
        t('closes in the persona’s way (Tab. 05, 10); missed: two nudges, then sags and watches; out of reach: Warm and Random lean and strain, then sag; Calm and Avoidant just watch', '按人格的做法凑上去（表 05、10）；没碰到：推两下，再垂下、看着；够不着：热情、乱序随机探身、撑、垂下，沉静、回避只看着'),
        t(`Warm crouches and strikes (if the strike fits and it is not past half of ageing; otherwise as Calm); Calm: half-beat pause, aim, precise reach; Avoidant (reaching only ${num(P.C.toward * 100, 0)}% × (1 − N)) edges in and out; Random strikes if fast, touches slowly if slow, or balks if its strength is negative`, `热情蹲下再扑（扑得下、衰老未过半；否则同沉静）；沉静停半拍、瞄准、精确伸；回避（迎的只有 ${num(P.C.toward * 100, 0)}% × (1 − N)）进进退退；乱序随机快的扑、慢的慢碰，强度抽到负就停住撤开`),
      ),
      row(
        t('Move the pointer toward the arm', '指针朝臂靠过去'),
        t('HAND with the distance to the arm shrinking', 'HAND，离臂越来越近'),
        t('if it is avoiding: closing in, near and fast enough (Tab. 11) → dodge', '在躲、手在逼近且够近够快（表 11）→ 躲开'),
        t(`snaps the arm away; breathing goes shallow (not held); the body turns another ${deg(HC.dodgeTurn)}·N side-on (${deg(HC.avoidSideMax)} at most in total, dodge turns included)`, `臂甩开；呼吸变浅（不屏气）；身体再侧开 ${deg(HC.dodgeTurn)}·N（连躲开加的在内封顶 ${deg(HC.avoidSideMax)}）`),
        t(`only while avoiding (Avoidant; Random on an “away” turn; Warm and Calm never avoid): with N ≥ 0.2 any movement ≥ ${HC.vStill} mm/s counts, otherwise ≥ ${HC.vFast} mm/s within ${num(DIST.near / 1000)} m`, `只在躲的时候（回避；乱序随机背向人的回合；热情、沉静从不躲）：N ≥ 0.2 时手 ≥ ${HC.vStill} mm/s 就算，否则要 ≥ ${HC.vFast} mm/s 且在 ${num(DIST.near / 1000)} m 内`),
      ),
      row(
        t('Touch the large arm with the pointer', '指针碰到大触手'),
        t(`ARM_TOUCH on after ${num(HAND_UI.dwell)} s within ${HAND_MM.touch} mm, not a swipe faster than ${HAND_MM.maxSpeed} mm/s; ${I(arm)}, or I ${num(INTENSITY.armReach)} if the arm came to a still hand`, `ARM_TOUCH on：在 ${HAND_MM.touch} mm 内待够 ${num(HAND_UI.dwell)} s、不是快于 ${HAND_MM.maxSpeed} mm/s 的划过；${I(arm)}，臂伸过来碰到不动的手时 I ${num(INTENSITY.armReach)}`),
        both(t('if it is reaching for this hand: expected, wraps at once (no startle, no queue)', '正在迎的手：预期中的接触，当帧开始缠（不判惊跳、不排队）'), elseSt(arm)),
        t(`wraps: holds still to feel, seats, tightens with each exhalation; when it is reaching for the hand, a hand sliding past at ≥ ${HC.vSlow} mm/s is not wrapped (it is if it then stops on the arm)`, `缠：定住感觉 → 贴上 → 每口呼气收紧一级；正在迎的手 ≥ ${HC.vSlow} mm/s 蹭过去不缠（停在臂上就缠）`),
        t(`Avoidant startles unless it was reaching for the hand, or the arm itself came to a still hand (I ${num(INTENSITY.armReach)}: no startle, it wraps after τ); Random may shrink back and avoid`, `回避除非正在迎这只手、或是臂自己碰到不动的手（I ${num(INTENSITY.armReach)}，不惊跳，过 τ 后缠），否则惊跳；乱序随机可能缩回去改躲`),
      ),
      row(
        t('Keep the pointer on the arm', '指针一直搭在臂上'),
        t('RESISTANCE on once the wrap has settled with the hand still there (the hand is caught)', '缠稳了、手还在：RESISTANCE on（手被卡住）'),
        t('tension + touch = holding a person', '张力 + 电极 = 握人'),
        t(`squeezes with each breath and hums; moving the pointer slowly (≤ ${HC.vSlow} mm/s for ${num(HC.tractionT)} s) leads it and the body follows at half speed`, `随呼吸一紧一松、哼；指针慢慢挪（≤ ${HC.vSlow} mm/s 持续 ${num(HC.tractionT)} s）就牵着它走，身体半速跟着转`),
        t('a twitch of the hand: Warm squeezes, Calm and Avoidant hold their breath, Random any of three', '手一动：热情攥一下，沉静、回避屏气，乱序随机三选一'),
      ),
      row(
        t('Pull the pointer away', '把指针拉开'),
        t(`ARM_TOUCH off beyond ${HAND_MM.release} mm from the arm (and, while wrapped or held, ${HAND_MM.anchor} mm from the touch point, which follows a slowly led hand); tension off unless “Leave object”`, `离臂 > ${HAND_MM.release} mm（缠 / 握着时另要离碰到点 > ${HAND_MM.anchor} mm，碰到点跟着慢慢牵的手走）：ARM_TOUCH off；没勾「留物件」时张力一起落`),
        t('holding, tension gone = pulled free; reached the stop with no tension = grasped nothing', '握着时张力没了 = 脱手；缠到限位没有张力 = 抓空'),
        t(`pulled free: chases at most ${GRASP.maxChases} time (lunges after a pull ≥ ${HC.vFast} mm/s if not past 60% of ageing, otherwise reaches out); grasped nothing: one beat, lets go, searches`, `脱手：至多追 ${GRASP.maxChases} 次（抽手 ≥ ${HC.vFast} mm/s 且衰老不过六成就扑过去，否则伸过去送一下）；抓空：一拍 → 放开 → 找`),
        t('Warm chases; Calm gives up; Avoidant gives up and avoids; Random half and half; searches A 2 · B 1 · C 0 · D 0–2', '热情追；沉静放弃；回避放弃后躲；乱序随机一半一半；找 A 2 · B 1 · C 0 · D 0–2 次'),
      ),
      row(
        t('Press and hold the large arm', '按住大触手'),
        t(`ARM_TOUCH on (${I(arm)}) while pressed; dragging away = pulling away`, `按着期间 ARM_TOUCH on（${I(arm)}）；拖开 = 抽手`),
        both(t('if it is reaching for this hand: expected, wraps at once', '正在迎的手：预期中的接触，当帧开始缠'), elseSt(arm)),
        t('as touching it with the pointer', '同指针碰到大触手'),
        t('—', '—'),
      ),
      row(
        t('Click a small arm', '点小触手'),
        t(`FEELER_TOUCH which arm, which side; ${I(feeler)}`, `FEELER_TOUCH 哪一条、哪一侧；${I(feeler)}`),
        both(t(`a local reflex first, any persona (not again within ${num(MOTION.reflexRefractory)} s)`, `先是触须自己的反射，不分人格（${num(MOTION.reflexRefractory)} s 内不再起）`), st(feeler)),
        t('the arm swings to that side, holds its breath and watches, then probes', '臂摆到那一侧、屏气盯住，再探几下'),
        t(`Warm probes three times, Calm and Random twice (Avoidant startles); Calm starts only after its ${num(P.B.latency[0])} s reaction time`, `热情探三下，沉静、乱序随机两下（回避惊跳）；沉静要过 ${num(P.B.latency[0])} s 的反应时间才动`),
      ),
      row(
        t('Drag across the shell', '在壳上拖'),
        t(`SHELL_STROKE stroke, which half; ${I(stroke)}`, `SHELL_STROKE 抚摸、哪一半；${I(stroke)}`),
        st(stroke),
        t('toward: leans into it slowly, breathes with it, purrs (the only response with no sharp edge)', '迎：慢慢倚过去、贴着呼吸蹭、呼噜（唯一没有尖角的回应）'),
        t('no one startles; leaning in follows the caption’s draw', '都不惊跳；倚不倚过去按表注的抽法'),
      ),
      row(
        t('Click the shell', '点壳'),
        t(`SHELL_STROKE tap; ${I(pat)}`, `SHELL_STROKE 轻拍；${I(pat)}`),
        st(pat),
        t('lifts toward it and nods, each nod smaller', '抬起来朝那边点头，一下比一下小'),
        t(`nods three times if its tempo k ≥ ${num(V2.springK)} (Warm, a fast Random), otherwise twice`, `节奏 k ≥ ${num(V2.springK)}（热情、抽到快的乱序随机）点三下，其余两下`),
      ),
      row(
        t(`Hold the shell (${num(BENCH_INPUT.holdAfter)} s, or the panel “Hold”)`, `按住壳（${num(BENCH_INPUT.holdAfter)} s，或面板「按住」）`),
        t(`SHELL_HOLD on / off; ${I(hold)}`, `SHELL_HOLD on / off；${I(hold)}`),
        st(hold),
        t('responds as to a stroke', '按抚摸回应'),
        t('Avoidant flinches first, and startles once afraid', '回避先一缩，怕了就惊跳'),
      ),
      row(
        t('Panel “Poke”', '面板「戳」'),
        t(`SHELL_STROKE poke, the half nearer the person; ${I(poke)}`, `SHELL_STROKE 戳，碰离人近的那一半；${I(poke)}`),
        st(poke),
        t('looks back at the spot and probes it once', '回头看那个地方、探一下'),
        flinchers(poke.kind, poke.I) ? t(`flinches first (I/θ ≥ ${num(V2.nearThreshold)}): ${flinchers(poke.kind, poke.I)}`, `先一缩（I/θ ≥ ${num(V2.nearThreshold)}）：${flinchers(poke.kind, poke.I)}`) : '—',
      ),
      row(
        t('Panel “Lift”, “Knock”, “Clap”, “Talk”', '面板「拿起」「敲」「拍手」「说话」'),
        t(`LIFT ${I(lift)} · KNOCK ${I(knock)} · SOUND ${I(clap)} / ${I(talk)}; no direction`, `LIFT ${I(lift)} · KNOCK ${I(knock)} · SOUND ${I(clap)} / ${I(talk)}；没有方向`),
        t(`startles — lift: ${list(lift).en}; knock: ${list(knock).en}; clap: ${list(clap).en}; talk: ${list(talk).en}`, `惊跳——拿起：${list(lift).zh}；敲：${list(knock).zh}；拍手：${list(clap).zh}；说话：${list(talk).zh}`),
        t('lift / knock: the arm straightens up and stays still, then a sigh; sound: holds its breath, small arms up, sweeps slowly in front', '拿起 / 敲：臂竖直挺起、静止，再叹一口气；声音：屏气、触须竖起来听，在正前方慢慢扫一遍'),
        t('only a negative response (Random) draws away', '只有负的回应（乱序随机）才躲'),
      ),
      row(
        t('“Leave object”, then pull away', '勾「留物件」再抽手'),
        t('ARM_TOUCH off, tension stays; unticking drops the tension', 'ARM_TOUCH off、张力留着；取消勾选张力才落'),
        t('tension only = holding an object', '只有张力 = 握物'),
        t(`grips at least as tight as bend ${num(GRASP.object)}; unticking = lost`, `握紧程度（弯曲）至少 ${num(GRASP.object)}；取消勾选 = 脱手`),
        t('—', '—'),
      ),
    ],
    caption: t(
      `What you can do and what follows. Read across: what a visitor does, what the bench turns it into, how the engine judges it, what the machine does, and where the personas differ. “startles” means I > θ (Tab. 06): a reflex after ${num(V2.startleLatency)} s that cancels any queued response. Everything else waits one reaction time τ, then responds; a directed response first draws its variant by row 10 — ${variantShares().en} (Random’s negative strengths avoid too); in place = the same move straight up and a little smaller, avoid = shrinks away to the other side, slow and silent. Nothing responds in the first ${LIFE.respondAt} s of a life, while dying or in the blank. While busy with another response it notes the stimulus as busy; a hand still on the arm when it is free again gets one late response.`,
      `人能做什么、做了以后会怎样。横着读：人做了什么、台架把它变成什么、引擎怎么判、机器会怎样、人格差在哪。「惊跳」= I > θ（表 06）：${num(V2.startleLatency)} s 起动的反射，作废排着的回应。其余一律等一个反应时间 τ 再回应；有方向的回应先按第 10 行抽变体——${variantShares().zh}（乱序随机强度抽到负的也躲）；原地 = 同一个动作朝正上、小一点，躲 = 往另一侧慢慢让开、不出声。每一世诞生头 ${LIFE.respondAt} s、死亡与空白段不回应。正在做别的回应时记作「正忙」；空下来时手还搭在臂上，补认一次。`,
    ),
  };
}

/** 表 06 · 同一个刺激，各人格会怎样 */
function stimulusTable(): LogTableBlock {
  const thC0 = P.C.startle[0];
  const thC1 = P.C.startle[0] * (1 - SOCIAL.startleClose);
  return {
    kind: 'table',
    head: [
      t('Stimulus', '刺激'),
      t('Strength I', '强度 I'),
      t(`A Warm θ ${num(P.A.startle[0])}`, `A 热情 θ ${num(P.A.startle[0])}`),
      t(`B Calm θ ${num(P.B.startle[0])}`, `B 沉静 θ ${num(P.B.startle[0])}`),
      t(`C Avoidant θ ${num(thC0)} (N = 0)`, `C 回避 θ ${num(thC0)}（N = 0）`),
      t(`C Avoidant θ ${num(thC1)} (afraid, N = 1)`, `C 回避 θ ${num(thC1)}（怕到 N = 1）`),
    ],
    rows: STIMULI.map(({ kind, I, label }): LogCell[] => [
      label,
      num(I),
      JUDGEMENT[judge(kind, I, P.A.startle[0])],
      JUDGEMENT[judge(kind, I, P.B.startle[0])],
      JUDGEMENT[judge(kind, I, thC0)],
      JUDGEMENT[judge(kind, I, thC1)],
    ]),
    caption: t(
      `The same stimulus, persona by persona. Every stimulus is a startle if I > θ × (1 − ${num(SOCIAL.startleClose)}N): a reflex that starts after a fixed ${num(V2.startleLatency)} s, whatever the persona. Below that, shell and small-arm touches and a person coming closer first flinch if I/θ reaches ${num(V2.nearThreshold)} (a quick ${num(V2.winceD)} curl away), and everything else waits one reaction time τ and responds. Knocks and sounds use the measured strength (0–1). Random redraws θ (${range(P.D.startle)}) for every stimulus and can be afraid too, so it has no column. Nothing reacts in the first ${LIFE.respondAt} s of a life; a hand the machine is already reaching for does not startle it (Tab. 10).`,
      `同一个刺激，各人格会怎样。刺激强度 I > θ × (1 − ${num(SOCIAL.startleClose)}N) 一律是惊跳：反射，固定 ${num(V2.startleLatency)} s 起动，不分人格。没到阈值时，碰壳、碰小触手与人走近这几种，I/θ ≥ ${num(V2.nearThreshold)} 先一缩（差动 ${num(V2.winceD)} 背着缩一下），其余等一个反应时间 τ 再回应。敲与声音按读数（0–1）。乱序随机每次刺激重抽 θ（${range(P.D.startle)}），也会怕，所以不列。每一世诞生头 ${LIFE.respondAt} s 不回应；正在迎的手碰臂不判惊跳（表 10）。`,
    ),
  };
}

/** 表 07 · 有人在时身体怎么变（⑬ 对人的趋避，按人有多近放大） */
function presenceTable(): LogTableBlock {
  const S = SOCIAL;
  return {
    kind: 'table',
    head: [t('Channel', '通道'), t('Drawn toward (P)', '迎（P）'), t('Afraid (N)', '怕（N）')],
    rows: [
      [t('Breath centre', '呼吸中心'), t(`toward open, ${num(S.openCenter)}·P`, `往张开端 ${num(S.openCenter)}·P`), t(`toward closed, ${num(S.closeCenter)}·N`, `往收拢端 ${num(S.closeCenter)}·N`)],
      [t('Breath depth', '呼吸幅度'), `× (1 + ${num(S.openAmp)}P)`, `× (1 − ${num(S.closeAmp)}N)`],
      [t('Breath period', '呼吸周期'), t('unchanged', '不变'), t(`× (1 − ${num(S.closePeriod)}N): shallow and quick`, `× (1 − ${num(S.closePeriod)}N)：浅、快`)],
      [
        t('Resting large arm', '大触手的静息姿态'),
        t(`raised toward the person, bend + ${num(S.openBend)}·P`, `朝人那一侧抬起，弯曲 + ${num(S.openBend)}·P`),
        t(`down and away from the person, bend + ${num(S.closeBend)}·N`, `往下、背着人那一侧缩，弯曲 + ${num(S.closeBend)}·N`),
      ],
      [t('Small arms', '小触手'), t(`sweep × (1 + ${num(S.feelerOpen)}P)`, `扫幅 × (1 + ${num(S.feelerOpen)}P)`), t(`sweep × (1 − ${num(S.feelerClose)}N), both tucked; above N ${num(S.quiverFrom)} they tremble (3 Hz, ${num(S.quiver)}·N rad)`, `扫幅 × (1 − ${num(S.feelerClose)}N)，两条一起收起；N > ${num(S.quiverFrom)} 起发抖（3 Hz、${num(S.quiver)}·N rad）`)],
      [t('Voice duty', '发声占空比'), `× (1 + ${num(S.voiceOpen)}P)`, t(`× (1 − ${num(S.voiceClose)}N): almost silent`, `× (1 − ${num(S.voiceClose)}N)：几乎不出声`)],
      [t('Pitch', '音高'), `× (1 + ${num(S.pitchOpen)}P)`, `× (1 + ${num(S.pitchClose)}N)`],
      [t('Body turn speed', '偏航限速'), `× (1 + ${num(S.yawOpen)}P)`, `× (1 + ${num(S.yawClose)}N)`],
      [t('Startle threshold', '惊吓阈值'), '—', `× (1 − ${num(S.startleClose)}N)`],
      [t('Turns away when startled', '惊跳时转开'), '—', `× (1 + ${num(S.flinchClose)}N)`],
      [t('Remembers a hand it avoided (s)', '躲开的手出了视野记多久（s）'), '—', `${num(HAND.loseAfter)} × (1 + ${num(S.loseClose)}N)`],
    ],
    caption: t(
      `Toward or away from people (row 13). With someone present the body changes all the time, not only when it decides something. Target = row 13 × how near the person is: presence band far ${num(S.band.far)}, middle ${num(S.band.mid)}, near ${num(S.band.near)}; a seen hand counts ${num(DIST.far / 1000)} m → 0 to ${num(DIST.near / 1000)} m → 1, whichever is larger. It rises with time constant ${num(S.onBase)} + ${num(S.onLatency)}·τ (the middle of the persona's row 4) and falls back with row 14. P and N are its positive and negative halves; with nobody there both are 0. Warm has P ≈ 1 up close, Avoidant N ≈ 1, Calm stays at 0.`,
      `对人的趋避（第 13 行）。有人在时身体一直在变，不只在做决定的那一下。目标 = 第 13 行 × 人有多近：在场档远 ${num(S.band.far)}、中 ${num(S.band.mid)}、近 ${num(S.band.near)}；看见了手时按手离电机轴 ${num(DIST.far / 1000)} m → 0、${num(DIST.near / 1000)} m → 1，两者取大。变强的时间常数 ${num(S.onBase)} + ${num(S.onLatency)}·τ（τ 取该人格第 4 行的中值），回落按第 14 行。P、N 是它的正负两半；没有人时都是 0。热情型人在近处 P ≈ 1、回避型 N ≈ 1、沉静型恒 0。`,
    ),
  };
}

/** 表 08 · 手（指针）：看见、决定、转身 */
function handTable(): LogTableBlock {
  const L = HC.armL;
  return {
    kind: 'table',
    head: [t('Step', '环节'), t('Rule', '规矩')],
    rows: [
      [t('Field of view', '视野'), t(`body heading ± ${deg(HAND.fov)}; once seen ± ${deg(HAND.fovKeep)}`, `机身朝向 ± ${deg(HAND.fov)}；看见以后放宽到 ± ${deg(HAND.fovKeep)}`)],
      [t('Sees it', '看见'), t('one reaction time τ after it enters the field of view, if it is still there; a hand touching the arm is always in view', '进视野后过一个反应时间 τ，到点还在视野里才算；碰着臂的手一律算在视野里')],
      [t('Not seen yet and gone', '还没看见就走了'), t(`out of view for ${num(HAND.loseAfter)} s: stops noticing it; off the canvas: forgotten at once`, `出视野 ${num(HAND.loseAfter)} s：不再去注意它；离开画布：立刻作罢`)],
      [t('Seen and gone', '看见以后丢失'), t(`off the canvas for ${num(HAND.loseAfter)} s; out of view for ${num(HAND.loseAfter)} s, an avoided hand ${num(HAND.loseAfter)} s × (1 + ${num(SOCIAL.loseClose)}N); the count starts only after a turn (toward it, side-on or unwinding) has finished`, `离开画布 ${num(HAND.loseAfter)} s；出视野 ${num(HAND.loseAfter)} s，躲开的手 ${num(HAND.loseAfter)} s × (1 + ${num(SOCIAL.loseClose)}N)；正在转身（朝它、侧开或绕回）时不算，转完才开始倒数`)],
      [t('Decides', '决定'), t('when it sees the hand, then every row 9 / 9′: reach with chance row 10 × (1 − N) (Random is not multiplied); otherwise row 10′ — “turns away” = avoid, “looks anywhere” = look elsewhere', '看见那一刻、之后每个第 9 / 9′ 行：按第 10 行 × (1 − N) 的概率迎（乱序随机不乘）；否则看第 10′ 行——「背向人」= 躲、「随便看」= 看别处')],
      [t('Startled by the hand', '被手吓到'), t('no draw: takes row 10′ until the next row 9', '不抽：直接换成第 10′ 行那一项，直到下一个第 9 行')],
      [t('Already avoiding, decides to avoid', '已经在躲又决定躲'), t('keeps avoiding: no re-shrink, no new side, does not interrupt a dodge or peek in progress (later dodges still happen)', '接着躲：不重收、不重选侧别、不打断正在做的躲开或偷看（之后照样会再躲开）')],
      [t('Look elsewhere', '看别处'), t(`glances at the hand, then turns ${deg(HAND.lookMin)}–${deg(HAND.lookMax)} away from it`, `朝手瞥一眼，再背着手那一侧转 ${deg(HAND.lookMin)}–${deg(HAND.lookMax)}`)],
      [t('Reach: arm only', '迎：只动臂'), t(`if the arm can reach: bend ≤ ${num(HC.reachBend)} and within ${num(HC.reachFar)} of the arm length (${num(L, 1)} mm) from its base`, `臂够得着就只动臂：弯曲 ≤ ${num(HC.reachBend)}、离臂基座 ≤ ${num(HC.reachFar)} 倍臂长（${num(L, 1)} mm）`)],
      [t('Reach: turn the body', '迎：转身'), t(`out of reach and more than ${deg(HAND.turnAt)} off; the arm moves first, the body ${num(HC.armLead)} ÷ k s later; stops turning once reachable; a hand inside arm length is met beside the straight arm, not swept by it`, `够不着且偏出 ${deg(HAND.turnAt)}；臂先身后（身体晚 ${num(HC.armLead)} ÷ k s）；转身途中够得着就停；手在臂长以内时转到直臂停在手旁边的朝向，不让直臂扫到手`)],
      [t('Avoid: turn the body', '躲：转身'), t(`more than ${deg(HAND.turnAt)} off; turns side-on (Tab. 11), also when the hand is over the body`, `偏出 ${deg(HAND.turnAt)} 就转；侧身（角度见表 11），手在机身上方也照转`)],
      [t('Stops turning', '停转'), t(`within ${deg(HAND.settle)}`, `偏差 ${deg(HAND.settle)} 以内`)],
      [t('Shortest way round', '取近路'), t(`direction locked beyond ${deg(HAND.antipode)}, unlocked within ${deg(HAND.unlock)}; travel ± 180°: past the stop by less than ${deg(HAND.unwindAt)} it waits there, otherwise unwinds the long way`, `方位差 > ${deg(HAND.antipode)} 锁定转向、回到 ${deg(HAND.unlock)} 以内解锁；行程 ± 180°：越限不到 ${deg(HAND.unwindAt)} 停在限位等，超过就绕回去`)],
      [t('Hand over the body', '手在机身上方'), t(`closer than ${num(DIST.body / 1000, 2)} m to the axis: when reaching it neither turns nor reaches`, `离电机轴 < ${num(DIST.body / 1000, 2)} m：迎的时候不转、不去够`)],
    ],
    caption: t(
      'Seeing the hand and turning. The pointer is a person’s hand; the machine knows where it is only once it has seen it; turning toward it, away from it or elsewhere is decided by the persona (Tab. 02, rows 9, 10, 13).',
      '看见手与转身。指针 = 人的手，机器先要看见它才知道它在哪；朝它转、背着它转还是看别处，由人格决定（表 02 第 9、10、13 行）。',
    ),
  };
}

/** 表 09 · 台架：指针怎么变成读数、怎么算碰到臂 */
function benchTable(): LogTableBlock {
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('Value', '值')],
    rows: [
      [t('Touch radius', '碰到半径'), t(`${HAND_MM.touch} mm (in pixels: mouse ${HAND_PX.mouse[0]}–${HAND_PX.mouse[1]}, finger ${HAND_PX.finger[0]}–${HAND_PX.finger[1]})`, `${HAND_MM.touch} mm（换成像素：鼠标 ${HAND_PX.mouse[0]}–${HAND_PX.mouse[1]}、手指 ${HAND_PX.finger[0]}–${HAND_PX.finger[1]}）`)],
      [t('Release radius · anchor', '松开半径 · 锚点'), `${HAND_MM.release} mm · ${HAND_MM.anchor} mm`],
      [t('Counts as a touch', '算碰到'), t(`inside the radius for ${num(HAND_UI.dwell)} s and slower than ${HAND_MM.maxSpeed} mm/s (a swipe does not count)`, `在半径内待够 ${num(HAND_UI.dwell)} s，且指针不快于 ${HAND_MM.maxSpeed} mm/s（划过去不算）`)],
      [t('Who touched whom', '谁碰谁'), t(`pointer still ≥ ${num(HAND_UI.stillFor)} s before entering = the arm reached the hand (I ${num(INTENSITY.armReach)}); otherwise the hand touched the arm (I ${num(INTENSITY.arm)})`, `进圈前指针已静止 ≥ ${num(HAND_UI.stillFor)} s = 臂伸过来碰到手（I ${num(INTENSITY.armReach)}）；否则手伸过去碰臂（I ${num(INTENSITY.arm)}）`)],
      [t('Being led', '牵着走'), t(`while wrapped or held, a pointer slower than ${HAND_MM.tractionSpeed} mm/s inside the release radius drags the anchor along`, `缠 / 握着时指针 ≤ ${HAND_MM.tractionSpeed} mm/s 且没出松开半径：锚点跟着指针走`)],
      [t('Pulling away', '抽手'), t('beyond the release radius from the arm and beyond the anchor from where it pressed', '离臂脊线 > 松开半径且离按下处 > 锚点')],
      [t('Readings sent', '读数发给引擎'), t(`at most every ${num(HAND_UI.send)} s, when bearing moves > ${num(HAND_UI.dBearing)} rad, distance > ${HAND_UI.dDist} mm, bend direction > ${num(HAND_UI.dAimDir)} rad or bend > ${num(HAND_UI.dAimBend)}, and while the pointer keeps moving`, `至多每 ${num(HAND_UI.send)} s 一条：方位 > ${num(HAND_UI.dBearing)} rad、距离 > ${HAND_UI.dDist} mm、弯向 > ${num(HAND_UI.dAimDir)} rad 或弯多少 > ${num(HAND_UI.dAimBend)} 才发；指针还在挪也发`)],
      [t('Pointer speed', '指针速度'), t(`over the last ${num(TRACK.window)} s; it is moving above ${TRACK.movePx} px`, `按最近 ${num(TRACK.window)} s 算；挪动 > ${TRACK.movePx} px 才算动`)],
      [t('Presence band from the hand', '手给出的在场档'), t(`near < ${num(DIST.near / 1000)} m, far > ${num(DIST.far / 1000)} m; ${HAND_UI.bandHys} mm hysteresis, ${num(HAND_UI.bandDwell)} s dwell`, `近 < ${num(DIST.near / 1000)} m、远 > ${num(DIST.far / 1000)} m；滞回 ${HAND_UI.bandHys} mm、驻留 ${num(HAND_UI.bandDwell)} s`)],
      [t('Hand over the body (reading)', '手在机身上（读数）'), t(`the pointer’s ray meets the hull first (radius ${R_HULL} mm, height ${num(HULL_Z[0], 0)}…${num(HULL_Z[1], 0)} mm): the hand reads as ${num(R_HULL / 1000)} m from the axis. Clicks, drags and holds on the shell are hit-tested on the skin between the rings`, `指针的射线先碰到机身外廓（半径 ${R_HULL} mm、高 ${num(HULL_Z[0], 0)}…${num(HULL_Z[1], 0)} mm）：手的读数记作离轴 ${num(R_HULL / 1000)} m。壳上的点、拖、按按环与环之间的蒙皮判命中`)],
      [t('Clicks', '点击'), t(`small arm (within ${BENCH_INPUT.smallArmHitPx} px) = touch it; shell: click = tap, drag > ${BENCH_INPUT.strokePx} px = stroke, hold ${num(BENCH_INPUT.holdAfter)} s = hold; pressing the large arm (within ${BENCH_INPUT.armPressPx} px) = hand on the arm`, `小触手（${BENCH_INPUT.smallArmHitPx} px 内）= 碰触须；壳：点 = 拍、拖过 ${BENCH_INPUT.strokePx} px = 摸、按住 ${num(BENCH_INPUT.holdAfter)} s = 按住；按住大触手（${BENCH_INPUT.armPressPx} px 内）= 手碰臂`)],
      [t('Farthest', '最远'), `${HAND_FAR} mm`],
    ],
    caption: t(
      'How the bench turns a pointer into what the machine senses. Distances are world millimetres, converted to pixels for the current view, so a touch is the same physical size whatever the zoom.',
      '台架怎么把指针变成机器感到的东西。距离一律是世界毫米，再按此刻的画面换成像素——画布多大、哪个视角，碰到的实际距离都一样。',
    ),
  };
}

/** 表 10 · 决定迎以后：陪着 → 凑 → 缠 → 握 → 脱手 */
function reachTable(): LogTableBlock {
  return {
    kind: 'table',
    head: [t('Stage', '阶段'), t('What it does', '做什么'), t('Numbers', '数')],
    rows: [
      [t('Follow', '陪着'), t('hops and pauses, keeping just off the hand', '一跳一停，停在离手一点的地方'), t(`first hop to ${num(HC.firstHop)} of the way; each hop ≥ ${num(HC.stepMin)} s; stops min(${HC.standCap}, touch + ${HC.standGap} + ${num(HC.standLag)} s × hand speed) mm away; hops when off by > ${num(HC.eps)}, at once if the target jumps > ${num(HC.jump)}; Warm leads by ${num(HC.leadT)} s, Avoidant goes ${num(HC.bStep * 100, 0)}% each hop`, `第一跳伸到 ${num(HC.firstHop)}；每跳 ≥ ${num(HC.stepMin)} s；停在离手 min(${HC.standCap}, 碰到半径 + ${HC.standGap} + ${num(HC.standLag)} s × 手速) mm；目标误差 > ${num(HC.eps)} 才跳、跳 > ${num(HC.jump)} 立刻重跳；热情冲在手前 ${num(HC.leadT)} s，回避每跳只走 ${num(HC.bStep * 100, 0)}%`)],
      [t('Approach', '凑'), t('once the hand is still and within reach: a half-beat pause, then the persona’s way in (Tab. 05)', '手停稳且够得着：停半拍，再按人格的做法凑上去（表 05）'), t(`hand slower than ${HC.vStill} mm/s; half-beat at most ${num(HC.hoverMax)} s; crouch ${num(HC.cockMin)}–${num(HC.cockMax)}; strike travel ≤ ${num(HC.strikeMax)}; strike, precise reach and slow touch all land ${HC.land} mm past the hand`, `手 < ${HC.vStill} mm/s；停半拍至多 ${num(HC.hoverMax)} s；蹲 ${num(HC.cockMin)}–${num(HC.cockMax)}；扑的总行程 ≤ ${num(HC.strikeMax)}；扑、精确伸、慢碰都落在手上 +${HC.land} mm`)],
      [t('Missed or out of reach', '没碰到 · 够不着'), t('missed: two nudges, then sags and watches; out of reach: Warm and Random lean and strain, then sag; Calm and Avoidant just watch', '没碰到：推两下，再垂下、看着；够不着：热情、乱序随机探身、撑、垂下，沉静、回避只看着'), t(`${HC.nudges} nudges of ${num(HC.nudge)}; re-arms after the hand moves ${HC.strainRearm} mm`, `推 ${HC.nudges} 下、每下 ${num(HC.nudge)}；手挪 ${HC.strainRearm} mm 才重来`)],
      [t('Touch', '碰到'), t('a hand it is reaching for does not startle it, is not queued and costs no reaction time', '正在迎的手碰臂：不判惊跳、不排队、不再等反应时间'), t(`flinches first only if 0.5·I/θ ≥ ${num(V2.nearThreshold)}`, `只有 0.5·I/θ ≥ ${num(V2.nearThreshold)} 时先一缩再接`)],
      [t('Wrap', '缠'), t('holds still to feel, seats, then tightens one step with each exhalation', '定住感觉 → 贴上 → 每口呼气收紧一级'), t(`feel per Tab. 04 (× ${num(HC.feelByHand)} when the hand came to it); seat ≥ max(${num(HC.stepMin)}, ${num(HC.seatK)} ÷ k) s; + ${HC.cinchStep} mm per step, window ${num(HC.winLo)}…+${HC.winHi} mm`, `定住按表 04（手伸过来 × ${num(HC.feelByHand)}）；贴上 ≥ max(${num(HC.stepMin)}, ${num(HC.seatK)} ÷ k) s；每级 +${HC.cinchStep} mm，窗口 ${num(HC.winLo)}…+${HC.winHi} mm`)],
      [t('Caught', '卡住'), t('the bench raises tension once seating is done and the arm has settled, with the hand still there', '贴上做完、臂停稳之后手还在：台架判张力'), t('or 1 s after seating', '或贴上之后 1 s')],
      [t('Hold', '握'), t('squeezes with the breath, softer as the hold goes on; follows a slowly moving hand', '随呼吸一紧一松，握久了变轻；手慢慢挪就跟着'), t(`presses ${HC.holdCenter} mm past the hand; squeeze ${HC.holdAmp0} + ${HC.holdAmp1}·row 2 mm, ${num(HC.holdLead)} s ahead of the breath; fades × (1 − ${num(HC.fade1)} + ${num(HC.fade1)}·e^(−n/${HC.fadeN})); a reading that jumps > ${num(HC.jumpD)} or ${deg(HC.jumpDir)} is not followed (for 0.2 s); led below ${HC.vSlow} mm/s for ${num(HC.tractionT)} s`, `压过手 ${HC.holdCenter} mm；峰峰 ${HC.holdAmp0} + ${HC.holdAmp1}·第 2 行 mm，比呼吸早 ${num(HC.holdLead)} s；满足后 × (1 − ${num(HC.fade1)} + ${num(HC.fade1)}·e^(−n/${HC.fadeN}))；读数一步跳 > ${num(HC.jumpD)} 或 ${deg(HC.jumpDir)}：这一下（0.2 s）不跟；< ${HC.vSlow} mm/s 持续 ${num(HC.tractionT)} s = 牵着走`)],
      [t('Pulled free', '脱手'), t('Warm chases, Random half the time (Tab. 05): lunges after a fast pull, reaches out once after a slow one', '热情追、乱序随机一半追（表 05）：抽得快就扑过去，抽得慢就伸过去送一下'), t(`fast = ≥ ${HC.vFast} mm/s in the last 0.3 s and not past 60% of ageing; slow: reaches ${num(HC.chaseExtend)} of the way; body ${num(HC.yawLag)} s behind; the chase ends 0.5 s after its beats (${HC.chaseCap} s fallback)`, `快 = 脱手前 0.3 s ≥ ${HC.vFast} mm/s 且衰老不过六成；慢：伸到够到所需的 ${num(HC.chaseExtend)}；身体晚 ${num(HC.yawLag)} s；拍走完 0.5 s 后结束（兜底 ${HC.chaseCap} s）`)],
      [t('Grasped nothing', '抓空'), t('the persona’s beat (Tab. 05), lets go, then searches around the last touch', '人格那一拍（表 05）→ 放开 → 以最后碰到处为中心找'), t(`hand still on the arm after letting go: tries again after ${num(HC.rearm)} s`, `放开后手还搭着：${num(HC.rearm)} s 后再来一次`)],
    ],
    caption: t(
      'Reaching for the hand: follow → approach → wrap → hold → pulled free. After deciding to reach, each beat waits for the arm to actually settle before the next. Waits depend on the reaction time (Tab. 04); speed caps on the tempo k (Tab. 03).',
      '迎手：陪着 → 凑 → 缠 → 握 → 脱手。决定迎以后，每一拍都等臂真的停稳才进下一拍。等多久看反应时间（表 04），多快看节奏 k（表 03）。',
    ),
  };
}

/** 表 11 · 躲：按怕的程度 N 放大 */
function avoidTable(): LogTableBlock {
  const Ns = [0, 0.5, 1];
  const col = (f: (N: number) => string): string[] => Ns.map(f);
  const side = (N: number, body: number) => Math.min(HC.avoidSideMax, HC.avoidSide + (HC.avoidSideMax - HC.avoidSide) * N * (HC.avoidFarShare + (1 - HC.avoidFarShare) * body));
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('How', '式子'), 'N = 0', 'N = 0.5', 'N = 1'],
    rows: [
      [t('Avoiding pose: bend (hand close)', '躲的姿态：差动（手在近处）'), `0.12 + (0.19 + ${num(HC.avoidTight)}N)·near`, ...col((N) => num(0.12 + 0.19 + HC.avoidTight * N, 2))],
      [t('Avoiding pose: tucks downward', '躲的姿态：弯向往下压'), `${deg(HC.avoidTuck)}·N·near`, ...col((N) => deg(HC.avoidTuck * N, 1))],
      [t('Withdraw takes (s × 1/k)', '收的时长（s × 1/k）'), `1.2 − ${num(HC.shrinkFast)}N`, ...col((N) => num(1.2 - HC.shrinkFast * N))],
      [t('Withdraws again when the pose is off by', '姿态差多少就再收一次'), `${num(HC.reshrinkPose)} − ${num(HC.reshrinkPoseN)}N`, ...col((N) => num(HC.reshrinkPose - HC.reshrinkPoseN * N, 3))],
      [t('Peek turns back toward the hand (Avoidant · Random)', '偷看转回手那边（回避 · 乱序随机）'), `0.3 · 0.4 × (1 − ${num(HC.peekLeanN)}N)`, ...col((N) => `${num(0.3 * (1 - HC.peekLeanN * N), 3)} · ${num(0.4 * (1 - HC.peekLeanN * N), 3)}`)],
      [t('Dodge: hand speed at least (mm/s)', '躲开：手至少多快（mm/s）'), t(`afraid (N ≥ 0.2) any movement, otherwise fast`, `怕（N ≥ 0.2）手一动就算，否则要快`), ...col((N) => String(N >= 0.2 ? HC.vStill : HC.vFast))],
      [t('Dodge: hand closer than', '躲开：手要多近'), t(`${num(DIST.near / 1000)} m from the axis; afraid also arm–hand < ${HC.dodgeR0} + ${HC.dodgeR1}N mm`, `离电机轴 < ${num(DIST.near / 1000)} m；怕的时候另算臂—手 < ${HC.dodgeR0} + ${HC.dodgeR1}N mm`), ...col((N) => (N >= 0.2 ? `${num(DIST.near / 1000)} m · ${HC.dodgeR0 + HC.dodgeR1 * N} mm` : `${num(DIST.near / 1000)} m`))],
      [t('Side-on angle, hand far', '侧身角（手在远处）'), `${deg(HC.avoidSide)} + ${deg(HC.avoidSideMax - HC.avoidSide)}·N·${num(HC.avoidFarShare)}`, ...col((N) => deg(side(N, 0), 1))],
      [t('Side-on angle, hand at the body', '侧身角（手凑到机身边上）'), `${deg(HC.avoidSide)} + ${deg(HC.avoidSideMax - HC.avoidSide)}·N`, ...col((N) => deg(side(N, 1), 1))],
      [t('Avoidant startle threshold', '回避型的惊吓阈值'), `${num(P.C.startle[0])} × (1 − ${num(SOCIAL.startleClose)}N)`, ...col((N) => num(P.C.startle[0] * (1 - SOCIAL.startleClose * N), 3))],
      [t('Remembers the avoided hand (s)', '躲开的手记多久（s）'), `${num(HAND.loseAfter)} × (1 + ${num(SOCIAL.loseClose)}N)`, ...col((N) => num(HAND.loseAfter * (1 + SOCIAL.loseClose * N), 1))],
    ],
    caption: t(
      `Avoiding a hand, by fear N. Avoiding (Avoidant whenever it does not reach, Random on its “away” turns) grows with fear N: the arm hides lower and tighter, reacts to smaller movements and turns further side-on, never fully back (at most ${deg(HC.avoidSideMax)} in total, including the up to ${deg(HC.dodgeTurnMax)} that dodges add and that fades over ${num(HC.dodgeTurnTau)} s). “near” runs from 0 at ${num(DIST.far / 1000)} m to 1 at ${num(DIST.near / 1000)} m; the side-on angle uses how close the hand last was to the body (${num(DIST.near / 1000)} → ${num(DIST.body / 1000)} m).`,
      `躲手，按怕的程度 N。躲（回避型不迎的时候、乱序随机抽到「背向人」的回合）随 N 放大：臂藏得更低更紧，手挪一点就再收，侧得更开，但不整个背过去（连躲开加的那一截在内封顶 ${deg(HC.avoidSideMax)}；躲开至多加 ${deg(HC.dodgeTurnMax)}、按 ${num(HC.dodgeTurnTau)} s 回落）。「near」= 手 ${num(DIST.far / 1000)} m 时 0、${num(DIST.near / 1000)} m 时 1；侧身角按最后看见手时离机身多近（${num(DIST.near / 1000)} → ${num(DIST.body / 1000)} m）。`,
    ),
  };
}

/** 表 12 · 躲：不随 N 变的规矩，和「躲开」做多大 */
function avoidRulesTable(): LogTableBlock {
  const sz = (s: number) => `${num(HC.dodgeD * (0.6 + 0.4 * s), 3)} · ${num(0.6 + 0.8 * s, 1)} s · ${num(0.06 + 0.02 * s, 2)}`;
  return {
    kind: 'table',
    head: [t('Rule', '规矩'), t('Value', '值')],
    rows: [
      [t('Deciding to avoid', '决定躲以后'), t(`freezes (Tab. 04: breath held, small arms tucked, silent), then withdraws; the body turns side-on ${num(HC.avoidLag)} s later`, `定住（表 04：屏气、触须收起、不出声）→ 收；身体晚 ${num(HC.avoidLag)} s 才侧过去`)],
      [t('Which side', '侧别'), t('the side that needs less turning; within 10° it keeps the hand on its left', '转得少的那一边；差不多（10° 内）时让手在左')],
      [t('Bends away from', '背着手弯的方向'), t('opposite the hand; with the hand right at the tip it curls down; when afraid and the hand is out of reach, down on the far side', '手的弯向的反向；手就在臂梢上时往下缩；怕的时候手在臂够不着的地方，往下、背着手那一侧')],
      [t('Dodge: when', '躲开：什么时候'), t(`the hand is closing in (nearer the arm or the body within the last 0.25 s) and passes the speed and distance gates in Tab. 11; at least ${num(HC.dodgeGap)} s apart; it can dodge again while holding still from the last one`, `手在逼近（0.25 s 内离臂或离机身变近）且过了表 11 的手速、远近两道门；两次之间 ≥ ${num(HC.dodgeGap)} s；上一次定住时手还在逼近照样再躲开`)],
      [t('Dodge: what', '躲开：做什么'), t(`the arm snaps away at strike speed, tighter than the avoiding pose; breathing goes shallow and is pushed toward closed (not held); the body turns another ${deg(HC.dodgeTurn)}·N`, `臂用「一击」档甩到背着手那边、比躲的姿态再紧一截；呼吸变浅、往收拢端推（不屏气）；身体再侧开 ${deg(HC.dodgeTurn)}·N`)],
      [t('Dodge size σ = max(N, hand speed share)', '躲开的份量 σ = max(N, 手速位置)'), t(`speed share runs ${HC.vSlow} → ${HC.vSwipe} mm/s; tighter · holds · body closes: σ 0 = ${sz(0)} · σ 1 = ${sz(1)}`, `手速位置 = ${HC.vSlow} → ${HC.vSwipe} mm/s；再紧 · 定住 · 环身收：σ 0 = ${sz(0)} · σ 1 = ${sz(1)}`)],
      [t('Peek', '偷看'), t('once per row 6 (6′ while someone is present) if the hand is visible and still: small arms point, the arm turns back a little, looks (Tab. 04), withdraws; if the hand moves it snaps back with a click', '每个第 6 行（有人在时 6′）一次（手看得见、静着）：触须先指过去 → 臂转回一点 → 看（表 04）→ 收回；看的时候手动了就咂一声缩回')],
      [t('Hand out of view', '手出了视野'), t('the arm keeps its last avoiding pose: no dodge, no re-withdraw, no peek', '臂保持最后的躲姿：不躲开、不再收、不偷看')],
      [t('Hand gone', '手走了'), t(`beyond ${num(DIST.far / 1000)} m for ${num(HC.reliefT)} s, or off the canvas: a sigh of relief, back to rest`, `远于 ${num(DIST.far / 1000)} m 持续 ${num(HC.reliefT)} s，或离开画布：呼一口气，回静息`)],
    ],
    caption: t(
      'Avoiding a hand: the rules. Side-on and watchful, not turning its back and not forgetting the hand. Four reactions: withdraw (and withdraw again), dodge, peek, relief.',
      '躲手的规矩。侧身提防，不背对、不忘掉手。四种反应：收（含再收）、躲开、偷看、松一口气。',
    ),
  };
}

/** 表 13 · 抓握 */
function graspTable(): LogTableBlock {
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('Value', '值')],
    rows: [
      [t('Wrap to the stop (hand not seen)', '缠到限位（没看见手时）'), t(`${num(GRASP.wrap)} s ÷ k`, `${num(GRASP.wrap)} s ÷ k`)],
      [t('Let go, back to rest', '松开回静息'), t(`${num(GRASP.release)} s ÷ k; ${num(GRASP.deathRelease)} × slower when dying`, `${num(GRASP.release)} s ÷ k；死的时候慢 ${num(GRASP.deathRelease)} 倍`)],
      [t('Bend at the stop', '限位处的弯曲'), num(GRASP.limit)],
      [t('Holding a person · an object', '握人 · 握物'), t(`very light ${num(GRASP.human)} (with a seen hand the hold follows Tab. 10 instead: ${HC.holdCenter} mm past the hand) · at least ${num(GRASP.object)}`, `极轻 ${num(GRASP.human)}（看见了的手改按表 10：压过手 ${HC.holdCenter} mm）· 至少 ${num(GRASP.object)}`)],
      [t('What it is holding', '握的是什么'), t('tension and touch = a person; tension only = an object (“leave object”); reached the stop with no tension = nothing', '张力 + 电极 = 人；只有张力 = 物（「留物件」）；到限位没有张力 = 抓空')],
      [t('Chases after losing it', '脱手后最多追'), t(`${GRASP.maxChases} time`, `${GRASP.maxChases} 次`)],
      [
        t('Hand touches the arm unseen', '没看见手就碰臂'),
        t(
          `wraps the old way, along the arm's current bend and without reading the hand; the bench raises tension at ${num(CATCH_AT * 100, 0)}% of the wrap; after an empty grab it searches around where the wrap began (the same search as after reaching for a seen hand)`,
          `走旧路的缠：顺着臂此刻的弯向缠，不读手；缠到 ${num(CATCH_AT * 100, 0)}% 时台架判张力；抓空后以缠开始的地方为中心找（与迎手之后的找同一段）`,
        ),
      ],
    ],
    caption: t(
      'The grasp state machine (T-0707-1): wrap → hold a person or an object → pulled free → chase once, or grasp nothing → let go → search.',
      '抓握状态机（T-0707-1）：缠 → 握人或握物 → 脱手 → 追一次；或抓空 → 松开 → 搜寻。',
    ),
  };
}

/** 表 14 · 一世的时间、唤醒度、硬上限 */
function limitsTable(): LogTableBlock {
  const A = ENGINE.arousal;
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('Value', '值'), t('Why', '为什么')],
    rows: [
      [t('One life', '一世'), t(`birth ${LIFE.birth} · growth ${LIFE.grow} · ageing ${LIFE.age} ± ${LIFE.deathWindow} · dying (row 12) · blank ${LIFE.blank} s`, `诞生 ${LIFE.birth} · 成长 ${LIFE.grow} · 衰老 ${LIFE.age} ± ${LIFE.deathWindow} · 死亡（第 12 行）· 空白 ${LIFE.blank} s`), t('life clock ×1–×20 speeds up only this; breathing and movement stay real-time', '生命时钟 ×1–×20 只加快它，呼吸与动作不跟着快')],
      [t('After birth', '诞生以后'), t(`breathing eases in over ${LIFE.breathRamp} s; reacts from ${LIFE.respondAt} s; spontaneous moves and turning from ${LIFE.spontAt} s`, `呼吸 ${LIFE.breathRamp} s 缓入；${LIFE.respondAt} s 起回应；${LIFE.spontAt} s 起自发动作与转向`), '—'],
      [t('Arousal', '唤醒度'), t(`+ ${num(A.gain)}·I per stimulus (≤ 1), falls with ${A.tau} s; breath period × (1 − ${num(A.breath)}a), spontaneous interval × (1 − ${num(A.spont)}a), small-arm sweep × (1 + ${num(A.feeler)}a)`, `每次刺激 + ${num(A.gain)}·I（≤ 1），回落 ${A.tau} s；呼吸周期 × (1 − ${num(A.breath)}a)、自发间隔 × (1 − ${num(A.spont)}a)、触须扫幅 × (1 + ${num(A.feeler)}a)`), '—'],
      [t('Crank', '曲柄'), t(`≤ ${num(CRANK.maxSpeed, 2)} rad/s (≤ 1° per substep, ≤ ${CRANK.maxSubsteps} substeps per frame)`, `≤ ${num(CRANK.maxSpeed, 2)} rad/s（每子步 ≤ 1°、每帧 ≤ ${CRANK.maxSubsteps} 子步）`), t('the five-ring solve stays on its branch only within 1° per substep', '五环解算每子步 1° 以内才不跳支')],
      [t('Breathing stroke speed', '呼吸行程速度'), t(`π·depth / period ≤ ${num(V2.breathRateCap)}/s after all cues; Random draws are capped at 0.9/s`, `π·幅度 / 周期 ≤ ${num(V2.breathRateCap)}/s（叠完所有提示之后）；乱序随机抽的时候先封 0.9/s`), t('so the crank keeps up (set from measured engine traces)', '让曲柄追得上（按引擎实测轨迹定）')],
      [t('Arm bend off the tendon axes', '离轴差动'), `≤ ${num(D_FLAT_MAX)}`, t('0.55 between two tendons was measured unstable', '两腱之间实测 0.55 失稳')],
      [t('Arm bend, overall (except the deep curl)', '差动封顶（深卷之外）'), `${num(D_MAX)}`, t('same', '同上')],
      [t('Deep curl', '深卷'), t(`startle only, to ${num(D_SPAN + D_DEEP_SPAN, 3)} (main tendon fully pulled)`, `只有惊跳用，到 ${num(D_SPAN + D_DEEP_SPAN, 3)}（主腱拉满）`), t('“use it, but not too much”', '「用，但不要用太多」')],
      [t('Strike at the hand', '扑手'), `≤ ${num(HC.strikeMax)}`, t('never as large as the same persona’s startle', '到不了同人格惊跳的一半')],
      [t('Swing', '摆动'), t('≤ 0.6 Hz; a hop-and-pause cycle ≥ 1.4 s', '≤ 0.6 Hz；一跳一停的周期 ≥ 1.4 s'), t('the arm’s passband is about 0.7 Hz', '臂的通带约 0.7 Hz')],
      [t('Body turn', '偏航'), t(`± 180°; ${num(MOTION.yawRate)} rad/s × k (startle × ${MOTION.yawRateStartle})`, `± 180°；${num(MOTION.yawRate)} rad/s × k（惊跳 × ${MOTION.yawRateStartle}）`), t('placeholder until the new turntable motor is modelled', '新转台电机定型前的占位')],
    ],
    caption: t(
      'Timing of one life, arousal, and the hard limits set by the hardware and the solver. All other numbers in these tables are proposals awaiting the author’s decision.',
      '一世的时间、唤醒度，以及硬件与求解器给的硬上限。这些表里其余的数都是提案，待作者拍板。',
    ),
  };
}

/**
 * Lab 1-6 的附件。顺序 = 先看「人做什么、机器怎么判」（表 01），再看人格（02–05）、
 * 判定与在场（06–07）、手与台架（08–09）、迎与躲（10–12）、抓握与上限（13–14）。
 */
export const LAB_1_6_TABLES: { title: Bilingual; blocks: LogTableBlock[] } = {
  title: t('Interaction tables', '交互机制表'),
  blocks: [
    interactionMap(),
    personaTable(),
    derivedTable(),
    waitsTable(),
    structureTable(),
    stimulusTable(),
    presenceTable(),
    handTable(),
    benchTable(),
    reachTable(),
    avoidTable(),
    avoidRulesTable(),
    graspTable(),
    limitsTable(),
  ],
};
