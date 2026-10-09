'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { COHABIT, CohabitSim, FACE_MODES, GUIDE_TARGETS, SPACE_MODES, TRIGGER_MODES, nearestNode, type GuideTarget, type Cat, type FaceMode, type SpaceMode, type TriggerMode, type Visitor } from '../../src/lib/space/cohabit';
import { PLAN, RESPONSES, type ResponseMode } from '../../src/lib/space/unit-activation';
import type { CatPose } from '../../src/lib/space/cat-rules';
import { H, W, canvasToRoom, drawPlan, readPalette, type Palette, type PlanPerson } from './planDraw';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab 2-14 · 人猫同台（2026-10-06 开工，待办第一步 1–3 + 第二步 4–5）。
 * 2-11 的访客与 2-12 的住户猫放进同一间房、同一片单元：两种代价（墙 / 停留）· R1–R5 · 四类相遇事件记账
 * · 空间的目的「促成相遇」。模型 = src/lib/space/cohabit.ts；画法复用 planDraw（墙 / R5 / 事件线三层是本轮加的）。
 * 三档「空间」给对照（会动 / 钉死 / 空房间），HUD 实时读四类事件数与猫在 1 m 外的时间占比（参照 M&T 0.78）。
 * 让路两档（2026-10-07 作者「人穿过只收相对的两个面」）：只收挡路的带 = 挡人的带各自收回到芯上（默认）；整个单元 = 2-11 的让位闸。
 * 规则两档（2026-10-07 作者「座位做据点，人分走 / 站 / 坐三种状态」+「先以 8×8 设计，座位摆在空间中间」）：
 * 「走 · 站 · 坐」（默认，8×8，标准布置）= 走着不触发、站定看猫给一步、坐着一步步把猫引到座位前方那台；痕迹（旧）= 上一版口径，留作对照。
 */
const TIME_SCALES = [1, 3, 8] as const;
const TIME_DEF = 1;
const MAX_SIM_DT = 0.05 * 8 * 1.01;

