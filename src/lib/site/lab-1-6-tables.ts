// Lab 1-6 的附件：交互机制表（2026-10-18 用户「把这些表格整理成表格成果推上去 附在 lab6 里面作为附件」）。
//
// 内容 = 轮回机器_交互机制参数表.md 的整理版，按「人做了什么 → 机器怎么判 → 会怎样」重排；
// **数一律从引擎模块现算**（人格表、常量块、限速的函数都是 import 进来的那一份），
// 文字中英两份手写。改了代码，这里跟着变，不会像手抄的表那样漂。
// 2026-10-19 交互机制整合（作者：「不造新机制和新词，删除不易察觉的冗余，只留观察者比较可见的机制」）：
// 14 张收成 5 张——交互总览 · 人格 · 惊跳与回应 · 手 · 一世与上限。
// 结构 = 日志条目的表格块（LogTableBlock：表头 + 行 + 说明，单元格可中英双语），
// 卡片与展开视图复用 components/site/LogBody 导出的 BlockRail / BlockView。
//
// 纯数据、零 DOM；守门 = lab-1-6-tables.test.ts（形状按日志的 schema 校、与引擎的判定一致）。
import type { Bilingual, LogCell, LogTableBlock } from './log-schema';
import { PERSONAS, PERSONA_KEYS, type PersonaKey, type PersonaSpec, type Range, isRandom } from '../linkage/behavior/persona';
import { ENGINE, HAND, MOTION, SOCIAL } from '../linkage/behavior/engine';
import { RECOVER, V2, respD, spontE, tierSpeed, type BuildCtx, type Tier } from '../linkage/behavior/vocab2';
import { DIST, HC } from '../linkage/behavior/vocab2-hand';
import { INTENSITY, type SensorKind } from '../linkage/behavior/events';
import { LIFE } from '../linkage/behavior/life';
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

const OTHERWISE: Record<PersonaSpec['otherwise'], Bilingual> = {
  random: t('looks elsewhere', '看别处'),
  away: t('keeps away', '躲'),
};
const DEATH: Record<PersonaSpec['death']['kind'], Bilingual> = {
  turn: t('energy runs out, ends facing the person', '精力渐尽，最后朝向人停下'),
  quiet: t('settles quietly', '安静慢慢停下'),
  withdraw: t('turns away and slows to a stop', '背过身慢慢停下'),
  arrhythmia: t('rhythm breaks up, then fades', '节律紊乱后渐弱'),
};

/** 人在近处时一个通道变多少：s = 第 13 行（+ 迎、− 怕），按人在近处（×1）算 */
function nearPerson(s: number): { breath: Bilingual; arm: Bilingual; feelers: Bilingual; voice: Bilingual } {
  const S = SOCIAL;
  const p = Math.max(0, s);
  const n = Math.max(0, -s);
  if (p === 0 && n === 0) {
    const same = t('unchanged', '不变');
    return { breath: same, arm: same, feelers: same, voice: same };
  }
  if (p > 0) {
    return {
      breath: t(
        `centre ${num(S.openCenter * p)} toward open · depth × ${num(1 + S.openAmp * p)} · period × ${num(1 - S.openPeriod * p)}: a little deeper and quicker`,
        `中心往张开端 ${num(S.openCenter * p)} · 幅度 × ${num(1 + S.openAmp * p)} · 周期 × ${num(1 - S.openPeriod * p)}：深一点、快一点`,
      ),
      arm: t(`raised toward the person, bend + ${num(S.openBend * p)}`, `朝人那一侧抬起，弯曲 + ${num(S.openBend * p)}`),
      feelers: t(`sweep × ${num(1 + S.feelerOpen * p)}`, `扫幅 × ${num(1 + S.feelerOpen * p)}`),
      voice: t(`× ${num(1 + S.voiceOpen * p)}`, `× ${num(1 + S.voiceOpen * p)}`),
    };
  }
  return {
    breath: t(
      `centre ${num(S.closeCenter * n)} toward closed · depth × ${num(1 - S.closeAmp * n)} · period × ${num(1 - S.closePeriod * n)}: shallow and quick`,
      `中心往收拢端 ${num(S.closeCenter * n)} · 幅度 × ${num(1 - S.closeAmp * n)} · 周期 × ${num(1 - S.closePeriod * n)}：浅、快`,
    ),
    arm: t(`down and away from the person, bend + ${num(S.closeBend * n)}`, `往下、背着人那一侧缩，弯曲 + ${num(S.closeBend * n)}`),
    feelers: t(`sweep × ${num((1 - S.feelerClose * n) * 1, 2)}, tucked`, `扫幅 × ${num(1 - S.feelerClose * n)}，收起`),
    voice: t(`× ${num(1 - S.voiceClose * n)}: almost silent`, `× ${num(1 - S.voiceClose * n)}：几乎不出声`),
  };
}
/** 乱序随机：每次定朝向时抽迎或躲，强度是第 13 行的区间 */
const RANDOM_NEAR = t(`as Warm or as Avoidant, drawn at each heading change, × ${range(P.D.stance)}`, `每次定朝向时抽：像热情或像回避，× ${range(P.D.stance)}`);

// ------------------------------------------------------------------ 判定（表 01 与表 03 共用）

/** 刺激进来时引擎的判定（与 engine.ts evaluate 同一条规矩；守门测试拿引擎实跑对照） */
export type Judgement = 'startle' | 'respond';
export function judge(I: number, theta: number): Judgement {
  return I > theta ? 'startle' : 'respond';
}
const JUDGEMENT: Record<Judgement, Bilingual> = {
  startle: t('startle', '惊跳'),
  respond: t('respond', '回应'),
};

/** 刺激清单：引擎事件 + 强度（INTENSITY、台架按钮的读数 BENCH_INPUT），表 01 与表 03 共用 */
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

/** 某个刺激下哪几种人格惊跳（A、B、C 用表里的 θ，D 每次重抽 θ）；没有 = 「无」 */
function startlers(I: number): Bilingual {
  const who: string[] = (['A', 'B', 'C'] as const).filter((k) => judge(I, P[k].startle[0]) === 'startle');
  const en = [...who];
  const zh = [...who];
  if (I > P.D.startle[0]) {
    en.push(`D (when its θ draw < ${num(I)})`);
    zh.push(`D（抽到的 θ < ${num(I)} 时）`);
  }
  return en.length ? t(en.join(', '), zh.join('、')) : t('none', '无');
}
const stim = (label: string): { kind: SensorKind; I: number } => {
  const x = STIMULI.find((s) => s.label.en === label);
  if (!x) throw new Error(`no stimulus ${label}`);
  return x;
};

