import { describe, expect, it } from 'vitest';
import { PERSONAS, type PersonaKey } from './persona';
import { ARM_OSC_MAX_HZ, D_FLAT_MAX, D_SPAN, type Phase, type Pose } from './programs';
import { type BuildCtx, PEAK, buildStartle, dOf, pathLen, tierSpeed } from './vocab2';
import {
  type ApproachBeat,
  CHASE_PLAN,
  HC,
  HOLD_CUE,
  type HandGeom,
  approachPlan,
  atMm,
  avoidPose,
  buildApproachBeat,
  buildChaseBeat,
  buildDodge,
  buildGiveUp,
  buildHop,
  buildSag,
  buildSearch,
  buildShrink,
  buildTake,
  buildWrap,
  endPose,
  flatH,
  gainAt,
  handArmGap,
  holdDrive,
  pounceGeom,
  trackTarget,
} from './vocab2-hand';

/**
 * 迎手链程序表（vocab2-hand.ts）的守门。这些表要交给固件照表执行，坏了不报错，只会让「迎」追上惊跳、
 * 在段界处顿一下、或者走进两腱之间失稳的区域。2026-10-19 交互机制整合后逐条卡：
 *   ① 一击追不上惊跳（扑的行程 ≤ 0.22、速率 ≤ 快档；躲开 / 扑过去 ≤ 快档；其余 ≤ 常速档）；
 *   ② 不出臂的通带（摆动 ≤ 0.6 Hz、一跳一停的周期 ≥ 1.4 s）；
 *   ③ 离轴 ≤ 0.48、不带深卷；
 *   ④ 身体通道不是惊跳的（不猛收、不 chirp、触须不张开、灯不闪）；
 *   ⑤ 人格看得见的那一处：热情 / 快的乱序随机蹲一下再扑，其余直接伸过去；
 *   ⑥ 缠一下贴上、握着跟着手、躲的姿态固定；表是纯数据（JSON 往返无损）。
 */
/** √k_v 与 τ 按人格表（区间：D 取 0.9 / 1.2，落在中间——不扑） */
const K: Record<PersonaKey, number> = { A: Math.sqrt(3 / 1.5), B: Math.sqrt(0.5 / 1.5), C: Math.sqrt(2 / 1.5), D: 0.9 };
const TAU: Record<PersonaKey, number> = { A: 0.2, B: 2.5, C: 0.3, D: 1.2 };

function ctx(persona: PersonaKey, cur: Pose = { bend: 0.25, dir: 0.4, deep: 0 }, over: Partial<BuildCtx> = {}): BuildCtx {
  return {
    persona,
    temper: PERSONAS[persona].temper,
    k: K[persona],
    tau: TAU[persona],
    gAbs: 0.3,
    vigor: 1,
    ageU: 0,
    breathAmp: 0.5,
    period: 4,
    rest: { bend: 0.25, dir: 0.4, deep: 0 },
    cur,
    rnd: () => 0.5,
    ...over,
  };
}
const geom = (o: Partial<HandGeom> = {}): HandGeom => ({ Dh: 0.27, dir: 0.62, r: 280, touch: 32, v: 0, ...o });

/** 一串段的每一段：起点、终点、隐含的峰速（差动/秒） */
function walk(phases: readonly Phase[], c: BuildCtx): { p: Phase; from: Pose; to: Pose; v: number }[] {
  let at = c.cur;
  return phases.map((p) => {
    const to = p.arm === 'hold' ? at : p.arm === 'rest' ? c.rest : p.arm;
    const v = p.ease === 'hold' || p.dur <= 0 ? 0 : (PEAK[p.ease] * pathLen(at, to, p.path)) / p.dur;
    const r = { p, from: at, to, v };
    at = to;
    return r;
  });
}

const ALL_BEATS: ApproachBeat[] = ['transport', 'crouch', 'cocked', 'pounce', 'reach'];
/** 快档的段：扑、躲开、扑过去（脱手后追） */
const FAST = new Set(['pounce', 'dodge', 'lunge']);