const COPY = {
  zh: {
    aria: '人与猫在同一间房的平面：访客在地面走，猫住在单元上，单元按两边的痕迹落下收回，右下读四类相遇事件',
    title: '人猫同台',
    sub: '平面 · 访客 + 住户猫 · 两种代价 · 四类事件',
    formed: (n: number, total: number) => `成形 ${n} / ${total}`,
    events: (c: Record<string, number>, s: Record<string, number>) =>
      `共视 ${c.gaze}（${s.gaze.toFixed(0)} s）· 共温 ${c.warmth}（${s.warmth.toFixed(0)} s）· 共触 ${c.touch} · 交接 ${c.pass}`,
    line: (t: number, people: number, cats: number, far: number, held: number, detour: number, bands: number | null) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${people} 人 · ${cats} 猫 · 猫在 1 m 外 ${(far * 100).toFixed(0)}%（参照 78%）· 绕行 ${detour.toFixed(1)} m${bands !== null ? ` · 让路 ${bands} 条带` : ''}${held ? ` · R5 钉住 ${held}` : ''}`,
    legend: '实墨圈 = 对人是墙 · 紫环 = 成形（缺口 = 收回的带）· 芯上短横 = R5 钉住 · 连线：绿虚 共视 / 紫 共温 / 粉 共触 / 墨 交接',
    legendSeats: '人：灰空心 走 · 墨空心 站 · 墨实心 坐 · 灰细线 = 同一组 · 猫身下灰虚线圈 = 猫在地面 · 紫点线圈 = 座位前方那台（猫被引去的地方） · 绿虚线 = 空间为猫铺的路（箭头 = 下一步）· 紫环 = 成形 · 实墨圈 = 对人是墙 · 连线：绿虚 共视 / 紫 共温 / 粉 共触',
    seats: (sitting: number, guides: number, arrivals: number) => ` · 坐着 ${sitting} · 铺路 ${guides} · 猫到座位前方那台 ${arrivals} 次`,
    hint: `用「+ 人」「+ 猫」添加人物，按住人物可拖动；猫可拖到任一单元。「自走」让访客漫步（一半几率去看猫）、猫按坐 / 卧 / 换格的节奏活动。最多 ${COHABIT.MAX_PEOPLE} 人 ${COHABIT.MAX_CATS} 猫。`,
    hintSeats: `用「+ 人」放一位访客，「+ 一组」放结伴的两人；按住人拖（拖到座位上松手 = 坐下）；猫可拖到任一单元；按住家具拖动换位置（摆不下的地方它不动），「家具」一栏加减、回到标准布置。「自走」让访客漫步：一半几率找空座坐 ${COHABIT.SEATS.SIT.min / 60}–${COHABIT.SEATS.SIT.max / 60} 分钟，否则一半几率去看猫，同组的人一起走、一起坐。最多 ${COHABIT.MAX_PEOPLE} 人 ${COHABIT.MAX_CATS} 猫。`,
    rulesSeats: '「走 · 站 · 坐」：家具是地面上独立的一层，标准布置是四张沙发、两把椅子共 10 个座，摆在房间中间、不贴墙。人有身体：一个交叉点只站一个人，过道里两人错不开身，就在交叉点等一下，等久了绕路。约七成访客结伴来（多是两人），一起走、一起坐，站着时挨着领头站。陌生人之间不再是有人靠近就走，改成挑位置时离陌生人远一点（能离 1.35 m 就离 1.35 m，不行至少 1 m），选定了就不换。猫可以从台上跳到地面，也可以跳回台上：身边人越多越想待在台上；从地面直接跳上台要多等一会儿，从沙发上借道就快。单元照常挂在家具上方，只有坐着的人头顶那几台不落（平台离地 1.08 m，比坐着的头顶低）。人走着不触发，地面也不留痕迹。站定满 3 秒、且看着一只猫，空间朝这个人给那只猫铺一步，这次站定只给一次。坐下 = 全力：空间从最近一只能来的猫脚下，一步一步铺到这个座位前方那台（离座位 1.0–1.5 m，猫卧在那儿不用付停留代价、又在共温带里）；落着的始终只有猫脚下和下一步。走不走仍是猫的事：它坐满 3 秒，旁边有一台空间递过来的，就一半几率挪过去，不走就卧下；挪窝时也优先走那台。其余照旧：落下的单元对人是墙；猫被访客贴到 1 m 以内撑过几秒就退开、之后一阵不跟人走；落下会困住人的不落；让路只收挡路的带时，挡人的那几条各自收回。',
    rules: '通行代价：落下的单元对人是墙、对猫不是。停留代价：访客被别人贴到 1.35 m 以内就走；猫被访客贴到 1 m 以内撑过几秒就退到更远的格，之后一阵不再靠人；有人站着盯着它，它有三分之一几率靠到台边。空间只写单元：猫脚下钉住，猫四邻里人的痕迹最高的一格补满，落下会困住人的不落。让路只收挡路的带：一个单元二十条带，挡在人身边或人路上的那几条各自收回到杆上（布回到顶上），其余照落；猫身下的带不收；人走到门口门正好开，走过去再落回。',
    space: '空间',
    rule: '规则',
    guide: '引导',
    grid: '格数',
    response: '响应',
    goal: '促成相遇',
    look: '转头',
    faces: '让路',
    clearance: '让位',
    threshold: '阈值',
    fade: '散掉',
    people: '人物',
    furniture: '家具',
    addSofa: '+ 沙发',
    addChair: '+ 椅子',
    removeFurn: '删掉选中',
    standard: '标准布置',
    run: '运转',
    auto: '自走',
    trace: '痕迹',
    addP: '+ 人',
    addParty: '+ 一组',
    removeP: '− 人',
    addC: '+ 猫',
    removeC: '− 猫',
    clear: '清空痕迹',
    reset: '清零计数',
    speed: '步速',
    time: '时间',
  },
  en: {
    aria: 'People and cats in one room plan: visitors walk the floor, cats live on the units, units follow both traces, the four encounter events are counted at the bottom right',
    title: 'People and cats together',
    sub: 'Plan · visitors + resident cats · two costs · four events',
    formed: (n: number, total: number) => `formed ${n} / ${total}`,
    events: (c: Record<string, number>, s: Record<string, number>) =>
      `co-gaze ${c.gaze} (${s.gaze.toFixed(0)} s) · co-warmth ${c.warmth} (${s.warmth.toFixed(0)} s) · contact ${c.touch} · crossing ${c.pass}`,
    line: (t: number, people: number, cats: number, far: number, held: number, detour: number, bands: number | null) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${people} people · ${cats} cats · cat beyond 1 m ${(far * 100).toFixed(0)}% (reference 78%) · detour ${detour.toFixed(1)} m${bands !== null ? ` · ${bands} bands giving way` : ''}${held ? ` · R5 held ${held}` : ''}`,
    legend: 'Solid ink ring = wall for people · purple ring = formed (notch = retracted band) · bar on the mast = held by R5 · links: green dashed co-gaze / purple co-warmth / rose contact / ink crossing',
    legendSeats: 'People: grey outline walking · ink outline standing · solid ink sitting · thin grey line = same party · grey dashed ring under a cat = cat on the floor · dotted purple ring = the unit in front of a seat (where a cat is led) · green dashes = the route the space lays for the cat (arrow = next step) · purple ring = formed · solid ink ring = wall for people · links: green dashed co-gaze / purple co-warmth / rose contact',
    seats: (sitting: number, guides: number, arrivals: number) => ` · ${sitting} seated · ${guides} routes · cat reached the unit in front of a seat ${arrivals}×`,
    hint: `Use “+ person” and “+ cat” to add bodies, then hold a body to drag it; a cat can be dragged onto any unit. Wander lets visitors roam (half the time towards a cat) and cats sit, lie and move between units. Up to ${COHABIT.MAX_PEOPLE} people and ${COHABIT.MAX_CATS} cats.`,
    hintSeats: `“+ person” adds a visitor, “+ party” adds two who came together; hold a person to drag (release on a seat to sit). A cat can be dragged onto any unit. Hold a piece of furniture to move it (it stays put where it does not fit); the Furniture group adds and removes pieces and restores the standard layout. Wander lets visitors roam: half the time they take a free seat for ${COHABIT.SEATS.SIT.min / 60}–${COHABIT.SEATS.SIT.max / 60} minutes, otherwise half the time they go and look at a cat; people in a party move and sit together. Up to ${COHABIT.MAX_PEOPLE} people and ${COHABIT.MAX_CATS} cats.`,
    rulesSeats: 'Walk, stand, sit: furniture is its own layer on the floor; the standard layout is four sofas and two chairs, ten seats, in the middle of the room and away from the walls. People have bodies: one person per aisle crossing; two cannot pass each other in an aisle, so one waits at the crossing and, after a while, takes another way. About seven in ten visitors come with someone (mostly in pairs); a party walks and sits together and its members stand next to whoever leads. Strangers no longer leave as soon as someone comes close; instead people pick spots away from strangers (1.35 m if they can, at least 1 m otherwise) and stay once they have chosen. Cats can jump down to the floor and back up: the more people around, the more a cat prefers the platforms; jumping straight up from the floor takes a while, going up by way of a sofa is quick. Units still hang over the furniture; only the ones over a seated person’s head stay up (platforms sit 1.08 m above the floor, below a seated head). Walking triggers nothing and leaves no trace. Standing still for 3 s while watching a cat makes the space lay one step for that cat towards the person, once per stop. Sitting down is full strength: from the nearest cat that can come, the space lays a route to the unit in front of the seat (1.0–1.5 m from the seat, where a cat pays no staying cost and is inside the co-warmth band) one step at a time; only the cat’s unit and the next step are formed. Whether to go is still the cat’s choice: after sitting for 3 s it takes an offered step half the time, otherwise it lies down, and when it moves it prefers the offered unit. The rest is unchanged: formed units are walls for people; a cat with a visitor inside 1 m for a few seconds retreats and keeps away for a while; a unit that would trap someone holds back; when only the bands in the way retract, those bands retract.',
    rules: 'Passage cost: a formed unit is a wall for people, not for cats. Staying cost: a visitor leaves when another comes within 1.35 m; a cat tolerates a visitor within 1 m for a few seconds, then retreats to a farther unit and keeps away for a while; when someone stands watching it, it approaches the platform edge one time in three. The space only writes units: the cat’s own unit stays formed, the neighbour with the strongest people trace is filled, and a unit that would trap someone is held back. Giving way with only the bands in the way: a unit has twenty bands; the few beside a person or on their route retract to the post (the cloth goes back up) while the rest come down; bands under a cat never retract; the door is open by the time the person reaches it and closes behind them.',
    space: 'space',
    rule: 'rule',
    guide: 'lead to',
    grid: 'grid',
    response: 'response',
    goal: 'promote encounters',
    look: 'look around',
    faces: 'giving way',
    clearance: 'clearance',
    threshold: 'threshold',
    fade: 'fade',
    people: 'Bodies',
    furniture: 'Furniture',
    addSofa: '+ sofa',
    addChair: '+ chair',
    removeFurn: 'remove selected',
    standard: 'standard layout',
    run: 'run',
    auto: 'wander',
    trace: 'trace',
    addP: '+ person',
    addParty: '+ party',
    removeP: '− person',
    addC: '+ cat',
    removeC: '− cat',
    clear: 'clear trace',
    reset: 'reset counts',
    speed: 'pace',
    time: 'time',
  },
} as const;

