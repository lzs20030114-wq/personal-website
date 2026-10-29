/**
 * 案例页分镜（FrameStrip）的帧数据（2026-10-28 项目二起用，2026-10-29 项目一跟上）。
 *
 * 每组 = 同一台 /lab 台架在若干时刻的截图，按时间排成一行（漫画式的小格），点开看大图。
 * 也收少量不是台架截图的单张（项目一的模型渲染，来自交接图册），单张一组、不带「去实验室」。
 * 截图由 scripts/case-frames/capture.mjs 从生产构建截出（假时钟 + 带种子的随机数，同一份脚本
 * 每次截到同一组画面），存成两份 webp：`<file>.webp` 原图（看图器用）、`<file>-s.webp` 缩略图（格子里用）。
 * 读数（t）是截图那一刻台架 HUD 上的数：结构台是协议步数，2-14 / 2-15 是仿真时间。
 * 说明（note）是站方写的图注，只描述画面里看得见的东西。
 *
 * 守门 case-frames.test.ts：每张图都在 public/ 里、尺寸与这里写的一致、中英两份齐全、
 * 两种语言的正文引用同样几组、引用的组都存在。
 */

export type Bi = { en: string; zh: string };

export type FrameProject = 'project-ii' | 'reincarnation-machine';

export interface Frame {
  /** 文件名（不带扩展名），在 public/work/<project>/frames/<set>/ 下 */
  file: string;
  /** 读数：步数或时刻 */
  t: Bi;
  /** 一句说明（可省） */
  note?: Bi;
}

export interface FrameSet {
  /** 哪个项目的案例页用这一组（决定图放在哪个目录、由哪份正文引用） */
  project: FrameProject;
  /** 对应的 /lab 台架编号（图注里「去实验室」链接）；不是台架截图的组不写 */
  lab?: string;
  /** 深链（含编制，如 `2-5-level`）；缺省 = lab */
  hash?: string;
  /** 原图像素宽高（同组每帧相同） */
  w: number;
  h: number;
  /** 缩略图像素宽 */
  tw: number;
  /** 桌面宽度下一行几格；缺省 = 帧数 */
  cols?: number;
  caption: Bi;
  sub?: Bi;
  frames: Frame[];
}

export function frameSrc(set: string, file: string, thumb = false): string {
  const project = CASE_FRAMES[set]?.project ?? 'project-ii';
  return `/work/${project}/frames/${set}/${file}${thumb ? '-s' : ''}.webp`;
}

