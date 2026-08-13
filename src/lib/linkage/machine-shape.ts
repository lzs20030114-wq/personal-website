// machine-shape.ts —— 轮回机器整机（Lab.05）形体分组与绑定表，机器生成。
// 来源：模型求解器参考/815.3dm（整机单源，2026-08-13 换源；每环曲柄双侧 =
//     2 轮片 + 2 驱动杆，底盘新构型；运动学与 shell3d-data 逐位一致故零改），
// 生成脚本 scripts/model-extract/gen_machine.py——手改无效，改脚本重生成。
// spec = 轮回机器_整机spec.md；测绘 = 轮回机器_整机测绘.md。
//
// 运动学不在这里：五环销坐标与 shell3d-data.ts 逐位相同，Lab.05 复用 shell3d 解算。
// 本文件只管「哪块网格跟着谁动」：
//   p{ring}_{tri}  角化件 → shell3d-data 的 tris[tri]，按三销实时标架刚性变换
//   x{ring}_{node} 配件   → nodes[node]，只平移不转
//   w{ring}         单杆轮 → 绕轮心转 θ−θ₀
//   r{ring}         驱动杆 → 曲柄销与拱顶两点定位姿
//   frame / tentacle  静件（已烘到世界系，不动）
// 组内顶点坐标：p/r 为板局部 (a, b, w)；x 为相对销的 (du, dv, w)；w/静件为环局部/世界系。
// 世界系同 shell3d：x = station + w，y = u，z = v。

export interface MachineGroup {
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
  /** 仅 sa_soft：双骨蒙皮混合带 [b0, b1]（组局部 x，= 沿链向下的距离） */
  blend?: readonly [number, number];
}

export interface MachineDrive {
  ring: string;
  station: number;
  crankR: number;
  /** 图纸姿态（θ₀ = 上死点 = 全开）的拱顶高度；行程下端 = apex0 − 2·crankR。 */
  apex0: number;
}

/**
 * 大触手（= Lab.03 那条三肌腱触手，椎节间距逐位吻合）在整机世界系里的落位。
 * sim 坐标系：y = 沿臂，(x, z) = 截面。实测滚转 ≈ 0（梢端三绑线柱方位与 TIES
 * 逐一对上），故 sim → 世界 是**绕世界 z 轴 90° + 平移**，无绕臂轴旋转：
 *   world = ( ARM_ORIGIN.x − sy , ARM_ORIGIN.y + sx , ARM_ORIGIN.z + sz )
 * 方向向量同理去掉平移。滚转残差见 ARM_ROLL_DEG（生成期 >6° 直接拒绝出表）。
 */
export interface ArmPlacement {
  origin: readonly [number, number, number];
  rollDeg: number;
}
export const ARM_PLACEMENT: ArmPlacement = {"origin": [-209.5151, 108.9232, -46.8742], "rollDeg": 2.577};

/**
 * 小触手（两条，机身两侧镜像）在整机世界系的位姿与链几何——机构由用户 2026-07-30
 * 说明：底座固定、SG90 驱动大节绕圆形轴心甩动、软性中间件连被动小块。
 * o = 轴心世界点；axis = 摆轴（单位向量）；h = 摆平面内的水平方向（θ>0 摆向 +h）。
 * 2D 链在 (h, 世界 z) 平面内解算，L1/LS/L2 = 轴心→上关节 / 软杆 / 下关节→梢端 mm。
 */
export interface SmallArmPlacement {
  o: readonly [number, number, number];
  axis: readonly [number, number, number];
  h: readonly [number, number, number];
}
export const SMALLARM_PLACEMENTS: ReadonlyArray<SmallArmPlacement> = [{"o": [-35.5251, -158.5472, -42.9344], "axis": [-0.0, 1.0, 0.0], "h": [-1.0, 0.0, 0.0]}, {"o": [49.4751, 147.6826, -42.8344], "axis": [-0.0, -1.0, 0.0], "h": [1.0, 0.0, 0.0]}];
export const SMALLARM_SHAPE = {"L1": 48.728, "LS": 23.016, "L2": 24.333, "blend": [3.75, 19.27]} as const;

