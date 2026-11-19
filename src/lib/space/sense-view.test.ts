import { describe, expect, it } from 'vitest';
import { COHABIT, CohabitSim, PACE_DEMO, populateCohabit, scatterCats } from './cohabit';
import { CAM, cameraLayout, camSees, sceneOf, type Scene } from './cohabit-sense';
import { CAT_KP, CAT_LINKS, PERSON_KP, PERSON_LINKS, camProject, catKeypoints, catTag, fixOf, hitPoint, personKeypoints, personTag, seenBy, tagRanges, TAG_NLOS_BIAS } from './sense-view';

const ROOM = 6.64;

describe('感知层画面 · 关键点', () => {
  it('人的 15 个点：站着头在 1.5–1.65 m、脚踝贴地；坐着头在 1.05–1.3 m、胯在座面高度附近', () => {
    const st = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'stand' });
    expect(st).toHaveLength(PERSON_KP.length);
    expect(st[0].z).toBeGreaterThan(1.5);
    expect(st[0].z).toBeLessThan(1.65);
    expect(st[11].z).toBeLessThan(0.1);
    expect(st[14].z).toBeLessThan(0.1);
    const sit = personKeypoints({ x: 0, y: 0, heading: 0, gaze: 0, pose: 'sit' });
    expect(sit[0].z).toBeGreaterThan(1.05);
    expect(sit[0].z).toBeLessThan(1.3);
    expect(sit[9].z).toBeGreaterThan(0.4);
    expect(sit[9].z).toBeLessThan(0.6);
    // 坐着胯落在座位点（平面）
    expect(Math.hypot((sit[9].x + sit[12].x) / 2, (sit[9].y + sit[12].y) / 2)).toBeLessThan(0.02);
    for (const [a, b] of PERSON_LINKS) expect(a < st.length && b < st.length).toBe(true);
  });

  it('鼻尖朝视线：身体朝 +x、视线转 60° 时鼻尖相对头也转了约 60°', () => {
    const k = personKeypoints({ x: 0, y: 0, heading: 0, gaze: Math.PI / 3, pose: 'stand' });
    const a = Math.atan2(k[1].y - k[0].y, k[1].x - k[0].x);
    expect(Math.abs(a - Math.PI / 3)).toBeLessThan(0.05);
  });

  it('猫的 7 个点在它站的面上方，脚贴着那个面', () => {
    const c = catKeypoints({ x: 1, y: 1, heading: 0, base: 1.05, pose: 'stand' });
    expect(c).toHaveLength(CAT_KP.length);
    for (const p of c) expect(p.z).toBeGreaterThanOrEqual(1.05 - 1e-9);
    expect(c[6].z).toBeCloseTo(1.05, 9);
    expect(c[0].z - 1.05).toBeLessThan(0.35);
    for (const [a, b] of CAT_LINKS) expect(a < c.length && b < c.length).toBe(true);
  });
});

describe('感知层画面 · 摄像头画面', () => {
  const cams = cameraLayout('corners4', ROOM);
  it('四个上角的摄像头都把房间中心的地面投在画面中央附近，身后的点不在镜头前', () => {
    for (const cam of cams) {
      const q = camProject(cam, { x: 0, y: 0, z: 0 });
      expect(q.front).toBe(true);
      expect(Math.abs(q.u)).toBeLessThan(0.05);
      expect(Math.abs(q.v)).toBeLessThan(0.05);
      const back = camProject(cam, { x: cam.x * 1.5, y: cam.y * 1.5, z: cam.z });
      expect(back.front).toBe(false);
    }
  });

  it('画面左右与平面一致：站在摄像头位置面朝房间中心，右手边的点在画面右边；高处的点在画面上边', () => {
    const cam = cams[0];
    const right = { x: -Math.sin(cam.yaw), y: Math.cos(cam.yaw) };
    const p = camProject(cam, { x: right.x * 1, y: right.y * 1, z: 0 });
    expect(p.u).toBeGreaterThan(0);
    const hi = camProject(cam, { x: 0, y: 0, z: 1.5 });
    expect(hi.v).toBeGreaterThan(0);
  });

  it('逐点判看见与 cohabit-sense 的射线检测一致；被挡的点的挡住处在摄像头与点之间', () => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 101, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: PACE_DEMO });
    populateCohabit(sim, 6, 0);
    scatterCats(sim, 4, 101);
    for (let t = 0; t < 90; t += 1 / 30) sim.step(1 / 30);
    const scene: Scene = sceneOf(sim);
    let seen = 0;
    let blocked = 0;
    for (const p of sim.people) {
      if (!p.walker.present) continue;
      const w = p.walker;
      const pts = personKeypoints({ x: w.x, y: w.y, heading: w.heading, gaze: w.gaze, pose: p.seated ? 'sit' : 'stand' });
      const s = seenBy(scene, cams, pts, p.id);
      pts.forEach((pt, k) => {
        for (const ci of s.by[k]) {
          expect(camSees(scene, cams[ci], pt.x, pt.y, pt.z, p.id)).toBe(true);
          seen++;
        }
        for (const ci of s.blocked[k]) {
          blocked++;
          const h = hitPoint(scene, cams[ci], pt, p.id);
          const c = cams[ci];
          const dAll = Math.hypot(pt.x - c.x, pt.y - c.y, pt.z - c.z);
          expect(Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z)).toBeLessThanOrEqual(dAll + 1e-6);
        }
      });
    }
    expect(seen).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThanOrEqual(0);
    expect(CAM.H).toBeGreaterThan(3);
  }, 30000);
});

describe('感知层画面 · 方案 B', () => {
  it('没人挡时量到的距离就是直线距离，误差取最小档；人体挡住的那段多量 0.35 m', () => {
    const anchors = cameraLayout('corners4', ROOM);
    const empty: Scene = { cyls: [], boxes: [] };
    const tag = personTag({ x: 0.5, y: -0.3, heading: 0, seated: false });
    const r = tagRanges(empty, anchors, tag);
    expect(r.los.every(Boolean)).toBe(true);
    r.ranges.forEach((d, i) => expect(d).toBeCloseTo(Math.hypot(tag.x - anchors[i].x, tag.y - anchors[i].y, tag.z - anchors[i].z), 9));
    // 在第 0 个固定点与标签之间放一个人
    const a = anchors[0];
    const mid = { x: (a.x + tag.x) / 2, y: (a.y + tag.y) / 2 };
    const scene: Scene = { cyls: [{ x: mid.x, y: mid.y, r: 0.2, z0: 0, z1: 3.6, owner: 7, body: true }], boxes: [] };
    const r2 = tagRanges(scene, anchors, tag);
    expect(r2.los[0]).toBe(false);
    expect(r2.ranges[0] - r.ranges[0]).toBeCloseTo(TAG_NLOS_BIAS, 9);
    expect(r2.sd).toBeGreaterThan(r.sd - 1e-12);
    expect(catTag({ x: 0, y: 0, base: 1.05 }).z).toBeCloseTo(1.25, 9);
  });

  it('几台看见 → 立体模型里的画法', () => {
    expect(fixOf(0)).toBe('none');
    expect(fixOf(1)).toBe('ray');
    expect(fixOf(3)).toBe('tri');
  });
});
