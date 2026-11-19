'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { LabViewDock } from './LabCtl';
import { attachLabCamera } from './labCameraInput';
import { planFromHash } from './planHash';
import { readPalette, type Palette } from './planDraw';
import { useBenchLoop } from './useBenchLoop';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { COHABIT, CohabitSim, PACE_STUDY, partySizes, scatterCats } from '../../src/lib/space/cohabit';
import { furnitureScene, type CamLayout, type OBox } from '../../src/lib/space/cohabit-sense';
import { SCENE, TABLE_TOP, tableTopFor } from '../../src/lib/space/cohabit-solid';
import { SenseObserver, type CamKind, type SenseView } from '../../src/lib/space/sense-observer';
import {
  PIVOT,
  RIGHT,
  SENSE_VIEWS,
  SH,
  SW,
  bodyKey,
  drawSense,
  inRight,
  pickBody,
  senseFitScale,
  solidPalette,
  zUpMatrix,
  type SenseFrame,
  type SenseViewKey,
} from './senseDraw';

/**
 * Lab 2-17 · 空间怎么知道人和猫在哪（2026-11-19，作者「把它做立体的：一些平面视图，旁边生成一个低保真、用点抽象的立体模型」）。
 * 左边 = 方案 A 四台摄像头各自拍到的画面（点和线），右边 = 从这些画面抽象出来的立体模型，人是一副由点连成的骨架、猫是几个点；
 * 方案 B 只讲原理：每个身体一个点，量到四个固定点的距离定位置，再读身体朝向。
 * 场景与 2-15 同一间房、同一组人猫（6 位访客 · 4 只猫）；访客节奏取研究那一套（一坐 1.5–4 分钟），画面里才有人走动。
 * 仿真里空间仍读真值，这台只画传感器读到了什么；空间改读这些读数以后引导还管不管用，见《项目二_感知层》。
 * 遮挡几何、误差档、摄像头位置都取 cohabit-sense，与研究同一份；画法在 senseDraw。
 */

const TIME_SCALES = [1, 3, 8] as const;
const LAYOUTS: readonly { key: CamLayout; zh: string; en: string }[] = [
  { key: 'adjacent2', zh: '同墙两台', en: 'two, one wall' },
  { key: 'diagonal2', zh: '对角两台', en: 'two, opposite' },
  { key: 'corners4', zh: '四个上角', en: 'four corners' },
  { key: 'all8', zh: '四角 + 墙中点', en: 'corners + midpoints' },
];
const VIEWS: readonly { key: SenseViewKey; zh: string; en: string }[] = [
  { key: 'axon', zh: '轴测', en: 'Axon' },
  { key: 'top', zh: '俯视', en: 'Top' },
  { key: 'front', zh: '正视', en: 'Front' },
];
/** 没有指针停着时，每隔这么久换一个身体点名（立体里画它的视线 / 距离线） */
const FOCUS_EVERY = 4;

