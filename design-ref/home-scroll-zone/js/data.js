// Homepage content. Edit copy here; home.js renders it into index.html.
window.HOME_DATA = (() => {
  const G = { ink: 'oklch(0.42 0.088 178)', hi: 'oklch(0.71 0.098 145)' };
  const V = { ink: 'oklch(0.42 0.09 282)', hi: 'oklch(0.71 0.095 291)' };
  const S = { ink: 'oklch(0.45 0.06 235)', hi: 'oklch(0.74 0.06 235)' };

  const SLIDES = [
    { n: '01', name: 'Reincarnation Machine', c: G, img: 'img/c-fivering.png', fig: 'Lab 1-5 · Full assembly', verb: 'tap',
      line: 'Each life ends in stillness. It wakes in the same body and answers your touch in a new way.',
      hint: 'Simulation of the full machine · tap a small feeler', note: 'stand-in still (Lab 1-4) until a 1-5 frame is captured' },
    { n: '02', name: 'Spatial simulation', c: V, img: 'img/c-crowd.png', fig: 'Lab 2-11 · A few people', verb: 'drag',
      line: 'Linger somewhere and the room takes shape around you. Move on and it lets go.',
      hint: 'Simulation, people only · drag someone across the floor', note: 'follow mode · static first frame' },
  ];

  const WORKS = [
    { n: '01', kicker: 'Project I', c: G, title: 'Reincarnation Machine', year: '2026', slug: 'reincarnation-machine', img: 'img/c-fivering.png',
      thesis: 'Why do people mourn something that was never alive? This desk-sized machine turns that question from an aesthetic remark into something you can measure, by holding the body constant and making behaviour the one thing that changes. [draft · author to rewrite]',
      role: 'Concept & research design · Mechanism design & fabrication · Electronics & firmware · HRI study design' },
    { n: '02', kicker: 'Project II', c: V, title: 'Spatial simulation', year: '2026', slug: 'project-ii', img: 'img/c-nine.png',
      thesis: 'Species sharing one space differ in how they move, how big they are and how close they come. Instead of zoning them apart, what if the space read those differences and reshaped itself, so divergence becomes the source of form?',
      role: 'Concept · System design · Behavioral algorithms · Implementation' },
    { n: '03', kicker: 'Project III', c: S, title: 'Project III', year: 'In progress', slug: 'project-iii', img: null,
      thesis: '[Project III thesis · author to write]', role: 'Role · to be written' },
  ];

  const OTHERS = [{ title: 'Smart Bed', line: '2030 Sleep Foresight Study · Tsinghua Future Lab × DeRucci · design research', year: '2026', slug: 'smart-bed' }];

  const FACTS = [
    { k: 'Contact', v: 'lzs20030114@gmail.com' },
    { k: 'Currently', v: 'Computational design & human–computer interaction' },
    { k: 'Approach', v: 'Research through design · parametric modeling · physical prototyping' },
    { k: 'Tools', v: 'Rhino / Grasshopper · Python · 3D printing' },
  ];

  // Bench stills available so far; other benches show a placeholder.
  const IMG = { '1-4': 'img/c-fivering.png', '2-5': 'img/c-cylinder.png', '2-8': 'img/cluster-nine.webp', '2-9': 'img/c-nine.png', '2-10': 'img/c-formed.png', '2-11': 'img/c-crowd.png' };
  const B = (no, title, description, meta) => ({ no, title, description, meta });
  const GROUPS = [
    { n: '01', c: G, title: 'Reincarnation Machine', sub: 'Lab 1-1 – 1-5 · two linkage kernels', slug: 'reincarnation-machine', cover: '1-4',
      segs: [{ n: '', label: '', benches: [
        B('1-1', 'Four-bar linkage', 'Drag a joint to move the four-bar mechanism and trace its path.', '36 tests · SVG'),
        B('1-2', 'Arch ring solver', 'The S4 scissor arch, driven by a crank-slider.', 'Kernel untouched · SVG'),
        B('1-3', 'Tendon tentacle', 'Bend seven vertebrae with three tendons spaced at 120°.', 'Orbit camera · WebGL'),
        B('1-4', 'Five-ring shell', 'Five rings opening and closing together.', 'Calibrated stops · WebGL'),
        B('1-5', 'Full assembly', 'One shaft drives five rings; three tendons bend the arm.', 'Real solids · WebGL')] }] },
    { n: '02', c: V, title: 'Spatial simulation', sub: 'Lab 2-1 – 2-12 · skin-unit engine & geometry studies', slug: 'project-ii', cover: '2-9',
      segs: [
        { n: 'Ⅰ', label: 'One band', benches: [B('2-1', 'Contractile skin units', 'Four bond patterns turn a contracting strip into four shapes.', 'Python parity · SVG'), B('2-2', 'Skin units, solid', 'The four fabric bands in 3D, with visible sections and bonds.', 'Shared 3D rig · WebGL'), B('2-3', 'Two structures, one band', 'Two structures on one strip, with an adjustable gap.', '5 dual bands · WebGL')] },
        { n: 'Ⅱ', label: 'A row', benches: [B('2-4', 'Series', 'Compare a graded series with a platform splitting in two.', '2 plans · WebGL')] },
        { n: 'Ⅲ', label: 'A ring', benches: [B('2-5', 'Cylinder of units', 'Twenty bands form a level, undulating, changing, split or double platform.', '5 plans · radius · WebGL'), B('2-6', 'Layers within one unit', 'Round to square, with independent shelf sizes, tilts, gaps and joins.', 'Target + forming bands · WebGL'), B('2-7', 'A square ring', 'Vary each band’s reach to change a round platform into a square.', 'Three depths · WebGL')] },
        { n: 'Ⅳ', label: 'A room', benches: [B('2-8', 'Four by four', 'Sixteen rings in a room, with a 1.70 m figure for scale.', '16 live rings · WebGL')] },
        { n: 'Ⅴ', label: 'Between units', benches: [B('2-9', 'Between units', 'Arrange 2, 3, 4 or 9 rings and compare their spacing, heights and timing.', '4 clusters · 5 relations · 2 timings · WebGL')] },
        { n: 'Ⅵ', label: 'People', benches: [B('2-10', 'A person walks through', 'Move one person and watch nearby units respond to their floor trace.', '6 behaviours · 3 grids · canvas'), B('2-11', 'A few people', 'Place or drag people to see how their overlapping views affect the units.', 'Up to 8 people · live · canvas')] },
        { n: 'Ⅶ', label: 'Compositions', benches: [B('2-12', 'Joined platforms', 'Join round or square platforms into steps, ramps and enclosures.', '8 figures · round & square · WebGL')] }] },
    { n: '03', c: S, title: 'Project III', sub: 'Benches to come', slug: 'project-iii', cover: null, segs: [] },
  ];

  // Latest entries; `entry` is the index into ENTRIES that the entry's tick represents.
  const LOGS = [
    { date: '2026-09-05', tag: 'Project II', c: V, entry: 0, text: 'Gave the person on the plan bench a facing, a body and a wandering gaze, so structure now forms in front of them, never on top of them.', img: 'img/attention-shape.webp', cap: 'Where the trace lands, one mechanism at a time: full circle, field of view, clearance D (units within it held back), walking lane.' },
    { date: '2026-09-04', tag: 'Project II', c: V, entry: 1, text: 'Opened the first bench with a behaviour layer: one person walks through the room in plan, and the units whose floor has been occupied long enough form.', img: null },
    { date: '2026-09-04', tag: 'Project II', c: V, entry: 2, text: 'Made the plan bench something you can actually handle: place people, drag them around, watch several at once and see the units form live.', img: 'img/bench-crowd.webp' },
  ];

  // Every log entry, newest first: "MM-DD Lane Topic".
  const ENTRIES = '09-05 Space Simulation|09-04 Space Simulation|09-04 Space Simulation|09-03 Space Concept|09-03 Space Simulation|07-31 Machine Mechanical|07-29 Space Research|07-29 Space Research|07-28 Space Research|07-27 Space Concept|07-27 Space Concept|07-27 Space Strategy|07-24 Space Concept|07-20 Space Simulation|07-18 Machine Simulation|07-17 Lab Shell|07-17 Lab Arch|07-17 Space Docs|07-14 Sleep Interviews|07-13 Site Site|07-13 Space Record|07-12 Space Simulation|07-10 Lab 3D|07-10 Lab Bench|07-10 Lab Bench|07-10 Machine Mechanical|07-09 Machine Sourcing|07-09 Space Study|07-08 Site Site|07-07 Lab Docs|07-07 Machine Study|07-07 Sleep Personas|07-06 Space Simulation|07-05 Machine Record|06-30 Sleep Personas|06-22 Space Strategy|06-21 Machine Electronics|06-20 Space Record|06-15 Machine Simulation|06-15 Space Concept|06-15 Sleep Survey|06-12 Machine Strategy|06-12 Sleep Writing|06-08 Machine Sourcing|06-07 Space Concept|06-05 Sleep Writing|06-04 Machine Mechanical|06-04 Sleep Concept|06-03 Machine Mechanical|06-03 Space Strategy|06-01 Machine Concept|05-26 Sleep Research|05-19 Sleep Research|05-08 Machine Mechanical|04-27 Machine Mechanical|04-26 Machine Simulation|04-04 Machine Simulation|04-03 Machine Study|03-20 Machine Concept|03-07 Machine Concept'
    .split('|').map((x, i) => { const [md, tag, sub] = x.split(' '); return { i, md, tag, sub }; });

  const LANES = [
    { keys: ['Machine'], label: 'Reincarnation Machine', ink: G.ink },
    { keys: ['Space'], label: 'Spatial simulation', ink: V.ink },
    { keys: ['Lab'], label: 'Lab benches', ink: 'oklch(0.235 0.025 215)' },
    { keys: ['Sleep', 'Site'], label: 'Smart Bed · site', ink: 'oklch(0.6 0.02 200)' },
  ];

  // Timeline span: Mar 1 – Oct 1 2026.
  const RANGE = { from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 9, 1), year: 2026 };

  return { SLIDES, WORKS, OTHERS, FACTS, IMG, GROUPS, LOGS, ENTRIES, LANES, RANGE, S };
})();