export const CASE_FRAMES: Record<string, FrameSet> = {
  // FIG.02 · 方法：一位访客坐下，猫被一步一步引到座位前方那台（Lab 2-14 默认场景，平面）
  'plan-sit': {
    project: 'project-ii',
    lab: '2-14',
    w: 900,
    h: 894,
    tw: 560,
    cols: 4,
    caption: {
      zh: '一位访客、一只猫的一场（实验 2-14，平面）。实心圆是坐着的人，绿色虚线是空间给猫铺的路，紫色点线框是座位前方那台',
      en: 'One visitor and one cat (Lab 2-14, plan). A filled circle is a seated person, the green dashes are the route the space lays for the cat, and the dotted purple square is the unit in front of the seat',
    },
    frames: [
      { file: 't000', t: { zh: '0:00', en: '0:00' }, note: { zh: '访客在走，猫在左上角的台上', en: 'the visitor walks, the cat is on a unit in the top-left corner' } },
      { file: 't016', t: { zh: '0:16', en: '0:16' }, note: { zh: '坐下，面前那台落成茶几（49 cm），猫脚下铺出第一步', en: 'sits down, the unit in front becomes a coffee table (49 cm) and the first step is laid from the cat' } },
      { file: 't060', t: { zh: '1:00', en: '1:00' }, note: { zh: '猫沿着递过来的台一步一步走', en: 'the cat walks along the units offered, one at a time' } },
      { file: 't160', t: { zh: '2:40', en: '2:40' }, note: { zh: '路在右上角拐下来', en: 'the route turns down at the top right' } },
      { file: 't200', t: { zh: '3:20', en: '3:20' }, note: { zh: '猫往座位这边下来', en: 'the cat comes down towards the seat' } },
      { file: 't220', t: { zh: '3:40', en: '3:40' }, note: { zh: '离座位前方那台还差一步', en: 'one step from the unit in front of the seat' } },
      { file: 't240', t: { zh: '4:00', en: '4:00' }, note: { zh: '猫到了座位前方那台', en: 'the cat reaches the unit in front of the seat' } },
      { file: 't270', t: { zh: '4:30', en: '4:30' }, note: { zh: '访客起身离开，桌子收回，猫下了台', en: 'the visitor leaves, the table goes up, the cat has come down off the units' } },
    ],
  },
  // FIG.03 · 一条带：四张键谱同一次收缩（Lab 2-1）
  'strip-forming': {
    project: 'project-ii',
    lab: '2-1',
    w: 1552,
    h: 783,
    tw: 720,
    cols: 3,
    caption: {
      zh: '四张键谱跑同一次收缩（实验 2-1），从左到右是袋、蘑菇挑台、直挑台、阶梯方箱，橙色是已经扣上的键',
      en: 'Four bond maps in the same contraction run (Lab 2-1), from left to right a pocket, a bulb flange, a straight ledge and a stepped box. Orange marks bonds that have locked',
    },
    frames: [
      { file: 's0000', t: { zh: '步 0', en: 'step 0' }, note: { zh: '芯开始收缩，布比芯长 5%', en: 'the core starts to shorten, the fabric 5% longer than it' } },
      { file: 's0200', t: { zh: '步 201', en: 'step 201' }, note: { zh: '富余往外鼓', en: 'the slack bows outward' } },
      { file: 's0400', t: { zh: '步 401', en: 'step 401' }, note: { zh: '鼓包各自拉成自己的形，键还没扣上', en: 'each bulge pulls into its own shape, no bond locked yet' } },
      { file: 's0700', t: { zh: '步 700', en: 'step 700' }, note: { zh: '袋和阶梯方箱的键扣上', en: 'the pocket and the stepped box lock' } },
      { file: 's0800', t: { zh: '步 801', en: 'step 801' }, note: { zh: '蘑菇挑台和直挑台扣上', en: 'the bulb flange and the straight ledge lock' } },
      { file: 's1500', t: { zh: '步 1500', en: 'step 1500' }, note: { zh: '芯停住，布被拉紧', en: 'the core holds and the fabric is pulled taut' } },
    ],
  },
  // FIG.05 · 形态的连续：十二条带目录渐变（Lab 2-4，正视，终态）
  'series-gradient': {
    project: 'project-ii',
    lab: '2-4',
    hash: '2-4-gradient',
    w: 1552,
    h: 507,
    tw: 1100,
    caption: {
      zh: '十二条带的键谱逐级微变，左起蘑菇挑台，右至阶梯方箱（实验 2-4，正视，终态）',
      en: 'Twelve bond maps changing by small steps, from the bulb flange on the left to the stepped box on the right (Lab 2-4, front view, final state)',
    },
    frames: [{ file: 's1500', t: { zh: '步 1500', en: 'step 1500' } }],
  },
  // FIG.06 · 裂成两片台：十条带（Lab 2-4 捏分，正视）
  'series-split': {
    project: 'project-ii',
    lab: '2-4',
    hash: '2-4-split',
    w: 1552,
    h: 484,
    tw: 720,
    cols: 3,
    caption: {
      zh: '十条带从一整块方箱（最左）逐级裂成上下两片台（最右）（实验 2-4，正视）',
      en: 'Ten strips going from one solid box (far left) to an upper and a lower slab (far right) (Lab 2-4, front view)',
    },
    frames: [
      { file: 's0200', t: { zh: '步 200', en: 'step 200' }, note: { zh: '富余鼓出，最左的整块方箱先扣上', en: 'the slack bows out and the solid box on the left locks first' } },
      { file: 's0400', t: { zh: '步 400', en: 'step 400' }, note: { zh: '鼓包开始分出上下两层', en: 'the bulges begin to divide into an upper and a lower layer' } },
      { file: 's0500', t: { zh: '步 500', en: 'step 500' }, note: { zh: '缝从左到右一条比一条深', en: 'the gap deepens from one strip to the next, left to right' } },
      { file: 's0600', t: { zh: '步 600', en: 'step 600' }, note: { zh: '轮廓逐渐变方', en: 'the outlines square up' } },
      { file: 's0700', t: { zh: '步 700', en: 'step 700' }, note: { zh: '最右几条的缝裂到芯上', en: 'on the rightmost strips the gap reaches the core' } },
      { file: 's1500', t: { zh: '步 1500', en: 'step 1500' }, note: { zh: '终态', en: 'final state' } },
    ],
  },
  // FIG.07 · 绕成一圈（Lab 2-5 整环同形 · 阶梯方箱，轴测）
  'ring-forming': {
    project: 'project-ii',
    lab: '2-5',
    hash: '2-5-single',
    w: 621,
    h: 968,
    tw: 400,
    caption: {
      zh: '二十条窄带用同一张键谱（阶梯方箱），绕一根竖轴在同一次收缩里扣成一圈环形平台（实验 2-5）',
      en: 'Twenty narrow strips with one bond map (the stepped box) fastening into a ring-shaped platform around one vertical axis in a single contraction run (Lab 2-5)',
    },
    frames: [
      { file: 's0000', t: { zh: '步 0', en: 'step 0' }, note: { zh: '一圈直垂的带', en: 'a ring of hanging strips' } },
      { file: 's0300', t: { zh: '步 300', en: 'step 300' }, note: { zh: '富余鼓成一圈褶', en: 'the slack bows into a ring of folds' } },
      { file: 's0450', t: { zh: '步 451', en: 'step 451' }, note: { zh: '褶往外伸', en: 'the folds reach outward' } },
      { file: 's0550', t: { zh: '步 550', en: 'step 550' }, note: { zh: '伸到最远', en: 'at their furthest' } },
      { file: 's0650', t: { zh: '步 650', en: 'step 650' }, note: { zh: '键扣上，箱形出来', en: 'bonds lock and the box appears' } },
      { file: 's1500', t: { zh: '步 1500', en: 'step 1500' }, note: { zh: '一圈平台', en: 'a ring-shaped platform' } },
    ],
  },
  // FIG.08 · 由圆到方（Lab 2-7 整环平，五种轮廓，高角度俯视，终态）
  'round-to-square': {
    project: 'project-ii',
    lab: '2-7',
    hash: '2-7-flat',
    w: 683,
    h: 899,
    tw: 400,
    caption: {
      zh: '同一种台，五种轮廓，只改每条带挑出的长度（实验 2-7，俯视，终态）',
      en: 'The same platform in five outlines, with only the reach of each strip changed (Lab 2-7, from above, final state)',
    },
    frames: [
      { file: 'o1', t: { zh: '圆', en: 'circle' } },
      { file: 'o2', t: { zh: '微方', en: 'soft square' } },
      { file: 'o3', t: { zh: '半方', en: 'half square' } },
      { file: 'o4', t: { zh: '近方', en: 'near square' } },
      { file: 'o5', t: { zh: '方', en: 'square' } },
    ],
  },
  // FIG.09 · 在房间里（Lab 2-15，前排沙发，放大）：落下、成形、收回
  'room-cycle': {
    project: 'project-ii',
    lab: '2-15',
    w: 1016,
    h: 754,
    tw: 480,
    cols: 3,
    caption: {
      zh: '前排沙发上两位访客坐下又起身，面前那台落下当茶几再收回（实验 2-15，局部）',
      en: 'Two visitors on the front sofa sit down and later stand, and the unit in front of them comes down as a coffee table and goes back up (Lab 2-15, detail)',
    },
    frames: [
      { file: 't011_00', t: { zh: '0:11.0', en: '0:11.0' }, note: { zh: '两人走到沙发前，面前的单元还收在天花板下', en: 'two visitors reach the sofa, the unit in front of it still stowed under the ceiling' } },
      { file: 't011_45', t: { zh: '0:11.5', en: '0:11.5' }, note: { zh: '坐下，面前那台沿芯落下', en: 'they sit, and the unit in front comes down its core' } },
      { file: 't011_90', t: { zh: '0:11.9', en: '0:11.9' }, note: { zh: '落到茶几高度，收缩成形', en: 'at coffee-table height it contracts and forms' } },
      { file: 't012_50', t: { zh: '0:12.5', en: '0:12.5' }, note: { zh: '茶几成形', en: 'the coffee table has formed' } },
      { file: 't140_80', t: { zh: '2:20.8', en: '2:20.8' }, note: { zh: '两人起身，桌子往上收', en: 'they stand, and the table rises' } },
      { file: 't142_60', t: { zh: '2:22.6', en: '2:22.6' }, note: { zh: '收回天花板下', en: 'back under the ceiling' } },
    ],
  },
  // FIG.10 · 两种用法（Lab 2-15 侧视）
  'two-uses': {
    project: 'project-ii',
    lab: '2-15',
    w: 1008,
    h: 536,
    tw: 1008,
    caption: {
      zh: '侧视剖面（实验 2-15，第 100 秒）。沙发前落成茶几的单元台面离地 0.49 m，猫待的那台停在 1.05 m，其余单元收在天花板下',
      en: 'Side section (Lab 2-15, at 100 s). A unit that came down as a coffee table in front of a sofa sits 0.49 m above the floor, the unit a cat is on stays at 1.05 m, and the rest are stowed under the ceiling',
    },
    frames: [{ file: 't100-side', t: { zh: '1:40 · 侧视', en: '1:40 · side view' } }],
  },

  // ─── 项目一（轮回机器）─────────────────────────────────────────────────────
  // N04 · 外形：整机台架停在全开，四个固定视角（Lab 1-5）。按内容自动取景，四张同尺寸
  'form-views': {
    project: 'reincarnation-machine',
    lab: '1-5',
    w: 1200,
    h: 900,
    tw: 480,
    caption: {
      zh: '整机台架停在全开（实验 1-5，中间轴 0°），四个固定视角。外覆的布皮是半透明的示意，实物蒙皮还没做',
      en: 'The full-machine bench held fully open (Lab 1-5, shaft at 0°) from its four fixed views. The fabric skin is a translucent stand-in, as the physical skin has not been made',
    },
    frames: [
      { file: 'axon', t: { zh: '轴测', en: 'axonometric' } },
      { file: 'left', t: { zh: '沿体轴看', en: 'along the body axis' }, note: { zh: '最前面是 S1 环', en: 'ring S1 nearest' } },
      { file: 'front', t: { zh: '侧视', en: 'side' }, note: { zh: '臂伸向左边', en: 'the arm extends to the left' } },
      { file: 'top', t: { zh: '俯视', en: 'top' } },
    ],
  },
  // N21 · 整机分解（交接图册 RM-HO-04，815.3dm 渲染）
  explode: {
    project: 'reincarnation-machine',
    w: 1400,
    h: 1167,
    tw: 900,
    caption: {
      zh: '整机分解，由 8 月 13 日的整机模型（815.3dm）渲染。从下往上是 X 形底座、转台、笼架、机身底盘、滑轨架与中间轴、五个环，臂在左侧，两条触须在机身下方。电机、皮带和转台外形模型里没有画，图中按模型留好的框位补画',
      en: 'Exploded view rendered from the assembly model of 13 August (815.3dm). From the bottom: X-shaped base, turntable, cage, chassis, slide frames and shaft, and the five rings, with the arm on the left and the two feelers under the body. The model has no motors, belt or turntable housing, so these are drawn into the frames it leaves for them',
    },
    frames: [{ file: 'explode', t: { zh: '分解图', en: 'exploded view' } }],
  },
  // N22 · 一次张合：沿体轴看，中间轴 0° → 180°（Lab 1-5 停转、相位滑块一度一度推）
  breath: {
    project: 'reincarnation-machine',
    lab: '1-5',
    w: 745,
    h: 714,
    tw: 420,
    caption: {
      zh: '一次张合（实验 1-5，沿体轴看，最前面是 S1 环）。中间轴从 0° 转到 180°，五个环同时收拢，台架用的是 7 月的曲柄方案',
      en: 'One opening and closing (Lab 1-5, looking along the body axis with ring S1 nearest). As the shaft turns from 0° to 180° all five rings close together. The bench uses the July crank design',
    },
    frames: [
      { file: 'p000', t: { zh: '0°', en: '0°' }, note: { zh: '全开', en: 'fully open' } },
      { file: 'p045', t: { zh: '45°', en: '45°' } },
      { file: 'p090', t: { zh: '90°', en: '90°' }, note: { zh: '走到一半', en: 'halfway' } },
      { file: 'p135', t: { zh: '135°', en: '135°' } },
      { file: 'p180', t: { zh: '180°', en: '180°' }, note: { zh: '折叠', en: 'folded' } },
    ],
  },
  // N23 · 肌腱走线（交接图册 RM-HO-10 图 19，815.3dm 剖面）
  'tendon-route': {
    project: 'reincarnation-machine',
    w: 1500,
    h: 560,
    tw: 1100,
    caption: {
      zh: '一根肌腱在第 1、2 节里的走法（815 模型，沿这根肌腱所在的竖直面剖开，只留远侧一半）。红线进端板窗口后越过轴线，压进中央导块对面的槽口，再回到下一片端板本侧的窗口',
      en: 'How one tendon runs through vertebrae 1 and 2 (815 model, cut along the vertical plane of that tendon, far half only). The red line enters the end-plate window, crosses the axis into the slot on the far side of the central guide, and returns to the window on its own side of the next end plate',
    },
    frames: [{ file: 'arm-cut', t: { zh: '剖面 · 第 1、2 节', en: 'section · vertebrae 1–2' } }],
  },
  // N24 · 惊跳：回避型被敲一下（Lab 1-6，侧视，指针不当手），按全部帧的并集取景
  startle: {
    project: 'reincarnation-machine',
    lab: '1-6',
    w: 1225,
    h: 690,
    tw: 400,
    cols: 6,
    caption: {
      zh: '回避型被敲了一下（实验 1-6，侧视）。0.1 秒后发出反射，臂背离刺激往下缩，再按回避型的方式慢慢恢复。臂有自己的惯性，动作在画面上晚零点几秒才看得出来。时间从敲的那一刻算起',
      en: 'The avoidant type is knocked (Lab 1-6, side view). After 0.1 s the reflex is issued, the arm flexes down away from the stimulus, and it then recovers in the avoidant way. The arm has its own inertia, so the movement shows a few tenths of a second later. Times are counted from the knock',
    },
    frames: [
      { file: 't000', t: { zh: '敲之前', en: 'before the knock' } },
      { file: 't010', t: { zh: '0.1 s', en: '0.1 s' }, note: { zh: '反射发出', en: 'the reflex is issued' } },
      { file: 't025', t: { zh: '0.25 s', en: '0.25 s' }, note: { zh: '触须先甩开', en: 'the feelers swing out first' } },
      { file: 't060', t: { zh: '0.6 s', en: '0.6 s' }, note: { zh: '臂背离刺激往下缩', en: 'the arm flexes down, away from the knock' } },
      { file: 't150', t: { zh: '1.5 s', en: '1.5 s' }, note: { zh: '缩到最低', en: 'at its lowest' } },
      { file: 't400', t: { zh: '4 s', en: '4 s' }, note: { zh: '慢慢抬回', en: 'slowly lifting back' } },
    ],
  },
  // N25 · 手：同一只手放在同一处，热情型与回避型（Lab 1-6，俯视，指针 = 手），时间从手出现算起
  hand: {
    project: 'reincarnation-machine',
    lab: '1-6',
    w: 1084,
    h: 1002,
    tw: 300,
    cols: 6,
    caption: {
      zh: '同一只手放在同一处（实验 1-6，俯视，鼠标指针当作手）。上一行是热情型，下一行是回避型，时间从手出现算起。绿圈表示迎向这只手，粉圈表示避开它，圈变实心表示接触',
      en: 'The same hand in the same place (Lab 1-6, top view, the mouse pointer as a hand). The top row is the warm type and the bottom row the avoidant type, with times counted from when the hand appears. A green ring is a hand being reached for, a pink ring one being avoided, and a filled ring means contact',
    },
    frames: [
      { file: 'warm-pre', t: { zh: '热情 · 手出现前', en: 'warm · no hand yet' } },
      { file: 'warm-t005', t: { zh: '0.5 s', en: '0.5 s' }, note: { zh: '手进入视野，开始迎向手', en: 'the hand comes into view and it starts to reach for it' } },
      { file: 'warm-t020', t: { zh: '2.0 s', en: '2.0 s' }, note: { zh: '转向手', en: 'turns towards the hand' } },
      { file: 'warm-t045', t: { zh: '4.5 s', en: '4.5 s' }, note: { zh: '手停稳了，臂凑过去', en: 'the hand is still and the arm closes in' } },
      { file: 'warm-t055', t: { zh: '5.5 s', en: '5.5 s' }, note: { zh: '碰到手，开始缠', en: 'touches the hand and starts to wrap' } },
      { file: 'warm-t070', t: { zh: '7.0 s', en: '7.0 s' }, note: { zh: '握住手', en: 'holds the hand' } },
      { file: 'avoid-pre', t: { zh: '回避 · 手出现前', en: 'avoidant · no hand yet' } },
      { file: 'avoid-t005', t: { zh: '0.5 s', en: '0.5 s' }, note: { zh: '手进入视野，侧转身体', en: 'the hand comes into view and it turns side-on' } },
      { file: 'avoid-t030', t: { zh: '3.0 s', en: '3.0 s' }, note: { zh: '臂弯向背离手的一侧', en: 'the arm is held away from the hand' } },
      { file: 'avoid-t060', t: { zh: '6.0 s', en: '6.0 s' }, note: { zh: '手开始朝机身移动', en: 'the hand starts towards the body' } },
      { file: 'avoid-t070', t: { zh: '7.0 s', en: '7.0 s' }, note: { zh: '臂甩开', en: 'the arm swings clear' } },
      { file: 'avoid-t110', t: { zh: '11.0 s', en: '11.0 s' }, note: { zh: '手到了机身边上，臂仍弯向背离手的一侧', en: 'the hand is beside the body, the arm still away from it' } },
    ],
  },
};