const COPY = {
  zh: {
    aria: '左边是房间四个上角的摄像头各自拍到的画面，人和猫画成点和线；右边是从这些画面抽象出的立体模型，可以拖动旋转',
    title: '空间怎么知道人和猫在哪',
    subA: '方案 A · 普通摄像头 · 两台以上看见的点交出立体位置，再读人在做什么',
    subD: '方案 A · 深度相机 · 一台看见就量得到远近，再读人在做什么',
    subB: '方案 B · 量到四个固定点的距离 · 解出位置与高度',
    scheme: '方案',
    schemeA: 'A 普通摄像头',
    schemeD: 'A 深度相机',
    schemeB: 'B 量距离',
    layout: '摄像头',
    truth: '叠上真实位置',
    run: '运转',
    reset: '重来',
    time: '时间',
    view: '视角',
    statA: (right: number, known: number, n: number) => `读对在做什么 ${right} / ${n}${known < n ? `（${n - known} 个看不清）` : ''}`,
    lineA: (tri: number, kp: number, cs: number, c: number, t: number) =>
      `${kp ? `站着的人 ${Math.round((100 * tri) / kp)}% 的点定得住` : '没有站着的人'} · 猫被看见 ${cs} / ${c} · ${t.toFixed(0)} s`,
    statB: (err: number) => `解出的位置平均差 ${err.toFixed(2)} m`,
    lineB: (flag: number, right: number, known: number, t: number) => `${flag} 个身体四段对不上 · 坐 / 站读对 ${right} / ${known} · ${t.toFixed(0)} s`,
    legendA: '实心点 = 两台以上看见、交得出位置 · 空心点加一小段 = 只有一台看见，只知道在那条视线上 · 画面里的粉色空心点 = 在画面里却被挡住，立体里粉色 × = 挡在哪 · 名字下面一行是读到的在做什么，读错了是粉色 · 指针停在谁身上画谁的视线，可拖动旋转',
    legendD: '实心点 = 深度相机量到了远近（一台就够）· 画面里的空心点 = 超出测距，只剩彩色画面里一个点 · 空心点加一小段 = 只有一条视线 · 粉色空心点 / × = 被挡住 · 名字下面一行是读到的在做什么，读错了是粉色 · 指针停在谁身上画谁的视线',
    legendB: '菱形 = 固定点 · 每段距离是一个球，弧 = 它在解出那一高度上的截面，几段弧交在一点就是位置 · 粉色虚线 = 其实隔着身体、读长了 · 粉圈 = 四段对不上 · 短线 = 读到的身体朝向 · 勾上「叠上真实位置」看差多少',
  },
  en: {
    aria: 'Left: what each camera in the four upper corners of the room sees, with people and cats drawn as points and lines. Right: the 3D model abstracted from those views, which can be dragged to rotate.',
    title: 'How the space knows where people and cats are',
    subA: 'Scheme A · ordinary cameras · points seen by two or more are placed in 3D, then read for what people are doing',
    subD: 'Scheme A · depth cameras · one camera measures how far a point is, then read for what people are doing',
    subB: 'Scheme B · distances to four fixed points · position and height solved',
    scheme: 'Scheme',
    schemeA: 'A · cameras',
    schemeD: 'A · depth cameras',
    schemeB: 'B · ranging',
    layout: 'Cameras',
    truth: 'Overlay true position',
    run: 'Run',
    reset: 'Restart',
    time: 'Time',
    view: 'View',
    statA: (right: number, known: number, n: number) => `activity read right ${right} / ${n}${known < n ? ` (${n - known} unclear)` : ''}`,
    lineA: (tri: number, kp: number, cs: number, c: number, t: number) =>
      `${kp ? `${Math.round((100 * tri) / kp)}% of standing people’s points fixed` : 'nobody standing'} · cats seen ${cs} / ${c} · ${t.toFixed(0)} s`,
    statB: (err: number) => `solved positions off by ${err.toFixed(2)} m on average`,
    lineB: (flag: number, right: number, known: number, t: number) => `${flag} bodies with disagreeing distances · sitting / standing read right ${right} / ${known} · ${t.toFixed(0)} s`,
    legendA: 'Solid point = seen by two or more cameras and placed · hollow point with a short line = seen by one, known only to lie on that sight line · pink hollow point in an image = in frame but blocked; pink × in 3D = where it is blocked · the line under each name is the activity read, pink when wrong · hover a body to draw its sight lines, drag to rotate',
    legendD: 'Solid point = the depth camera measured how far it is (one camera is enough) · hollow point in an image = beyond depth range, only a point in the colour image · hollow point with a short line = one sight line only · pink hollow point / × = blocked · the line under each name is the activity read, pink when wrong · hover a body to draw its sight lines',
    legendB: 'Diamond = fixed point · each distance is a sphere; an arc = its section at the solved height, and where the arcs meet is the position · pink dashed = actually through a body, reads long · pink ring = the four distances disagree · short line = body facing as read · tick Overlay true position to see the gap',
  },
} as const;

