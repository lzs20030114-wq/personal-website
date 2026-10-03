/** Evidence describes actions, not a fitted policy. Full provenance: 项目二_猫行为lab.md §4. */
export const CAT_SOURCES = {
  ethogram: { label: 'Stanton et al. · 2015 · Table 6', url: 'https://doi.org/10.1016/j.applanim.2015.04.001' },
  needs: { label: 'Ellis et al. · 2013 · Pillars 1, 3', url: 'https://journals.sagepub.com/doi/full/10.1177/1098612x13477537' },
  cafe: { label: 'Hirsch et al. · 2025 · §2.3.3, §3.2', url: 'https://research.slu.se/ws/portalfiles/portal/19246537/fulltext.pdf' },
} as const;

export const CAT_RULES = {
  scan: { zh: '扫视可去的台', en: 'Scan options', source: 'ethogram', term: 'Watch' },
  walk: { zh: '向前行走', en: 'Walk', source: 'ethogram', term: 'Walking' },
  sit: { zh: '坐姿停留', en: 'Sit', source: 'ethogram', term: 'Sitting' },
  lie: { zh: '伏卧休息', en: 'Lie down', source: 'ethogram', term: 'Lying' },
  watch: { zh: '盯住玩具', en: 'Watch toy', source: 'ethogram', term: 'Watch' },
  stalk: { zh: '低伏靠近', en: 'Stalk', source: 'ethogram', term: 'Stalk' },
  chase: { zh: '追逐玩具', en: 'Chase toy', source: 'needs', term: 'Pillar 3 · moving prey-like toys' },
  capture: { zh: '前爪捕捉', en: 'Catch & paw', source: 'needs', term: 'Pillar 3 · capture / paw manipulation' },
} as const;
export type CatPhase = keyof typeof CAT_RULES;
export type CatPose = 'stand' | 'walk' | 'sit' | 'lie' | 'crouch' | 'chase' | 'paw';
export type CatEpisode = 'pass' | 'rest' | 'play';
export const CAT_SEQUENCES: Record<CatEpisode, readonly CatPhase[]> = {
  pass: ['scan', 'walk', 'sit'], rest: ['sit', 'lie'], play: ['watch', 'stalk', 'chase', 'capture'],
};

/** D1: presentation settings, NOT measurements or biological thresholds. */
export const CAT_DEMO = {
  walkSpeed: 0.55, stalkSpeed: 0.22, chaseSpeed: 1.1,
  sitSeconds: 3, lieSeconds: 18, watchSeconds: 1.5, captureSeconds: 3, arrivalSeconds: 2,
  toyMoveSeconds: 0.45,
  // Each glance at a neighbouring unit before a pass; with the default 1 s gaze-open time it half-opens it.
  glanceSeconds: 0.5,
  // A repeatable tour makes every category visible; it is not a daily time budget.
  tour: ['pass', 'rest', 'play'] as readonly CatEpisode[],
} as const;
