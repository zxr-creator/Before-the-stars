// Pure helpers for labour productivity (ruleset 3.0 slice 6; docs/units-and-scale.md §15,
// design chapter 36 §4). No JSX and no i18n: the strings below are English source text,
// translated with t() where they are shown.
//
// What the referee sends: per governed region and sector the product of six factors
// (education, culture, religion, technology, city, health), with each factor's value and
// its own wording, and the posts the sector saved last month; per works the posts at the
// method's base, after shared support and after productivity, the works' productivity,
// and for land works the yield of one level with its factors. Productivity frees people;
// it never raises what a level makes.
import type { FacilityType, FacilityView, FactorView, OwnRegion, ProductivityView, Sector } from '../protocol';

export const SECTORS: Sector[] = ['food', 'extraction', 'industry', 'services', 'knowledge', 'construction'];

/** The six factors whose product is a sector's productivity, in the design's order. */
export const SECTOR_FACTORS = ['education', 'culture', 'religion', 'technology', 'city', 'health'] as const;

export interface FactorInfo {
  /** Name of the factor as the design calls it. */
  label: string;
  /** What it measures, in a sentence. */
  what: string;
  /** What raises it. */
  raise: string;
  /** Its bounds, as multipliers. */
  lo: number;
  hi: number;
}

// i18n-table
export const FACTOR_INFO: Record<string, FactorInfo> = {
  education: {
    label: 'Education',
    what: 'The share of working-age people who can read, and the share who hold a trade or profession.',
    raise: 'Schools, colleges and teaching programmes raise both shares.',
    lo: 1, hi: 1.5,
  },
  culture: {
    label: 'Culture',
    what: 'How well the majority people’s tendency suits this kind of work, and the practices you have established for it.',
    raise: 'Establish practices that favour the sector (reforms in the culture panel).',
    lo: 0.85, hi: 1.3,
  },
  religion: {
    label: 'Religion',
    what: 'Doctrines of the majority faith that bear on this work.',
    raise: 'Doctrines such as Sanctified Labour or Stewardship of the Land; a Day of Rest costs a little everywhere.',
    lo: 0.9, hi: 1.15,
  },
  technology: {
    label: 'Technology',
    what: 'The productivity technologies of this sector that you understand. A works of an older era gets only those up to one era above its own.',
    raise: 'Understand the sector’s technologies, and upgrade or replace old works so they can use them.',
    lo: 1, hi: 2,
  },
  city: {
    label: 'City',
    what: 'A larger principal city helps industry, services and knowledge; a shortfall of water and health pressure count against it.',
    raise: 'Grow the city, supply its water and keep health pressure down.',
    lo: 0.8, hi: 1.25,
  },
  health: {
    label: 'Health',
    what: 'Hungry or sick people do less work.',
    raise: 'Full food access; healers, hospitals, drains and clean water.',
    lo: 0.6, hi: 1,
  },
  automation: {
    label: 'Automation',
    what: 'Counts for qualified posts only: automation lets fewer specialists run the same works.',
    raise: 'Understand automation technologies.',
    lo: 1, hi: 1.5,
  },
  land: {
    label: 'Resources and site',
    what: 'For land works only: site bonuses such as a fertile floodplain, fish banks or old-growth forest, irrigation and the harvest raise what one level yields.',
    raise: 'Build land works where the site is good; irrigate.',
    lo: 0.5, hi: 2,
  },
  support: {
    label: 'Buildings and method',
    what: 'The method sets the posts one level needs. A larger works shares its support staff: 2% fewer general posts for each level beyond the first, at most 20%, while freight is served in full.',
    raise: 'Choose the method; expand works rather than scatter them; keep transport ahead of the load.',
    lo: 0.8, hi: 1,
  },
};
// i18n-end

/** Bounds of a sector's productivity (the product of the six factors). */
export const LP_MIN_BP = 5000;
export const LP_MAX_BP = 40000;

export function factorInfo(source: string): FactorInfo | null {
  return FACTOR_INFO[source] ?? null;
}

/** "×1.09" for 10,900 bp. */
export function mult(bp: number): string {
  return '×' + (bp / 10000).toFixed(2);
}

/** "+9%" / "−4%" / "±0%" for a factor of 10,900 / 9,600 / 10,000 bp. */
export function deltaPct(bp: number): string {
  const d = Math.round((bp - 10000) / 100);
  return d === 0 ? '±0%' : (d > 0 ? '+' : '−') + Math.abs(d) + '%';
}

/** A factor's tone: above one is good, below is bad. */
export function factorTone(bp: number): 'up' | 'down' | 'flat' {
  return bp > 10049 ? 'up' : bp < 9951 ? 'down' : 'flat';
}

/** The sector a works' posts follow: its labour category; food works (fields, herds, fishing) are food. */
export function sectorOf(fac: FacilityType | null | undefined): Sector {
  return fac?.labor_category ?? 'food';
}

export function sectorView(own: OwnRegion, sector: Sector): ProductivityView | null {
  return own.productivity?.find((p) => p.sector === sector) ?? null;
}

export function factorOf(p: ProductivityView | null, source: string): FactorView | null {
  return p?.factors.find((f) => f.source === source) ?? null;
}

/** People the region's works saved last month across sectors. */
export function postsSaved(own: OwnRegion): number {
  return (own.productivity ?? []).reduce((n, p) => n + p.posts_saved, 0);
}

/** The pieces of a factor's wording ("Technology: A; Technology: B"), and whether it says older works receive part. */
export function detailParts(detail: string): { parts: string[]; olderPart: boolean } {
  const SUFFIX = ' (works of older eras receive part)';
  const olderPart = detail.includes(SUFFIX);
  const parts = detail.replace(SUFFIX, '').split('; ').map((x) => x.trim()).filter(Boolean);
  return { parts, olderPart };
}

/** The posts chain of a works: at the method's base, after shared support, after productivity. */
export interface PostsChain {
  base: number;
  afterScale: number;
  afterProd: number;
  /** People the shared support saved, and people productivity saved. */
  bySupport: number;
  byProductivity: number;
  productivityBp: number;
  /** False on referees older than ruleset 3.0 slice 6. */
  known: boolean;
}

export function postsChain(f: FacilityView): PostsChain {
  const known = f.posts_base !== undefined && f.posts_after_productivity !== undefined;
  const base = f.posts_base ?? f.staff_needed;
  const afterScale = f.posts_after_scale ?? base;
  const afterProd = f.posts_after_productivity ?? afterScale;
  return {
    base, afterScale, afterProd,
    bySupport: Math.max(0, base - afterScale),
    byProductivity: Math.max(0, afterScale - afterProd),
    productivityBp: f.productivity_bp ?? 10000,
    known,
  };
}

/** Land works: one level's yield and its factors. */
export function isLandWorks(f: FacilityView): boolean {
  return (f.yield_per_level ?? 0) > 0 || (f.yield_factors?.length ?? 0) > 0;
}
