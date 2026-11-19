import { describe, expect, it } from 'vitest';
import { cameraLayout } from './cohabit-sense';
import { alongRay, closestOnRay, rayTo, readCat, readPerson, SOLVE, triangulate, trilaterate } from './sense-solve';
import { catKeypoints, personKeypoints, type P3 } from './sense-view';

const ROOM = 6.64;
const cams = cameraLayout('corners4', ROOM);
const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const all = (n: number) => Array.from({ length: n }, () => true);
const WATCH = { d: 3, half: (25 * Math.PI) / 180 };

describe('视线求点', () => {
  it('两条以上没有误差的视线交回原点', () => {
    const p = { x: 0.7, y: -1.2, z: 1.1 };
    for (const n of [2, 3, 4]) {
      const q = triangulate(cams.slice(0, n).map((c) => rayTo(c, p)))!;
      expect(dist(q, p)).toBeLessThan(1e-9);
    }
  });
  it('一条视线定不出点，几乎平行的两条也不算', () => {
    const p = { x: 0.2, y: 0.3, z: 1 };
    expect(triangulate([rayTo(cams[0], p)])).toBeNull();
    expect(triangulate([rayTo(cams[0], p), rayTo(cams[0], { x: 0.21, y: 0.31, z: 1 })])).toBeNull();
  });
  it('检测误差 0.005 rad 时两台交出的点偏不到 6 cm（研究里两台以上那一档 ±0.04 m 的量级）', () => {
    const p = { x: -1.1, y: 0.4, z: 1.3 };
    const q = triangulate([rayTo(cams[0], p, SOLVE.rayAng, -SOLVE.rayAng), rayTo(cams[1], p, -SOLVE.rayAng, SOLVE.rayAng)])!;
    expect(dist(q, p)).toBeLessThan(0.06);
  });
  it('一条视线：落在线上离预测最近处；深度相机沿线走量到的距离就是那个点', () => {
    const p = { x: 1, y: 1, z: 1 };
    const r = rayTo(cams[2], p);
    expect(dist(closestOnRay(r, p), p)).toBeLessThan(1e-9);
    expect(dist(alongRay(r, dist(p, r.o)), p)).toBeLessThan(1e-9);
  });
});

describe('四段距离解位置', () => {
  const anchors = cams.map((c) => ({ x: c.x, y: c.y, z: c.z }));
  it('没有误差时从四段距离解回原点（含高度），取房间里那一个镜像', () => {
    for (const p of [{ x: 0.5, y: -1, z: 1.3 }, { x: -2.5, y: 2.4, z: 0.3 }, { x: 0, y: 0, z: 1 }]) {
      const r = anchors.map((a) => dist(a, p));
      const f = trilaterate(anchors, r, { x: 0, y: 0, z: 1 });
      expect(dist(f.p, p)).toBeLessThan(1e-6);
      expect(f.consistent).toBe(true);
    }
  });
  it('从房顶上方起步也落回房间里', () => {
    const p = { x: 1.2, y: 0.6, z: 1.25 };
    const f = trilaterate(anchors, anchors.map((a) => dist(a, p)), { x: 0, y: 0, z: 5 });
    expect(dist(f.p, p)).toBeLessThan(1e-6);
  });
  it('一段隔着身体读长 0.35 m：位置偏开、那一段的残差为正、四段对不上', () => {
    const p = { x: 0.4, y: 0.2, z: 1.3 };
    const r = anchors.map((a) => dist(a, p));
    r[1] += 0.35;
    const f = trilaterate(anchors, r, { x: 0, y: 0, z: 1 });
    expect(dist(f.p, p)).toBeGreaterThan(0.1);
    expect(f.resid[1]).toBeGreaterThan(0);
    expect(f.consistent).toBe(false);
  });
});

describe('读动作', () => {
  it('站 / 走 / 坐按胯的高度和速度读；坐着看猫前倾读得出', () => {
    const stand = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'stand' });
    const sit = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'sit' });
    const lean = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'sit', lean: true });
    const g = { face: 0, prev: 0, moveDir: null };
    expect(readPerson(stand, all(15), 0, g, [], false, WATCH).posture).toBe('stand');
    expect(readPerson(stand, all(15), 0.9, g, [], false, WATCH).posture).toBe('walk');
    expect(readPerson(stand, all(15), 0.2, g, [], true, WATCH).posture).toBe('walk');
    expect(readPerson(sit, all(15), 0, g, [], false, WATCH).posture).toBe('sit');
    expect(readPerson(sit, all(15), 0, g, [], false, WATCH).lean).toBe(false);
    expect(readPerson(lean, all(15), 0, g, [], false, WATCH).lean).toBe(true);
  });
  it('胯看不见时按头的高度读；关键点全没定住读不出', () => {
    const sit = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'sit' });
    const ok = all(15);
    ok[9] = ok[12] = false;
    expect(readPerson(sit, ok, 0, { face: null, prev: null, moveDir: null }, [], false, WATCH).posture).toBe('sit');
    expect(readPerson(sit, ok.map(() => false), 0, { face: null, prev: null, moveDir: null }, [], false, WATCH).posture).toBe('unknown');
  });
  it('看得见脸时按读到的视线挑猫；看不见脸时按两肩的朝向，正反由走的方向定', () => {
    const p = personKeypoints({ x: 0, y: 0, heading: Math.PI / 2, gaze: Math.PI / 2, pose: 'stand' });
    const cats = [{ id: 7, x: 0, y: 2 }, { id: 8, x: 2, y: 0 }];
    expect(readPerson(p, all(15), 0, { face: Math.PI / 2, prev: null, moveDir: null }, cats, false, WATCH).watching).toBe(7);
    const body = readPerson(p, all(15), 0, { face: null, prev: null, moveDir: Math.PI / 2 }, cats, false, WATCH);
    expect(body.gazeFrom).toBe('body');
    expect(Math.abs(Math.atan2(Math.sin(body.gaze! - Math.PI / 2), Math.cos(body.gaze! - Math.PI / 2)))).toBeLessThan(0.05);
    expect(body.watching).toBe(7);
    // 走着不算在看猫
    expect(readPerson(p, all(15), 1, { face: Math.PI / 2, prev: null, moveDir: null }, cats, false, WATCH).watching).toBeNull();
  });
  it('猫：坐 / 趴 / 站按背、臀相对脚的高度，站的面多高照实读出', () => {
    for (const base of [0, 0.43, 1.05]) {
      const r = (pose: 'sit' | 'lie' | 'stand', speed = 0) => readCat(catKeypoints({ x: 0, y: 0, heading: 0, base, pose }), all(7), speed, false);
      expect(r('sit').posture).toBe('sit');
      expect(r('lie').posture).toBe('lie');
      expect(r('stand').posture).toBe('stand');
      expect(r('stand', 0.3).posture).toBe('walk');
      expect(r('sit').base).toBeCloseTo(base, 6);
    }
  });
});
