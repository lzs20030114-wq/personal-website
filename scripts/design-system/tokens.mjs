// 设计系统 token 生成器：从站上 CSS 现读颜色，输出 claude.ai 设计系统「Portfolio」的 tokens.json。
//   node scripts/design-system/tokens.mjs <out.json> [--ref <git ref>] [--date YYYY-MM-DD] [--check]
// 颜色有三种来源：
//   css(作用域, '--x')  站上 CSS 自定义属性，生成时现读（改了站上的值，重跑即同步）；
//   '{token}'           设计系统里的别名；
//   lit(值, 文件)        站上只写在规则里、没有变量的字面值（--check 会核对它还在不在那个文件里）。
// 作用域：light = globals.css 的 :root；dark = 再叠 .pg-dark；home = 再叠 home.css 的 .hs-root；case = 再叠 case-dark.css 的 .cs。
// 字体 / 间距 / 圆角 / 阴影 / 版式是桌面端取值的描述（站上多为 clamp()），在下面写死。
// 2026-10-25 起（MAPPING §62）：此前这份 json 是手抄的，站上一改就漂。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVars, resolveVar } from './css-vars.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FILES = {
  globals: 'app/globals.css',
  home: 'components/site/home/home.css',
  case: 'app/(site)/work/[slug]/case-dark.css',
  field: 'src/lib/site/field-visuals.ts',
};

/** 四个作用域的变量表。 */
export function loadScopes(root = REPO) {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const globals = read(FILES.globals);
  const light = readVars(globals, ':root');
  return {
    light,
    dark: { ...light, ...readVars(globals, '.pg-dark') },
    home: { ...light, ...readVars(read(FILES.home), '.hs-root') },
    case: { ...light, ...readVars(read(FILES.case), '.cs') },
  };
}

const css = (scope, name) => ({ css: name, scope });
const lit = (value, from) => ({ value, from });
const C = (name, light, dark, usage) => ({ name, light, dark, usage });

const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
/** 三条色阶：浅底取 :root；n200–n800 在 .pg-dark 里另有深底值。 */
const RAMP_USAGE = {
  g: {
    100: "Lightest lotus-leaf green. Duotone highlight (`.duotone-g` lights) and the faintest green wash.",
    200: "Text-selection background on Paper; bright lime band (same value as `lime-hi`).",
    300: "Lime. Dot-grid pattern on the `face` band and accent words on the Night hero (same value as `lime`).",
    400: "Project I highlight on dark grounds (`project-i` in Night). Mint accent of the home stage.",
    500: "Mid green. Charts and mechanism strokes only; never body text.",
    600: "Mid-dark green. Charts and mechanism strokes only.",
    700: "Teal. `accent` on Paper: links, numbers, project-I ink. 7.2:1 on `paper`.",
    800: "Deep green. Charts only.",
    900: "Deep forest. Duotone shadows (`.duotone-g` darks).",
  },
  p: {
    100: "Lightest violet. Duotone highlight for violet-toned images.",
    200: "Violet wash. Highlight of the green-shadow/violet-light signature duotone.",
    300: "Light violet. `accent-2` on Night (the `.pg-dark` value): Project II’s color on dark pages (Lab chips, log marks, instrument top lines).",
    400: "Mid-light violet. Charts only.",
    500: "Mid violet. Charts only.",
    600: "Violet. Charts only.",
    700: "Water violet. `accent-2` on Paper: Live tags, experiment labels, project-II ink. 7.9:1 on `paper`.",
    800: "Deep violet. Charts only.",
    900: "Darkest violet. Duotone shadows for violet-toned images.",
  },
  n: {
    100: "Pond-mist white. `surface` on Paper: plates and row hover.",
    200: "Neutral wash. Neutral tag ground; in Night a 8% cream tint.",
    300: "Hairline grey. `hairline` on Paper (figure frames, rules). Night: dim slate for embedded instruments.",
    400: "Disabled strokes and secondary chart lines.",
    500: "Mid neutral. Chart axes.",
    600: "Graphite. `graphite` on Paper: captions and meta text, 5.2:1 on `paper`.",
    700: "Soft ink. `ink-soft` on Paper: card body copy, 7.3:1 on `paper`.",
    800: "Neutral tag text on Paper; bright text for embedded instruments in Night.",
    900: "Darkest neutral.",
  },
};
export const RAMPS = ['g', 'p', 'n'].flatMap((h) =>
  STEPS.map((s) => C(`${h}${s}`, css('light', `--${h}${s}`), h === 'n' && s >= 200 && s <= 800 ? css('dark', `--${h}${s}`) : null, RAMP_USAGE[h][s])),
);