function poseOf(c: Cat): CatPose {
  if (c.mode === 'held') return 'stand';
  if (c.walker.state === 'walk') return 'walk';
  if (c.state === 'lie') return 'lie';
  if (c.state === 'approach') return 'crouch';
  return 'sit';
}

function postureOf(p: Visitor): 'walk' | 'stand' | 'sit' {
  if (p.seated) return 'sit';
  return p.walker.state === 'walk' && p.moving ? 'walk' : 'stand';
}

function sceneOf(sim: CohabitSim, showTrace: boolean, selected = -1) {
  const seats = sim.trigger === 'posture';
  const people: PlanPerson[] = sim.people.map((p) => ({
    x: p.walker.x,
    y: p.walker.y,
    heading: p.walker.heading,
    gaze: p.walker.gaze,
    // 「走 · 站 · 坐」规则下地面不留痕迹：不画视野扇面（坐着的人连让位圈也不画——四周本就没有单元）
    reach: seats ? 0 : sim.reach,
    held: p.mode === 'held',
    fov: sim.fov,
    // 只收挡路的带：画的是身体 + 让位那一小圈（带离它就收）；整个单元：画让位距离 D（芯到人）
    keepOut: seats && p.seated ? 0 : sim.faces ? sim.marginM : sim.keepOutM,
    lane: !seats && !sim.faces && sim.lane && p.moving,
    posture: seats ? postureOf(p) : undefined,
    party: sim.social ? p.party : undefined,
  }));
  for (const c of sim.cats)
    people.push({
      kind: 'cat',
      pose: poseOf(c),
      motionTime: c.phaseTime,
      bodyR: COHABIT.CAT.bodyR,
      x: c.walker.x,
      y: c.walker.y,
      heading: c.walker.heading,
      gaze: c.walker.gaze,
      reach: 0,
      held: c.mode === 'held',
      onFloor: sim.catFloor && sim.space !== 'empty' && !c.unit,
    });
  const supportIds = sim.cats.flatMap((c) => sim.supportOf(c).map((u) => u.i));
  const landing = sim.cats.find((c) => c.pending)?.pending?.i ?? null;
  return {
    layout: sim.layout,
    field: sim.field,
    catchment: sim.catchment,
    act: sim.act,
    people,
    showTrace,
    blocked: sim.clearance === null || sim.faces ? null : sim.blocked,
    bands: sim.faces && sim.space === 'live' ? { open: sim.bandOpen, hold: sim.bandHold, count: COHABIT.FACES.BANDS } : null,
    supportIds: sim.space === 'empty' ? undefined : supportIds,
    landingId: sim.space === 'empty' ? null : landing,
    walls: sim.space === 'empty' ? null : sim.wall,
    heldR5: sim.space === 'live' ? sim.heldR5 : null,
    links: sim.links,
    hideUnits: sim.space === 'empty',
    furniture: sim.furn
      ? {
          rects: sim.furn.rects,
          seats: sim.seats.map((q) => ({ x: q.x, y: q.y, meet: q.meet, taken: sim.people.some((v) => v.seat === q.i) })),
          selected,
        }
      : null,
    guides: sim.guides.map((g) => {
      const cat = sim.cats.find((c) => c.id === g.cat);
      const pts = g.path.map((i) => ({ x: sim.layout.units[i].x, y: sim.layout.units[i].y }));
      // 从猫身上起笔（它可能在台边）
      if (cat) pts[0] = { x: cat.walker.x, y: cat.walker.y };
      return { kind: g.kind, pts };
    }),
  };
}