/** 有方向的回应按 ⑩ 抽变体：迎（概率第 10 行），否则热情 / 沉静原地做、回避 / 乱序随机躲 */
function variantShares(): Bilingual {
  const pct = (x: number) => `${num(x * 100, 0)}%`;
  const parts = PERSONA_KEYS.map((k) => {
    const other = P[k].otherwise === 'away' ? t('avoids', '躲') : t('does it in place', '原地做');
    return t(`${k} ${pct(P[k].toward)} toward, else ${other.en}`, `${k} ${pct(P[k].toward)} 迎、否则${other.zh}`);
  });
  return t(parts.map((x) => x.en).join(' · '), parts.map((x) => x.zh).join(' · '));
}

// ------------------------------------------------------------------ 表

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
  const list = (x: { I: number }): Bilingual => startlers(x.I);
  const st = (x: { I: number }): Bilingual => t(`startles: ${list(x).en}`, `惊跳：${list(x).zh}`);
  const elseSt = (x: { I: number }): Bilingual => t(`otherwise judged as usual — startles: ${list(x).en}`, `其余照常判——惊跳：${list(x).zh}`);
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
        t('a short response (toward, in place or avoiding: see the caption), then the whole body shifts with how near the person is (Tab. 02, last four rows)', '一个短回应（迎、原地或躲，见表注）；之后整个身体随人有多近变化（表 02 最后四行）'),
        t('Warm opens up and lifts the arm toward the person; Calm does not change; Avoidant closes up, arm low and away; Random draws one or the other at each heading', '热情张开、臂朝人抬；沉静不变；回避收拢、臂往下背着人；乱序随机每次定朝向时抽一种'),
      ),
      row(
        t('Move the pointer over the bench', '在画面上移动指针'),
        t(`HAND reading at most every ${num(HAND_UI.send)} s: bearing, distance, how the arm would bend to reach it, touch radius, still for, speed; plus a presence band from its distance (Tab. 04)`, `HAND 读数，至多每 ${num(HAND_UI.send)} s 一条：方位、距离、臂要怎么弯才碰得到、碰到半径、静止多久、速度；外加按距离给的在场档（表 04）`),
        t(`seen one τ after it enters ± ${deg(HAND.fov)}; then decides by row 10: reach, otherwise row 10′`, `进 ± ${deg(HAND.fov)} 视野、过一个 τ 才看见；然后按第 10 行决定：迎，否则看第 10′ 行`),
        t(`reach = Warm follows the hand all the way, the others follow it hop by hop; keep away = withdraws the arm and turns side-on; look elsewhere = glances at it, then turns ${num(HAND.lookMin * DEG, 0)}–${deg(HAND.lookMax)} away`, `迎 = 热情一路跟着手走，其余一跳一停地陪着；躲 = 收臂、侧过身；看别处 = 瞥一眼，身体转开 ${num(HAND.lookMin * DEG, 0)}–${deg(HAND.lookMax)}`),
        t(`Warm reaches ${num(P.A.toward * 100, 0)}%; Calm ${num(P.B.toward * 100, 0)}%, otherwise looks elsewhere; Avoidant ${num(P.C.toward * 100, 0)}%, otherwise keeps away; Random ${num(P.D.toward * 100, 0)}%, otherwise keeps away`, `热情 ${num(P.A.toward * 100, 0)}% 迎；沉静 ${num(P.B.toward * 100, 0)}% 迎、否则看别处；回避 ${num(P.C.toward * 100, 0)}% 迎、否则躲；乱序随机 ${num(P.D.toward * 100, 0)}% 迎、否则躲`),
      ),
      row(
        t('Hold the pointer still within the arm’s reach', '指针停在臂够得着的地方'),
        t(`HAND with speed below ${HC.vStill} mm/s`, `HAND，速度 < ${HC.vStill} mm/s`),
        t('if it is reaching: the hand has been still for one τ (row 4) → approach', '在迎、手静了一个 τ（第 4 行）→ 凑'),
        t(`moves close, then strikes or reaches onto the hand; missed: sags back and waits until the hand moves ${HC.rearmMm} mm; out of reach: only follows (the body turns toward it)`, `靠近，再扑或伸到手上；没碰到：垂回去，等手挪开 ${HC.rearmMm} mm 再凑；够不着：只陪着（身体转过去）`),
        t('Warm crouches and strikes (if the strike fits and it is not past half of ageing; otherwise reaches); Calm and Avoidant reach; Random strikes if its draw is fast, otherwise reaches', '热情蹲下再扑（扑得下、衰老未过半；否则伸过去）；沉静、回避伸过去；乱序随机抽到快的扑，否则伸过去'),
      ),
      row(
        t('Move the pointer toward the arm', '指针朝臂靠过去'),
        t('HAND with the distance to the arm shrinking', 'HAND，离臂越来越近'),
        t(`if it is keeping away and the hand is in view: closing in, moving, and near (within ${num(DIST.near / 1000)} m, or ${HC.dodgeR0} mm from the arm) → dodge`, `在躲、手看得见：手在逼近、在动、而且近（${num(DIST.near / 1000)} m 内，或离臂 < ${HC.dodgeR0} mm）→ 躲开`),
        t(`snaps the arm away, ${num(HC.dodgeD)} tighter than the avoiding pose, and holds it ${num(HC.dodgeHold)} s; breathing goes shallow`, `臂甩开、比躲姿再紧 ${num(HC.dodgeD)}，定住 ${num(HC.dodgeHold)} s；呼吸变浅`),
        t('only while keeping away (Avoidant, Random on an “away” turn); Warm and Calm never keep away', '只在躲的时候（回避；乱序随机抽到躲的回合）；热情、沉静从不躲'),
      ),
      row(
        t('Touch the large arm with the pointer', '指针碰到大触手'),
        t(`ARM_TOUCH on after ${num(HAND_UI.dwell)} s within ${HAND_MM.touch} mm, not a swipe faster than ${HAND_MM.maxSpeed} mm/s; ${I(arm)}, or I ${num(INTENSITY.armReach)} if the arm came to a still hand`, `ARM_TOUCH on：在 ${HAND_MM.touch} mm 内待够 ${num(HAND_UI.dwell)} s、不是快于 ${HAND_MM.maxSpeed} mm/s 的划过；${I(arm)}，臂伸过来碰到不动的手时 I ${num(INTENSITY.armReach)}`),
        both(t('if it is reaching for this hand: expected, wraps at once (no startle, no queue)', '正在迎的手：预期中的接触，当帧开始缠（不判惊跳、不排队）'), elseSt(arm)),
        t(`wraps: seats on the hand in one move, ${HC.holdCenter} mm past it; when it is reaching for the hand, a hand sliding past at ≥ ${HC.vSlow} mm/s is not wrapped (it is if it then stops on the arm)`, `缠：一下贴到手上、压过手 ${HC.holdCenter} mm；正在迎的手 ≥ ${HC.vSlow} mm/s 蹭过去不缠（停在臂上就缠）`),
        t(`Avoidant startles unless it was reaching for the hand, or the arm itself came to a still hand (I ${num(INTENSITY.armReach)}: no startle, it wraps after τ)`, `回避除非正在迎这只手、或是臂自己碰到不动的手（I ${num(INTENSITY.armReach)}，不惊跳，过 τ 后缠），否则惊跳`),
      ),
      row(
        t('Keep the pointer on the arm', '指针一直搭在臂上'),
        t('RESISTANCE on once the wrap has settled with the hand still there (the hand is caught)', '缠稳了、手还在：RESISTANCE on（手被卡住）'),
        t('tension + touch = holding a person', '张力 + 电极 = 握人'),
        t(`holds and hums; moving the pointer slowly (${HC.vStill}–${HC.vSlow} mm/s) leads it: the arm follows, and the body turns once the hand is ${deg((25 * Math.PI) / 180)} off`, `握着、哼；指针慢慢挪（${HC.vStill}–${HC.vSlow} mm/s）就牵着它走：臂跟着，手偏出 ${deg((25 * Math.PI) / 180)} 身体跟着转`),
        t('—', '—'),
      ),
      row(
        t('Pull the pointer away', '把指针拉开'),
        t(`ARM_TOUCH off beyond ${HAND_MM.release} mm from the arm (and, while wrapped or held, ${HAND_MM.anchor} mm from the touch point, which follows a slowly led hand); tension off unless “Leave object”`, `离臂 > ${HAND_MM.release} mm（缠 / 握着时另要离碰到点 > ${HAND_MM.anchor} mm，碰到点跟着慢慢牵的手走）：ARM_TOUCH off；没勾「留物件」时张力一起落`),
        t('holding, tension gone = pulled free; reached the stop with no tension = grasped nothing', '握着时张力没了 = 脱手；缠到限位没有张力 = 抓空'),
        t(`pulled free: chases at most ${GRASP.maxChases} time — lunges to beside the hand, then reaches onto it; grasped nothing: sighs, lets go, searches around the last touch`, `脱手：至多追 ${GRASP.maxChases} 次——先扑到手旁，再伸到手上；抓空：叹一口气放开，在最后碰到的地方找`),
        t('Warm chases; Calm gives up; Avoidant gives up and keeps away; Random half and half; searches A 2 · B 1 · C 0 · D 0–2', '热情追；沉静放弃；回避放弃后躲；乱序随机一半一半；找 A 2 · B 1 · C 0 · D 0–2 次'),
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
        t('toward: leans into it slowly, breathes with it, purrs', '迎：慢慢倚过去、贴着呼吸蹭、呼噜'),
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
        t('—', '—'),
      ),
      row(
        t('Panel “Poke”', '面板「戳」'),
        t(`SHELL_STROKE poke, the half nearer the person; ${I(poke)}`, `SHELL_STROKE 戳，碰离人近的那一半；${I(poke)}`),
        st(poke),
        t('looks back at the spot and probes it once', '回头看那个地方、探一下'),
        t('—', '—'),
      ),
      row(
        t('Panel “Lift”, “Knock”, “Clap”, “Talk”', '面板「拿起」「敲」「拍手」「说话」'),
        t(`LIFT ${I(lift)} · KNOCK ${I(knock)} · SOUND ${I(clap)} / ${I(talk)}; no direction`, `LIFT ${I(lift)} · KNOCK ${I(knock)} · SOUND ${I(clap)} / ${I(talk)}；没有方向`),
        t(`startles — lift: ${list(lift).en}; knock: ${list(knock).en}; clap: ${list(clap).en}; talk: ${list(talk).en}`, `惊跳——拿起：${list(lift).zh}；敲：${list(knock).zh}；拍手：${list(clap).zh}；说话：${list(talk).zh}`),
        t('lift / knock: the arm straightens up and stays still, then a sigh; sound: holds its breath, small arms up, sweeps slowly in front', '拿起 / 敲：臂竖直挺起、静止，再叹一口气；声音：屏气、触须竖起来听，在正前方慢慢扫一遍'),
        t('—', '—'),
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
      `What you can do and what follows. Read across: what a visitor does, what the bench turns it into, how the engine judges it, what the machine does, and where the personas differ. “startles” means I > θ (Tab. 03): a reflex after ${num(V2.startleLatency)} s that cancels any queued response. Everything else waits one reaction time τ, then responds; a directed response first draws its variant by row 10 — ${variantShares().en}; in place = the same move straight up and a little smaller, avoid = shrinks away to the other side, slow and silent. Nothing responds in the first ${LIFE.respondAt} s of a life, while dying or in the blank. While busy with another response it notes the stimulus as busy; a hand still on the arm when it is free again gets one late response.`,
      `人能做什么、做了以后会怎样。横着读：人做了什么、台架把它变成什么、引擎怎么判、机器会怎样、人格差在哪。「惊跳」= I > θ（表 03）：${num(V2.startleLatency)} s 起动的反射，作废排着的回应。其余一律等一个反应时间 τ 再回应；有方向的回应先按第 10 行抽变体——${variantShares().zh}；原地 = 同一个动作朝正上、小一点，躲 = 往另一侧慢慢让开、不出声。每一世诞生头 ${LIFE.respondAt} s、死亡与空白段不回应。正在做别的回应时记作「正忙」；空下来时手还搭在臂上，补认一次。`,
    ),
  };
}