/** 所有表（不含握持控制器），按人格 × 几个手位 */
function allTables(): { name: string; c: BuildCtx; phases: Phase[] }[] {
  const out: { name: string; c: BuildCtx; phases: Phase[] }[] = [];
  for (const P of ['A', 'B', 'C', 'D'] as PersonaKey[]) {
    for (const g of [geom(), geom({ Dh: 0.12, r: 330 }), geom({ Dh: 0.45, r: 180, dir: -2.5 }), geom({ v: 120 })]) {
      const c = ctx(P);
      out.push({ name: `${P} take`, c, phases: buildTake(c, g) });
      out.push({ name: `${P} hop`, c, phases: buildHop(c, g) });
      for (const b of ALL_BEATS) {
        const cb = b === 'pounce' ? ctx(P, atMm(g, -40)) : c;
        out.push({ name: `${P} ${b}`, c: cb, phases: buildApproachBeat(cb, g, b) });
      }
      out.push({ name: `${P} sag`, c: ctx(P, atMm(g, 0)), phases: buildSag(ctx(P, atMm(g, 0))) });
      out.push({ name: `${P} wrap`, c, phases: buildWrap(c, g, { byHand: false, Dref: g.Dh }).phases });
      out.push({ name: `${P} receive`, c, phases: buildWrap(c, g, { byHand: true, Dref: g.Dh }).phases });
      for (const b of CHASE_PLAN) out.push({ name: `${P} chase ${b}`, c, phases: buildChaseBeat(c, g, b, true) });
      out.push({ name: `${P} chase lunge far`, c, phases: buildChaseBeat(c, g, 'lunge', false) });
      out.push({ name: `${P} giveUp`, c, phases: buildGiveUp(c) });
      out.push({ name: `${P} search`, c, phases: buildSearch(c, { D: 0.25, dir: 0.6 }, 3) });
      out.push({ name: `${P} shrink`, c, phases: buildShrink(c, -2.5) });
      const cd = ctx(P, avoidPose(-2.5));
      out.push({ name: `${P} dodge`, c: cd, phases: buildDodge(cd, -2.5) });
    }
  }
  return out;
}

