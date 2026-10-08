/**
 * 日志记录 → 一句人读的话（台架 HUD 用，中英两份）。纯函数。
 *
 * 措辞守 THESIS_NOTES：写**行为**不写感受——「惊跳」（startle reflex 的通行译名）而不是
 * 「害怕」，「转向人」而不是「想看你」。生命感是观众的知觉，HUD 不替机器宣布情绪。
 */

import type { Phase } from './life';
import type { LogRecord, LogValue } from './log';
import { PERSONAS, type PersonaKey } from './persona';

export type DescribeLang = 'zh' | 'en';
type Pair = readonly [zh: string, en: string];

const pick = (p: Pair, lang: DescribeLang): string => (lang === 'zh' ? p[0] : p[1]);

export const PHASE_NAMES: Record<Phase, Pair> = {
  BIRTH: ['诞生', 'Birth'],
  GROW: ['成长', 'Growth'],
  AGE: ['衰老', 'Ageing'],
  DEATH: ['死亡', 'Dying'],
  BLANK: ['空白', 'Blank'],
  END: ['结束', 'End'],
};

export function phaseName(p: Phase, lang: DescribeLang): string {
  return pick(PHASE_NAMES[p], lang);
}

export function personaName(k: PersonaKey, lang: DescribeLang): string {
  return lang === 'zh' ? PERSONAS[k].zh : PERSONAS[k].en;
}

const OUTCOME: Record<string, Pair> = {
  respond: ['回应', 'responds'],
  startle: ['惊跳', 'startles'],
  busy: ['正忙', 'busy'],
  muted: ['不响应', 'no response'],
};

const BAND: Record<string, Pair> = {
  gone: ['人离开', 'person leaves'],
  far: ['人在远处', 'person far'],
  mid: ['人在中距离', 'person mid-range'],
  near: ['人靠近', 'person near'],
};
const SHELL_TOUCH: Record<string, Pair> = {
  pat: ['轻拍壳', 'shell pat'],
  stroke: ['抚摸壳', 'shell stroke'],
  poke: ['戳壳', 'shell poke'],
};
const SIDE: Record<string, Pair> = { L: ['左', 'L'], R: ['右', 'R'], both: ['两侧', 'both'] };
const SPONT: Record<string, Pair> = {
  curl: ['卷臂', 'curls arm'],
  sway: ['扫臂', 'sweeps arm'],
  flick: ['抖触须', 'flicks feelers'],
  sigh: ['叹气', 'sighs'],
  search: ['搜寻', 'searches'],
};
const ORIENT: Record<string, Pair> = {
  toward: ['转向人', 'turns to person'],
  away: ['背过身', 'turns away'],
  random: ['四处看', 'looks around'],
  final: ['最后朝向人', 'final turn to person'],
  unwind: ['转台到限位，绕回去', 'turntable at its limit, turns back the long way'],
};
const HAND_MODE: Record<string, Pair> = {
  toward: ['迎过去', 'reaches toward it'],
  away: ['背过身', 'turns away'],
  look: ['看别处', 'looks elsewhere'],
};
const HAND_LOST: Record<string, Pair> = {
  gone: ['手离开', 'hand gone'],
  unseen: ['手出了视野', 'hand out of view'],
};
/** 迎手链（v2）的阶段与拍 */
const HC_STAGE: Record<string, Pair> = {
  off: ['不再跟手', 'stops following'],
  track: ['陪着手', 'keeps pace with the hand'],
  approach: ['凑过去', 'closes in'],
  strain: ['够不着 · 探身', 'stretches for it'],
  watch: ['看着手', 'watches the hand'],
  wrap: ['缠', 'wraps'],
  hold: ['握着', 'holding'],
  chase: ['追', 'goes after it'],
  release: ['放开', 'lets go'],
  search: ['找', 'searches'],
  avoid: ['侧身躲开', 'turns aside'],
};
const HC_BEAT: Record<string, Pair> = {
  transport: ['靠近', 'moves closer'],
  edge: ['试探着靠近', 'edges closer'],
  wait: ['停住', 'pauses'],
  retreat: ['退一点', 'backs off a little'],
  wait2: ['再停', 'pauses again'],
  edge2: ['再靠近', 'edges in again'],
  hover: ['停半拍', 'holds just short'],
  crouch: ['蹲', 'crouches'],
  cocked: ['蓄住', 'holds, coiled'],
  pounce: ['扑', 'pounces'],
  sight: ['瞄准', 'takes aim'],
  reach: ['伸过去', 'reaches'],
  touch: ['慢慢碰', 'touches slowly'],
  curl: ['卷过去', 'curls over'],
  nudge: ['推一下', 'nudges'],
  balk: ['停住不前', 'stops short'],
  stall: ['愣住', 'stalls'],
  drop: ['撤开', 'pulls away'],
  grab: ['抓住', 'grabs'],
  receive: ['接住', 'takes it'],
  regrab: ['再抓', 'grabs again'],
  let: ['一松', 'lets slip'],
  lunge: ['扑过去', 'lunges after it'],
  creep: ['摸过去', 'creeps over'],
  grope: ['摸索', 'gropes'],
  letSlow: ['一松', 'lets slip'],
  extend: ['伸过去送', 'reaches after it'],
  linger: ['停着', 'lingers'],
  sag: ['垂下', 'sags'],
  palpate: ['摸一摸', 'feels around'],
  open: ['慢慢张开', 'opens slowly'],
  giveUp: ['放弃', 'gives up'],
  cast: ['来回找', 'casts about'],
  deflate: ['垂下来', 'sinks'],
  stretch: ['探身', 'stretches'],
  peek: ['偷看', 'peeks'],
  snap: ['缩回', 'snaps back'],
  cringe: ['一缩', 'cringes'],
  reshrink: ['再收', 'shrinks back'],
  relief: ['呼一口气', 'exhales'],
};