/** 表 02 · 人格：表里的数、按它算出来的量、做法不同的地方、人在近处时身体怎么变 */
function personaTable(): LogTableBlock {
  const row = (no: string, label: Bilingual, f: (p: PersonaSpec) => LogCell): LogCell[] => [no, label, ...per(f)];
  const tier = (tr: Tier) => (p: PersonaSpec) => {
    const [a, b] = kRange(p);
    return two(tierSpeed(tr, a), tierSpeed(tr, b));
  };
  const R = RECOVER;
  const pct = (x: number) => `${num(x * 100, 0)}%`;
  const near = (key: 'breath' | 'arm' | 'feelers' | 'voice') => (p: PersonaSpec): LogCell => (isRandom(p) ? RANDOM_NEAR : nearPerson(p.stance[0])[key]);
  return {
    kind: 'table',
    head: ['#', t('Parameter', '参数'), ...PERSONA_HEAD],
    rows: [
      row('1', t('Breath period at rest (s)', '平时的呼吸周期（s）'), (p) => range(p.breathPeriod)),
      row('2', t('Breath depth at rest (share of the stroke)', '平时的呼吸幅度（行程分数）'), (p) => range(p.breathAmp)),
      row('3', t('Movement speed (cm/s)', '运动速度（cm/s）'), (p) => range(p.speed)),
      row('4', t('Reaction time τ (s)', '响应延迟 τ（s）'), (p) => range(p.latency)),
      row('5', t('Response size', '回应幅度'), (p) => range(p.gain)),
      row('6', t('Spontaneous movement every (s)', '自发动作间隔（s）'), (p) => range(p.spont)),
      row('7', t('Voice pitch (Hz)', '声音基频（Hz）'), (p) => range(p.voiceFreq, 0)),
      row('8', t('Voice duty (share of each breath)', '声音占空比'), (p) => range(p.voiceDuty)),
      row('9', t('Changes heading every (s)', '朝向变化间隔（s）'), (p) => range(p.orient)),
      row('10', t('Chance of turning toward the person', '朝向偏向人的概率'), (p) => num(p.toward)),
      row('10′', t('Otherwise, with a hand', '不朝人时（对手）'), (p) => OTHERWISE[p.otherwise]),
      row('11', t('Startle threshold θ', '惊吓阈值 θ'), (p) => range(p.startle)),
      row('12', t('How it dies (s)', '死法（s）'), (p) => t(`${DEATH[p.death.kind].en} · ${p.death.dur}`, `${DEATH[p.death.kind].zh} · ${p.death.dur}`)),
      row('13', t('Toward or away from people', '对人的趋避'), (p) => (isRandom(p) ? `±${range(p.stance)}` : signed(p.stance[0]))),
      row('·', t(`Tempo k = √(row 3 ÷ ${num(ENGINE.speedRef)})`, `节奏 k = √(第 3 行 ÷ ${num(ENGINE.speedRef)})`), (p) => {
        const [a, b] = kRange(p);
        return two(a, b);
      }),
      row('·', t('Speed cap: fast · normal · slow (differential/s)', '限速：快 · 常速 · 慢（差动/秒）'), (p) => `${tier('fast')(p)} · ${tier('normal')(p)} · ${tier('slow')(p)}`),
      row('·', t('Body turn speed (rad/s)', '转身速度（rad/s）'), (p) => {
        const [a, b] = kRange(p);
        return two(MOTION.yawRate * a, MOTION.yawRate * b);
      }),
      row('·', t('Response size (differential)', '回应幅度（差动）'), (p) => two(respD(ctx({ gAbs: p.gain[0] })), respD(ctx({ gAbs: p.gain[1] })), 3)),
      row('·', t('Spontaneous size (differential)', '自发幅度（差动）'), (p) =>
        two(spontE(ctx({ breathAmp: p.breathAmp[0], temper: p.temper })), spontE(ctx({ breathAmp: p.breathAmp[1], temper: p.temper })), 3),
      ),
      row('·', t(`Startle: freezes ${num(V2.freeze)} s + τ (s)`, `惊跳：凝住 ${num(V2.freeze)} s + τ（s）`), (p) =>
        two(Math.min(V2.freezeCap, V2.freeze + p.latency[0]), Math.min(V2.freezeCap, V2.freeze + p.latency[1])),
      ),
      [
        '·',
        t(`Startle: recovery`, '惊跳后的恢复'),
        t(
          `swings out to the stimulus side (${num(R.warmLookD)}, ${num(R.warmLookDeg, 0)}° off) and looks there ${num(R.warmInspect)} s, the arm swaying, small arms probing; then back`,
          `甩到刺激那一侧（差动 ${num(R.warmLookD)}、偏 ${num(R.warmLookDeg, 0)}°）看 ${num(R.warmInspect)} s，臂一摆一摆、触须交替探；再回来`,
        ),
        t(`stays curled, one deep sigh (${num(R.calmPause)} s), then eases back in one slow move (${num(R.calmSettle)} s ÷ k)`, `一直缩着，深叹一口气（${num(R.calmPause)} s），再一口气慢慢放回（${num(R.calmSettle)} s ÷ k）`),
        t(
          `peeks out and shrinks back twice (out to ${pct(R.avoidPeek[0])} · ${pct(R.avoidPeek[1])} of the curl, back to ${pct(R.avoidBack[0])} · ${pct(R.avoidBack[1])}), trembling and silent; then opens`,
          `探出一点又缩回去，两回（探到卷曲的 ${pct(R.avoidPeek[0])} · ${pct(R.avoidPeek[1])}、缩回 ${pct(R.avoidBack[0])} · ${pct(R.avoidBack[1])}），一直发抖、不出声；再展开`,
        ),
        t(`loosens to ${pct(R.randLoosen)}, one aftershock (a second one ${pct(R.randTwice)} of the time), then drops back stiffly`, `先松到 ${pct(R.randLoosen)}，一下余震（${pct(R.randTwice)} 几率再来一下），再生硬落回`),
      ],
      [
        '·',
        t('Approaching a hand it reaches for', '迎手时怎么凑'),
        t(`moves close → crouches → holds coiled → strikes (when the strike fits and before half of ageing; otherwise reaches)`, '靠近 → 蹲 → 蓄住 → 扑（扑得下、衰老未过半；否则伸过去）'),
        t('moves close → reaches onto the hand', '靠近 → 伸到手上'),
        t('moves close → reaches onto the hand', '靠近 → 伸到手上'),
        t(`as Warm when its draw is fast (k ≥ ${num(V2.springK)}), otherwise reaches; its moves are evenly paced (stiff)`, `抽到快的（k ≥ ${num(V2.springK)}）同热情，否则伸过去；动作匀速（生硬）`),
      ],
      row('·', t('Waits before approaching: the hand still for (s)', '凑之前手要静多久（s）'), (p) => range(p.latency)),
      [
        '·',
        t('The hand pulls free', '脱手'),
        t('chases', '追'),
        t('gives up', '放弃'),
        t('gives up, then keeps away', '放弃，之后躲'),
        t('chases half the time', '一半追一半放弃'),
      ],
      ['·', t('Searches after grasping nothing', '抓空后找几次'), '2', '1', '0', '0–2'],
      row('·', t('Near a person: breath', '人在近处：呼吸'), near('breath')),
      row('·', t('Near a person: large arm at rest', '人在近处：大触手静息'), near('arm')),
      row('·', t('Near a person: small arms', '人在近处：小触手'), near('feelers')),
      row('·', t('Near a person: voice duty', '人在近处：出声多少'), near('voice')),
    ],
    caption: t(
      `Personas. Rows 1–13 are the numbers each life is drawn from (one persona per life; the letters are slots: A Warm, B Calm, C Avoidant, D Random). D redraws every range each breath, movement or response, biased towards both ends. The rows marked · follow from them. Deliberate movements take their time ÷ k, reflexes do not. In a startle the ${num(V2.startleLatency)} s latency and the direction and timing of the ${num(V2.startleFlex)} s flexion are the same for all four; k ≥ ${num(V2.springK)} springs back to ${num(V2.recoilTo)} after ${num(V2.recoilAt)} s, k < ${num(V2.zvSlow)} curls in two steps. “Near a person” is row 13 × how near: presence band far ${num(SOCIAL.band.far)}, middle ${num(SOCIAL.band.mid)}, near ${num(SOCIAL.band.near)}; a seen hand counts ${num(DIST.far / 1000)} m → 0 to ${num(DIST.near / 1000)} m → 1, whichever is larger; it follows with time constant ${num(SOCIAL.onBase)} + ${num(SOCIAL.onLatency)}·τ and returns to 0 when nobody is there.`,
      `人格。第 1–13 行是每一世抽数用的表（一世一种人格；字母是槽位：A 热情 · B 沉静 · C 回避 · D 乱序随机）。D 每次呼吸、动作或响应都重抽区间，偏向两端。标 · 的行由它们算出。刻意的动作时长 ÷ k，反射不除。惊跳的 ${num(V2.startleLatency)} s 潜伏与 ${num(V2.startleFlex)} s 屈曲的方向、时刻四种人格相同；k ≥ ${num(V2.springK)} 的在 ${num(V2.recoilAt)} s 后弹回到 ${num(V2.recoilTo)}，k < ${num(V2.zvSlow)} 的分两步缩。「人在近处」= 第 13 行 × 人有多近：在场档远 ${num(SOCIAL.band.far)}、中 ${num(SOCIAL.band.mid)}、近 ${num(SOCIAL.band.near)}；看见了手时按手离电机轴 ${num(DIST.far / 1000)} m → 0、${num(DIST.near / 1000)} m → 1，两者取大；跟随的时间常数 ${num(SOCIAL.onBase)} + ${num(SOCIAL.onLatency)}·τ，没有人时回到 0。`,
    ),
  };
}