describe('迎手链程序表 vocab2-hand.ts', () => {
  it('接触灵敏度：离基座越远越灵、弯得越多越钝；手那一点上的毫米换算两头对得上', () => {
    expect(gainAt(357.5, 0.2)).toBeGreaterThan(gainAt(200, 0.2));
    expect(gainAt(200, 0.1)).toBeGreaterThan(gainAt(200, 0.4));
    expect(gainAt(10, 0.2)).toBeCloseTo(gainAt(357.5 * 0.25, 0.2), 9);
    const g = geom();
    expect(dOf(atMm(g, 0))).toBeCloseTo(g.Dh, 12);
    expect(dOf(atMm(g, -30))).toBeLessThan(g.Dh);
    expect(dOf(atMm(g, 10))).toBeGreaterThan(g.Dh);
    // 离轴封顶 0.48、不带深卷（超过 0.34 的部分是 bend > 1，执行层的深缠行程给）
    const big = flatH(0.9, 0.62);
    expect(dOf(big)).toBeCloseTo(D_FLAT_MAX, 12);
    expect(big.deep).toBe(0);
    expect(big.bend).toBeGreaterThan(1);
  });

  it('一击追不上惊跳：扑的行程（蹲 + 扑）≤ 0.22、速率 ≤ 快档；躲开 / 扑过去 ≤ 快档；其余任何一段 ≤ 常速档', () => {
    let pounces = 0;
    for (const { name, c, phases } of allTables()) {
      for (const w of walk(phases, c)) {
        if (FAST.has(w.p.name)) {
          expect(w.v, `${name} · ${w.p.name}`).toBeLessThanOrEqual(tierSpeed('fast', c.k) + 1e-9);
          if (w.p.name === 'pounce') {
            pounces++;
            // 段首 → 段末的直线行程（落点那 2 mm 也算在内）
            expect(pathLen(w.from, w.to, 'line'), name).toBeLessThanOrEqual(HC.strikeMax + 1e-9);
          }
          continue;
        }
        expect(w.v, `${name} · ${w.p.name}`).toBeLessThanOrEqual(tierSpeed('normal', c.k) + 1e-9);
      }
    }
    expect(pounces).toBeGreaterThan(0);
    // 扑只在行程装得下时排进拍序；装得下的一律 ≤ 0.22
    for (const P of ['A', 'D'] as PersonaKey[]) {
      for (const g of [geom(), geom({ Dh: 0.1, r: 340 }), geom({ Dh: 0.45, r: 120 })]) {
        const c = ctx(P, undefined, { k: 1.5 });
        const plan = approachPlan(c, g);
        const { S } = pounceGeom(c, g);
        expect(plan.includes('pounce'), `${P} ${g.r}`).toBe(S <= HC.strikeMax);
      }
    }
    // 与惊跳比：最浅的惊跳也有 0.45 的行程、0.15 s 屈曲（反射，不限速）
    const st = buildStartle(ctx('A'), { I: 0.81, th: 0.8, side: 1, recoilYaw: 0, turnBack: 0 });
    const flex = st.phases.find((p) => p.name === 'flex')!;
    expect(dOf(flex.arm as Pose)).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(HC.strikeMax).toBeLessThanOrEqual(0.5 * 0.45);
  });

  it('不出臂的通带：摆动 ≤ 0.6 Hz、叠上去不超弯曲上限；一跳一停的周期 ≥ 1.4 s', () => {
    for (const { name, c, phases } of allTables()) {
      for (const w of walk(phases, c)) {
        const p = w.p;
        if (!p.osc) continue;
        expect(p.osc.hz, name).toBeLessThanOrEqual(ARM_OSC_MAX_HZ);
        expect(dOf(w.to) + p.osc.amp * D_SPAN, `${name} · ${p.name}`).toBeLessThanOrEqual(D_FLAT_MAX + 1e-9);
      }
    }
    for (const P of ['A', 'B', 'C', 'D'] as PersonaKey[]) {
      const hop = buildHop(ctx(P), geom());
      const shift = hop.find((p) => p.name === 'shift')!;
      const fix = hop.find((p) => p.name === 'fixate')!;
      expect(shift.dur).toBeGreaterThanOrEqual(HC.stepMin - 1e-9);
      expect(shift.dur + fix.dur - 1).toBeGreaterThanOrEqual(1.4 - 1e-9);
      // 停的那段带摆动时差动 ≤ 0.27（大弯曲上再摆会被执行层削掉一截）
      if (fix.osc) expect(dOf(shift.arm as Pose)).toBeLessThanOrEqual(0.27 + 1e-9);
    }
  });

  it('迎手链的表一律离轴 ≤ 0.48、不带深卷', () => {
    for (const { name, phases } of allTables()) {
      for (const p of phases) {
        if (p.arm === 'hold' || p.arm === 'rest') continue;
        expect(p.arm.deep, `${name} · ${p.name}`).toBe(0);
        expect(dOf(p.arm), `${name} · ${p.name}`).toBeLessThanOrEqual(D_FLAT_MAX + 1e-9);
      }
    }
    // 手在腱轴 0 正上方、读数饱和（平卷够不着）时，缠与握也只走平卷
    const g = geom({ Dh: 0.5, dir: 0, r: 250 });
    const c = ctx('A', { bend: 1.4, dir: 0, deep: 0 });
    for (const p of buildWrap(c, g, { byHand: false, Dref: 0.5 }).phases) {
      if (p.arm === 'hold' || p.arm === 'rest') continue;
      expect(p.arm.deep, p.name).toBe(0);
      expect(dOf(p.arm), p.name).toBeLessThanOrEqual(D_FLAT_MAX + 1e-9);
    }
    const hold = holdDrive({ g, Dref: 0.5, dirRef: 0, grip: 1 });
    expect(hold.deep).toBe(0);
    expect(dOf(hold)).toBeLessThanOrEqual(D_FLAT_MAX + 1e-9);
  });

  it('身体通道不是惊跳的：迎手链没有一段猛收、chirp、触须张开或闪灯（> 1.25）', () => {
    for (const { name, phases } of allTables()) {
      for (const p of phases) {
        expect(p.breath?.clench ?? 0, `${name} · ${p.name}`).toBe(0);
        expect(p.voice, `${name} · ${p.name}`).not.toBe('chirp');
        expect(p.feel?.pose, `${name} · ${p.name}`).not.toBe('splay');
        expect(p.light ?? 1, `${name} · ${p.name}`).toBeLessThanOrEqual(1.25);
        expect(p.name, name).not.toBe('flex');
      }
    }
    expect(HOLD_CUE.voice).toBe('hum');
    expect(HOLD_CUE.breath?.clench ?? 0).toBe(0);
  });

  it('凑：热情 / 快的乱序随机蹲一下再扑，其余（含衰老过半）直接伸过去', () => {
    const g = geom();
    expect(approachPlan(ctx('A'), g)).toEqual(['transport', 'crouch', 'cocked', 'pounce']);
    expect(approachPlan(ctx('B'), g)).toEqual(['transport', 'reach']);
    expect(approachPlan(ctx('C'), g)).toEqual(['transport', 'reach']);
    expect(approachPlan(ctx('D'), g)).toEqual(['transport', 'reach']);
    expect(approachPlan(ctx('D', undefined, { k: 1.5, tau: 0.3 }), geom({ Dh: 0.25 }))).toContain('pounce');
    expect(approachPlan(ctx('A', undefined, { ageU: 0.6 }), g)).toEqual(['transport', 'reach']);
    // 靠近停在碰到圈外 nearGap，伸 / 扑都落在手上 +land
    const at = (mm: number): number => dOf(atMm(g, mm));
    expect(dOf(buildApproachBeat(ctx('B'), g, 'transport')[0].arm as Pose)).toBeCloseTo(at(-(g.touch + HC.nearGap)), 12);
    expect(dOf(buildApproachBeat(ctx('B'), g, 'reach')[0].arm as Pose)).toBeCloseTo(at(HC.land), 12);
    // 乱序随机的段是匀速（生硬），其余最小急动
    expect(buildApproachBeat(ctx('D'), g, 'transport')[0].ease).toBe('lin');
    expect(buildApproachBeat(ctx('B'), g, 'transport')[0].ease).toBe('mj');
    // 没碰到：落回静息
    expect(endPose(buildSag(ctx('B', atMm(g, 0))), ctx('B'))).toEqual(ctx('B').rest);
  });

  it('热情型跟着手走：停在手旁碰到半径 + 20 mm 处，往手动的方向前看至多半个差动', () => {
    const g = geom();
    const still = trackTarget(g, { x: 0, y: 0 });
    expect(dOf(still)).toBeCloseTo(dOf(atMm(g, -(g.touch + HC.standGap))), 12);
    const lead = trackTarget(g, { x: 0.05 * Math.cos(g.dir + Math.PI / 2), y: 0.05 * Math.sin(g.dir + Math.PI / 2) });
    expect(lead.dir).toBeGreaterThan(still.dir);
    const huge = trackTarget(g, { x: 10, y: 0 });
    const dx = dOf(huge) * Math.cos(huge.dir) - dOf(still) * Math.cos(still.dir);
    expect(dx).toBeLessThanOrEqual(0.5 * dOf(still) + 1e-9);
  });

  it('缠：一下贴上并压过手 holdCenter mm；手伸过来碰的叫合拢', () => {
    const g = geom();
    const c = ctx('C');
    const grab = buildWrap(c, g, { byHand: false, Dref: g.Dh });
    expect(grab.phases[grab.seat].name).toBe('seat');
    expect(dOf(grab.phases[grab.seat].arm as Pose)).toBeCloseTo(dOf(atMm(g, HC.holdCenter)), 12);
    expect(grab.phases[grab.seat].dur).toBeGreaterThanOrEqual(HC.stepMin - 1e-9);
    const recv = buildWrap(c, g, { byHand: true, Dref: g.Dh });
    expect(recv.phases[recv.seat].name).toBe('close');
  });

  it('握：压过手 holdCenter mm、跟着跟手的差动与弯向走，握力缩放', () => {
    const g = geom();
    const mmOf = (p: Pose): number => (dOf(p) - g.Dh) * gainAt(g.r, g.Dh);
    const h = holdDrive({ g, Dref: g.Dh, dirRef: g.dir, grip: 1 });
    expect(mmOf(h)).toBeCloseTo(HC.holdCenter, 9);
    expect(h.dir).toBeCloseTo(g.dir, 12);
    expect(holdDrive({ g, Dref: g.Dh, dirRef: 1.1, grip: 1 }).dir).toBeCloseTo(1.1, 12);
    expect(dOf(holdDrive({ g, Dref: g.Dh, dirRef: g.dir, grip: 0.5 }))).toBeLessThan(dOf(h));
  });

  it('脱手：追 = 先扑到手旁、再伸过去落在手上；放开回静息', () => {
    const g = geom();
    const c = ctx('A');
    expect(CHASE_PLAN).toEqual(['lunge', 'creep']);
    const lunge = buildChaseBeat(c, g, 'lunge', true)[0];
    expect(dOf(lunge.arm as Pose)).toBeCloseTo(dOf(atMm(g, -(g.touch + HC.nearGap))), 12);
    const creep = buildChaseBeat(c, g, 'creep', true)[0];
    expect(dOf(creep.arm as Pose)).toBeCloseTo(dOf(atMm(g, HC.land)), 12);
    expect(endPose(buildGiveUp(c), c)).toEqual(c.rest);
  });

  it('搜寻以最后碰到的那一点为中心、一边比一边宽，最后垂回静息', () => {
    const c = ctx('C');
    const sp = buildSearch(c, { D: 0.3, dir: 1 }, 2);
    const cast1 = sp.find((p) => p.name === 'cast1')!.arm as Pose;
    expect(Math.abs(cast1.dir - (1 + Math.PI / 6))).toBeLessThan(1e-9);
    expect(sp.filter((p) => p.name.startsWith('cast')).length).toBe(2);
    expect(endPose(sp, c)).toEqual(c.rest);
  });

  it('躲：背着手弯、往下压 25°、差动 0.4；躲开比躲姿再紧 0.08、定 1 s', () => {
    for (const dir of [-2.5, 0.3, 1.5]) {
      const p = avoidPose(dir);
      expect(dOf(p)).toBeCloseTo(HC.avoidD, 12);
      const toDown = Math.abs(Math.atan2(Math.sin(Math.PI - dir), Math.cos(Math.PI - dir)));
      const turned = Math.abs(Math.atan2(Math.sin(p.dir - dir), Math.cos(p.dir - dir)));
      expect(turned).toBeCloseTo(Math.min(toDown, HC.avoidTuck), 9);
    }
    // 已经朝下的不再转过头
    expect(Math.cos(avoidPose(Math.PI - 0.1).dir)).toBeCloseTo(-1, 12);
    const c = ctx('C', avoidPose(-2.5));
    expect(endPose(buildShrink(c, -2.5), c)).toEqual(avoidPose(-2.5));
    const dg = buildDodge(c, -2.5);
    expect(dg.map((p) => p.name)).toEqual(['dodge', 'hold']);
    expect(dOf(dg[0].arm as Pose)).toBeCloseTo(HC.avoidD + HC.dodgeD, 12);
    expect((dg[0].arm as Pose).dir).toBeCloseTo(-2.5, 12);
    expect(dg[1].dur).toBeCloseTo(HC.dodgeHold, 12);
  });

  it('表是纯数据：JSON 往返无损', () => {
    for (const { phases } of allTables()) expect(JSON.parse(JSON.stringify(phases))).toEqual(phases);
  });

  it('臂—手距离（粗估）：读数朝臂此刻的姿态挪，距离变小；手超出臂长的那一截算进去', () => {
    const pose = flatH(0.3, -2.5);
    const far = handArmGap(1.2, 0.6, 300, pose);
    const mid = handArmGap(0.9, -1.5, 300, pose);
    const at = handArmGap(0.3 / D_SPAN, -2.5, 300, pose);
    expect(mid).toBeLessThan(far);
    expect(at).toBeCloseTo(0, 9);
    expect(handArmGap(0.3 / D_SPAN, -2.5, 600, pose)).toBeCloseTo(600 - HC.armL, 9);
  });
});
