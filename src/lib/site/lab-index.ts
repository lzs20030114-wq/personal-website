/**
 * /lab 目录（2026-09-17，用户手绘立项「左边加一列目录，可以直接概览整体，想看什么直接点击跳转」）。
 *
 * 这是 /lab 页的**唯一**台架清单：页面上每台的题头（Lab 编号 + 标题）与图框顶线颜色
 * 都从这里取，左栏目录也从这里画 ⇒ 目录与页面不可能各说各话（守门另卡「页面里每个
 * `no=` 都登记在此、此处每条都在页面里」）。
 *
 * 结构 = 项目 → 段 → 台架，与页面上的 ProjectRule / ScaleRule 一一对应：
 * 项目一没有段（五台直接挂项目下，segment 只有一条、不出段头）；项目二按尺度六段
 * （2026-09-03 收纳 + 09-03/09-04 追加的 Ⅴ Ⅵ + 09-17/09-20 的 Ⅶ 单元组合）。编号按项目（2026-09-13 拍板）。
 *
 * kernel：'2d' = 2D 内核（绿）· '3d' = 3D 内核（紫），与图框顶线同一套编码
 * （稿内：2D 绿 / 3D 紫）；Lab 2-10 / 2-11 是 2D canvas 平面，按 2D 记。
 */
export type LabKernel = "2d" | "3d";

export interface LabBench {
  /** 页面编号「项目-序号」，锚点 `#lab${no}` */
  no: string;
  title: string;
  kernel: LabKernel;
  /** 原主页预览文案，现与台架目录共用编号。 */
  description: string;
  meta: string;
}

export interface LabSegment {
  /** 段序号（罗马数字）；项目一唯一那段没有段头，n 为 '' */
  n: string;
  label: string;
  /** 段头右侧副题（页面 ScaleRule 的 sub） */
  sub: string;
  benches: LabBench[];
}

export interface LabGroup {
  /** 项目 slug；目录里作分组键 */
  key: "project-i" | "project-ii";
  label: string;
  /** 项目头右侧副题（页面 ProjectRule 的 sub） */
  sub: string;
  segments: LabSegment[];
}

