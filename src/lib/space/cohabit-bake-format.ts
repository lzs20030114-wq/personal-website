/**
 * Lab 2-15 / 2-16 带子轨迹的预烘文件（2026-11-10）：一组 `BandTrajectory` ↔ 一段二进制。
 *
 * 为什么有它：九条带的轨迹在访客的浏览器里要算三十来秒（慢的机器一两分钟），Lab 2-16 的小样要等两组都算完才开演，
 * 这段时间画面里没有人也没有猫，线上读成「跑不起来」。改成构建时算好（scripts/cohabit-bake/generate.mjs，
 * 与 skin-terminal、3D 网格同一种做法），台架先取这份文件，取不到或对不上才退回后台线程现算。
 *
 * 数值逐位保留（坐标按 Float64 原样存，标量走 JSON——双精度数经 JSON 往返不变），所以取文件与现算的结果相同。
 * 停稳之后的关键帧共用同一个数组（TrajectoryBaker），这里按引用去重、只存一次，解出来仍共用。
 *
 * 布局：`[u32 魔数][u32 头长][头 JSON，补齐到 8 字节][各条带不重复的帧 Float64…][不重复的锁定位图 Uint8…]`
 */
import type { BandTrajectory } from './cohabit-solid';

/** 'CHB1'（小端） */
const MAGIC = 0x31424843;

interface TrajHead {
  n: number;
  /** 一帧的长度（= 2n） */
  len: number;
  /** 这条带不重复的帧数（payload 里连续排开） */
  unique: number;
  /** 每一帧取第几个不重复的帧 */
  frames: number[];
  /** 每一帧的锁定位图取第几个（全组共用一张表）；-1 = null */
  locks: number[];
  bonds: number[];
  sides: number[];
  scalars: Omit<BandTrajectory, 'n' | 'frames' | 'bonds' | 'sides' | 'locks'>;
}
interface Head {
  key: string;
  trajs: TrajHead[];
  /** 各张锁定位图的长度 */
  lockLens: number[];
}

/** 一组轨迹 → 二进制。`key` = `bakedKey(defs, frames)`，取用时核对 */
export function packTrajectories(key: string, trajs: readonly BandTrajectory[]): ArrayBuffer {
  const lockIndex = new Map<Uint8Array, number>();
  const lockList: Uint8Array[] = [];
  const frameLists: Float64Array[][] = [];
  const head: Head = { key, trajs: [], lockLens: [] };
  for (const t of trajs) {
    const index = new Map<Float64Array, number>();
    const list: Float64Array[] = [];
    const frames = t.frames.map((f) => {
      let i = index.get(f);
      if (i === undefined) {
        i = list.length;
        index.set(f, i);
        list.push(f);
      }
      return i;
    });
    const len = list[0]?.length ?? 0;
    if (list.some((f) => f.length !== len)) throw new Error('同一条带的帧长度不一致');
    const locks = t.locks.map((l) => {
      if (l === null) return -1;
      let i = lockIndex.get(l);
      if (i === undefined) {
        i = lockList.length;
        lockIndex.set(l, i);
        lockList.push(l);
      }
      return i;
    });
    const { n, frames: _f, bonds, sides, locks: _l, ...scalars } = t;
    void _f;
    void _l;
    head.trajs.push({ n, len, unique: list.length, frames, locks, bonds: [...bonds], sides: [...sides], scalars });
    frameLists.push(list);
  }
  head.lockLens = lockList.map((l) => l.length);
  const json = new TextEncoder().encode(JSON.stringify(head));
  const headEnd = Math.ceil((8 + json.length) / 8) * 8;
  const floats = head.trajs.reduce((s, t) => s + t.unique * t.len, 0);
  const lockBytes = head.lockLens.reduce((s, l) => s + l, 0);
  const buf = new ArrayBuffer(headEnd + floats * 8 + lockBytes);
  const view = new DataView(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, json.length, true);
  new Uint8Array(buf, 8, json.length).set(json);
  const f64 = new Float64Array(buf, headEnd, floats);
  let at = 0;
  for (const list of frameLists)
    for (const f of list) {
      f64.set(f, at);
      at += f.length;
    }
  const u8 = new Uint8Array(buf, headEnd + floats * 8, lockBytes);
  at = 0;
  for (const l of lockList) {
    u8.set(l, at);
    at += l.length;
  }
  return buf;
}

/** 二进制 → 一组轨迹；魔数、键或长度对不上返回 null（调用者退回现算） */
export function unpackTrajectories(buf: ArrayBuffer, key: string): BandTrajectory[] | null {
  try {
    if (buf.byteLength < 8) return null;
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== MAGIC) return null;
    const jsonLen = view.getUint32(4, true);
    if (8 + jsonLen > buf.byteLength) return null;
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jsonLen))) as Head;
    if (head.key !== key) return null;
    const headEnd = Math.ceil((8 + jsonLen) / 8) * 8;
    const floats = head.trajs.reduce((s, t) => s + t.unique * t.len, 0);
    const lockBytes = head.lockLens.reduce((s, l) => s + l, 0);
    if (headEnd + floats * 8 + lockBytes !== buf.byteLength) return null;
    let at = headEnd + floats * 8;
    const lockList = head.lockLens.map((len) => {
      const l = new Uint8Array(buf.slice(at, at + len));
      at += len;
      return l;
    });
    at = headEnd;
    return head.trajs.map((t) => {
      const list: Float64Array[] = [];
      for (let i = 0; i < t.unique; i++) {
        list.push(new Float64Array(buf.slice(at, at + t.len * 8)));
        at += t.len * 8;
      }
      if (t.frames.some((i) => !list[i]) || t.locks.some((i) => i >= 0 && !lockList[i])) throw new Error('下标越界');
      return {
        n: t.n,
        frames: t.frames.map((i) => list[i]),
        bonds: Int32Array.from(t.bonds),
        sides: Int8Array.from(t.sides),
        locks: t.locks.map((i) => (i < 0 ? null : lockList[i])),
        ...t.scalars,
      } as BandTrajectory;
    });
  } catch {
    return null;
  }
}

/** 预烘文件的地址（构建时生成到 public/cohabit-bake/，另有 .gz）：平台三档一份、两个结构的六条一份 */
export const COHABIT_BAKE_URL = {
  tiers: '/cohabit-bake/tiers.bin',
  dual: '/cohabit-bake/dual.bin',
} as const;