export const MACHINE_MESH_URL = '/mesh/machine-mesh.bin';
export const MACHINE_TRIS = 98096;
export const MACHINE_DRIVE: ReadonlyArray<MachineDrive> = [{"ring": "S1_M3x1.057", "station": -170.0, "crankR": 29.882, "apex0": 126.294}, {"ring": "S2_M1x1.184", "station": -85.0, "crankR": 48.928, "apex0": 221.228}, {"ring": "S3_M5x1.584", "station": 0.0, "crankR": 34.733, "apex0": 157.275}, {"ring": "S4_M3x1.000", "station": 85.0, "crankR": 28.097, "apex0": 119.216}, {"ring": "S5_M3x0.870", "station": 170.0, "crankR": 24.178, "apex0": 103.282}];
export const MACHINE_GROUPS: ReadonlyArray<MachineGroup> = [{"name": "p0_8", "verts": 344, "tris": 704, "vOff": 0, "iOff": 4128, "idx32": false}, {"name": "p0_4", "verts": 334, "tris": 680, "vOff": 8352, "iOff": 12360, "idx32": false}, {"name": "p0_0", "verts": 344, "tris": 704, "vOff": 16440, "iOff": 20568, "idx32": false}, {"name": "p0_11", "verts": 346, "tris": 708, "vOff": 24792, "iOff": 28944, "idx32": false}, {"name": "p0_9", "verts": 344, "tris": 704, "vOff": 33192, "iOff": 37320, "idx32": false}, {"name": "p0_7", "verts": 344, "tris": 704, "vOff": 41544, "iOff": 45672, "idx32": false}, {"name": "p0_3", "verts": 334, "tris": 680, "vOff": 49896, "iOff": 53904, "idx32": false}, {"name": "p0_10", "verts": 344, "tris": 704, "vOff": 57984, "iOff": 62112, "idx32": false}, {"name": "p0_6", "verts": 346, "tris": 708, "vOff": 66336, "iOff": 70488, "idx32": false}, {"name": "p0_5", "verts": 334, "tris": 680, "vOff": 74736, "iOff": 78744, "idx32": false}, {"name": "p0_2", "verts": 334, "tris": 680, "vOff": 82824, "iOff": 86832, "idx32": false}, {"name": "p0_13", "verts": 344, "tris": 704, "vOff": 90912, "iOff": 95040, "idx32": false}, {"name": "p0_12", "verts": 344, "tris": 704, "vOff": 99264, "iOff": 103392, "idx32": false}, {"name": "p0_1", "verts": 346, "tris": 708, "vOff": 107616, "iOff": 111768, "idx32": false}, {"name": "x0_5", "verts": 240, "tris": 480, "vOff": 116016, "iOff": 118896, "idx32": false}, {"name": "x0_13", "verts": 240, "tris": 480, "vOff": 121776, "iOff": 124656, "idx32": false}, {"name": "w0", "verts": 642, "tris": 1292, "vOff": 127536, "iOff": 135240, "idx32": false}, {"name": "r0", "verts": 1614, "tris": 3140, "vOff": 142992, "iOff": 162360, "idx32": false}, {"name": "p1_0", "verts": 318, "tris": 648, "vOff": 181200, "iOff": 185016, "idx32": false}, {"name": "p1_1", "verts": 320, "tris": 652, "vOff": 188904, "iOff": 192744, "idx32": false}, {"name": "p1_2", "verts": 322, "tris": 656, "vOff": 196656, "iOff": 200520, "idx32": false}, {"name": "p1_3", "verts": 322, "tris": 656, "vOff": 204456, "iOff": 208320, "idx32": false}, {"name": "p1_4", "verts": 318, "tris": 648, "vOff": 212256, "iOff": 216072, "idx32": false}, {"name": "p1_5", "verts": 318, "tris": 648, "vOff": 219960, "iOff": 223776, "idx32": false}, {"name": "p1_6", "verts": 318, "tris": 648, "vOff": 227664, "iOff": 231480, "idx32": false}, {"name": "p1_7", "verts": 318, "tris": 648, "vOff": 235368, "iOff": 239184, "idx32": false}, {"name": "p1_8", "verts": 318, "tris": 648, "vOff": 243072, "iOff": 246888, "idx32": false}, {"name": "p1_9", "verts": 318, "tris": 648, "vOff": 250776, "iOff": 254592, "idx32": false}, {"name": "p1_10", "verts": 318, "tris": 648, "vOff": 258480, "iOff": 262296, "idx32": false}, {"name": "p1_11", "verts": 318, "tris": 648, "vOff": 266184, "iOff": 270000, "idx32": false}, {"name": "p1_12", "verts": 318, "tris": 648, "vOff": 273888, "iOff": 277704, "idx32": false}, {"name": "p1_13", "verts": 318, "tris": 648, "vOff": 281592, "iOff": 285408, "idx32": false}, {"name": "w1", "verts": 620, "tris": 1248, "vOff": 289296, "iOff": 296736, "idx32": false}, {"name": "r1", "verts": 1465, "tris": 2682, "vOff": 304224, "iOff": 321804, "idx32": false}, {"name": "p2_9", "verts": 322, "tris": 656, "vOff": 337896, "iOff": 341760, "idx32": false}, {"name": "p2_8", "verts": 322, "tris": 656, "vOff": 345696, "iOff": 349560, "idx32": false}, {"name": "p2_7", "verts": 318, "tris": 648, "vOff": 353496, "iOff": 357312, "idx32": false}, {"name": "p2_6", "verts": 320, "tris": 652, "vOff": 361200, "iOff": 365040, "idx32": false}, {"name": "p2_5", "verts": 322, "tris": 656, "vOff": 368952, "iOff": 372816, "idx32": false}, {"name": "p2_4", "verts": 324, "tris": 660, "vOff": 376752, "iOff": 380640, "idx32": false}, {"name": "p2_3", "verts": 320, "tris": 652, "vOff": 384600, "iOff": 388440, "idx32": false}, {"name": "p2_2", "verts": 318, "tris": 648, "vOff": 392352, "iOff": 396168, "idx32": false}, {"name": "p2_1", "verts": 322, "tris": 656, "vOff": 400056, "iOff": 403920, "idx32": false}, {"name": "p2_0", "verts": 322, "tris": 656, "vOff": 407856, "iOff": 411720, "idx32": false}, {"name": "w2", "verts": 694, "tris": 1396, "vOff": 415656, "iOff": 423984, "idx32": false}, {"name": "r2", "verts": 1344, "tris": 2658, "vOff": 432360, "iOff": 448488, "idx32": false}, {"name": "p3_9", "verts": 334, "tris": 680, "vOff": 464436, "iOff": 468444, "idx32": false}, {"name": "p3_12", "verts": 348, "tris": 712, "vOff": 472524, "iOff": 476700, "idx32": false}, {"name": "p3_11", "verts": 334, "tris": 680, "vOff": 480972, "iOff": 484980, "idx32": false}, {"name": "p3_8", "verts": 334, "tris": 680, "vOff": 489060, "iOff": 493068, "idx32": false}, {"name": "p3_7", "verts": 348, "tris": 712, "vOff": 497148, "iOff": 501324, "idx32": false}, {"name": "p3_3", "verts": 346, "tris": 708, "vOff": 505596, "iOff": 509748, "idx32": false}, {"name": "p3_1", "verts": 346, "tris": 708, "vOff": 513996, "iOff": 518148, "idx32": false}, {"name": "p3_0", "verts": 346, "tris": 708, "vOff": 522396, "iOff": 526548, "idx32": false}, {"name": "p3_13", "verts": 346, "tris": 708, "vOff": 530796, "iOff": 534948, "idx32": false}, {"name": "p3_10", "verts": 334, "tris": 680, "vOff": 539196, "iOff": 543204, "idx32": false}, {"name": "p3_6", "verts": 346, "tris": 708, "vOff": 547284, "iOff": 551436, "idx32": false}, {"name": "p3_5", "verts": 346, "tris": 708, "vOff": 555684, "iOff": 559836, "idx32": false}, {"name": "p3_4", "verts": 346, "tris": 708, "vOff": 564084, "iOff": 568236, "idx32": false}, {"name": "p3_2", "verts": 348, "tris": 712, "vOff": 572484, "iOff": 576660, "idx32": false}, {"name": "w3", "verts": 682, "tris": 1372, "vOff": 580932, "iOff": 589116, "idx32": false}, {"name": "r3", "verts": 1471, "tris": 2948, "vOff": 597348, "iOff": 615000, "idx32": false}, {"name": "p4_1", "verts": 358, "tris": 732, "vOff": 632688, "iOff": 636984, "idx32": false}, {"name": "p4_2", "verts": 340, "tris": 692, "vOff": 641376, "iOff": 645456, "idx32": false}, {"name": "p4_5", "verts": 340, "tris": 692, "vOff": 649608, "iOff": 653688, "idx32": false}, {"name": "p4_6", "verts": 358, "tris": 732, "vOff": 657840, "iOff": 662136, "idx32": false}, {"name": "p4_10", "verts": 356, "tris": 728, "vOff": 666528, "iOff": 670800, "idx32": false}, {"name": "p4_12", "verts": 356, "tris": 728, "vOff": 675168, "iOff": 679440, "idx32": false}, {"name": "p4_13", "verts": 356, "tris": 728, "vOff": 683808, "iOff": 688080, "idx32": false}, {"name": "p4_0", "verts": 356, "tris": 728, "vOff": 692448, "iOff": 696720, "idx32": false}, {"name": "p4_3", "verts": 340, "tris": 692, "vOff": 701088, "iOff": 705168, "idx32": false}, {"name": "p4_4", "verts": 340, "tris": 692, "vOff": 709320, "iOff": 713400, "idx32": false}, {"name": "p4_7", "verts": 356, "tris": 728, "vOff": 717552, "iOff": 721824, "idx32": false}, {"name": "p4_8", "verts": 356, "tris": 728, "vOff": 726192, "iOff": 730464, "idx32": false}, {"name": "p4_9", "verts": 356, "tris": 728, "vOff": 734832, "iOff": 739104, "idx32": false}, {"name": "p4_11", "verts": 360, "tris": 736, "vOff": 743472, "iOff": 747792, "idx32": false}, {"name": "w4", "verts": 710, "tris": 1428, "vOff": 752208, "iOff": 760728, "idx32": false}, {"name": "r4", "verts": 1638, "tris": 3122, "vOff": 769296, "iOff": 788952, "idx32": false}, {"name": "frame", "verts": 9789, "tris": 21203, "vOff": 807684, "iOff": 925152, "idx32": false}, {"name": "shaft", "verts": 1233, "tris": 2514, "vOff": 1052372, "iOff": 1067168, "idx32": false}, {"name": "sa_mount", "verts": 1367, "tris": 2557, "vOff": 1082252, "iOff": 1098656, "idx32": false}, {"name": "sa_seg1", "verts": 1666, "tris": 3082, "vOff": 1114000, "iOff": 1133992, "idx32": false}, {"name": "sa_soft", "verts": 223, "tris": 424, "vOff": 1152484, "iOff": 1155160, "idx32": false, "blend": [3.75, 19.27]}, {"name": "sa_seg2", "verts": 497, "tris": 790, "vOff": 1157704, "iOff": 1163668, "idx32": false}];
