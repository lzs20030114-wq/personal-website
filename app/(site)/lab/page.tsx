import type { ReactNode } from 'react';
import { LabPanel, LabWorkspace } from '../../../components/lab/LabWorkspace';
import './workspace.css';
import './lab-dark.css';
import { LabIntro, LabProjectRule, LabProjectEmpty, LabScaleRule } from '../../../components/lab/LabChrome';
import { LegacyLabHash } from '../../../components/lab/LegacyLabHash';
import { LabIndex } from '../../../components/lab/LabIndex';
import { labAccent, labBench } from '../../../src/lib/site/lab-index';
import { FourBarBench } from '../../../components/lab/FourBarBench';
import { ArchBench } from '../../../components/lab/ArchBench';
import { TentacleBench } from '../../../components/lab/TentacleBench';
import { RingsBench } from '../../../components/lab/RingsBench';
import { MachineBench } from '../../../components/lab/MachineBench';
import { SkinBench } from '../../../components/lab/SkinBench';
import { SkinSolidBench } from '../../../components/lab/SkinSolidBench';
import { SkinRingBench } from '../../../components/lab/SkinRingBench';
import { SkinLayersBench } from '../../../components/lab/SkinLayersBench';
import { SkinSeriesBench } from '../../../components/lab/SkinSeriesBench';
import { SkinGridBench } from '../../../components/lab/SkinGridBench';
import { SkinDualBench } from '../../../components/lab/SkinDualBench';
import { SquareRingBench } from '../../../components/lab/SquareRingBench';
import { SkinClusterBench } from '../../../components/lab/SkinClusterBench';
import { WalkPlanBench, WalkPlanNotes } from '../../../components/lab/WalkPlanBench';
import { CrowdPlanBench, CrowdPlanNotes } from '../../../components/lab/CrowdPlanBench';
import { CatPlanBench, CatPlanNotes } from '../../../components/lab/CatPlanBench';
import { SkinComboBench } from '../../../components/lab/SkinComboBench';

export const metadata = { title: 'The lab' };

/**
 * The lab（Lab-Modernist 稿 → MAPPING §7）：台架目录见 lab-index，深色语言与 case/log 一致。
 * 2026-09-28 插入 Lab 2-6 多层台，后续编号顺延；目标几何与首轮真实截面成形分开呈现。
 * 2026-09-29 UI 试用版：LabWorkspace / LabPanel 复用原台架，提供可调目录、可收说明与原位放大。
 * 原稿的固定 300px 说明栏由自适应分栏替代；完整正文、规格、颜色编码及项目/尺度编排保留。
 * 原有求解台架跑的是站内 TS 内核，不是视频、不是二次实现：Lab.01–05 = src/lib/linkage（封盘零改，
 * 项目一），Lab.06–13 = src/lib/space（项目二皮肤单元引擎，Python 研究代码的 1:1 移植）；
 * Lab.14–15 = src/lib/space/unit-activation + crowd-plan（项目二带行为层的两台：一个人走过 / 几个人在场——
 * 平面、2D canvas，规则来自作者 07-20 的原型；2026-09-04 立项，第六段 Ⅵ People）。
 *
 * 项目二七台按**尺度**收成四段（2026-09-03 用户拍板「七台四段」——此前九台按立项时间排，
 * 读者看完 4×4 的房间又跳回单条带）：一条带 → 一排 → 一圈 → 一间房；段内按形态族
 * （目录四形态 → 双结构 → 捏分 → 方形）。一台 = 一种排布，编制 = 形态族：
 * 06 二维剖面（SVG）· 07 立体带 · 08 双结构带（原 11）｜09 序列 = 原 08 目录渐变 + 原 12
 * 捏分十级｜10 圆筒环 = 原 09 三编制 + 原 13 捏分环 · 11 方形环（原 14）｜12 环阵列场地（原 10）。
 * 46 种离散差分一档不少，冻在 src/lib/space/lab-variants.test.ts；折进编制按钮的差分用
 * `/lab#labNN-<plan>` 直达（如 #lab10-split）。编号按新页序连续；文档里的旧号见 CLAUDE.md 对照表。
 * 2026-09-03 加第五段 Ⅴ Between units（Lab.13 单元关系）：尺度主轴到「一间房」封顶，Ⅴ 开的是第二条轴
 * ——几个单元**之间**能是什么关系（距离 / 高度 / 形态），编号顺延不重排。
 * 2026-09-04 加第六段 Ⅵ A person（Lab.14 一个人走过）：行为层第一次接进来，问的是「人这样走一遍，哪一群单元被激活」。
 * 2026-08-18 起页面按项目分组（MAPPING §16）——log 页先例：多项目共用一条主线。
 * 2026-09-17 加第七段 Ⅶ Compositions（Lab 2-13 单元组合）；2026-09-20 用户纠偏为「同一种平台一圈起伏、几个单元首尾相接、
 * 接缝处接高接低」（首版按目录形态换槽位，读错了）：每个单元一个相位 + 一段高度，接法五种预设，用户的图形按预设追加；编号顺延不重排。
 * 2026-09-13 编号改按项目（用户拍板）：Lab.01–05 → Lab 1-1…1-5，Lab.06–15 → Lab 2-1…2-11；
 * 锚点 `#lab1-1`／`#lab2-5-split`，旧哈希 `#lab10(-split)` 由 LegacyLabHash + planFromHash 照认。
 * 上面各条注释里的两位编号是写下时的号（历史），对照见 CLAUDE.md「Lab 编号对照」。
 * 2026-09-17 左栏目录（用户手绘立项）：`.lab-layout` 两列——左 `.lab-rail` 吸顶目录（LabIndex，
 * 滚动读位 + 滑动标记 + 进度线 + 平滑跳转）、右 `.lab-main` 原有全部内容。台架清单只有一份
 * = src/lib/site/lab-index.ts：Bench 的题头与顶线色、ProjectRule / ScaleRule 的字都从它取。
 * 页宽为此放到 1560（`.shell--lab`），否则台架图框要让出目录那一列；<1280 目录回落成页顶芯片带。
 */