export function CohabitNotes({ lang: explicitLang }: { lang?: 'zh' | 'en' }) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const t = COPY[lang];
  return (
    <div className="walk-notes">
      <h3>{lang === 'zh' ? tx('操作说明') : tx('How to use')}</h3>
      <p>{t.hintSeats}</p>
      <h3>{lang === 'zh' ? '规则 · 「走 · 站 · 坐」（默认）' : 'Rules · walk, stand, sit (default)'}</h3>
      <p>{t.rulesSeats}</p>
      <h3>{lang === 'zh' ? '规则 · 痕迹（旧）' : 'Rules · trace (earlier)'}</h3>
      <p>{t.rules}</p>
      <h3>{lang === 'zh' ? '读数' : 'Readings'}</h3>
      <p>
        {lang === 'zh'
          ? '四类事件按正文的定义记：共视 = 互相看着对方满 1 秒，共温 = 在对方 0.5–1.5 m 带内站满 2 秒，共触 = 距离小于 0.5 m，交接 = 走着穿过对方 1.5 m 的身体域。空事件要「招引」，人的行为里还没有，不记。「猫在 1 m 外」的占比只当参照：Mertens 与 Turner 1988 量到人不理猫时是 78%，这里不拿它拟合。'
          : 'The four events follow the text: co-gaze = looking at each other for 1 s, co-warmth = standing in the other’s 0.5–1.5 m band for 2 s, contact = closer than 0.5 m, crossing = walking through the other’s 1.5 m body domain. The empty event needs an invitation gesture, which people do not have yet, so it is not counted. The share of time the cat spends beyond 1 m is a reference only: Mertens and Turner (1988) measured 78% when people ignored the cat; nothing here is fitted to it.'}
      </p>
    </div>
  );
}

