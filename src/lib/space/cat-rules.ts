/** Evidence describes actions, not a fitted policy. Full provenance: 项目二_猫行为lab.md §4. */
export const CAT_SOURCES = {
  ethogram: { label: 'Stanton et al. · 2015 · Table 6', url: 'https://doi.org/10.1016/j.applanim.2015.04.001' },
  needs: { label: 'Ellis et al. · 2013 · Pillars 1, 3', url: 'https://journals.sagepub.com/doi/full/10.1177/1098612x13477537' },
  cafe: { label: 'Hirsch et al. · 2025 · §2.3.3, §3.2', url: 'https://research.slu.se/ws/portalfiles/portal/19246537/fulltext.pdf' },
  // Play fades against an unchanging toy and returns, intensely, when the toy is swapped (abstract checked).
  habituation: { label: 'Hall, Bradshaw & Robinson · 2002', url: 'https://research-information.bris.ac.uk/en/publications/object-play-in-adult-domestic-cats-the-roles-of-habituation-and-d/' },
  // Movement is among the strongest toy properties eliciting object play (thesis abstract checked).
  toys: { label: 'Hall · 1995 · PhD thesis', url: 'https://eprints.soton.ac.uk/459217' },
} as const;

export const CAT_RULES = {
  scan: { zh: '扫视可去的台', en: 'Scan options', source: 'ethogram', term: 'Watch' },
  walk: { zh: '向前行走', en: 'Walk', source: 'ethogram', term: 'Walking' },
  sit: { zh: '坐姿停留', en: 'Sit', source: 'ethogram', term: 'Sitting' },
  lie: { zh: '伏卧休息', en: 'Lie down', source: 'ethogram', term: 'Lying' },
  watch: { zh: '盯住玩具', en: 'Watch toy', source: 'ethogram', term: 'Watch' },
  stalk: { zh: '低伏靠近', en: 'Stalk', source: 'ethogram', term: 'Stalk' },
  chase: { zh: '追扑玩具', en: 'Chase & pounce', source: 'needs', term: 'Pillar 3 · moving prey-like toys' },
  capture: { zh: '前爪捕捉', en: 'Catch & paw', source: 'needs', term: 'Pillar 3 · capture / paw manipulation' },
} as const;
export type CatPhase = keyof typeof CAT_RULES;
export type CatPose = 'stand' | 'walk' | 'sit' | 'lie' | 'crouch' | 'chase' | 'paw';
export type CatEpisode = 'pass' | 'rest' | 'play';
export const CAT_SEQUENCES: Record<CatEpisode, readonly CatPhase[]> = {
  pass: ['scan', 'walk', 'sit'], rest: ['sit', 'lie'], play: ['watch', 'walk', 'stalk', 'chase', 'capture'],
};

/** D1: presentation settings, NOT measurements or biological thresholds. */
export const CAT_DEMO = {
  walkSpeed: 0.55, stalkSpeed: 0.22, chaseSpeed: 1.1,
  sitSeconds: 3, lieSeconds: 18, captureSeconds: 2, arrivalSeconds: 2,
  // Each glance at a neighbouring unit before a pass; with the default 1 s gaze-open time it half-opens it.
  glanceSeconds: 0.5,
  // A repeatable tour makes every category visible; it is not a daily time budget.
  tour: ['pass', 'rest', 'play'] as readonly CatEpisode[],
} as const;

/**
 * Play (2026-10-04 revision, 项目二_猫行为lab.md §6). The cat's play reacts to a moving toy; nothing is a
 * fixed route. The toy is moved by a demonstration operator (a wand someone is holding) — seeded, so a
 * replay is identical — or by the viewer dragging it. Operator ranges, distances and rates are D1 settings.
 */
export const CAT_PLAY = {
  seed: 20261004,
  // Operator: a prey-like toy darts, then waits (pause or twitch) to lure the cat; movement elicits object
  // play (Hall 1995). When the cat comes within `near` the toy hesitates, then escapes — the hesitation is
  // the cat's chance to pounce. A toy left waiting `lureMax` without the cat coming darts somewhere else.
  dartSpeed: 1.6, escapeSpeed: 2.2,
  dartMin: 0.4, dartMax: 1.2, escapeMin: 0.8, escapeMax: 1.5,
  pauseMin: 0.6, pauseMax: 2.0, twitchMin: 1.0, twitchMax: 2.5, twitchAmp: 0.04, twitchHz: 6,
  near: 0.6, hesitateMin: 0.4, hesitateMax: 1.5, lureMax: 7,
  // The toy dropped near the cat at the start of a bout, and after a swap.
  appearMin: 1.0, appearMax: 1.8,
  // Cat side: within this centre distance the toy is under its paws. The toy reads as moving once its
  // smoothed speed passes `moveOn` and as still again below `moveOff`: a twitch in place stays still, only
  // a toy that travels reads as moving, and the reading does not flicker at the threshold.
  pawReach: 0.26, moveOn: 0.12, moveOff: 0.05, speedTau: 0.15,
  // A still toy: walked up to from afar, stalked within `stalkFrom`, rushed (pounce) within `pounce`.
  stalkFrom: 1.2, pounce: 0.7,
  // After letting go, seconds before the cat can catch again (the toy gets its chance to escape).
  recover: 0.8,
  // Interest (Hall, Bradshaw & Robinson 2002): drains while playing and with each catch; below `vigorous`
  // the cat only watches a moving toy, below `stop` it quits. A new toy restores it.
  drainPerSecond: 0.016, catchCost: 0.05, vigorous: 0.5, stop: 0.2,
  // Seconds the cat sits after quitting before lying down / before the operator offers a new toy.
  quitSit: 3, swapAfter: 10,
} as const;
