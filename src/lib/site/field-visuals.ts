import type { LogEntry } from './log-schema';
import logIcons from './field-log-icons.json' with { type: 'json' };

export type FieldKind = 'project' | 'lab' | 'log' | 'other' | 'about';
export type FieldProject = 'project-i' | 'project-ii' | 'project-iii' | 'other-work' | 'this-site' | 'about';

/** Home project hues (G / V / S), with quieter tints for other work and the site. */
export const FIELD_PROJECTS: Record<FieldProject, { label: string; ink: string; surface: string; muted: string }> = {
  'project-i': { label: 'Reincarnation Machine', ink: '#bed5ae', surface: '#21342c', muted: '#88a18e' },
  'project-ii': { label: 'Cross-species space', ink: '#c2b6db', surface: '#2b283d', muted: '#9990b2' },
  'project-iii': { label: 'Sleep research', ink: '#afced9', surface: '#20323c', muted: '#829fab' },
  'other-work': { label: 'Smart Bed', ink: '#b9ceca', surface: '#243535', muted: '#889e9c' },
  'this-site': { label: 'This site', ink: '#c8cbc0', surface: '#2a3030', muted: '#969f99' },
  about: { label: 'About', ink: '#e3e6ce', surface: '#2d342c', muted: '#b7bea7' },
};

export const FIELD_KINDS: Record<FieldKind, { label: string; weight: number }> = {
  project: { label: 'Project', weight: 3 },
  lab: { label: 'Experiment', weight: 3 },
  log: { label: 'Work log', weight: 4 },
  other: { label: 'Other work', weight: 1 },
  about: { label: 'About', weight: 1 },
};

export const PROJECT_ICONS: Record<FieldProject, string> = {
  'project-i': 'machine', 'project-ii': 'space', 'project-iii': 'sleep',
  'other-work': 'bed', 'this-site': 'layout', about: 'about',
};

export const LAB_ICONS: Record<string, string> = {
  '1-1': 'linkage', '1-2': 'arch', '1-3': 'tendon', '1-4': 'shell', '1-5': 'assembly', '1-6': 'behavior',
  '2-1': 'strip', '2-2': 'solid-strip', '2-3': 'dual-strip', '2-4': 'series', '2-5': 'cylinder',
  '2-6': 'layers', '2-7': 'square-ring', '2-8': 'array', '2-9': 'between', '2-10': 'walk',
  '2-11': 'crowd', '2-12': 'cat', '2-13': 'joined', '2-14': 'together', '2-15': 'together-3d',
};

/** New entries remain eligible without hand-editing the homepage. Existing records were reviewed individually. */
const ASPECT_ICONS: Record<string, string> = {
  Simulation: 'agents', Docs: 'archive', Concept: 'strategy', Mechanical: 'mechanism',
  Research: 'research', Writing: 'writing', Study: 'experiment', Strategy: 'strategy',
  '3D': 'model', Record: 'archive', Personas: 'agents', Interviews: 'interview',
  Sourcing: 'sourcing', Shell: 'shell', Arch: 'arch', Electronics: 'electronics', Survey: 'survey',
};
export function logIcon(entry: LogEntry): string {
  const reviewed = entry.id ? (logIcons as Record<string, string>)[entry.id] : undefined;
  return reviewed ?? ASPECT_ICONS[entry.tags.find(t => t.variant === 'neutral')?.label.en ?? ''] ?? 'archive';
}

export const iconPath = (key: string) => `/home/icons/${key}.svg`;

export interface FieldDraw { weight: number; groups: number[][] }
/** First select a content kind, then a project, then an item: 184 logs cannot bury the projects. */
export function buildFieldDraws(pool: readonly { kind: FieldKind; project: FieldProject }[]): FieldDraw[] {
  return (Object.keys(FIELD_KINDS) as FieldKind[]).flatMap(kind => {
    const groups = new Map<FieldProject, number[]>();
    pool.forEach((item, i) => {
      if (item.kind !== kind) return;
      const group = groups.get(item.project) ?? [];
      group.push(i);
      groups.set(item.project, group);
    });
    return groups.size ? [{ weight: FIELD_KINDS[kind].weight, groups: [...groups.values()] }] : [];
  });
}

export function pickFieldIndex(draws: readonly FieldDraw[], random: () => number = Math.random): number {
  if (!draws.length) throw new Error('Field has no content');
  let cursor = random() * draws.reduce((n, d) => n + d.weight, 0);
  const bucket = draws.find(d => (cursor -= d.weight) < 0) ?? draws[draws.length - 1];
  const group = bucket.groups[Math.min(bucket.groups.length - 1, Math.floor(random() * bucket.groups.length))];
  return group[Math.min(group.length - 1, Math.floor(random() * group.length))];
}

/** Project hue stays stable; logs use quieter strokes, project covers use brighter strokes. */
export function fieldColors(project: FieldProject, kind: FieldKind) {
  const p = FIELD_PROJECTS[project];
  return { ink: kind === 'log' ? p.muted : p.ink, surface: p.surface };
}
