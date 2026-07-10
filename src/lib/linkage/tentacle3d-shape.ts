// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/11.3dm（干净版触手本体，用户提供 2026-07-10）。
// 结构：基座舵机总成（全量）+ 7 方盒椎节 + 节间盘轴联接 + 梢端盖。
// 网格：嵌入渲染网格全量导入（106633 三角，0.05mm 焊接）——WebGL 直接吃，
// 细节不再做凸包减量（用户拍板「直接导入」）。载荷在 tentacle3d-mesh.bin。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = [[0.0, 0.0, 0.0], [0.0, 72.2, 0.0], [0.0, 139.1, 0.0], [0.0, 201.0, 0.0], [0.0, 258.0, 0.0], [0.0, 310.5, 0.0], [0.0, 357.8, 0.0]] as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [[[8.92, 0.0, 5.15], [8.05, 72.2, 4.65], [7.19, 139.1, 4.15], [6.32, 201.0, 3.65], [5.63, 258.0, 3.25], [4.94, 310.5, 2.85], [4.24, 357.8, 2.45]], [[-8.92, 0.0, 5.15], [-8.05, 72.2, 4.65], [-7.19, 139.1, 4.15], [-6.32, 201.0, 3.65], [-5.63, 258.0, 3.25], [-4.94, 310.5, 2.85], [-4.24, 357.8, 2.45]], [[-0.0, 0.0, -10.3], [-0.0, 72.2, -9.3], [-0.0, 139.1, -8.3], [-0.0, 201.0, -7.3], [-0.0, 258.0, -6.5], [-0.0, 310.5, -5.7], [-0.0, 357.8, -4.9]]] as const;

export const RADII: ReadonlyArray<number> = [10.3, 9.3, 8.3, 7.3, 6.5, 5.7, 4.9] as const;

/** mesh.bin 分组布局（c0..c6 = 站元胞局部系，mnt = 基座挂站 0 刚架） */
export interface MeshGroup {
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
}

export const MESH_GROUPS: ReadonlyArray<MeshGroup> = [{"name": "c0", "verts": 6749, "tris": 12450, "vOff": 0, "iOff": 80988, "idx32": false}, {"name": "c1", "verts": 8872, "tris": 16263, "vOff": 155688, "iOff": 262152, "idx32": false}, {"name": "c2", "verts": 8938, "tris": 16158, "vOff": 359732, "iOff": 466988, "idx32": false}, {"name": "c3", "verts": 8723, "tris": 15660, "vOff": 563936, "iOff": 668612, "idx32": false}, {"name": "c4", "verts": 8923, "tris": 15474, "vOff": 762572, "iOff": 869648, "idx32": false}, {"name": "c5", "verts": 9878, "tris": 15291, "vOff": 962492, "iOff": 1081028, "idx32": false}, {"name": "c6", "verts": 4449, "tris": 8464, "vOff": 1172776, "iOff": 1226164, "idx32": false}, {"name": "mnt", "verts": 9654, "tris": 6873, "vOff": 1276948, "iOff": 1392796, "idx32": false}] as const;