/** 表 03 · 惊跳与回应：同一个刺激，各人格会怎样 */
function stimulusTable(): LogTableBlock {
  return {
    kind: 'table',
    head: [
      t('Stimulus', '刺激'),
      t('Strength I', '强度 I'),
      t(`A Warm θ ${num(P.A.startle[0])}`, `A 热情 θ ${num(P.A.startle[0])}`),
      t(`B Calm θ ${num(P.B.startle[0])}`, `B 沉静 θ ${num(P.B.startle[0])}`),
      t(`C Avoidant θ ${num(P.C.startle[0])}`, `C 回避 θ ${num(P.C.startle[0])}`),
    ],
    rows: STIMULI.map(({ I, label }): LogCell[] => [
      label,
      num(I),
      JUDGEMENT[judge(I, P.A.startle[0])],
      JUDGEMENT[judge(I, P.B.startle[0])],
      JUDGEMENT[judge(I, P.C.startle[0])],
    ]),
    caption: t(
      `Startle and response. Every stimulus is a startle if I > θ: a reflex that starts after a fixed ${num(V2.startleLatency)} s, whatever the persona — the arm curls hard along the tendon axis away from the stimulus in ${num(V2.startleFlex)} s, the rings close, breath is held, a short cry; then it freezes and recovers in the persona's way (Tab. 02). Below θ it waits one reaction time τ: breath slows or stops, the small arms point at the stimulus, the arm keeps still; then it responds with a move that suits the stimulus (lean in for a stroke, nod for a tap, swing and probe for a small arm, straighten up for a knock or lift, listen for a sound). Knocks and sounds use the measured strength (0–1). Random redraws θ (${range(P.D.startle)}) for every stimulus, so it has no column. Nothing reacts in the first ${LIFE.respondAt} s of a life; a hand the machine is already reaching for does not startle it (Tab. 04).`,
      `惊跳与回应。刺激强度 I > θ 一律是惊跳：反射，固定 ${num(V2.startleLatency)} s 起动，不分人格——臂在 ${num(V2.startleFlex)} s 内沿背离刺激的腱轴猛缩、环身猛收、屏气、一声短叫；然后凝住，按人格恢复（表 02）。没到阈值时等一个反应时间 τ：呼吸放慢或停住、小触手指向刺激、臂不动；再按刺激的种类回应（抚摸倚过去、轻拍点头、碰小触手摆过去探、敲与拿起竖直挺起、声音竖起来听）。敲与声音按读数（0–1）。乱序随机每次刺激重抽 θ（${range(P.D.startle)}），所以不列。每一世诞生头 ${LIFE.respondAt} s 不回应；正在迎的手碰臂不判惊跳（表 04）。`,
    ),
  };
}

