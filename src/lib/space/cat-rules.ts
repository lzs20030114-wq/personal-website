/** Evidence describes actions, not a fitted policy. Full provenance: 项目二_猫行为lab.md §4. */
export const CAT_SOURCES = {
  ethogram: { label: 'Stanton et al. · 2015 · Table 6', url: 'https://doi.org/10.1016/j.applanim.2015.04.001' },
  needs: { label: 'Ellis et al. · 2013 · Pillars 1, 3', url: 'https://journals.sagepub.com/doi/full/10.1177/1098612x13477537' },
  cafe: { label: 'Hirsch et al. · 2025 · §2.3.3, §3.2', url: 'https://research.slu.se/ws/portalfiles/portal/19246537/fulltext.pdf' },
  // The two below are cited by the wand-toy play parked in cat-wand.ts (not shown in Lab 2-12).
  // Play fades against an unchanging toy and returns, intensely, when the toy is swapped (abstract checked).
  habituation: { label: 'Hall, Bradshaw & Robinson · 2002', url: 'https://research-information.bris.ac.uk/en/publications/object-play-in-adult-domestic-cats-the-roles-of-habituation-and-d/' },
  // Movement is among the strongest toy properties eliciting object play (thesis abstract checked).
  toys: { label: 'Hall · 1995 · PhD thesis', url: 'https://eprints.soton.ac.uk/459217' },
} as const;
export type CatSource = keyof typeof CAT_SOURCES;
export interface CatRule { zh: string; en: string; source: CatSource; term: string; }

/** Actions in Lab 2-12 (the cat alone). */
export const CAT_RULES = {
  scan: { zh: '扫视可去的台', en: 'Scan options', source: 'ethogram', term: 'Watch' },
  walk: { zh: '向前行走', en: 'Walk', source: 'ethogram', term: 'Walking' },
  sit: { zh: '坐姿停留', en: 'Sit', source: 'ethogram', term: 'Sitting' },
  lie: { zh: '伏卧休息', en: 'Lie down', source: 'ethogram', term: 'Lying' },
  // Hirsch §3.2 records exploration as its own category; what it looks like on a platform is D1 (§7).
  investigate: { zh: '停下查看', en: 'Investigate', source: 'cafe', term: '§3.2 · Exploration' },
} as const satisfies Record<string, CatRule>;
export type CatPhase = keyof typeof CAT_RULES;
export type CatPose = 'stand' | 'walk' | 'sit' | 'lie' | 'sniff' | 'crouch' | 'chase' | 'paw';
export type CatEpisode = 'pass' | 'rest' | 'explore';
export const CAT_SEQUENCES: Record<CatEpisode, readonly CatPhase[]> = {
  pass: ['scan', 'walk', 'sit'], rest: ['sit', 'lie'], explore: ['investigate', 'scan', 'walk'],
};

/** D1: presentation settings, NOT measurements or biological thresholds. */
export const CAT_DEMO = {
  walkSpeed: 0.55, stalkSpeed: 0.22, chaseSpeed: 1.1,
  sitSeconds: 3, lieSeconds: 18, captureSeconds: 2, arrivalSeconds: 2,
  // Each glance at a neighbouring unit before a move; with the default 1 s gaze-open time it half-opens it.
  glanceSeconds: 0.5,
  // A repeatable tour makes every category visible; it is not a daily time budget.
  tour: ['pass', 'rest', 'explore'] as readonly CatEpisode[],
} as const;

/**
 * Explore (2026-10-04, 项目二_猫行为lab.md §7). The cat moves on its own, with no toy and no person: it
 * investigates the platform it is on, glances toward the few least-explored parts of the room, and heads for
 * the least explored in short bouts. Only the category is sourced (Hirsch §3.2); everything here is D1.
 */
export const CAT_EXPLORE = {
  // Seconds spent investigating a platform it had not been on (or had forgotten), and one it knows.
  newSeconds: 2, knownSeconds: 0.6,
  // Below this many seconds of familiarity a platform counts as new.
  newBelow: 0.5,
  // How many directions it glances at before going (the chosen one among them).
  options: 3,
  // Familiarity = seconds spent on a platform, forgotten with this half-life. The cat's own memory, not an
  // input to the units (they read only gaze and use traces).
  forgetHalfLife: 60,
  // Where to go: the area around a platform (Gaussian, `areaSigma` grid pitches) that is least familiar,
  // a platform counting as unfamiliar by exp(−familiarity / knownAfter). It walks up to `boutHops` toward it.
  areaSigma: 1.5, knownAfter: 2, boutHops: 3,
  // Bouts per explore episode in the Free tour.
  bouts: 6,
} as const;
