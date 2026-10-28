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

export const FIELD_KINDS: Record<FieldKind, { label: string }> = {
  project: { label: 'Project' },
  lab: { label: 'Experiment' },
  log: { label: 'Work log' },
  other: { label: 'Other work' },
  about: { label: 'About' },
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

/**
 * 浅色首屏（2026-10-27，画布 H6，MAPPING §71）：项目色只给格子底色与图标。
 * 亮格比纸深一档、暗格只比纸深一点；其他作品、本站与「关于」共用中性灰。
 */
const LIGHT_NEUTRAL = { ink: 'oklch(0.43 0.013 192)', lit: 'oklch(0.89 0.012 160)', dim: 'oklch(0.93 0.0066 160)' };
export const FIELD_LIGHT: Record<FieldProject, { ink: string; lit: string; dim: string }> = {
  'project-i': { ink: 'oklch(0.42 0.088 178)', lit: 'oklch(0.86 0.07 150)', dim: 'oklch(0.925 0.0385 150)' },
  'project-ii': { ink: 'oklch(0.42 0.09 282)', lit: 'oklch(0.86 0.06 292)', dim: 'oklch(0.925 0.033 292)' },
  'project-iii': { ink: 'oklch(0.45 0.06 235)', lit: 'oklch(0.87 0.04 235)', dim: 'oklch(0.925 0.022 235)' },
  'other-work': LIGHT_NEUTRAL,
  'this-site': LIGHT_NEUTRAL,
  about: LIGHT_NEUTRAL,
};

/** Project hue stays stable; logs use quieter strokes, project covers use brighter strokes. */
export function fieldColors(project: FieldProject, kind: FieldKind) {
  const p = FIELD_PROJECTS[project];
  return { ink: kind === 'log' ? p.muted : p.ink, surface: p.surface };
}
