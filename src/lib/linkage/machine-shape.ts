// machine-shape.ts —— 轮回机器整机（Lab.05）形体分组与绑定表，机器生成。
// 来源：模型求解器参考/729新参考.3dm（环身/单杆轮/驱动杆，2026-07-29 提取）
//     + 模型求解器参考/底架改进.3dm（底盘/滑轨架/轴系/触手摆位，2026-07-31 换源），
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
export const SMALLARM_PLACEMENTS: ReadonlyArray<SmallArmPlacement> = [{"o": [-120.5251, -158.5474, -42.9344], "axis": [-0.0, 1.0, 0.0], "h": [-1.0, 0.0, 0.0]}, {"o": [49.4751, 147.6827, -42.8344], "axis": [-0.0, -1.0, 0.0], "h": [1.0, 0.0, 0.0]}];
export const SMALLARM_SHAPE = {"L1": 62.344, "LS": 23.016, "L2": 24.333, "blend": [3.75, 19.27]} as const;

export const MACHINE_MESH_URL = '/mesh/machine-mesh.bin';
export const MACHINE_TRIS = 84125;
export const MACHINE_DRIVE: ReadonlyArray<MachineDrive> = [{"ring": "S1_M3x1.057", "station": -170.0, "crankR": 29.882, "apex0": 126.294}, {"ring": "S2_M1x1.184", "station": -85.0, "crankR": 48.928, "apex0": 221.228}, {"ring": "S3_M5x1.584", "station": 0.0, "crankR": 34.733, "apex0": 157.275}, {"ring": "S4_M3x1.000", "station": 85.0, "crankR": 28.097, "apex0": 119.216}, {"ring": "S5_M3x0.870", "station": 170.0, "crankR": 24.178, "apex0": 103.282}];
export const MACHINE_GROUPS: ReadonlyArray<MachineGroup> = [{"name": "x0_13", "verts": 240, "tris": 480, "vOff": 0, "iOff": 2880, "idx32": false}, {"name": "x0_5", "verts": 240, "tris": 480, "vOff": 5760, "iOff": 8640, "idx32": false}, {"name": "p0_1", "verts": 346, "tris": 708, "vOff": 11520, "iOff": 15672, "idx32": false}, {"name": "p0_12", "verts": 344, "tris": 704, "vOff": 19920, "iOff": 24048, "idx32": false}, {"name": "p0_13", "verts": 344, "tris": 704, "vOff": 28272, "iOff": 32400, "idx32": false}, {"name": "p0_2", "verts": 334, "tris": 680, "vOff": 36624, "iOff": 40632, "idx32": false}, {"name": "p0_5", "verts": 334, "tris": 680, "vOff": 44712, "iOff": 48720, "idx32": false}, {"name": "p0_6", "verts": 346, "tris": 708, "vOff": 52800, "iOff": 56952, "idx32": false}, {"name": "p0_10", "verts": 344, "tris": 704, "vOff": 61200, "iOff": 65328, "idx32": false}, {"name": "p0_3", "verts": 334, "tris": 680, "vOff": 69552, "iOff": 73560, "idx32": false}, {"name": "p0_7", "verts": 344, "tris": 704, "vOff": 77640, "iOff": 81768, "idx32": false}, {"name": "p0_9", "verts": 344, "tris": 704, "vOff": 85992, "iOff": 90120, "idx32": false}, {"name": "p0_11", "verts": 346, "tris": 708, "vOff": 94344, "iOff": 98496, "idx32": false}, {"name": "p0_0", "verts": 344, "tris": 704, "vOff": 102744, "iOff": 106872, "idx32": false}, {"name": "p0_4", "verts": 334, "tris": 680, "vOff": 111096, "iOff": 115104, "idx32": false}, {"name": "p0_8", "verts": 344, "tris": 704, "vOff": 119184, "iOff": 123312, "idx32": false}, {"name": "w0", "verts": 525, "tris": 1030, "vOff": 127536, "iOff": 133836, "idx32": false}, {"name": "r0", "verts": 733, "tris": 1288, "vOff": 140016, "iOff": 148812, "idx32": false}, {"name": "p1_13", "verts": 318, "tris": 648, "vOff": 156540, "iOff": 160356, "idx32": false}, {"name": "p1_12", "verts": 318, "tris": 648, "vOff": 164244, "iOff": 168060, "idx32": false}, {"name": "p1_11", "verts": 318, "tris": 648, "vOff": 171948, "iOff": 175764, "idx32": false}, {"name": "p1_10", "verts": 318, "tris": 648, "vOff": 179652, "iOff": 183468, "idx32": false}, {"name": "p1_9", "verts": 318, "tris": 648, "vOff": 187356, "iOff": 191172, "idx32": false}, {"name": "p1_8", "verts": 318, "tris": 648, "vOff": 195060, "iOff": 198876, "idx32": false}, {"name": "p1_7", "verts": 318, "tris": 648, "vOff": 202764, "iOff": 206580, "idx32": false}, {"name": "p1_6", "verts": 318, "tris": 648, "vOff": 210468, "iOff": 214284, "idx32": false}, {"name": "p1_5", "verts": 318, "tris": 648, "vOff": 218172, "iOff": 221988, "idx32": false}, {"name": "p1_4", "verts": 318, "tris": 648, "vOff": 225876, "iOff": 229692, "idx32": false}, {"name": "p1_3", "verts": 322, "tris": 656, "vOff": 233580, "iOff": 237444, "idx32": false}, {"name": "p1_2", "verts": 322, "tris": 656, "vOff": 241380, "iOff": 245244, "idx32": false}, {"name": "p1_1", "verts": 320, "tris": 652, "vOff": 249180, "iOff": 253020, "idx32": false}, {"name": "p1_0", "verts": 318, "tris": 648, "vOff": 256932, "iOff": 260748, "idx32": false}, {"name": "w1", "verts": 538, "tris": 1068, "vOff": 264636, "iOff": 271092, "idx32": false}, {"name": "r1", "verts": 694, "tris": 1186, "vOff": 277500, "iOff": 285828, "idx32": false}, {"name": "p2_9", "verts": 322, "tris": 656, "vOff": 292944, "iOff": 296808, "idx32": false}, {"name": "p2_8", "verts": 322, "tris": 656, "vOff": 300744, "iOff": 304608, "idx32": false}, {"name": "p2_7", "verts": 318, "tris": 648, "vOff": 308544, "iOff": 312360, "idx32": false}, {"name": "p2_6", "verts": 320, "tris": 652, "vOff": 316248, "iOff": 320088, "idx32": false}, {"name": "p2_5", "verts": 322, "tris": 656, "vOff": 324000, "iOff": 327864, "idx32": false}, {"name": "p2_4", "verts": 324, "tris": 660, "vOff": 331800, "iOff": 335688, "idx32": false}, {"name": "p2_3", "verts": 320, "tris": 652, "vOff": 339648, "iOff": 343488, "idx32": false}, {"name": "p2_2", "verts": 318, "tris": 648, "vOff": 347400, "iOff": 351216, "idx32": false}, {"name": "p2_1", "verts": 322, "tris": 656, "vOff": 355104, "iOff": 358968, "idx32": false}, {"name": "p2_0", "verts": 322, "tris": 656, "vOff": 362904, "iOff": 366768, "idx32": false}, {"name": "x2_9", "verts": 121, "tris": 121, "vOff": 370704, "iOff": 372156, "idx32": false}, {"name": "w2", "verts": 684, "tris": 1354, "vOff": 372884, "iOff": 381092, "idx32": false}, {"name": "r2", "verts": 648, "tris": 1159, "vOff": 389216, "iOff": 396992, "idx32": false}, {"name": "p3_2", "verts": 348, "tris": 712, "vOff": 403948, "iOff": 408124, "idx32": false}, {"name": "p3_4", "verts": 346, "tris": 708, "vOff": 412396, "iOff": 416548, "idx32": false}, {"name": "p3_5", "verts": 346, "tris": 708, "vOff": 420796, "iOff": 424948, "idx32": false}, {"name": "p3_6", "verts": 346, "tris": 708, "vOff": 429196, "iOff": 433348, "idx32": false}, {"name": "p3_10", "verts": 334, "tris": 680, "vOff": 437596, "iOff": 441604, "idx32": false}, {"name": "p3_13", "verts": 346, "tris": 708, "vOff": 445684, "iOff": 449836, "idx32": false}, {"name": "p3_0", "verts": 346, "tris": 708, "vOff": 454084, "iOff": 458236, "idx32": false}, {"name": "p3_1", "verts": 346, "tris": 708, "vOff": 462484, "iOff": 466636, "idx32": false}, {"name": "p3_3", "verts": 346, "tris": 708, "vOff": 470884, "iOff": 475036, "idx32": false}, {"name": "p3_7", "verts": 348, "tris": 712, "vOff": 479284, "iOff": 483460, "idx32": false}, {"name": "p3_8", "verts": 334, "tris": 680, "vOff": 487732, "iOff": 491740, "idx32": false}, {"name": "p3_11", "verts": 334, "tris": 680, "vOff": 495820, "iOff": 499828, "idx32": false}, {"name": "p3_12", "verts": 348, "tris": 712, "vOff": 503908, "iOff": 508084, "idx32": false}, {"name": "p3_9", "verts": 334, "tris": 680, "vOff": 512356, "iOff": 516364, "idx32": false}, {"name": "w3", "verts": 562, "tris": 1132, "vOff": 520444, "iOff": 527188, "idx32": false}, {"name": "r3", "verts": 593, "tris": 1145, "vOff": 533980, "iOff": 541096, "idx32": false}, {"name": "p4_1", "verts": 358, "tris": 732, "vOff": 547968, "iOff": 552264, "idx32": false}, {"name": "p4_2", "verts": 340, "tris": 692, "vOff": 556656, "iOff": 560736, "idx32": false}, {"name": "p4_5", "verts": 340, "tris": 692, "vOff": 564888, "iOff": 568968, "idx32": false}, {"name": "p4_6", "verts": 358, "tris": 732, "vOff": 573120, "iOff": 577416, "idx32": false}, {"name": "p4_10", "verts": 356, "tris": 728, "vOff": 581808, "iOff": 586080, "idx32": false}, {"name": "p4_12", "verts": 356, "tris": 728, "vOff": 590448, "iOff": 594720, "idx32": false}, {"name": "p4_13", "verts": 356, "tris": 728, "vOff": 599088, "iOff": 603360, "idx32": false}, {"name": "p4_0", "verts": 356, "tris": 728, "vOff": 607728, "iOff": 612000, "idx32": false}, {"name": "p4_3", "verts": 340, "tris": 692, "vOff": 616368, "iOff": 620448, "idx32": false}, {"name": "p4_4", "verts": 340, "tris": 692, "vOff": 624600, "iOff": 628680, "idx32": false}, {"name": "p4_7", "verts": 356, "tris": 728, "vOff": 632832, "iOff": 637104, "idx32": false}, {"name": "p4_8", "verts": 356, "tris": 728, "vOff": 641472, "iOff": 645744, "idx32": false}, {"name": "p4_9", "verts": 356, "tris": 728, "vOff": 650112, "iOff": 654384, "idx32": false}, {"name": "p4_11", "verts": 360, "tris": 736, "vOff": 658752, "iOff": 663072, "idx32": false}, {"name": "w4", "verts": 632, "tris": 1270, "vOff": 667488, "iOff": 675072, "idx32": false}, {"name": "r4", "verts": 721, "tris": 1311, "vOff": 682692, "iOff": 691344, "idx32": false}, {"name": "frame", "verts": 7440, "tris": 16506, "vOff": 699212, "iOff": 788492, "idx32": false}, {"name": "shaft", "verts": 1217, "tris": 2490, "vOff": 887528, "iOff": 902132, "idx32": false}, {"name": "sa_mount", "verts": 1367, "tris": 2557, "vOff": 917072, "iOff": 933476, "idx32": false}, {"name": "sa_seg1", "verts": 1657, "tris": 3074, "vOff": 948820, "iOff": 968704, "idx32": false}, {"name": "sa_soft", "verts": 223, "tris": 424, "vOff": 987148, "iOff": 989824, "idx32": false, "blend": [3.75, 19.27]}, {"name": "sa_seg2", "verts": 490, "tris": 770, "vOff": 992368, "iOff": 998248, "idx32": false}];