/** 表 04 · 手（指针）：看见 → 迎或躲 → 凑 → 缠 → 握 → 脱手；台架怎么把指针变成读数 */
function handTable(): LogTableBlock {
  const L = HC.armL;
  return {
    kind: 'table',
    head: [t('Step', '环节'), t('What it does', '做什么'), t('Numbers', '数')],
    rows: [
      [t('Sees it', '看见'), t('a hand that enters the field of view is seen one reaction time τ later, if it is still there; the machine does not know where a hand is until it has seen it', '手进了视野、过一个反应时间 τ 还在，才算看见；看见之前机器不知道手在哪'), t(`body heading ± ${deg(HAND.fov)}; a hand touching the arm is always in view`, `机身朝向 ± ${deg(HAND.fov)}；碰着臂的手一律算在视野里`)],
      [t('Forgets it', '忘掉'), t('out of view (or off the canvas) for a while: forgotten; seen again later = decided anew', '出了视野（或离开画布）一阵：忘掉；再看见就重新决定'), t(`${num(HAND.loseAfter)} s; not while a turn is still in progress`, `${num(HAND.loseAfter)} s；正在转身时不算，转完才开始倒数`)],
      [t('Decides', '决定'), t('when it sees the hand, then every row 9: reach (row 10), otherwise row 10′ — keep away, or look elsewhere; startled by the hand = row 10′ until the next row 9', '看见那一刻、之后每个第 9 行：按第 10 行迎，否则看第 10′ 行——躲，或看别处；被这只手吓到 = 直接换成第 10′ 行，到下一个第 9 行'), '—'],
      [t('Turns the body', '转身'), t('reach: only the arm moves if it can reach; out of reach, the body turns to line the arm up (a hand inside arm length is met beside the straight arm, not swept by it). Keep away: turns side-on', '迎：臂够得着就只动臂；够不着才转身，让臂线对准手（手在臂长以内时转到直臂停在手旁边，不让直臂扫到手）。躲：侧过身'), t(`reachable = bend ≤ ${num(HC.reachBend)} and within ${num(HC.reachFar)} × ${num(L, 1)} mm of the arm base; turns when more than ${deg(HAND.turnAt)} off, stops within ${deg(HAND.settle)}; ± 180° travel: past the stop by less than ${deg(HAND.unwindAt)} it waits there, otherwise unwinds the long way`, `够得着 = 弯曲 ≤ ${num(HC.reachBend)}、离臂基座 ≤ ${num(HC.reachFar)} × ${num(L, 1)} mm；偏出 ${deg(HAND.turnAt)} 才转、${deg(HAND.settle)} 以内停；行程 ± 180°：越限不到 ${deg(HAND.unwindAt)} 停在限位等，超过就绕回去`)],
      [t('Follows (Warm)', '陪着（热情）'), t('follows the hand all the way, close beside it', '一路跟着手走，贴在手旁'), t(`every frame, critically damped (ω ${HC.trackOmega} rad/s) toward touch + ${HC.standGap} mm from the hand, leading by ${num(HC.leadT)} s`, `每一帧按临界阻尼（ω ${HC.trackOmega} rad/s）追向离手「碰到半径 + ${HC.standGap}」mm 处，往手动的方向前看 ${num(HC.leadT)} s`)],
      [t('Follows (others)', '陪着（其余）'), t('hops and pauses, keeping just off the hand', '一跳一停，停在离手一点的地方'), t(`each hop ≥ ${num(HC.stepMin)} s, then a pause ≥ ${num(HC.stepMin)} s; stops min(${HC.standCap}, touch + ${HC.standGap} + ${num(HC.standLag)} s × hand speed) mm away`, `每跳 ≥ ${num(HC.stepMin)} s、跳完停 ≥ ${num(HC.stepMin)} s；停在离手 min(${HC.standCap}, 碰到半径 + ${HC.standGap} + ${num(HC.standLag)} s × 手速) mm`)],
      [t('Approaches', '凑'), t('the hand is still for τ and within reach: moves close, then strikes (Warm, a fast Random) or reaches onto it', '手静了一个 τ、够得着：靠近，再扑（热情、抽到快的乱序随机）或伸到手上'), t(`hand slower than ${HC.vStill} mm/s; stops ${HC.nearGap} mm outside the touch radius first; strike travel ≤ ${num(HC.strikeMax)}; lands ${HC.land} mm past the hand`, `手 < ${HC.vStill} mm/s；先停在碰到半径外 ${HC.nearGap} mm；扑的总行程 ≤ ${num(HC.strikeMax)}；落在手上 +${HC.land} mm`)],
      [t('Misses', '没碰到'), t('sighs and sags back; waits until the hand has moved before trying again', '叹一口气、垂回去；手挪开才再凑'), t(`${HC.rearmMm} mm`, `${HC.rearmMm} mm`)],
      [t('Touch', '碰到'), t('a hand it is reaching for does not startle it, is not queued and costs no reaction time', '正在迎的手碰臂：不判惊跳、不排队、不再等反应时间'), '—'],
      [t('Wraps', '缠'), t('seats on the hand in one move', '一下贴到手上'), t(`${HC.holdCenter} mm past the hand; ≥ max(${num(HC.stepMin)}, ${num(HC.seatK)} ÷ k) s`, `压过手 ${HC.holdCenter} mm；≥ max(${num(HC.stepMin)}, ${num(HC.seatK)} ÷ k) s`)],
      [t('Caught', '卡住'), t('the bench raises tension once the wrap is done and the arm has settled, with the hand still there', '缠完、臂停稳之后手还在：台架判张力'), t('or 1 s after the wrap', '或缠完 1 s 后')],
      [t('Holds', '握'), t('holds and hums; follows a slowly moving hand, the body turns when it is led off to one side', '握着、哼；手慢慢挪就跟着，牵到一边去身体跟着转'), t(`follows with τ ${num(HC.followTau)} s, bend direction ≤ ${num(HC.followRate)} rad/s; led = ${HC.vStill}–${HC.vSlow} mm/s, body turns past 25°; a reading that jumps > ${num(HC.jumpD)} or ${deg(HC.jumpDir)} is not followed`, `跟手 τ ${num(HC.followTau)} s、弯向 ≤ ${num(HC.followRate)} rad/s；牵 = ${HC.vStill}–${HC.vSlow} mm/s，偏出 25° 身体跟着转；读数一步跳 > ${num(HC.jumpD)} 或 ${deg(HC.jumpDir)} 不跟`)],
      [t('Pulled free', '脱手'), t('Warm chases, Random half the time: lunges to beside the hand, then reaches onto it; the others sigh and let go', '热情追、乱序随机一半追：先扑到手旁，再伸到手上；其余叹一口气放开'), t(`the chase ends 0.5 s after its two beats (${HC.chaseCap} s fallback)`, `两拍走完 0.5 s 后结束（兜底 ${HC.chaseCap} s）`)],
      [t('Grasped nothing', '抓空'), t('sighs, lets go, then searches around the last touch (Tab. 02); a hand still on the arm gets one more try', '叹一口气放开，再以最后碰到处为中心找（表 02）；手还搭着就再来一次'), t(`again after ${num(HC.rearm)} s`, `${num(HC.rearm)} s 后再来`)],
      [t('Keeps away', '躲'), t('turns side-on, the hand at its side and still in view; the arm bends away from the hand and tucks low; withdraws again when the hand moves', '侧过身，手在身侧、还看得见；臂背着手弯、往下压；手挪了就再收'), t(`side ${deg(HC.avoidSide)}; differential ${num(HC.avoidD)}, ${deg(HC.avoidTuck)} down; again when off by ${num(HC.reshrinkPose)}`, `侧 ${deg(HC.avoidSide)}；差动 ${num(HC.avoidD)}、往下 ${deg(HC.avoidTuck)}；姿态差 ${num(HC.reshrinkPose)} 就再收`)],
      [t('Dodges', '躲开'), t('a hand closing in, moving and near: snaps the arm away and holds it; a hand out of view does not count', '手在逼近、在动、而且近：臂甩开、定住；看不见的手不算'), t(`closing in within the last 0.25 s; ≥ ${HC.vStill} mm/s; within ${num(DIST.near / 1000)} m or ${HC.dodgeR0} mm from the arm; ${num(HC.dodgeD)} tighter, holds ${num(HC.dodgeHold)} s; ≥ ${num(HC.dodgeGap)} s apart`, `0.25 s 内在逼近；≥ ${HC.vStill} mm/s；${num(DIST.near / 1000)} m 内或离臂 < ${HC.dodgeR0} mm；再紧 ${num(HC.dodgeD)}、定 ${num(HC.dodgeHold)} s；两次之间 ≥ ${num(HC.dodgeGap)} s`)],
      [t('The hand goes', '手走了'), t('stops keeping away, the arm goes back to rest', '不再躲，臂回静息'), t(`beyond ${num(DIST.far / 1000)} m for ${num(HC.reliefT)} s, or off the canvas`, `远于 ${num(DIST.far / 1000)} m 持续 ${num(HC.reliefT)} s，或离开画布`)],
      [t('Bench: touch', '台架：碰到'), t(`inside the radius for ${num(HAND_UI.dwell)} s and slower than ${HAND_MM.maxSpeed} mm/s (a swipe does not count); pointer still ≥ ${num(HAND_UI.stillFor)} s before = the arm reached the hand (I ${num(INTENSITY.armReach)}), otherwise the hand touched the arm (I ${num(INTENSITY.arm)})`, `在半径内待够 ${num(HAND_UI.dwell)} s、指针不快于 ${HAND_MM.maxSpeed} mm/s（划过去不算）；进圈前已静止 ≥ ${num(HAND_UI.stillFor)} s = 臂伸过来碰到手（I ${num(INTENSITY.armReach)}），否则手伸过去碰臂（I ${num(INTENSITY.arm)}）`), t(`radius ${HAND_MM.touch} mm (mouse ${HAND_PX.mouse[0]}–${HAND_PX.mouse[1]} px, finger ${HAND_PX.finger[0]}–${HAND_PX.finger[1]} px); release ${HAND_MM.release} mm · anchor ${HAND_MM.anchor} mm; led slower than ${HAND_MM.tractionSpeed} mm/s`, `半径 ${HAND_MM.touch} mm（鼠标 ${HAND_PX.mouse[0]}–${HAND_PX.mouse[1]} px、手指 ${HAND_PX.finger[0]}–${HAND_PX.finger[1]} px）；松开 ${HAND_MM.release} mm · 锚点 ${HAND_MM.anchor} mm；牵着走 ≤ ${HAND_MM.tractionSpeed} mm/s`)],
      [t('Bench: readings', '台架：读数'), t(`at most every ${num(HAND_UI.send)} s when the reading changes, and while the pointer keeps moving; speed over the last ${num(TRACK.window)} s; a presence band from the distance`, `至多每 ${num(HAND_UI.send)} s 一条（读数变了、指针还在挪才发）；速度按最近 ${num(TRACK.window)} s 算；按距离给在场档`), t(`near < ${num(DIST.near / 1000)} m, far > ${num(DIST.far / 1000)} m (${HAND_UI.bandHys} mm hysteresis, ${num(HAND_UI.bandDwell)} s dwell); over the hull (radius ${R_HULL} mm, height ${num(HULL_Z[0], 0)}…${num(HULL_Z[1], 0)} mm) the hand reads as ${num(R_HULL / 1000)} m from the axis; farthest ${HAND_FAR} mm`, `近 < ${num(DIST.near / 1000)} m、远 > ${num(DIST.far / 1000)} m（滞回 ${HAND_UI.bandHys} mm、驻留 ${num(HAND_UI.bandDwell)} s）；指针射线先碰到机身外廓（半径 ${R_HULL} mm、高 ${num(HULL_Z[0], 0)}…${num(HULL_Z[1], 0)} mm）时记作离轴 ${num(R_HULL / 1000)} m；最远 ${HAND_FAR} mm`)],
      [t('Bench: clicks', '台架：点击'), t('small arm = touch it; shell: click = tap, drag = stroke, hold = hold; pressing the large arm = hand on the arm', '小触手 = 碰触须；壳：点 = 拍、拖 = 摸、按住 = 按住；按住大触手 = 手碰臂'), t(`small arm within ${BENCH_INPUT.smallArmHitPx} px; drag > ${BENCH_INPUT.strokePx} px; hold ${num(BENCH_INPUT.holdAfter)} s; large arm within ${BENCH_INPUT.armPressPx} px`, `小触手 ${BENCH_INPUT.smallArmHitPx} px 内；拖过 ${BENCH_INPUT.strokePx} px；按住 ${num(BENCH_INPUT.holdAfter)} s；大触手 ${BENCH_INPUT.armPressPx} px 内`)],
    ],
    caption: t(
      'The hand. The pointer is a person’s hand. Once it has seen the hand the machine reaches for it, keeps away from it, or looks elsewhere, by persona (Tab. 02 rows 9, 10, 10′). Each beat waits for the arm to settle before the next. Distances are world millimetres, converted to pixels for the current view, so a touch is the same physical size whatever the zoom.',
      '手。指针 = 人的手。看见以后按人格迎、躲或看别处（表 02 第 9、10、10′ 行）。每一拍都等臂停稳才进下一拍。距离一律是世界毫米，再按此刻的画面换成像素——画布多大、哪个视角，碰到的实际距离都一样。',
    ),
  };
}

