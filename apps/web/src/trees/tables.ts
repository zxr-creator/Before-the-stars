// Public catalogue facts used to arrange and explain cards the observation has already
// disclosed: era bands, field lanes, tradition branches, rival-family kinds and exclusive
// practice groups. Every lookup takes a disclosed card's own text; nothing here is ever
// listed on screen by itself, so it cannot reveal a card the seat has not seen.
import tables from 'virtual:tree-tables';
import type { PracticeCard, TechCard } from '../protocol';

/** Era band names, 0-9 (design chapter 37, table 0.1). Only bands holding disclosed cards are shown. */
export const ERA_NAMES = ['Ancient', 'Classical', 'Medieval', 'Early Modern', 'Industrial', 'Modern', 'Information', 'Space', 'AI', 'Interstellar'];

export interface Tradition {
  key: string;
  /** Short name ("Coal and Steam"). */
  name: string;
  /** The genre it evokes ("Steampunk"). */
  genre: string;
  /** Slot it is offered in (design chapter 37, section 4.1). */
  slot: 'machine' | 'frontier';
}

/** The seven traditions (design chapter 37, section 4; chapter 39, groups M-S). */
export const TRADITIONS: Tradition[] = [
  { key: 'steam', name: 'Coal and Steam', genre: 'Steampunk', slot: 'machine' },
  { key: 'engine', name: 'Oil and Engine', genre: 'Dieselpunk', slot: 'machine' },
  { key: 'wire', name: 'Current and Wire', genre: 'Electropunk', slot: 'machine' },
  { key: 'atom', name: 'Atom', genre: 'Atompunk', slot: 'frontier' },
  { key: 'network', name: 'Network', genre: 'Cyberpunk', slot: 'frontier' },
  { key: 'living', name: 'Living Systems', genre: 'Biopunk', slot: 'frontier' },
  { key: 'synthetic', name: 'Synthetic Minds', genre: 'AI-punk', slot: 'frontier' },
];
export const traditionByKey = (key: string | null | undefined): Tradition | undefined => TRADITIONS.find((x) => x.key === key);

/** Era band 0-9 of a disclosed technology. */
export function techBand(card: Pick<TechCard, 'name'>): number {
  return tables.band[card.name] ?? 0;
}

/** Era 0-8 of a disclosed practice (sent by the referee since bts-protocol/2.1). */
export function practiceBand(card: Pick<PracticeCard, 'era'>): number {
  return card.era ?? 0;
}

/** Lane key of a field: its catalogue letter (A-L), or "T" for every tradition branch. */
export function techLane(field: string): string {
  const f = tables.fields[field];
  if (!f) return '~' + field;
  return f.tradition ? 'T' : f.letter;
}

/** The tradition a branch field belongs to, if any. */
export function fieldTradition(field: string): Tradition | undefined {
  return traditionByKey(tables.fields[field]?.tradition);
}

/** Lane order: catalogue letters, then the tradition lane, then anything unfamiliar. */
export function laneOrder(a: string, b: string): number {
  const rank = (x: string) => (x === 'T' ? 'Y' : x.startsWith('~') ? 'Z' + x : x);
  return rank(a).localeCompare(rank(b));
}

/** Kind of a rival family ('standard', 'approach' or 'doctrine'), from public content. */
export function familyKind(family: string): string {
  return tables.families[family]?.kind ?? 'approach';
}

/** Names of the technologies that refute a family's doctrine (public content). Callers show only disclosed ones. */
export function familyRefuters(family: string): string[] {
  return tables.families[family]?.refuted_by ?? [];
}

/** The exclusive group a practice belongs to, by its English name. */
export function exclusiveGroup(name: string): string | null {
  return tables.exclusive[name] ?? null;
}
