import { bakeIndexed, bakeSkinned, type CellFrame } from './gl3d';
import type { Vec3 } from './solver3d';
import { GUIDE3, ROOTB3, SPINE3, TENTACLE3D } from './tentacle3d-data';
import { MESH_GROUPS } from './tentacle3d-shape';

/** 当前帧的局部刚架；原点引用活体节点，只在本次绘制中复用。 */
export function tentacleCellFrame(nodes: ReadonlyArray<Readonly<Vec3>>, i: number): CellFrame {
  const si = Math.max(0, i);
  const o = nodes[SPINE3(si)];
  const nA = si === 0 ? nodes[ROOTB3()] : nodes[SPINE3(si - 1)];
  const nB = nodes[SPINE3(Math.min(TENTACLE3D.segments, si + 1))];
  let ux = nB.x - nA.x;
  let uy = nB.y - nA.y;
  let uz = nB.z - nA.z;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const g = nodes[GUIDE3(0, si)];
  let ex = g.x - o.x;
  let ey = g.y - o.y;
  let ez = g.z - o.z;
  const dot = ex * ux + ey * uy + ez * uz;
  ex -= dot * ux;
  ey -= dot * uy;
  ez -= dot * uz;
  const el = Math.hypot(ex, ey, ez) || 1;
  ex /= el;
  ey /= el;
  ez /= el;
  return { o, ux, uy, uz, ex, ey, ez, fx: ey * uz - ez * uy, fy: ez * ux - ex * uz, fz: ex * uy - ey * ux };
}

interface TentacleMesh {
  readonly name: string;
  readonly skinned: boolean;
  /** 共享只读 CPU 数据：调用者只传给 renderer，不原地修改。GPU 缓冲仍归各上下文。 */
  readonly data: Float32Array;
}

let meshPromise: Promise<readonly TentacleMesh[]> | undefined;

/** 固定资产与烘焙规则随本模块版本更新；并发挂载只下载/烘焙一次，失败不缓存。 */
export function loadTentacleMeshes(): Promise<readonly TentacleMesh[]> {
  if (!meshPromise) {
    meshPromise = fetch('/mesh/tentacle3d-mesh.bin')
      .then((response) => {
        if (!response.ok) throw new Error(`3D mesh 请求失败（HTTP ${response.status}）`);
        return response.arrayBuffer();
      })
      .then((buf) => {
        const need = Math.max(...MESH_GROUPS.flatMap((g) => [
          g.vOff + g.verts * 3 * Float32Array.BYTES_PER_ELEMENT,
          g.iOff + g.tris * 3 * (g.idx32 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT),
        ]));
        if (buf.byteLength < need) throw new Error(`3D mesh 数据不完整（${buf.byteLength}/${need} bytes）`);
        return MESH_GROUPS.map((g): TentacleMesh => {
          const verts = new Float32Array(buf, g.vOff, g.verts * 3);
          const idx = g.idx32
            ? new Uint32Array(buf, g.iOff, g.tris * 3)
            : new Uint16Array(buf, g.iOff, g.tris * 3);
          return {
            name: g.name,
            skinned: !!g.blend,
            data: g.blend ? bakeSkinned(verts, idx, g.blend[0], g.blend[1]) : bakeIndexed(verts, idx),
          };
        });
      })
      .catch((error: unknown) => {
        meshPromise = undefined;
        throw error;
      });
  }
  return meshPromise;
}