export function CohabitBench({
  active = true,
  onLight = false,
  controls = true,
  lang: explicitLang,
  workspace = false,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'zh' | 'en';
  workspace?: boolean;
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const t = COPY[lang];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<CohabitSim | null>(null);
  const palRef = useRef<Palette | null>(null);
  const runningRef = useRef(true);
  const timeRef = useRef<number>(TIME_DEF);
  const traceRef = useRef(true);
  const heldRef = useRef<{ kind: 'person' | 'cat'; id: number } | null>(null);
  /** 按住的家具：件号、按下点相对家具中心的偏移、按下时的屏幕坐标、是否已经拖起来（没拖 = 点击） */
  const furnRef = useRef<{ i: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const selRef = useRef(-1);
  const [selFurn, setSelFurn] = useState(-1);
  const select = (i: number) => {
    selRef.current = i;
    setSelFurn(i);
  };
  const [running, setRunning] = useState(true);
  const [auto, setAuto] = useState(true);
  const [showTrace, setShowTrace] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(TIME_DEF);
  const [trigger, setTrigger] = useState<TriggerMode>('posture');
  const [guideTarget, setGuideTarget] = useState<GuideTarget>(COHABIT.GUIDE.target);
  const [grid, setGrid] = useState<number>(COHABIT.SEATS.GRID);
  const [space, setSpace] = useState<SpaceMode>('live');
  const seatsMode = trigger === 'posture';
  const [mode, setMode] = useState<ResponseMode>('follow');
  const [goal, setGoal] = useState(true);
  const [faceMode, setFaceMode] = useState<FaceMode>('bands');
  const [look, setLook] = useState<boolean>(PLAN.ATTENTION.look);
  const [clearOn, setClearOn] = useState(true);
  const [clearance, setClearance] = useState<number>(PLAN.ATTENTION.clearance);
  const clearanceOpt = clearOn ? clearance : null;
  const [threshold, setThreshold] = useState<number>(PLAN.DEMO.threshold);
  const [fade, setFade] = useState<number>(PLAN.DEMO.fade);
  const [speed, setSpeed] = useState<number>(COHABIT.VISITOR.speed);
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
  const [hud, setHud] = useState(() => ({
    formed: 0,
    total: COHABIT.SEATS.GRID * COHABIT.SEATS.GRID,
    t: 0,
    people: 1,
    cats: 1,
    far: 1,
    held: 0,
    detour: 0,
    bands: 0 as number | null,
    seats: null as { sitting: number; guides: number; arrivals: number } | null,
    counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 } as Record<string, number>,
    seconds: { gaze: 0, warmth: 0, touch: 0, pass: 0 } as Record<string, number>,
  }));

  const paint = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const pal = palRef.current;
    if (!canvas || !sim || !pal) return;
    const ctx = canvas.getContext('2d');
    if (ctx) drawPlan(ctx, sceneOf(sim, traceRef.current, selRef.current), pal);
  };

  // 建仿真（换格数或规则才重建——「走 · 站 · 坐」规则的家具改了过道图；换「空间」档走 setSpace，人与猫留在原地）
  useEffect(() => {
    // 「走 · 站 · 坐」规则用按 Mertens & Turner 1988 标定的猫（COHABIT.CAT_MT）；痕迹（旧）保留演示值
    // 「走 · 站 · 坐」规则另开两组规则（作者 2026-10-08）：访客有身体、结伴、离陌生人远一点（social）；猫能下地再跳回台上，会动 / 钉死档都一样（catFloor）
    const posture = trigger === 'posture';
    const sim = new CohabitSim({ trigger, grid, space, mode, goal, look, threshold, fade, auto, clearance: clearanceOpt, lane: clearanceOpt !== null, faces: faceMode === 'bands', guide: { target: guideTarget }, cat: posture ? { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid } : undefined, social: posture, catFloor: posture });
    sim.setSpeed(speed);
    simRef.current = sim;
    heldRef.current = null;
    furnRef.current = null;
    select(-1);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, trigger]);
  useEffect(() => {
    simRef.current?.setSpace(space);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space]);
  useEffect(() => {
    simRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    if (simRef.current) simRef.current.goal = goal;
  }, [goal]);
  useEffect(() => {
    if (simRef.current) simRef.current.guide.target = guideTarget;
  }, [guideTarget]);
  useEffect(() => {
    simRef.current?.setFaces(faceMode === 'bands');
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceMode]);
  useEffect(() => {
    simRef.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    simRef.current?.setClearance(clearanceOpt);
  }, [clearanceOpt]);
  useEffect(() => {
    simRef.current?.setThreshold(threshold);
  }, [threshold]);
  useEffect(() => {
    simRef.current?.setFade(fade);
  }, [fade]);
  useEffect(() => {
    simRef.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    simRef.current?.setAuto(auto);
  }, [auto]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runningRef.current = false;
      setRunning(false);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    palRef.current = readPalette(wrap);
    const preset = planFromHash('2-14', SPACE_MODES.map((m) => m.key));
    if (preset) setSpace(preset);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastHud = useRef('');
  useBenchLoop(
    canvasRef,
    (dt) => {
      const sim = simRef.current;
      if (!sim || !palRef.current) return;
      if (runningRef.current) sim.step(Math.min(MAX_SIM_DT, dt * timeRef.current));
      paint();
      const s = sim.summary();
      const key = `${Math.floor(s.t)}|${s.formed}|${s.people}|${s.cats}|${s.ledger.counts.gaze}|${s.ledger.counts.warmth}|${s.ledger.counts.touch}|${s.ledger.counts.pass}|${s.heldR5}|${sim.faces ? s.bandsOpen : '-'}|${s.seated}|${s.guides}|${s.catArrivals}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({
          formed: s.formed,
          total: sim.layout.units.length,
          t: s.t,
          people: s.people,
          cats: s.cats,
          far: s.catFarShare,
          held: s.heldR5,
          detour: s.detour,
          bands: sim.faces && sim.space === 'live' ? s.bandsOpen : null,
          seats: sim.trigger === 'posture' ? { sitting: s.seated, guides: s.guides, arrivals: s.catArrivals } : null,
          counts: { ...s.ledger.counts },
          seconds: { ...s.ledger.seconds },
        });
      }
    },
    [],
    active,
  );

  // 指针：按住人或猫 = 拖；按空地 = 放访客
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    const hit = sim.bodyAt(x, y);
    const fi = hit ? -1 : sim.furnitureAt(x, y);
    if (hit) {
      heldRef.current = hit;
      sim.hold(hit.kind, hit.id, x, y);
      canvas.setPointerCapture(e.pointerId);
      setCursor('grabbing');
    } else if (fi >= 0) {
      // 家具：按住拖 = 挪；没拖就松开 = 点击（点在空座上 = 放一个人坐下）
      const f = sim.furniture[fi];
      furnRef.current = { i: fi, dx: x - f.x, dy: y - f.y, sx: e.clientX, sy: e.clientY, moved: false };
      select(fi);
      canvas.setPointerCapture(e.pointerId);
      setCursor('grabbing');
    } else {
      // 添加人物只走控制条按钮（master 2026-10-07）
      select(-1);
    }
    paint();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    const held = heldRef.current;
    if (held) {
      sim.drag(held.kind, held.id, x, y);
      if (!runningRef.current) paint();
      return;
    }
    const fh = furnRef.current;
    if (fh) {
      if (!fh.moved && Math.hypot(e.clientX - fh.sx, e.clientY - fh.sy) > 4) fh.moved = true;
      if (fh.moved) {
        // 按 5 cm 吸附；摆不下的位置不挪（停在上一个摆得下的地方）
        const snap = (v: number) => Math.round(v / 0.05) * 0.05;
        sim.moveFurniture(fh.i, snap(x - fh.dx), snap(y - fh.dy));
        if (!runningRef.current) paint();
      }
      return;
    }
    const next = sim.bodyAt(x, y) || sim.furnitureAt(x, y) >= 0 ? 'grab' : 'default';
    if (next !== cursor) setCursor(next);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    const fh = furnRef.current;
    if (sim && canvas && fh) {
      furnRef.current = null;
      // 点家具没拖动 = 只选中；点座位不再放人（添加人物只走按钮，master 2026-10-07）
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      setCursor('grab');
      paint();
      return;
    }
    const held = heldRef.current;
    if (!sim || !canvas || !held) return;
    sim.release(held.kind, held.id);
    heldRef.current = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    setCursor('grab');
    paint();
  };

  const bodyControls = (
    <div className={`grp${workspace ? ' walk-behaviour crowd-people' : ''}`}>
      {workspace && (
        <LabControlLabel help={['添加、移除访客或猫；清空痕迹不撤掉猫脚下的支撑；清零计数只清四类事件与占比。', 'Add or remove visitors and cats. Clearing traces keeps the cats’ support; reset counts only clears the events and shares.']} lang={lang}>
          {t.people}
        </LabControlLabel>
      )}
      <span className={workspace ? 'seg' : undefined} style={workspace ? undefined : { display: 'contents' }}>
        <button
          type="button"
          onClick={() => {
            const sim = simRef.current;
            if (!sim) return;
            const half = sim.layout.fieldM / 2;
            const x = (Math.random() * 2 - 1) * half;
            const y = (Math.random() * 2 - 1) * half;
            // 「走 · 站 · 坐」规则：落在最近一个能站的交叉点（别放进家具里）
            const k = sim.furn ? nearestNode(sim.graph, x, y) : -1;
            if (k >= 0) sim.addPerson(sim.graph.nodes[k].x, sim.graph.nodes[k].y);
            else sim.addPerson(x, y);
            paint();
          }}
        >
          {t.addP}
        </button>
        {seatsMode && (
          <button
            type="button"
            onClick={() => {
              const sim = simRef.current;
              if (!sim) return;
              const half = sim.layout.fieldM / 2;
              sim.addParty((Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half, 2);
              paint();
            }}
          >
            {t.addParty}
          </button>
        )}
        <button type="button" onClick={() => { simRef.current?.removeLastPerson(); paint(); }}>{t.removeP}</button>
        <button
          type="button"
          onClick={() => {
            const sim = simRef.current;
            if (!sim) return;
            const u = sim.layout.units[Math.floor(Math.random() * sim.layout.units.length)];
            sim.addCat(u);
            paint();
          }}
        >
          {t.addC}
        </button>
        <button type="button" onClick={() => { simRef.current?.removeLastCat(); paint(); }}>{t.removeC}</button>
        <button type="button" onClick={() => { simRef.current?.clearTraces(); paint(); }}>{t.clear}</button>
        <button type="button" onClick={() => { simRef.current?.resetLedger(); paint(); }}>{t.reset}</button>
      </span>
    </div>
  );

  const furnitureControls = (
    <div className={`grp${workspace ? ' walk-behaviour crowd-people' : ''}`}>
      <LabControlLabel help={['家具是地面上独立的一层：按住拖动换位置（摆不下、或会把一块地面围死的位置不挪），把人拖到空座上松手即坐下。加减家具、回到标准布置（四张沙发、两把椅子摆在房间中间）。只在「走 · 站 · 坐」规则下可用。', 'Furniture is its own layer on the floor: hold a piece to move it (it will not go where it does not fit or would box in a patch of floor), drag a person onto a free seat to sit them down. Add or remove pieces, or restore the standard layout (four sofas and two chairs in the middle of the room). Walk / stand / sit rule only.']} lang={lang}>
        {t.furniture}
      </LabControlLabel>
      <span className="seg">
        <button type="button" disabled={!seatsMode} onClick={() => { const sim = simRef.current; if (!sim) return; select(sim.addFurniture('sofa')); paint(); }}>{t.addSofa}</button>
        <button type="button" disabled={!seatsMode} onClick={() => { const sim = simRef.current; if (!sim) return; select(sim.addFurniture('chair')); paint(); }}>{t.addChair}</button>
        <button
          type="button"
          disabled={!seatsMode || selFurn < 0}
          onClick={() => {
            const sim = simRef.current;
            if (!sim || selRef.current < 0) return;
            sim.removeFurniture(selRef.current);
            select(-1);
            paint();
          }}
        >
          {t.removeFurn}
        </button>
        <button type="button" disabled={!seatsMode} onClick={() => { simRef.current?.resetFurniture(); select(-1); paint(); }}>{t.standard}</button>
      </span>
    </div>
  );

  return (
    <div ref={wrapRef} className={`lab-wrap${onLight ? ' on-light' : ''}${workspace ? ' walk-workbench' : ''}`}>
      <div className="lab-fig">
        <div className="walk-map" style={workspace ? undefined : { display: 'contents' }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t.aria}
            style={{ cursor, touchAction: 'none', aspectRatio: `${W}/${H}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>{tx('Lab 2-14 / Project II')}</div>
          <div>{tx(t.title)}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim" data-cohabit-events>
            {t.events(hud.counts, hud.seconds)}
            <br />
            {t.line(hud.t, hud.people, hud.cats, hud.far, hud.held, hud.detour, hud.bands)}
            {hud.seats && t.seats(hud.seats.sitting, hud.seats.guides, hud.seats.arrivals)}
          </div>
        </div>
        <div className="lab-hud bl dim">{seatsMode ? t.legendSeats : t.legend}</div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp walk-behaviour">
              <LabControlLabel help={['「走 · 站 · 坐」：房间中间摆四张沙发、两把椅子，人走着不触发，站定看猫满 3 秒给猫铺一步，坐下就一步一步把猫引到座位前方那台（只在 8×8 下）。痕迹（旧）：上一版，人的视野在地面留痕迹、单元跟痕迹落下，留作对照。', 'Walk, stand, sit: four sofas and two chairs in the middle of the room; walking triggers nothing, standing 3 s while watching a cat lays one step for it, sitting down leads a cat step by step to the unit in front of the seat (8×8 only). Trace (earlier): the previous version, where people’s gaze leaves a floor trace that the units follow, kept for comparison.']} lang={lang}>
                {t.rule}
              </LabControlLabel>
              <span className="seg">
                {TRIGGER_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={m.key === trigger ? 'active' : undefined}
                    onClick={() => {
                      setTrigger(m.key);
                      if (m.key === 'posture') setGrid(COHABIT.SEATS.GRID);
                    }}
                  >
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp walk-behaviour">
              <LabControlLabel help={['会动：单元按规则落下收回；钉死：偶数行一直落着、不响应（「走 · 站 · 坐」规则下圈死人的那几台不落）；空房间：没有单元，猫在地面走。三档给对照用，座位都一样。', 'Live: units come down and withdraw by the rules. Fixed: even rows stay formed and never respond (in the walk / stand / sit rule, units that would box someone in are left out). Empty: no units, the cat walks the floor. The three settings are for comparison and share the same seats.']} lang={lang}>
                {t.space}
              </LabControlLabel>
              <span className="seg">
                {SPACE_MODES.map((m) => (
                  <button key={m.key} type="button" className={m.key === space ? 'active' : undefined} onClick={() => setSpace(m.key)}>
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={['只收挡路的带：一个单元二十条带，挡在人身边或人路上的那几条各自收回到杆上，其余照落、猫身下的不收，门在人走到之前开好；整个单元：平台会打到人的单元整个不落（2-11 的让位闸）。', 'Only the bands in the way: a unit has twenty bands; the few beside a person or on their route retract to the post while the rest come down, bands under a cat never retract, the door opens before the person arrives. Whole unit: a unit whose platform would hit someone holds back entirely (the Lab 2-11 clearance gate).']} lang={lang}>
                {t.faces}
              </LabControlLabel>
              <span className="seg">
                {FACE_MODES.map((m) => (
                  <button key={m.key} type="button" className={m.key === faceMode ? 'active' : undefined} onClick={() => setFaceMode(m.key)}>
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={['坐着的人把猫引到哪一台。座位前方：面前 1.0–1.5 m 那台，猫在台面中心不付停留代价、又在共温带里；座位旁边：平台不盖头顶的最近一台，猫走到台边离人最近（共触只能发生在这儿）；先前方再旁边：先到前方那台，坐着的人看满 10 秒再递一步到旁边那台。只在「走 · 站 · 坐」规则下起作用。', 'Which unit a seated person leads the cat to. In front of the seat: the unit 1.0–1.5 m in front, where the cat pays no staying cost and is inside the co-warmth band. Beside the seat: the nearest unit that does not hang over the head; at its edge the cat is closest (contact can only happen here). Front, then beside: the unit in front first, then after 10 s of being watched one more step to the unit beside. Walk / stand / sit rule only.']} lang={lang}>
                {t.guide}
              </LabControlLabel>
              <span className="seg">
                {GUIDE_TARGETS.map((g) => (
                  <button key={g.key} type="button" disabled={!seatsMode} className={g.key === guideTarget ? 'active' : undefined} onClick={() => setGuideTarget(g.key)}>
                    {lang === 'zh' ? g.zh : g.en}
                  </button>
                ))}
              </span>
            </div>
            {workspace && bodyControls}
            {workspace && furnitureControls}
            <div className="grp">
              <LabControlLabel help={['4×4 是 Lab 2-8 那间房的真实单元尺寸；6×6、8×8 是等比缩小的单元。「走 · 站 · 坐」规则只有 8×8：4×4 的一台平台直径 1.04 m，一张沙发会吃掉一个象限。', '4×4 is the real unit size of the Lab 2-8 room; 6×6 and 8×8 are scaled-down units. The walk / stand / sit rule is 8×8 only: a 4×4 platform is 1.04 m across, so one sofa would take a whole quadrant.']} lang={lang}>
                {t.grid}
              </LabControlLabel>
              <span className="seg">
                {PLAN.GRIDS.map((n) => (
                  <button key={n} type="button" className={n === grid ? 'active' : undefined} disabled={seatsMode && n !== COHABIT.SEATS.GRID} onClick={() => setGrid(n)}>
                    {n}×{n}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={['跟随：痕迹褪去后收回；锁定：保留已成形的。猫脚下的单元两档都钉住。', 'Follow withdraws as traces fade; lock keeps formed units. The cat’s own unit is pinned in both.']} lang={lang}>
                {t.response}
              </LabControlLabel>
              <span className="seg">
                {RESPONSES.map((r) => (
                  <button key={r.key} type="button" className={r.key === mode ? 'active' : undefined} onClick={() => setMode(r.key)}>
                    {lang === 'zh' ? r.zh : r.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={goal}
                  title={tx(
                    seatsMode
                      ? lang === 'zh'
                        ? '空间的目的：有人坐下就一步一步把猫引到座位前方那台，有人站定看猫就给猫铺一步；关 = 单元只给猫脚下与它自己要去的那一台'
                        : 'the space’s purpose: when someone sits, lead a cat step by step to the unit in front of the seat; when someone stands watching a cat, lay one step; off = units only hold the cat’s own footing and its chosen landing'
                      : lang === 'zh'
                        ? '空间的目的：猫四邻里人的痕迹最高的一格由空间补满，把猫能走的路铺向人多的地方；关 = 单元只跟痕迹'
                        : 'the space’s purpose: the cat’s neighbour with the strongest people trace is filled, laying a route towards people; off = units only follow traces',
                  )}
                  onChange={(e) => setGoal(e.target.checked)}
                />
                {t.goal}
              </label>
              <label>
                <input type="checkbox" checked={look} onChange={(e) => setLook(e.target.checked)} />
                {t.look}
              </label>
            </div>
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={clearOn}
                  title={tx(lang === 'zh' ? '布离身体至少留这么远。只收挡路的带：离身体不到「身体 + 让位」的带收回；整个单元：平台外缘离身体不到这么远的单元整个不落（4×4 下站在交叉点的人离四邻单元中心 0.87 m，0.15 m 会把四台都闸住）' : 'how far the cloth keeps from a body. Only the bands in the way: bands closer than body + clearance retract; whole unit: a unit whose platform edge would come closer holds back entirely (at 4×4 a person at a crossing is 0.87 m from the four neighbours, so 0.15 m holds all four back)')}
                  onChange={(e) => setClearOn(e.target.checked)}
                />
                {t.clearance} {clearance.toFixed(2)} {tx('m')}
              </label>
              <input type="range" min={PLAN.CLEARANCE.min} max={PLAN.CLEARANCE.max} step={0.01} value={clearance} disabled={!clearOn} aria-label={t.clearance} style={{ width: 72 }} onChange={(e) => setClearance(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['地面读数达到阈值时单元成形；猫的落点预备用同一个数。', 'A unit forms when its floor reading reaches the threshold; the cat’s landing uses the same number.']} lang={lang}>
                {t.threshold} {threshold.toFixed(0)} {tx('s')}
              </LabControlLabel>
              <input type="range" min={1} max={40} step={1} value={threshold} disabled={seatsMode} aria-label={t.threshold} style={{ width: 84 }} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['人与猫离开后，痕迹退光所需的时间。', 'Time for a full trace to fade after people and cats leave.']} lang={lang}>
                {t.fade} {fade.toFixed(0)} {tx('s')}
              </LabControlLabel>
              <input type="range" min={2} max={60} step={1} value={fade} disabled={seatsMode} aria-label={t.fade} style={{ width: 84 }} onChange={(e) => setFade(Number(e.target.value))} />
            </div>
          </div>
          <div className="lab-ctl__row walk-playback">
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={running}
                  onChange={(e) => {
                    runningRef.current = e.target.checked;
                    setRunning(e.target.checked);
                  }}
                />
                {t.run}
              </label>
              <label>
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                {t.auto}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showTrace}
                  disabled={seatsMode}
                  onChange={(e) => {
                    traceRef.current = e.target.checked;
                    setShowTrace(e.target.checked);
                    paint();
                  }}
                />
                {t.trace}
              </label>
            </div>
            {!workspace && bodyControls}
            {!workspace && furnitureControls}
            <div className="grp">
              <LabControlLabel help={['访客在房间内行走的速度。', 'How fast visitors walk through the room.']} lang={lang}>
                {t.speed} {speed.toFixed(1)} {tx('m/s')}
              </LabControlLabel>
              <input type="range" min={PLAN.SPEED.min} max={PLAN.SPEED.max} step={0.1} value={speed} aria-label={t.speed} style={{ width: 84 }} onChange={(e) => setSpeed(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['仿真播放倍速。', 'Simulation playback rate.']} lang={lang}>
                {t.time}
              </LabControlLabel>
              <span className="seg">
                {TIME_SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={s === timeScale ? 'active' : undefined}
                    onClick={() => {
                      timeRef.current = s;
                      setTimeScale(s);
                    }}
                  >
                    ×{s}
                  </button>
                ))}
              </span>
            </div>
            {!workspace && (
              <>
                <p className="lab-ctl__hint">{seatsMode ? t.rulesSeats : t.rules}</p>
                <p className="lab-ctl__hint">{seatsMode ? t.hintSeats : t.hint}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