export const LAB_INDEX: readonly LabGroup[] = [
  {
    key: "project-i",
    label: "Project I — Reincarnation machine",
    sub: "Lab 1-1 – 1-5 · two linkage kernels",
    segments: [
      {
        n: "",
        label: "",
        sub: "",
        benches: [
          { no: "1-1", title: "Four-bar linkage", kernel: "2d", description: 'Drag a joint to move the four-bar mechanism and trace its path.', meta: '36 tests · SVG' },
          { no: "1-2", title: "Arch ring solver", kernel: "2d", description: 'The S4 scissor arch, driven by a crank-slider.', meta: 'Kernel untouched · SVG' },
          { no: "1-3", title: "Tendon tentacle", kernel: "3d", description: 'Bend seven vertebrae with three tendons spaced at 120°.', meta: 'Orbit camera · WebGL' },
          { no: "1-4", title: "Five-ring shell", kernel: "3d", description: 'Five rings opening and closing together.', meta: 'Calibrated stops · WebGL' },
          { no: "1-5", title: "Full assembly", kernel: "3d", description: 'One shaft drives five rings; three tendons bend the arm.', meta: 'Real solids · WebGL' },
        ],
      },
    ],
  },
  {
    key: "project-ii",
    label: "Project II — Spatial simulation",
    sub: "Lab 2-1 – 2-12 · skin-unit engine & geometry studies",
    segments: [
      {
        n: "Ⅰ",
        label: "One band",
        sub: "Lab 2-1 – 2-3 · what a unit is",
        benches: [
          { no: "2-1", title: "Contractile skin units", kernel: "2d", description: 'Four bond patterns turn a contracting strip into four shapes.', meta: 'Python parity · SVG' },
          { no: "2-2", title: "Skin units, solid", kernel: "3d", description: 'The four fabric bands in 3D, with visible sections and bonds.', meta: 'Shared 3D rig · WebGL' },
          { no: "2-3", title: "Two structures, one band", kernel: "3d", description: 'Two structures on one strip, with an adjustable gap.', meta: '5 dual bands · WebGL' },
        ],
      },
      {
        n: "Ⅱ",
        label: "A row",
        sub: "Lab 2-4 · transitions along a line",
        benches: [{ no: "2-4", title: "Series", kernel: "3d", description: 'Compare a graded series with a platform splitting in two.', meta: '2 plans · WebGL' }],
      },
      {
        n: "Ⅲ",
        label: "A ring",
        sub: "Lab 2-5 – 2-7 · the row closed into a loop",
        benches: [
          { no: "2-5", title: "Cylinder of units", kernel: "3d", description: 'Twenty bands form a level, undulating, changing, split or double platform.', meta: '5 plans · radius · WebGL' },
          { no: "2-6", title: "Layers within one unit", kernel: "3d", description: 'Round to square, with independent shelf sizes, tilts, gaps and joins.', meta: 'Target + forming bands · WebGL' },
          { no: "2-7", title: "A square ring", kernel: "3d", description: 'Vary each band’s reach to change a round platform into a square.', meta: 'Three depths · WebGL' },
        ],
      },
      {
        n: "Ⅳ",
        label: "A room",
        sub: "Lab 2-8 · the field at real scale",
        benches: [{ no: "2-8", title: "Four by four", kernel: "3d", description: 'Sixteen rings in a room, with a 1.70 m figure for scale.', meta: '16 live rings · WebGL' }],
      },
      {
        n: "Ⅴ",
        label: "Between units",
        sub: "Lab 2-9 · what two, three, four, nine units can be to each other",
        benches: [{ no: "2-9", title: "Between units", kernel: "3d", description: 'Arrange 2, 3, 4 or 9 rings and compare their spacing, heights and timing.', meta: '4 clusters · 5 relations · 2 timings · WebGL' }],
      },
      {
        n: "Ⅵ",
        label: "People",
        sub: "Lab 2-10 – 2-11 · behaviour reaching the units",
        benches: [
          { no: "2-10", title: "A person walks through", kernel: "2d", description: 'Move one person and watch nearby units respond to their floor trace.', meta: '6 behaviours · 3 grids · canvas' },
          { no: "2-11", title: "A few people", kernel: "2d", description: 'Place or drag people to see how their overlapping views affect the units.', meta: 'Up to 8 people · live · canvas' },
        ],
      },
      {
        n: "Ⅶ",
        label: "Compositions",
        sub: "Lab 2-12 · platforms joined high to low",
        benches: [{ no: "2-12", title: "Joined platforms", kernel: "3d", description: 'Join round or square platforms into steps, ramps and enclosures.', meta: '8 figures · round & square · WebGL' }],
      },
    ],
  },
];

/** 全部台架，页序 */
export const LAB_BENCHES: readonly LabBench[] = LAB_INDEX.flatMap((g) =>
  g.segments.flatMap((s) => s.benches),
);

/** 按编号取台架；页面 Bench 用它取题头与顶线色，没登记的编号构建期直接抛 */
export function labBench(no: string): LabBench {
  const b = LAB_BENCHES.find((x) => x.no === no);
  if (!b)
    throw new Error(`lab-index: Lab ${no} 未登记（src/lib/site/lab-index.ts）`);
  return b;
}

/** 台架的图框顶线 / 目录圆点颜色 token（稿内编码：2D 绿、3D 紫） */
export function labAccent(kernel: LabKernel): string {
  return kernel === "2d" ? "var(--accent)" : "var(--accent-2)";
}

/** 锚点 id（与 planHash / LegacyLabHash 同一套：`lab1-1`） */
export function labAnchor(no: string): string {
  return `lab${no}`;
}