/** 语义色：每个 token 的浅 / 深两侧从哪来。dark 为 null = 两套主题同一个值。 */
export const SEMANTIC = [
  C("paper", css('light', '--paper'), css('dark', '--ld-paper'),
    "Page ground. Paper = warm milk white (light pages, home Hook/About/Log zones); Night = the flat dark ground of Lab, case studies and the log archive. Every text token below is checked on it."),
  C("surface", css('light', '--surface'), css('dark', '--surface'),
    "Quiet plate one step off `paper`: hover rows, note boxes, inline code. In Night a 5% cream tint."),
  C("ink", css('light', '--ink'), css('dark', '--ink'),
    "Headings, body copy and the 2px section rules. 15.0:1 on Paper `paper`, 16.0:1 on Night `paper`; also passes on `mist` and `sage`."),
  C("graphite", css('light', '--graphite'), css('dark', '--ld-mute'),
    "Muted text: captions, meta rows, mono labels, counts. 5.2:1 on Paper `paper` (4.9:1 on `mist`), 7.0:1 on Night `paper`, 6.0:1 on `panel`, 5.1:1 on `deep`. Not on `sage` (4.3:1): use `sage-ink` there."),
  C("hairline", css('light', '--hairline'), css('dark', '--hairline'),
    "Decorative 1px rules: figure frames, dot grids, dividers between rows. Not a control border (≈1.5:1). Night value is the .pg-dark default; most rules on dark pages actually use 10–16% cream (see `hairline-soft`)."),
  C("accent", css('light', '--accent'), css('dark', '--ld-g'),
    "Links, section numbers, figure ids, the reading bar, hover fill of the solid button. 7.2:1 on Paper `paper`, 8.3:1 on Night `paper`. Also Project I’s color on Paper (`project-i`); on Night, Project I uses green 400 (.71) while links use this .74 green: two greens the site keeps side by side."),
  C("accent-2", css('light', '--accent-2'), css('dark', '--ld-v'),
    "Violet. Project II’s color in text and marks (with `project-ii`), plus research-question and aside kickers. As a surface it appears only in the Live tag (`live-surface`). 7.9:1 on Paper `paper`, 7.2:1 on Night `paper`."),
  C("rose", css('light', '--rose'), null,
    "Lotus pink. One or two marks per site at most: the clearance ring and blocked-unit crosses in the plan simulations. Never text."),
  C("ink-soft", css('light', '--n700'), css('dark', '--ld-soft'),
    "Second-level text that should still read strongly: card body, panel descriptions, sidebar items. 7.3:1 on Paper `paper`, 10.0:1 on Night `paper`."),
  C("ink-body", '{ink}', css('case', '--cs-body'),
    "Long-form reading text in case studies (17px body). Night softens cream so pages of prose do not glare; 13.0:1 on Night `paper`."),
  C("hairline-soft", lit('oklch(0.235 0.025 215 / 0.1)', 'components/site/home/home.css'), lit('oklch(0.95 0.032 120 / 0.1)', 'app/(site)/dark-chrome.css'),
    "The faintest rule: sticky header bottom edge, rows inside a how-to list. Decorative only."),
  C("rule-strong", '{graphite}', css('dark', '--ld-control'),
    "Border of every outlined control: line and mono buttons, segmented buttons, the language toggle, viewer buttons; hover goes to 70% cream on Night. Night value is the site token `--ld-control` (3.5:1 on Night `paper`). Paper has no source value; graphite (5.2:1) was chosen so the border clears 3:1."),
  C("header-veil", lit('oklch(0.965 0.01 115 / 0.9)', 'components/site/home/home.css'), lit('oklch(0.18 0.032 228 / 0.82)', 'app/(site)/dark-chrome.css'),
    "Translucent ground of the 64px sticky header and home HUD, always with a 10px backdrop blur."),
  C("live-surface", lit('oklch(0.925 0.022 290)', 'components/site/home/home.css'), lit('oklch(0.33 0.045 288)', 'app/(site)/dark-chrome.css'),
    "Ground of the Live tag. On Paper it is also the AI-disclosure panel."),
  C("live-ink", css('home', '--violet'), lit('oklch(0.88 0.05 295)', 'app/(site)/dark-chrome.css'),
    "Text and dot of the Live tag on `live-surface`: 6.9:1 (Paper), 8.5:1 (Night)."),
  C("focus-ring", '{accent}', null,
    "2px solid outline, offset 2px, on `:focus-visible` for every link and control. Clears 3:1 on its theme’s `paper` and `surface` (7.2:1 Paper, 8.3:1 Night) and, on Paper, on `mist` and `sage`. On `night`, `face` or `deep` grounds (home hero, About band, footers) draw it in `lime-hi` instead."),
  C("slate", css('light', '--slate'), css('dark', '--slate'),
    "Slate blue: Project III and anything \"in preparation\" (the hatched WIP plates, the empty-project chip). 6.7:1 on Paper `paper`, 8.1:1 on Night `paper`."),
  C("accent-hi", css('light', '--ld-g-hi'), null,
    "Bright green for Night only: pull quotes, big part numerals, the live pulse dot. 12.3:1 on Night `paper`. Never on light grounds; use `accent` there."),
  C("night", css('home', '--night'), null,
    "Deepest ground: the home Field hero behind the 28 × 14 square field. Cream text 17.1:1."),
  C("shade", css('home', '--shade'), null,
    "Page-turn veil: the receding page darkens toward this as the next sheet rises. Motion only, never a resting ground."),
  C("cream", css('light', '--ld-cream'), null,
    "Text on the fixed dark bands (`face`, `deep`, `night`) whatever the theme. 7.5:1 on `face`, 11.7:1 on `deep`."),
  C("mist", css('home', '--mist'), null,
    "Tonal layer 1 (paper → mist): ground of the home Work page. Image-less cards sit on `paper` so they lift off it."),
  C("sage", css('home', '--sage'), null,
    "Tonal layer 2 (mist → sage): the full-bleed Log band, 96px above and inside. Text stays `ink`."),
  C("sage-ink", css('home', '--sage-ink'), null,
    "Secondary text inside the `sage` band (graphite is too weak there). 8.5:1 on `sage`."),
  C("face", css('light', '--ld-face'), null,
    "Tonal layer 3, the main teal face: home About page and the footer of Lab and case pages. One saturated face per screen. Text is `paper`/`cream`."),
  C("face-ink", css('light', '--ld-face-ink'), null,
    "Secondary text on `face` (footer meta). 5.7:1 on `face`."),
  C("deep", css('light', '--ld-deep'), null,
    "Tonal layer 4, the deep pool: home footer and the Lab intro band. Text `cream` (11.7:1), meta `graphite` in Night (5.1:1), links `lime`."),
  C("panel", css('light', '--ld-panel'), null,
    "One step raised off Night `paper`: the Lab notes panel. Padding 16 18 18, no border."),
  C("lime", css('home', '--lime'), null,
    "Lime on dark bands: accent word in the Field hero title, footer links on `deep` (8.2:1), dot pattern on `face` at 16% opacity."),
  C("lime-hi", css('light', '--ld-lime-hi'), null,
    "Lime high step: labels, eyebrows and links on `face` (6.5:1), the state label of a case hero. Focus colour on `face`/`deep`."),
  C("amber", css('light', '--ld-amber'), null,
    "Pending only: the \"to be supplied\" dashed box, its tag and the status dot of an unfinished project. Night only (10.8:1 on Night `paper`)."),
  C("project-i", css('light', '--accent'), css('dark', '--accent'),
    "Project I · Reincarnation Machine. Hue means project, everywhere: card bar and kicker, Lab chips, the Lab directory dots and ticks, instrument frame top lines, the log project mark and lanes. Paper uses the 700 step; Night uses the brighter step that `.pg-dark` sets (green 400). Kernel type (2D / 3D) is never colored, only named in text."),
  C("project-ii", css('light', '--accent-2'), css('dark', '--accent-2'),
    "Project II · Cross-species space. Same roles as `project-i`. Paper uses violet 700, Night violet 300 (the `.pg-dark` value of `accent-2`)."),
  C("project-iii", '{slate}', null,
    "Project III · sleep research (in preparation), also Other work. Same roles as `project-i`."),
];