/** 守门用（describe.test 逐条查措辞） */
export const HAND_STAGE_TEXT: { stage: Readonly<Record<string, Pair>>; beat: Readonly<Record<string, Pair>> } = { stage: HC_STAGE, beat: HC_BEAT };

const LOST: Record<string, Pair> = {
  chase: ['脱手 · 追', 'loses grip · chases'],
  giveUp: ['脱手 · 放弃', 'loses grip · gives up'],
};

const num = (v: LogValue | undefined, d = 1): string => (typeof v === 'number' ? v.toFixed(d) : '');
const str = (v: LogValue | undefined): string => (typeof v === 'string' ? v : '');

/** 事件本身那半句（不含去向） */
function what(r: LogRecord, lang: DescribeLang): string {
  const p = r.p ?? {};
  const zh = lang === 'zh';
  switch (r.ev) {
    // —— 传感
    case 'PRESENCE':
      return pick(BAND[str(p.band)] ?? ['在场', 'presence'], lang);
    case 'FEELER_TOUCH':
      return zh ? `碰触须 ${Number(p.feeler) + 1}` : `feeler ${Number(p.feeler) + 1} touched`;
    case 'SHELL_STROKE': {
      const t = pick(SHELL_TOUCH[str(p.touch)] ?? ['碰壳', 'shell touch'], lang);
      return `${t}${zh ? '（' : ' ('}${pick(SIDE[str(p.half)] ?? ['?', '?'], lang)}${zh ? '）' : ')'}`;
    }
    case 'SHELL_HOLD':
      return p.on ? (zh ? '按住壳' : 'shell held') : zh ? '松开壳' : 'shell released';
    case 'LIFT':
      return p.lifted ? (zh ? '被拿起' : 'lifted') : zh ? '被放下' : 'put down';
    case 'KNOCK':
      return zh ? '敲' : 'knock';
    case 'SOUND':
      return Number(p.level) >= 0.6 ? (zh ? '拍手声' : 'clap') : zh ? '说话声' : 'voice';
    case 'ARM_TOUCH':
      return p.on ? (zh ? '手碰臂' : 'arm touched') : zh ? '手离开臂' : 'hand off arm';
    case 'RESISTANCE':
      return p.on ? (zh ? '臂里有张力' : 'tension on') : zh ? '张力消失' : 'tension off';
    case 'HAND':
      return p.on === false ? (zh ? '手移开' : 'hand away') : zh ? '手在动' : 'hand moves';
    // —— 引擎
    case 'RESPONSE':
      return zh ? `回应（${num(p.latency)} s）` : `response (${num(p.latency)} s)`;
    case 'RESPONSE_DROP':
      return zh ? '响应作废' : 'response dropped';
    case 'STARTLE':
      return zh ? '惊跳' : 'startle';
    case 'REFLEX':
      return zh ? `触须 ${Number(p.feeler) + 1} 反射` : `feeler ${Number(p.feeler) + 1} reflex`;
    case 'SPONTANEOUS':
      return pick(SPONT[str(p.action)] ?? ['自发动作', 'spontaneous'], lang);
    case 'ORIENT':
      return pick(ORIENT[str(p.mode)] ?? ['转向', 'turns'], lang);
    case 'GRASP_START':
      return p.chase ? (zh ? '再缠' : 'wraps again') : zh ? '缠' : 'wraps';
    case 'GRASP_HOLD_HUMAN':
      return zh ? '握住手' : 'holds hand';
    case 'GRASP_HOLD_OBJECT':
      return zh ? '握住物件' : 'holds object';
    case 'GRASP_EMPTY':
      return zh ? '抓空' : 'grasps nothing';
    case 'GRASP_LOST':
      return pick(LOST[str(p.reaction)] ?? ['脱手', 'loses grip'], lang);
    case 'RELEASE_DONE':
      return zh ? '松开' : 'released';
    case 'CONTACT':
      return zh ? '手还在臂上' : 'hand still on arm';
    case 'HAND_SEEN': {
      const m = pick(HAND_MODE[str(p.mode)] ?? ['看着', 'watches'], lang);
      if (p.cause === 'startle') return zh ? `惊跳之后 · ${m}` : `after the startle · ${m}`;
      if (p.again) return zh ? `再看手一眼 · ${m}` : `looks at the hand again · ${m}`;
      return zh ? `注意到手 · ${m}` : `notices the hand · ${m}`;
    }
    case 'HAND_LOST':
      return pick(HAND_LOST[str(p.reason)] ?? ['手不见了', 'hand lost'], lang);
    case 'HAND_STAGE': {
      const st = pick(HC_STAGE[str(p.stage)] ?? ['手', 'hand'], lang);
      const b = HC_BEAT[str(p.beat)];
      return b ? `${st} · ${pick(b, lang)}` : st;
    }
    case 'LIFE_BIRTH':
      return zh ? `诞生 · ${personaName(r.persona, 'zh')}` : `born · ${personaName(r.persona, 'en')}`;
    case 'LIFE_GROW':
      return zh ? '进入成长' : 'growth';
    case 'LIFE_AGE':
      return zh ? '开始衰老' : 'ageing begins';
    case 'LIFE_DEATH_START':
      return zh ? '开始死亡' : 'dying begins';
    case 'LIFE_DEATH':
      return zh ? '死亡' : 'death';
    case 'SESSION_END':
      return zh ? '会话结束' : 'session ended';
    // —— 台架操作
    case 'RATE':
      return zh ? `生命时钟 ×${num(p.rate, 0)}` : `life clock ×${num(p.rate, 0)}`;
    case 'SKIP':
      return zh ? '跳到下一段' : 'skipped stage';
    default:
      return r.ev;
  }
}

/** 一条记录的一句话：传感事件带去向（「轻拍壳（左）→ 回应」），去向为 none 时不带 */
export function describeRecord(r: LogRecord, lang: DescribeLang): string {
  const w = what(r, lang);
  const o = r.out ? OUTCOME[r.out] : undefined;
  return o ? `${w} → ${pick(o, lang)}` : w;
}