/** 表 05 · 一世的时间、唤醒度、抓握、硬上限 */
function limitsTable(): LogTableBlock {
  const A = ENGINE.arousal;
  return {
    kind: 'table',
    head: [t('Quantity', '量'), t('Value', '值'), t('Why', '为什么')],
    rows: [
      [t('One life', '一世'), t(`birth ${LIFE.birth} · growth ${LIFE.grow} · ageing ${LIFE.age} ± ${LIFE.deathWindow} · dying (row 12) · blank ${LIFE.blank} s`, `诞生 ${LIFE.birth} · 成长 ${LIFE.grow} · 衰老 ${LIFE.age} ± ${LIFE.deathWindow} · 死亡（第 12 行）· 空白 ${LIFE.blank} s`), t('life clock ×1–×20 speeds up only this; breathing and movement stay real-time', '生命时钟 ×1–×20 只加快它，呼吸与动作不跟着快')],
      [t('After birth', '诞生以后'), t(`breathing eases in over ${LIFE.breathRamp} s; reacts from ${LIFE.respondAt} s; spontaneous moves and turning from ${LIFE.spontAt} s`, `呼吸 ${LIFE.breathRamp} s 缓入；${LIFE.respondAt} s 起回应；${LIFE.spontAt} s 起自发动作与转向`), '—'],
      [t('Arousal', '唤醒度'), t(`+ row 5 × I per stimulus (≤ 1), falls with ${A.tau} s; breathes (1 + ${num(A.breath)}a) × as fast and shallower (depth × (1 − ${num(A.shallow)}a)), spontaneous interval × (1 − ${num(A.spont)}a), small-arm sweep × (1 + ${num(A.feeler)}a)`, `每次刺激 + 第 5 行 × I（≤ 1），回落 ${A.tau} s；呼吸快到 (1 + ${num(A.breath)}a) 倍、变浅（幅度 × (1 − ${num(A.shallow)}a)），自发间隔 × (1 − ${num(A.spont)}a)、触须扫幅 × (1 + ${num(A.feeler)}a)`), t(`breathing is the same physiology in all four; what changes it is being stirred up: after being touched it breathes fast and shallow for a while and moves more often. Warm is stirred most (${num(P.A.gain[0])}·I), Calm hardly at all (${num(P.B.gain[0])}·I)`, `呼吸是四种人格共有的生理信号，让它变的是被搅动：被碰过之后一阵呼吸又快又浅、动得勤。热情最容易被搅动（${num(P.A.gain[0])}·I），沉静几乎不（${num(P.B.gain[0])}·I）`)],
      [t('Grasp', '抓握'), t(`wrap to the stop (hand not seen) ${num(GRASP.wrap)} s ÷ k, bench tension at ${num(CATCH_AT * 100, 0)}%; let go ${num(GRASP.release)} s ÷ k (${num(GRASP.deathRelease)} × slower when dying); bend at the stop ${num(GRASP.limit)}; holding a person very light ${num(GRASP.human)} (a seen hand: Tab. 04) · an object at least ${num(GRASP.object)}; chases at most ${GRASP.maxChases} time`, `缠到限位（没看见手时）${num(GRASP.wrap)} s ÷ k，缠到 ${num(CATCH_AT * 100, 0)}% 时台架判张力；松开 ${num(GRASP.release)} s ÷ k（死的时候慢 ${num(GRASP.deathRelease)} 倍）；限位处弯曲 ${num(GRASP.limit)}；握人极轻 ${num(GRASP.human)}（看见了的手按表 04）· 握物至少 ${num(GRASP.object)}；脱手后至多追 ${GRASP.maxChases} 次`), t('tension and touch = a person; tension only = an object; reached the stop with no tension = nothing (T-0707-1)', '张力 + 电极 = 人；只有张力 = 物；到限位没有张力 = 抓空（T-0707-1）')],
      [t('Crank', '曲柄'), t(`≤ ${num(CRANK.maxSpeed, 2)} rad/s (≤ 1° per substep, ≤ ${CRANK.maxSubsteps} substeps per frame)`, `≤ ${num(CRANK.maxSpeed, 2)} rad/s（每子步 ≤ 1°、每帧 ≤ ${CRANK.maxSubsteps} 子步）`), t('the five-ring solve stays on its branch only within 1° per substep', '五环解算每子步 1° 以内才不跳支')],
      [t('Breathing stroke speed', '呼吸行程速度'), t(`π·depth / period ≤ ${num(V2.breathRateCap)}/s after all cues`, `π·幅度 / 周期 ≤ ${num(V2.breathRateCap)}/s（叠完所有提示之后）`), t('so the crank keeps up (set from measured engine traces)', '让曲柄追得上（按引擎实测轨迹定）')],
      [t('Arm bend off the tendon axes', '离轴差动'), `≤ ${num(D_FLAT_MAX)}`, t('0.55 between two tendons was measured unstable', '两腱之间实测 0.55 失稳')],
      [t('Arm bend, overall (except the deep curl)', '差动封顶（深卷之外）'), `${num(D_MAX)}`, t('same', '同上')],
      [t('Deep curl', '深卷'), t(`startle only, to ${num(D_SPAN + D_DEEP_SPAN, 3)} (main tendon fully pulled)`, `只有惊跳用，到 ${num(D_SPAN + D_DEEP_SPAN, 3)}（主腱拉满）`), t('“use it, but not too much”', '「用，但不要用太多」')],
      [t('Strike at the hand', '扑手'), `≤ ${num(HC.strikeMax)}`, t('never as large as the same persona’s startle', '到不了同人格惊跳的一半')],
      [t('Swing', '摆动'), t('≤ 0.6 Hz; a hop-and-pause cycle ≥ 1.4 s', '≤ 0.6 Hz；一跳一停的周期 ≥ 1.4 s'), t('the arm’s passband is about 0.7 Hz', '臂的通带约 0.7 Hz')],
      [t('Body turn', '偏航'), t(`± 180°; ${num(MOTION.yawRate)} rad/s × k (startle × ${MOTION.yawRateStartle})`, `± 180°；${num(MOTION.yawRate)} rad/s × k（惊跳 × ${MOTION.yawRateStartle}）`), t('placeholder until the new turntable motor is modelled', '新转台电机定型前的占位')],
    ],
    caption: t(
      'Timing of one life, arousal, the grasp, and the hard limits set by the hardware and the solver. All other numbers in these tables are proposals awaiting the author’s decision.',
      '一世的时间、唤醒度、抓握，以及硬件与求解器给的硬上限。这些表里其余的数都是提案，待作者拍板。',
    ),
  };
}

/**
 * Lab 1-6 的附件。顺序 = 先看「人做什么、机器怎么判」（表 01），再看人格（02）、
 * 惊跳与回应（03）、手（04）、一世与上限（05）。
 */
export const LAB_1_6_TABLES: { title: Bilingual; blocks: LogTableBlock[] } = {
  title: t('Interaction tables', '交互机制表'),
  blocks: [interactionMap(), personaTable(), stimulusTable(), handTable(), limitsTable()],
};