/** 首页 Field 方块场的六组色：现读 field-visuals.ts 的 FIELD_PROJECTS。 */
const FIELD_KEYS = [
  ['i', 'project-i', 'Project I'],
  ['ii', 'project-ii', 'Project II'],
  ['iii', 'project-iii', 'Project III'],
  ['bed', 'other-work', 'Smart Bed (other work)'],
  ['site', 'this-site', 'This site'],
  ['about', 'about', 'About'],
];
export function readField(root = REPO) {
  const ts = readFileSync(join(root, FILES.field), 'utf8');
  const found = {};
  for (const m of ts.matchAll(/'?([\w-]+)'?:\s*\{\s*label:\s*'[^']*',\s*ink:\s*'(#[0-9a-fA-F]{6})',\s*surface:\s*'(#[0-9a-fA-F]{6})',\s*muted:\s*'(#[0-9a-fA-F]{6})'/g)) {
    found[m[1]] = { ink: m[2], surface: m[3], muted: m[4] };
  }
  return FIELD_KEYS.map(([k, key, label]) => {
    const v = found[key];
    if (!v) throw new Error(`${FILES.field} 的 FIELD_PROJECTS 里找不到 ${key}`);
    return { k, label, ...v };
  });
}

/** 解一侧的值：css 现读到底；与某一级色阶在同一侧完全相同就写成色阶别名（{n600} 之类），别名与字面值照抄。 */
function resolveSide(src, side, scopes, rampValues, self) {
  if (typeof src === 'string') return src;
  if (src.value) return src.value;
  const value = resolveVar(src.css, scopes[src.scope]);
  const ramp = Object.entries(rampValues[side]).find(([n, v]) => n !== self && v === value);
  return ramp ? `{${ramp[0]}}` : value;
}

export function buildColor(root = REPO) {
  const scopes = loadScopes(root);
  const rampValues = { light: {}, dark: {} };
  for (const t of RAMPS) {
    rampValues.light[t.name] = resolveVar(t.light.css, scopes.light);
    rampValues.dark[t.name] = t.dark ? resolveVar(t.dark.css, scopes.dark) : rampValues.light[t.name];
  }
  const tokens = [];
  for (const t of [...RAMPS, ...SEMANTIC]) {
    const isRamp = RAMPS.includes(t);
    const light = isRamp ? rampValues.light[t.name] : resolveSide(t.light, 'light', scopes, rampValues, t.name);
    const dark = t.dark == null ? null : isRamp ? rampValues.dark[t.name] : resolveSide(t.dark, 'dark', scopes, rampValues, t.name);
    tokens.push({ name: t.name, value: dark == null || dark === light ? light : { light, dark }, usage: t.usage });
  }
  for (const f of readField(root)) {
    tokens.push(
      { name: `field-${f.k}-ink`, value: f.ink, usage: `Field hero · ${f.label}: icon stroke and title accent of its squares and hover card. Paired with field-${f.k}-surface.` },
      { name: `field-${f.k}-surface`, value: f.surface, usage: `Field hero · ${f.label}: square and card ground on \`night\`.` },
      { name: `field-${f.k}-muted`, value: f.muted, usage: `Field hero · ${f.label}: icon stroke for work-log squares and card captions (≥4.5:1 on field-${f.k}-surface).` },
    );
  }
  return tokens;
}

/** lit() 写下的字面值还在不在它注明的文件里（只报告，不拦）。 */
export function checkLiterals(root = REPO) {
  // 空白归一，且 0.9 与 .9 视为同一个数（站上两种写法都有）
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/(?<![\d.])0\./g, '.');
  const missing = [];
  for (const t of SEMANTIC) {
    for (const side of ['light', 'dark']) {
      const s = t[side];
      if (s && typeof s === 'object' && s.value && !norm(readFileSync(join(root, s.from), 'utf8')).includes(norm(s.value))) {
        missing.push(`${t.name} (${side}): ${s.value} 不在 ${s.from} 里了`);
      }
    }
  }
  return missing;
}

const T = (name, value, usage) => ({ name, value, usage });
const sans = "'Archivo Variable', Archivo, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const mono = "'JetBrains Mono', 'PingFang SC', 'Microsoft YaHei', ui-monospace, SFMono-Regular, Menlo, monospace";
const S = (name, fontSize, lineHeight, fontWeight, letterSpacing, usage, sample) => {
  const s = { name, fontSize, fontWeight, usage };
  if (lineHeight != null) s.lineHeight = lineHeight;
  if (letterSpacing) s.letterSpacing = letterSpacing;
  if (sample) s.sample = sample;
  return s;
};

export function buildTokens(root = REPO, { ref = 'master', date = new Date().toISOString().slice(0, 10) } = {}) {
  const tokens = buildColor(root);
  return {
    name: 'Portfolio',
    version: 1,
    meta: {
      source: 'github', repo: 'lzs20030114-wq/personal-website', ref, package: '.',
      paths: {
        tokens: ['app/globals.css', 'app/(site)/dark-chrome.css', 'components/site/home/home.css', 'app/(site)/work/[slug]/case-dark.css', 'app/(site)/lab/lab-dark.css', 'src/lib/site/home-model.ts', 'src/lib/site/field-visuals.ts'],
        fonts: ['@fontsource-variable/archivo@5.3.0 (latin wght)', '@fontsource/jetbrains-mono@5.3.0 (latin 400, 500)'],
        assets: ['public/home/icons/*.svg'],
        docs: ['SITE_SPEC.md', 'LAYOUT_NOTES.md', 'design-ref/MAPPING.md', '工作日志写作纪律.md'],
      },
      synced: date,
      notes: 'Generated by scripts/design-system/tokens.mjs: colors are read from the site CSS (globals.css :root and .pg-dark, home.css .hs-root, case-dark.css .cs) and field-visuals.ts; the other families are desktop values written in the script.',
    },
    color: {
      themes: [{ id: 'light', name: 'Paper' }, { id: 'dark', name: 'Night' }],
      tokens,
    },
  type: {
    fonts: [
      { family: 'Archivo Variable', file: 'fonts/archivo-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
      { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
      { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    ],
    families: { sans, mono },
    groups: [
      { name: 'Display', family: 'sans', styles: [
        S('display', '120px', 0.92, 500, '-0.05em', 'Case-study title. Desktop size of clamp(46px, min(7.6vw, 12vh), 120px). One per page.', 'Reincarnation Machine'),
        S('display-m', '92px', 0.96, 500, '-0.045em', 'Lab page title. Desktop size of clamp(48px, 6.4vw, 92px). A trailing dot may take `accent`.', 'Lab.'),
        S('headline', '52px', 1, 500, '-0.038em', 'Home section headlines and the Field hero title. clamp(32px, min(3.8vw, 6.4vh), 52px).', 'Selected work'),
        S('section', '50px', 1.05, 600, '-0.035em', 'Numbered case-study section (h2) under a 2px `ink` rule. clamp(30px, 3.4vw, 50px). Chinese pages: letter-spacing 0.', 'Embodied form'),
        S('subsection', '27px', 1.15, 600, '-0.022em', 'Case-study h3 with a hairline above and a 1.1-style number. clamp(21px, 1.9vw, 27px).', 'Personality parameters'),
        S('title', '28px', 1.1, 600, '-0.024em', 'Lab instrument title and project heads. clamp(22px, 2vw, 28px).', 'Four-bar linkage'),
        S('card-title', '23px', 1.1, 600, '-0.022em', 'Project card title on the home Work page. clamp(18px, 1.7vw, 23px).', 'Cross-species space'),
      ] },
      { name: 'Text', family: 'sans', styles: [
        S('pull-quote', '38px', 1.35, 500, '-0.02em', 'Case-study accent paragraph in `accent-hi` (Night). Max 26em.', 'The machine dies so that the visitor notices it was alive.'),
        S('lead', '32px', 1.45, 400, '-0.012em', 'Opening paragraph of a case study, in `ink`. Max 32em.'),
        S('lede', '21px', 1.55, 400, null, 'One-sentence summary under a page title. Max 440px or 52ch.'),
        S('body-long', '17px', 1.8, 400, null, 'Case-study reading text in `ink-body`, max 42em (≈66 characters). Chinese: line-height 1.9.'),
        S('body', '15px', 1.55, 400, null, 'Default UI and page text. Panel descriptions and meta values.'),
        S('body-sm', '14px', 1.6, 400, null, 'Card body, part descriptions, how-to definitions.'),
        S('button', '13px', null, 500, null, 'Sans buttons and the header / HUD nav.', 'Open case study'),
      ] },
      { name: 'Mono', family: 'mono', styles: [
        S('section-no', '13px', 1, 500, null, 'Section and project numbers (01, 02 …) in `accent` or the project colour.', '03'),
        S('label-strong', '12px', null, 500, null, 'Figure ids, chip rows, Lab action buttons, the back link.', 'N05 · Lifecycle'),
        S('label', '12px', null, 400, null, 'Eyebrows, meta rows, captions and footers in `graphite`. Sentence case, no tracking.', 'Updated 2026-10-24'),
        S('tag', '11px', 1, 500, null, 'Live tag, definition terms, kickers, card stamps. Definition terms add 0.08em tracking.', 'Live'),
        S('micro', '10.5px', null, 400, null, 'Index numbers, counts, rail numerals. The smallest size on the site.', '17 benches'),
      ] },
    ],
  },
  spacing: { tokens: [
    T('space-4', '4px', 'Hairline offsets; gap inside a numbered heading row.'),
    T('space-6', '6px', 'Gap between a status dot and its word; pitch of the dot-grid texture.'),
    T('space-8', '8px', 'The most used gap: button padding block, list item spacing, figure caption gaps.'),
    T('space-10', '10px', 'Gap between a figure frame and its caption; corner-tick inset is 12.'),
    T('space-12', '12px', 'Gap between buttons and between meta items; Field hero cell gap.'),
    T('space-14', '14px', 'Top padding under a chip or part top rule; menu row gaps.'),
    T('space-16', '16px', 'Section rule to heading; panel padding top; card padding in the Modernist set.'),
    T('space-20', '20px', 'Mobile page gutter (min of clamp(20px, 4vw, 48px)).'),
    T('space-24', '24px', 'Grid gap of chips and footers; nav-to-language gap.'),
    T('space-28', '28px', 'Gap between home project cards and nav links.'),
    T('space-44', '44px', 'Gap between the case TOC rail and the text column; Lab intro bottom padding; panel top padding.'),
    T('space-48', '48px', 'Desktop page gutter (max of clamp(20px, 4vw, 48px)).'),
    T('space-56', '56px', 'Space above a Lab project head; chip row top margin.'),
    T('space-72', '72px', 'Lab intro top padding; Log band padding on narrow screens.'),
    T('space-96', '96px', 'Major break: footer top margin, Log band padding, section margin (case h2 uses 90).'),
  ] },
  radius: { tokens: [
    T('radius-none', '0px', 'Default for everything: buttons, tags, cards, frames, panels. The system is square.'),
    T('radius-cell', '2px', 'Only the Field hero squares and their hover card.'),
    T('radius-dot', '50%', 'Status dots (5–6px) and the Live tag dot.'),
  ] },
  shadow: { note: 'Borders, rules and tonal steps carry depth; shadows are rare.', tokens: [
    T('shadow-lift', '0 18px 50px oklch(0.08 0.02 235 / 0.4)', 'The only drop shadow: the Field hero card that opens over the square field.'),
    T('shadow-frame', 'inset 0 0 0 1px oklch(0.95 0.032 120 / 0.1)', 'Inner 1px ring on dark figure frames and the case hero stage, instead of a border.'),
  ] },
  layout: { note: 'Widths give room to zones, not to line length (LAYOUT_NOTES first law).', tokens: [
    T('width-case', '1240px', 'Case-study page and its header/footer inner width.'),
    T('width-shell', '1320px', 'Interior light pages (`.shell`).'),
    T('width-home', '1360px', 'Home Work, Log and footer inner width.'),
    T('width-lab', '1440px', 'Lab page and its header.'),
    T('header-height', '64px', 'Sticky header and home HUD bar.'),
    T('measure-body', '42em', 'Max line length of long-form body copy (≈62–68ch).'),
  ] },
  };
}

// 命令行
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const out = args.find((a, i) => !a.startsWith('--') && !['--ref', '--date'].includes(args[i - 1]));
  if (args.includes('--check')) {
    const miss = checkLiterals();
    console.log(miss.length ? miss.join('\n') : '字面值都还在原文件里');
  }
  if (out) {
    const json = buildTokens(REPO, { ref: opt('--ref'), date: opt('--date') });
    writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
    console.log(`${out}: ${json.color.tokens.length} colors, ${json.type.groups.reduce((a, g) => a + g.styles.length, 0)} type styles`);
  }
}