function Bench({
  no,
  lede,
  specs,
  children,
  notes,
}: {
  no: string;
  lede: string;
  specs: [string, string][];
  children: ReactNode;
  notes?: ReactNode;
}) {
  const { title, kernel, description, kind, verb } = labBench(no);
  return <LabPanel no={no} title={title} description={description} accent={labAccent(kernel)} kind={kind} verb={verb} lede={lede} specs={specs} notes={notes}>{children}</LabPanel>;
}

export default function LabPage() {
  return (
    <>
      <div className="ground-plane ld-ground" aria-hidden />
      <div className="ld-dots" aria-hidden />
      <LegacyLabHash />
      <div className="shell shell--lab pg-dark">
        <LabIntro />
        <LabWorkspace index={<LabIndex />}>
        <LabProjectRule i={0} />

        <Bench
          no="1-1"
          lede="Drag a free joint to drive the four-bar linkage. Release it to see the crank resume and the coupler trace its path."
          specs={[
            ['Kernel', '2D PBD · Gauss–Seidel'],
            ['Tests', '36 tests'],
            ['Render', 'SVG · live coupler trace'],
            ['Drive', 'Any free node · release damping'],
          ]}
        >
          <FourBarBench />
        </Bench>

        <Bench
          no="1-2"
          lede="Drag the apex, feet or crank pin to move the S4 scissor arch. Slot stops limit its travel."
          specs={[
            ['Kernel', 'Shared 2D core'],
            ['Instance', 'S4 M3×1.000 · 14 plates'],
            ['Stops', 'Dual-end slot clamp · fixed step'],
            ['Drive', 'Apex / feet / crank pin'],
          ]}
        >
          <ArchBench />
        </Bench>

        <Bench
          no="1-3"
          lede="Adjust three tendons to bend seven box vertebrae. Drag to rotate the scanned model."
          specs={[
            ['Kernel', 'LinkageSolver3D · symmetric GS'],
            ['Mesh', '107k tri · real scan'],
            ['Camera', 'Drag to orbit · zoom controls · wheel zoom when expanded'],
            ['Drive', 'Tendon sliders · critical damping'],
          ]}
        >
          <TentacleBench />
        </Bench>

        <Bench
          no="1-4"
          lede="Five rings open and close together at 85 mm spacing. Adjust the phase and skin to inspect the structure."
          specs={[
            ['Family', 'S1–S5 · ladder 0 / 2 / 4 / 8'],
            ['Choreo', 'In-phase · ω 0.8 · step 1/120 s'],
            ['Peaks', '0.24–0.42 mm'],
            ['Drive', 'Run · phase · skin · views'],
          ]}
        >
          <RingsBench />
        </Bench>

        <Bench
          no="1-5"
          lede="A shaft swings through 180° to open and close five rings. Three tendons bend the large arm."
          specs={[
            ['Bodies', 'Real solids · adjustable skin'],
            ['Drive', 'One shaft · five cranks · in phase'],
            ['Stroke', '180° reciprocating · apex ≡ 2R'],
            ['Arm', 'Three tendons · same solver as Lab 1-3'],
            ['Caveats', 'Speed not to scale · small-arm motion choreographed'],
          ]}
        >
          <MachineBench />
        </Bench>

        {/* 2026-10-07 用户拍板把行为引擎从 1-5 拆出来单独成台：同一台整机、同一个 MachineBench，
            behavior = 驱动换成行为引擎（spec = 轮回机器_行为引擎spec.md §6.3）。旧深链 #lab1-5-behavior 由
            planHash.normalizedLabHash 转到这里。 */}
        <Bench
          no="1-6"
          lede="The machine lives four lives, one persona each, and responds to touch. Click a small arm or the shell, press the large arm, or use the controls to simulate a person nearby, sounds or being lifted."
          specs={[
            ['Personas', 'Vital · Withdrawn · Curious · Unstable · one per life'],
            ['Life', 'Birth · growth · ageing · dying · blank'],
            ['Stimuli', 'Presence · touch · grasp · sound · lift'],
            ['Clock', 'Life clock ×1–×60 · motion stays real-time'],
            ['Log', 'JSON Lines · sensor, engine and life events'],
            ['Machine', 'Same assembly as Lab 1-5 · breath drives the crank'],
            ['Caveats', 'Rhythms not hardware-verified · yaw is a placeholder'],
          ]}
        >
          <MachineBench behavior />
        </Bench>

        {/* 项目二尚未定名：与 log 页 PROJECT_GROUPS 同一措辞（描述而非标题），定名后一并改 */}
        <LabProjectRule i={1} />

        <LabScaleRule i={0} />

        <Bench
          no="2-1"
          lede="A hanging strip contracts into a pocket, bulb, ledge or stairs. Each shape uses a different pattern of locking bonds."
          specs={[
            ['Kernel', 'Position-based · Verlet + projection'],
            ['Source', 'Research-code port · parity ≤ 1e-9'],
            ['Bonds', 'Zipper locks · forming only'],
            ['Drive', 'One contraction ℓ · four bond maps'],
            ['Render', 'SVG · smoothing affects drawing only'],
          ]}
        >
          <SkinBench />
        </Bench>

        <Bench
          no="2-2"
          lede="Rotate the four shapes from Lab 2-1 as solid fabric bands. Section edges show the material thickness and locking bonds."
          specs={[
            ['Kernel', 'Lab 2-1’s 2D engine'],
            ['Band', 'Extruded section · thickness 5'],
            ['Camera', 'Drag to orbit · preset views'],
            ['Bonds', 'Visible on both section edges'],
            ['Render', 'WebGL'],
          ]}
        >
          <SkinSolidBench />
        </Bench>

        <Bench
          no="2-3"
          lede="One strip forms two structures under the same contraction. Choose a pair and adjust the fixed segment between them to compare how independently they fold."
          specs={[
            ['Band', 'Fixed · free A · fixed · free B · fixed'],
            ['Pairs', 'Four matching pairs · bulb above ledge'],
            ['Gap', '16 / 29 / 48 nodes'],
            ['Independence', 'Gap ≥ 29: identical to separate runs; ≥ 16: difference < 1 px'],
            ['Drive', 'One contraction ℓ for both structures'],
          ]}
        >
          <SkinDualBench />
        </Bench>

        <LabScaleRule i={1} />

        <Bench
          no="2-4"
          lede="Compare a 12-band transition from bulb to stepped box with a 10-stage split from one box into two platforms. Pack the bands together or spread them into a row."
          specs={[
            ['Series', 'Graded: 12 bands · split: 10 stages'],
            ['Gradient', 'Bond length 0.10 → 0.32'],
            ['Split', 'Platforms 12 px thick · depth 40 px · final gap 28 px'],
            ['Bonds', 'Outer ladder · seam zipper · face-corner bonds'],
            ['Shape fit', 'Silhouette difference 0.3–3.7 px'],
            ['Layout', 'Packed body or spread row'],
          ]}
        >
          <SkinSeriesBench />
        </Bench>

        <LabScaleRule i={2} />

        <Bench
          no="2-5"
          lede="Twenty contracting bands form a platform around a tube. Choose a level, undulating, changing, split or double platform, then adjust the radius."
          specs={[
            ['Ring', '20 bands · five arrangements'],
            ['Undulation', 'One shape placed at heights from 18% to 71% of the strip'],
            ['Split', 'Two shelves, each 16 px thick · gap varies from 0 to 100 px'],
            ['Double', 'Two level shelves · constant 100 px gap'],
            ['Radius', 'Adjustable · gaps between bands widen with it'],
            ['Skin', 'Opacity 0–1 · default 0.35; split/double 0.15'],
            ['Limit', 'Independent 2D sections; no forces between bands'],
          ]}
        >
          <SkinRingBench />
        </Bench>

        <Bench
          no="2-6"
          lede="Morph the ring from round to square and adjust shelf sizes, tilts and gaps. Join depth ranges from 0% to 100%: 100% meets both rims; 50% fills the inner half. Forming bands and skin follow the assembly; Sections shows the original solve."
          specs={[
            ['Views', 'Target geometry · forming bands'],
            ['Baseline', 'Lab 2-5 double platform · thickness 16 · gap 100 · reach 83.2'],
            ['Tilt', '0–20° per layer · assembly preview'],
            ['Radius', '70–130 per layer · maximum axis-to-rim distance'],
            ['Ring shape', 'Five steps from circle to square · fixed maximum radius'],
            ['Skin', 'Opacity 0–100% · default 35% · cutouts stay open'],
            ['Outline', '360° / 180° / 90° / 240° / two 90° sectors'],
            ['Joins', 'One sector or two opposite sectors · depth 0–100%'],
            ['Forming', 'Four profiles · 20 base slots, split at gaps and square corners'],
            ['Limit', 'No circumferential forces; shape, size, join depth and tilt are assembly previews'],
          ]}
        >
          <SkinLayersBench />
        </Bench>

        <Bench
          no="2-7"
          lede="Twenty bands with different reaches form a square around a round mast. Change the outline from circle to square, or choose an undulating or split platform."
          specs={[
            ['Bands', '20 total: 8 face · 8 edge · 4 corner'],
            ['Outline', 'Five steps from circle to square'],
            ['Flat', 'Side 169 px · platform height 36 px · rim error < 0.9 px'],
            ['Reach', 'Round 54 px · square 56 / 64 / 89 px'],
            ['Undulation', '40 px height range'],
            ['Split', 'Shelves 16 px thick · gap 0–100 px · seam centre stays level'],
            ['Split outline', 'Side 223 px · 338 nodes per band'],
            ['Layout', 'Single ring or 4×4 · fixed radius'],
            ['Limit', 'Split faces held straight by a placement rule during forming'],
          ]}
        >
          <SquareRingBench />
        </Bench>

        <LabScaleRule i={3} />

        <Bench
          no="2-8"
          lede="Sixteen rings fill a room beside a 1.70 m figure. Change the form for the whole field or by row; adjust the radius to change the spacing."
          specs={[
            ['Field', '4×4 rings · 20 bands each'],
            ['Scale', 'Figure 1.70 m · room 3.74 m · ring width 1.04 m'],
            ['Height', 'Platform underside 1.08 m'],
            ['Spacing', 'Tracks radius · ring gap = 1.5× gap between bands'],
            ['Forms', 'Same throughout or one per row'],
            ['Skin', 'Adjustable membrane opacity, 0–1'],
          ]}
        >
          <SkinGridBench />
        </Bench>

        <LabScaleRule i={4} />

        <Bench
          no="2-9"
          lede="Arrange two, three, four or nine rings. Compare gaps, touching edges, steps and interleaving, then make them form together or in sequence. Combinations that would collide are disabled."
          specs={[
            ['Unit', 'Lab 2-5 ring · 20 bands · 202 nodes'],
            ['Clusters', '2 / 3 / 4 / 9 rings'],
            ['Relations', 'Apart · touching · apart stepped · touching stepped · interleaved'],
            ['Height', 'Up to 0.35 m; shape stays unchanged'],
            ['Interleave', 'Step must clear the forming body by 6 px'],
            ['Timing', 'Together or staggered by 150 steps'],
            ['Seams', 'Level touching edges joined by a 16 cm fabric web'],
            ['Scale', 'Lab 2-8 room · 1.70 m figure'],
          ]}
        >
          <SkinClusterBench />
        </Bench>

        <LabScaleRule i={5} />

        <Bench
          no="2-10"
          notes={<WalkPlanNotes />}
          lede="Move one person through the room and watch nearby units form. The floor records time spent within view. Follow mode withdraws the structure as that trace fades; lock mode keeps it formed."
          specs={[
            ['Grid', '4×4 / 6×6 / 8×8 · Lab 2-8 room'],
            ['Trace', '0.1 m floor cells · capped at the threshold · linear fade'],
            ['Reading', 'Mean trace by cell or footprint'],
            ['Forming', 'Mean ≥ threshold × floor share; default share 50%'],
            ['Demo', 'Threshold 2 s · fade 6 s · follow mode'],
            ['View', 'Reach 0.22–2.0 m, default 1.5 m · angle 60°–360°, default 180°'],
            ['Clearance', 'Platform radius + body 0.22 m + margin 0.15 m; walking lane twice this width'],
            ['Prototype', '15 s threshold · 2%/s decay, uncapped; differs from this demo'],
            ['Limit', 'Activation only; no behaviour-to-shape rule'],
          ]}
        >
          <WalkPlanBench workspace />
        </Bench>

        <Bench
          no="2-11"
          notes={<CrowdPlanNotes />}
          lede="Place up to eight people, drag them or let them wander. Their floor traces add where their views overlap, so units can form sooner. Activation and clearance use the same rules as Lab 2-10."
          specs={[
            ['People', 'Click to add · hold to drag · − removes the last'],
            ['Wander', '0.7 m/s · walks 0.5–2 m, occasionally 3.5 m · pauses 8–45 s'],
            ['Response', 'Follow: withdraw as traces fade · lock: keep formed'],
            ['Overlap', 'Two simultaneous views add trace at twice the rate'],
            ['Grid', '4×4 / 6×6 / 8×8 · Lab 2-8 room'],
            ['Limit', 'Random wandering for demonstration; not a model of human behaviour'],
          ]}
        >
          <CrowdPlanBench workspace />
        </Bench>

        <Bench
          no="2-12"
          notes={<CatPlanNotes />}
          lede="The cat lives on the units. Its current platform stays open; the next landing forms before it moves. Choose a behaviour, click a destination or drag the cat onto a unit."
          specs={[
            ['Behaviour', 'Pass through · seated / lying rest · toy play · free sequence'],
            ['Trace', 'Visits leave traces on platform surfaces'],
            ['Response', 'Occupied units stay open; the next landing activates before departure'],
            ['Limit', 'Plan view only; transfer reach, jump height and loads are not simulated'],
          ]}
        >
          <CatPlanBench workspace />
        </Bench>

        <LabScaleRule i={6} />

        <Bench
          no="2-13"
          lede="Join round or square platforms into steps, ramps and enclosures. Adjust each unit’s height range and orientation, then read the height difference at each seam. The square rising arrangement retains an 8 cm step."
          specs={[
            ['Figures', 'Descent · rise · enclosure · step · ramp · three-part ramp · hollow · arch'],
            ['Units', 'Round from Lab 2-5 · square from Lab 2-7'],
            ['Controls', 'Crest band 0–19 · height slice 0–100% · split opening direction'],
            ['Range', 'Round 0.35 m · square 0.16 m'],
            ['Seams', 'Level within 3 cm · square rise includes an 8 cm step'],
            ['Spacing', 'Touching at peak reach or separated by the family’s gap'],
            ['Scale', '1.70 m figure · round surface 1.39–1.73 m · cavity height 0.39 m'],
            ['Limit', 'Single-row assembly; no interaction between units'],
          ]}
        >
          <SkinComboBench workspace />
        </Bench>

        <LabProjectEmpty />
        </LabWorkspace>
      </div>
    </>
  );
}
