// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/11.3dm（干净版触手本体，用户提供 2026-07-10）。
// 结构：基座舵机总成（全量）+ 7 方盒椎节 + 节间 TPU 盘轴联接（j 组）+ 梢端盖。
// 网格：嵌入渲染网格全量导入（106633 三角，0.05mm 焊接）——WebGL 直接吃。
// v4：连接件与方盒榫卯插接（刚盒 + TPU 软连接件）——j 组做双骨蒙皮，
// blend = 裸露带（站 g 局部 ax），插接段随盒刚动。载荷在 tentacle3d-mesh.bin。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = [[0.0, 0.0, 0.0], [0.0, 72.2, 0.0], [0.0, 139.1, 0.0], [0.0, 201.0, 0.0], [0.0, 258.0, 0.0], [0.0, 310.5, 0.0], [0.0, 357.8, 0.0]] as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [[[8.92, 0.0, 5.15], [8.05, 72.2, 4.65], [7.19, 139.1, 4.15], [6.32, 201.0, 3.65], [5.63, 258.0, 3.25], [4.94, 310.5, 2.85], [4.24, 357.8, 2.45]], [[-8.92, 0.0, 5.15], [-8.05, 72.2, 4.65], [-7.19, 139.1, 4.15], [-6.32, 201.0, 3.65], [-5.63, 258.0, 3.25], [-4.94, 310.5, 2.85], [-4.24, 357.8, 2.45]], [[-0.0, 0.0, -10.3], [-0.0, 72.2, -9.3], [-0.0, 139.1, -8.3], [-0.0, 201.0, -7.3], [-0.0, 258.0, -6.5], [-0.0, 310.5, -5.7], [-0.0, 357.8, -4.9]]] as const;

export const RADII: ReadonlyArray<number> = [10.3, 9.3, 8.3, 7.3, 6.5, 5.7, 4.9] as const;

/** 每节两端板的沿臂位置（站局部 ax，[近端, 远端]）——肌腱 v3 真实走线的腱孔所在 */
export const PLATES: ReadonlyArray<readonly [number, number]> = [[-22.3, 27.3], [-25.07, 25.05], [-22.97, 22.99], [-21.07, 21.04], [-19.25, 19.32], [-17.66, 17.65], [-13.65, 13.7]] as const;

/** 每节中央球体导件的径向半径（轴上零件实测顶点最大径）——肌腱绕行其背面 */
export const BALLS: ReadonlyArray<number> = [12.18, 10.9, 9.72, 8.63, 7.62, 6.69, 5.87] as const;

/** mesh.bin 分组布局：c0..c6 = 站元胞局部系（刚性）；j0..j5 = 节间 TPU 连接件
 *  （站 g 局部系，blend = [b0,b1] 裸露带，双骨蒙皮 g↔g+1）；mnt = 基座挂站 0。 */
export interface MeshGroup {
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
  blend?: readonly [number, number];
}

export const MESH_GROUPS: ReadonlyArray<MeshGroup> = [{"name": "c0", "verts": 6749, "tris": 12450, "vOff": 0, "iOff": 80988, "idx32": false}, {"name": "c1", "verts": 8680, "tris": 15887, "vOff": 155688, "iOff": 259848, "idx32": false}, {"name": "c2", "verts": 8746, "tris": 15782, "vOff": 355172, "iOff": 460124, "idx32": false}, {"name": "c3", "verts": 8531, "tris": 15284, "vOff": 554816, "iOff": 657188, "idx32": false}, {"name": "c4", "verts": 8729, "tris": 15090, "vOff": 748892, "iOff": 853640, "idx32": false}, {"name": "c5", "verts": 9686, "tris": 14915, "vOff": 944180, "iOff": 1060412, "idx32": false}, {"name": "c6", "verts": 4257, "tris": 8088, "vOff": 1149904, "iOff": 1200988, "idx32": false}, {"name": "j0", "verts": 192, "tris": 376, "vOff": 1249516, "iOff": 1251820, "idx32": false, "blend": [27.3, 47.13]}, {"name": "j1", "verts": 192, "tris": 376, "vOff": 1254076, "iOff": 1256380, "idx32": false, "blend": [25.05, 43.93]}, {"name": "j2", "verts": 192, "tris": 376, "vOff": 1258636, "iOff": 1260940, "idx32": false, "blend": [22.99, 40.83]}, {"name": "j3", "verts": 194, "tris": 384, "vOff": 1263196, "iOff": 1265524, "idx32": false, "blend": [21.04, 37.75]}, {"name": "j4", "verts": 192, "tris": 376, "vOff": 1267828, "iOff": 1270132, "idx32": false, "blend": [19.32, 34.84]}, {"name": "j5", "verts": 192, "tris": 376, "vOff": 1272388, "iOff": 1274692, "idx32": false, "blend": [17.65, 33.65]}, {"name": "mnt", "verts": 9654, "tris": 6873, "vOff": 1276948, "iOff": 1392796, "idx32": false}] as const;