function buildSim(seed: number): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture',
    grid: COHABIT.SEATS.GRID,
    unit: 'square',
    cover: 'room',
    space: 'live',
    seed,
    opening: false,
    auto: true,
    faces: true,
    social: true,
    catFloor: true,
    cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid },
    guide: COHABIT.GUIDE,
    pace: PACE_STUDY,
  });
  const half = sim.layout.fieldM / 2;
  const sizes = partySizes(SCENE.people);
  sizes.forEach((sz, i) => {
    const a = (i / sizes.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(a) * half * 0.6, Math.sin(a) * half * 0.6, sz);
  });
  scatterCats(sim, SCENE.cats, seed);
  return sim;
}

/** 开场先跑几秒：人猫散开、有几台单元落下，第一眼就有东西可看 */
const WARMUP = 12;

export function SenseBench({
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
  const obsRef = useRef<SenseObserver | null>(null);
  const orbitRef = useRef<OrbitCamera | null>(null);
  const palRef = useRef<Palette | null>(null);
  const furnRef = useRef<{ key: unknown; boxes: OBox[] }>({ key: null, boxes: [] });
  const seedRef = useRef<number>(SCENE.seed);
  const viewRef = useRef<SenseView>('camera');
  const kindRef = useRef<CamKind>('rgb');
  const layoutRef = useRef<CamLayout>('corners4');
  const truthRef = useRef(false);
  const runningRef = useRef(true);
  const timeRef = useRef<number>(1);
  const langRef = useRef(lang);
  langRef.current = lang;
  const hoverRef = useRef<string | null>(null);
  const pinRef = useRef<string | null>(null);
  const focusRef = useRef<{ key: string | null; t: number }>({ key: null, t: 0 });
  const dragRef = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [view, setView] = useState<SenseView>('camera');
  const [kind, setKind] = useState<CamKind>('rgb');
  const [layout, setLayout] = useState<CamLayout>('corners4');
  const [truth, setTruth] = useState(false);
  const [running, setRunning] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [viewKey, setViewKey] = useState<SenseViewKey>('axon');
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing' | 'pointer'>('default');
  const [hud, setHud] = useState({ standTri: 0, standKp: 0, catsSeen: 0, cats: 0, losOk: 0, bodies: 0, readRight: 0, readKnown: 0, flagged: 0, tagErr: 0, tagRight: 0, tagKnown: 0, t: 0 });

  const frameOf = (): SenseFrame | null => {
    const sim = simRef.current;
    const obs = obsRef.current;
    const orbit = orbitRef.current;
    if (!sim || !obs || !orbit) return null;
    if (furnRef.current.key !== sim.furn) furnRef.current = { key: sim.furn, boxes: furnitureScene(sim) };
    const rects = sim.furn?.rects ?? [];
    return {
      view: viewRef.current,
      obs,
      layout: sim.layout,
      degree: sim.act.degree,
      topOf: (u) => {
        const f = sim.tableBy[u];
        return f >= 0 && rects[f] ? tableTopFor(rects[f]) : TABLE_TOP.stand;
      },
      furn: furnRef.current.boxes,
      orbit,
      truth: truthRef.current,
      hover: hoverRef.current ?? pinRef.current,
      focus: focusRef.current.key,
      lang: langRef.current,
    };
  };

  const paint = () => {
    const canvas = canvasRef.current;
    const pal = palRef.current;
    const f = frameOf();
    if (!canvas || !pal || !f) return;
    const ctx = canvas.getContext('2d');
    if (ctx) drawSense(ctx, f, pal);
  };

  /** 新开一场：同一个种子从头跑，先跑 WARMUP 秒 */
  const rebuild = () => {
    const sim = buildSim(seedRef.current);
    const obs = new SenseObserver(sim.layout.roomM, layoutRef.current, seedRef.current, kindRef.current);
    const dt = 1 / 20;
    for (let s = 0; s < WARMUP; s += dt) sim.step(dt);
    obs.update(sim, dt);
    obs.update(sim, 0.2);
    simRef.current = sim;
    obsRef.current = obs;
    furnRef.current = { key: null, boxes: [] };
    focusRef.current = { key: null, t: 0 };
    pinRef.current = null;
  };

  const goView = (k: SenseViewKey) => {
    const orbit = orbitRef.current;
    const sim = simRef.current;
    if (!orbit || !sim) return;
    setViewKey(k);
    orbit.setOrientation(zUpMatrix(SENSE_VIEWS[k].yaw, SENSE_VIEWS[k].elev));
    orbit.retarget(PIVOT, senseFitScale(sim.layout.roomM, k));
    paint();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(SW * dpr);
    canvas.height = Math.round(SH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    palRef.current = solidPalette(readPalette(wrap));
    const preset = planFromHash('2-17', ['camera', 'rgb', 'depth', 'tag', ...LAYOUTS.map((l) => l.key.toLowerCase())]);
    if (preset === 'tag') {
      viewRef.current = 'tag';
      setView('tag');
    } else if (preset === 'depth') {
      kindRef.current = 'depth';
      setKind('depth');
    } else if (preset && preset !== 'camera' && preset !== 'rgb') {
      const l = LAYOUTS.find((x) => x.key.toLowerCase() === preset)!.key;
      layoutRef.current = l;
      setLayout(l);
    }
    rebuild();
    const sim = simRef.current!;
    const orbit = new OrbitCamera({
      cx: RIGHT.x + RIGHT.w / 2,
      cy: RIGHT.y + RIGHT.h / 2,
      pivot: PIVOT,
      scale: senseFitScale(sim.layout.roomM, 'axon'),
      mode: 'turntable',
      upAxis: 'z',
      // 横拖要让模型跟着手转（往右拖，近处那一侧往右走），与 Y 朝上那几台台架一致；
      // 相机的 Z 朝上转盘按默认正号环绕时近处那一侧往左走（2026-11-19 作者「拖动是反的」）。竖拖不用翻。
      yawPerPx: -0.008,
      zoomMin: 0.6,
      zoomMax: 3,
    });
    orbit.setOrientation(zUpMatrix(SENSE_VIEWS.axon.yaw, SENSE_VIEWS.axon.elev));
    orbitRef.current = orbit;
    const detach = attachLabCamera(canvas, {
      wheel: (delta) => {
        orbit.wheel(delta);
        paint();
      },
      home: () => {
        orbit.reset();
        goView('axon');
      },
    });
    paint();
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastHud = useRef('');
  useBenchLoop(
    canvasRef,
    (dt) => {
      const sim = simRef.current;
      const obs = obsRef.current;
      if (!sim || !obs || !palRef.current) return;
      if (runningRef.current) {
        let left = dt * timeRef.current;
        const total = left;
        while (left > 1e-9) {
          const h = Math.min(0.05, left);
          sim.step(h);
          left -= h;
        }
        obs.update(sim, total);
        // 没有指针停着、也没点名时，轮着画一个身体的视线 / 距离线
        const fr = focusRef.current;
        fr.t += dt;
        const keys = obs.bodies.map(bodyKey);
        if (!fr.key || !keys.includes(fr.key) || fr.t >= FOCUS_EVERY) {
          const i = fr.key ? keys.indexOf(fr.key) : -1;
          fr.key = keys.length ? keys[(i + 1) % keys.length] : null;
          fr.t = 0;
        }
      }
      paint();
      const s = obs.stats();
      const key = `${s.standTri}|${s.standKp}|${s.catsSeen}|${s.cats}|${s.readRight}|${s.readKnown}|${s.flagged}|${s.tagErr.toFixed(2)}|${s.tagRight}|${s.tagKnown}|${s.bodies}|${Math.floor(sim.t)}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({ ...s, t: sim.t });
      }
    },
    [],
    active,
  );

  const toCanvas = (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SW, y: ((e.clientY - r.top) / r.height) * SH };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    if (inRight(p.x, p.y)) {
      orbitRef.current?.pointerDown(e.pointerId, e.clientX, e.clientY, e.button === 2);
      dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件没有活动的 pointerId */
      }
      setCursor('grabbing');
    } else dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (d && d.id === e.pointerId && orbitRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
      orbitRef.current.pointerMove(e.pointerId, e.clientX, e.clientY);
      if (!runningRef.current) paint();
      return;
    }
    const f = frameOf();
    if (!f) return;
    const p = toCanvas(e);
    const hit = pickBody(f, p.x, p.y);
    hoverRef.current = hit;
    setCursor(hit ? 'pointer' : inRight(p.x, p.y) ? 'grab' : 'default');
    if (!runningRef.current) paint();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    orbitRef.current?.pointerUp(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d && !d.moved) {
      // 点一下：点在身体上 = 一直画它；点空处 = 回到轮流点名
      const f = frameOf();
      const p = toCanvas(e);
      pinRef.current = f ? pickBody(f, p.x, p.y) : null;
    }
    const p = toCanvas(e);
    setCursor(hoverRef.current ? 'pointer' : inRight(p.x, p.y) ? 'grab' : 'default');
    paint();
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
    setCursor('default');
    if (!runningRef.current) paint();
  };

  const pickScheme = (v: SenseView, k: CamKind = kindRef.current) => {
    viewRef.current = v;
    setView(v);
    if (k !== kindRef.current) {
      kindRef.current = k;
      setKind(k);
      const sim = simRef.current;
      const obs = obsRef.current;
      if (sim && obs) {
        obs.setKind(k);
        obs.update(sim, 0);
      }
    }
    paint();
  };
  const pickLayout = (l: CamLayout) => {
    layoutRef.current = l;
    setLayout(l);
    const sim = simRef.current;
    const obs = obsRef.current;
    if (sim && obs) {
      obs.setLayout(l, sim.layout.roomM);
      obs.update(sim, 0);
    }
    paint();
  };

  const isA = view === 'camera';
  return (
    <div ref={wrapRef} className={`lab-wrap${onLight ? ' on-light' : ''}${workspace ? ' solid-workbench' : ''}`}>
      <div className="lab-fig">
        <div className="solid-map">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t.aria}
            style={{ cursor, touchAction: 'none', aspectRatio: `${SW}/${SH}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>{tx('Lab 2-17 / Project II')}</div>
          <div>{t.title}</div>
          <div className="dim">{isA ? (kind === 'depth' ? t.subD : t.subA) : t.subB}</div>
        </div>
        <div className="lab-hud br">
          <div className="num" data-sense-stat>{isA ? t.statA(hud.readRight, hud.readKnown, hud.bodies) : t.statB(hud.tagErr)}</div>
          <div className="dim">{isA ? t.lineA(hud.standTri, hud.standKp, hud.catsSeen, hud.cats, hud.t) : t.lineB(hud.flagged, hud.tagRight, hud.tagKnown, hud.t)}</div>
        </div>
        <div className="lab-hud bl dim">{isA ? (kind === 'depth' ? t.legendD : t.legendA) : t.legendB}</div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp">
              <LabControlLabel
                help={[
                  'A 普通摄像头：房间上角的摄像头拍画面，两台以上同时看见的点交出立体位置，只有一台看见的点只知道在那条视线上。A 深度相机：每台还量得到点有多远，一台看见就定得住，但只在 0.5–5.5 m 以内、视场也窄一些。两种摄像头都从解出来的关键点读人在做什么：胯和头的高度分站和坐，一秒里挪了多远分走和站，脸朝哪（看得见脸时）或两肩朝哪定视线，视线 ±25°、3 m 以内的猫算在看。B：每个人、每只猫身上一个点，量到四个固定点的距离，用最小二乘解出位置和高度；隔着身体量的那段读长，四段就对不上，但看不出是哪一段。几种只换读法，场景不变。',
                  'A · cameras: cameras in the upper corners record images; a point seen by two or more is placed in 3D, a point seen by one is known only to lie on that sight line. A · depth cameras: each camera also measures how far the point is, so one camera is enough, but only from 0.5 to 5.5 m and with a narrower view. Both read what people are doing from the solved points: hip and head height tell standing from sitting, how far the body moved in a second tells walking, the face (when seen) or the shoulders give where someone looks, and a cat within ±25° and 3 m of that counts as watched. B: one point on each person and cat; its distances to four fixed points are solved by least squares for position and height; a distance measured through a body reads long and the four stop agreeing, but which one is wrong cannot be told. The scene stays the same when switching.',
                ]}
                lang={lang}
              >
                {t.scheme}
              </LabControlLabel>
              <span className="seg">
                <button type="button" className={isA && kind === 'rgb' ? 'active' : undefined} onClick={() => pickScheme('camera', 'rgb')}>
                  {t.schemeA}
                </button>
                <button type="button" className={isA && kind === 'depth' ? 'active' : undefined} onClick={() => pickScheme('camera', 'depth')}>
                  {t.schemeD}
                </button>
                <button type="button" className={!isA ? 'active' : undefined} onClick={() => pickScheme('tag')}>
                  {t.schemeB}
                </button>
              </span>
            </div>
            <div className="grp">
              <LabControlLabel
                help={[
                  '摄像头装在哪几个上角（3.4 m 高，在收起的单元下沿以下）。两台交叉时同一面墙两台、对角两台各有看不到的地方；研究里四个上角能让站着的人 96% 的时间被两台同时看见。只对方案 A 起作用。',
                  'Which upper corners hold cameras (3.4 m up, below the stowed units). With two crossing cameras, either on one wall or in opposite corners, some places are seen by only one or none; in the study four corners kept standing people in view of two cameras 96% of the time. Scheme A only.',
                ]}
                lang={lang}
              >
                {t.layout}
              </LabControlLabel>
              <span className="seg">
                {LAYOUTS.map((l) => (
                  <button key={l.key} type="button" disabled={!isA} className={l.key === layout ? 'active' : undefined} onClick={() => pickLayout(l.key)}>
                    {lang === 'zh' ? l.zh : l.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={truth}
                  onChange={(e) => {
                    truthRef.current = e.target.checked;
                    setTruth(e.target.checked);
                    paint();
                  }}
                />
                {t.truth}
              </label>
            </div>
          </div>
          <div className="lab-ctl__row">
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
              <button
                type="button"
                onClick={() => {
                  seedRef.current += 1;
                  rebuild();
                  runningRef.current = true;
                  setRunning(true);
                  paint();
                }}
              >
                {t.reset}
              </button>
            </div>
            <div className="grp">
              <LabControlLabel help={['仿真播放倍速。', 'Simulation playback rate.']} lang={lang}>
                {t.time}
              </LabControlLabel>
              <span className="seg">
                {TIME_SCALES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={k === timeScale ? 'active' : undefined}
                    onClick={() => {
                      timeRef.current = k;
                      setTimeScale(k);
                    }}
                  >
                    ×{k}
                  </button>
                ))}
              </span>
            </div>
            <LabViewDock>
              <LabControlLabel help={['右边立体模型的机位：轴测、俯视或正视；也可以在右边拖动旋转。', 'Camera for the 3D model on the right: axonometric, top or front; you can also drag it to rotate.']} lang={lang}>
                {t.view}
              </LabControlLabel>
              <span className="seg">
                {VIEWS.map((v) => (
                  <button key={v.key} type="button" className={v.key === viewKey ? 'active' : undefined} onClick={() => goView(v.key)}>
                    {lang === 'zh' ? v.zh : v.en}
                  </button>
                ))}
              </span>
            </LabViewDock>
          </div>
        </div>
      ) : null}
    </div>
  );
}
