// Original glyphs for the Solar System layer (20×20 grid, stroke = currentColor).
import type { JSX } from 'preact';
import type { SiteKind } from './catalog';

const GLYPH: Record<string, JSX.Element> = {
  // A ring with spokes: a hub and staging base.
  hub: <><circle cx="10" cy="10" r="6" /><circle cx="10" cy="10" r="2" /><path d="M10 2.5v3.5M10 14v3.5M2.5 10H6M14 10h3.5" /></>,
  // A dome on the ground with a door: a colony.
  colony: <><path d="M3 15.5h14" /><path d="M4.5 15.5a5.5 5.5 0 0 1 11 0" /><path d="M8.5 15.5v-2.5h3v2.5" /><path d="M7 7.6 6 5.5M13 7.6l1-2.1" /></>,
  // A drill head over strata: a mining site.
  mining: <><path d="M10 2.5v9" /><path d="M6.5 6h7" /><path d="m10 11.5-2 3h4z" /><path d="M3 16.5h14M5 18.2h10" /></>,
  // A derrick with a drop: an extraction site (ice, gas, fuel).
  extraction: <><path d="M6 17 9.2 3.5h1.6L14 17" /><path d="M7.3 11.5h5.4M8.2 7.5h3.6" /><path d="M15.6 9.5c.9 1.2 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.7z" /></>,
  // A dish on a mast: a research site.
  research: <><path d="M4 9.5a6 6 0 0 0 8.5 0z" /><path d="M8.2 10.4 12.5 6" /><circle cx="13.2" cy="5.3" r="1" /><path d="M8.2 11.8 7 17h6l-1.6-5" /></>,
  // A truss with panels: a station.
  station: <><path d="M10 4v12" /><rect x="2.5" y="7.5" width="5" height="5" /><rect x="12.5" y="7.5" width="5" height="5" /><circle cx="10" cy="10" r="1.6" /></>,
  // A rocket: boost.
  rocket: <><path d="M10 2.5c2.6 2 3.6 4.8 3.6 8.2v3.1H6.4v-3.1c0-3.4 1-6.2 3.6-8.2z" /><circle cx="10" cy="8.4" r="1.4" /><path d="M6.4 11.5 4 14.6v2h2.4M13.6 11.5l2.4 3.1v2h-2.4M8.6 16.5 10 18.5l1.4-2" /></>,
  // A globe: the home world.
  home: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2.3 2 3.2 4.4 3.2 7s-.9 5-3.2 7c-2.3-2-3.2-4.4-3.2-7S7.7 5 10 3z" /></>,
  // A planet with a ring: the Solar System.
  system: <><circle cx="10" cy="10" r="4.2" /><ellipse cx="10" cy="10" rx="8.2" ry="2.8" transform="rotate(-18 10 10)" /></>,
  // The Earth and Moon.
  orbit: <><circle cx="8" cy="11" r="4" /><circle cx="16" cy="5" r="1.6" /><path d="M2.8 13.8A8 8 0 0 1 14.4 4.2" stroke-dasharray="1.6 1.8" /></>,
};

export function SpaceGlyph({ name, size = 16 }: { name: SiteKind | keyof typeof GLYPH; size?: number }): JSX.Element {
  return (
    <svg class="sp-glyph" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {GLYPH[name] ?? GLYPH.hub}
    </svg>
  );
}
