// The works only a tradition can build (ruleset 3.1), each with its own pictogram: a small
// token in the path's colours, shown wherever the works is named in the construction sheet
// and the building tree, so a Steampunk seat's steam hammer or a Rocketpunk seat's rocket
// works is picked out of the list at a glance. Original 20×20 line drawings.
import type { JSX } from 'preact';
import { PUNK, type PunkStyle } from '../map/punk';
import { t } from '../i18n';
import { cx } from '../ui';

interface ExclusiveWorks { style: PunkStyle; glyph: JSX.Element }

const A = { fill: 'var(--pw-accent)', stroke: 'none' } as const;

/** Facility kind → the path it belongs to and its drawing. */
export const EXCLUSIVE_WORKS: Record<string, ExclusiveWorks> = {
  // a drop hammer in its frame over the anvil
  steam_hammer: { style: 'steam', glyph: <><path d="M5 17h10M6.500 17V4h7v13" /><path d="M8.500 7h3v4.500h-3z" {...A} /><path d="M8.500 7h3v4.500h-3zM10 4v3M8 15h4v2H8z" /><path d="M14.500 5.500c1.200-.4 1.800-1.200 1.800-2.300" /></>, },
  // an engine block: two cylinders over a crank
  motor_works: { style: 'diesel', glyph: <><path d="M5 4h10v7H5z" {...A} /><path d="M5 4h10v7H5zM10 4v7M7.500 6.500v2M12.500 6.500v2" /><circle cx="10" cy="14.500" r="2.500" /><path d="M7.500 11l1.200 1.600M12.500 11l-1.200 1.600M3 14.500h4.500M12.500 14.500H17" /></>, },
  // a tram under its wire
  tramways: { style: 'electric', glyph: <><path d="M2.500 3.500h15" /><path d="M4.500 8h11a1 1 0 0 1 1 1v5.500h-13V9a1 1 0 0 1 1-1z" {...A} /><path d="M4.500 8h11a1 1 0 0 1 1 1v5.500h-13V9a1 1 0 0 1 1-1zM6 10.500h8M8 8l2-4.500L12 8" /><circle cx="7" cy="16" r="1.200" /><circle cx="13" cy="16" r="1.200" /></>, },
  // a toothed wheel with a winding key
  automaton_works: { style: 'clockwork', glyph: <><circle cx="9" cy="11" r="5" stroke-width="2.400" stroke-dasharray="2 1.930" stroke-linecap="butt" /><circle cx="9" cy="11" r="3.300" {...A} /><circle cx="9" cy="11" r="3.300" /><circle cx="9" cy="11" r="1" /><path d="M13.500 6.500l2-2M14.300 2.800l2.900 2.900M15 3.500c.9-1 2.400-.9 2.700.3.200.9-.6 1.600-1.400 1.400" /></>, },
  // a core in its vessel, ringed by an orbit
  compact_reactor: { style: 'atomic', glyph: <><path d="M6 17V8a4 4 0 0 1 8 0v9z" {...A} /><path d="M6 17V8a4 4 0 0 1 8 0v9zM4 17h12" /><ellipse cx="10" cy="10" rx="7.500" ry="2.600" transform="rotate(-20 10 10)" /><circle cx="10" cy="10" r="1.300" fill="currentColor" stroke="none" /></>, },
  // a hot cell: a flask behind the trefoil
  isotope_works: { style: 'atomic', glyph: <><circle cx="10" cy="10" r="7" {...A} /><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="1.300" fill="currentColor" stroke="none" /><path d="M10 7.500V3.300M7.800 11.300 4.200 13.400M12.200 11.300l3.600 2.100" stroke-width="2.600" stroke-linecap="butt" /></>, },
  // watch floor: a screen over linked nodes
  noc: { style: 'neon', glyph: <><path d="M3.500 3.500h13v7h-13z" {...A} /><path d="M3.500 3.500h13v7h-13zM5.500 8l2.500-2.500 2 1.500 2.500-2.500 2 1.500" /><circle cx="5" cy="15.500" r="1.500" /><circle cx="10" cy="15.500" r="1.500" /><circle cx="15" cy="15.500" r="1.500" /><path d="M6.500 15.500h2M11.500 15.500h2M10 10.500V14" /></>, },
  // a hand of wire and joints
  implant_clinic: { style: 'neon', glyph: <><path d="M6 17.500v-5L4.500 9.500V6M8 12V3.500M11 12V3M14 12V4.500M16 10l-1 2.500v5" /><path d="M6 12.500h9v5H6z" {...A} /><path d="M6 12.500h9v5H6zM9 15h3M10.500 13.500v3" /></>, },
  // a vat with a sprouting leaf
  biofoundry: { style: 'organic', glyph: <><path d="M5.500 8h9v7a2.500 2.500 0 0 1-2.500 2.500H8A2.500 2.500 0 0 1 5.500 15z" {...A} /><path d="M5.500 8h9v7a2.500 2.500 0 0 1-2.500 2.500H8A2.500 2.500 0 0 1 5.500 15zM4.500 8h11M7.500 12.500c1.500-1 3.500 1 5 0" /><path d="M10 8V5.500M10 5.500C10 3.500 8.500 2.500 6.500 2.500c0 2 1.500 3 3.500 3zM10 6c0-1.600 1.300-2.500 3.300-2.500 0 1.700-1.300 2.500-3.300 2.500z" /></>, },
  // a columned hall with an eye in the pediment
  machine_governance: { style: 'chrome', glyph: <><path d="M3 8.500 10 3l7 5.500z" {...A} /><path d="M3 8.500 10 3l7 5.500zM5 9.500V15M8.300 9.500V15M11.700 9.500V15M15 9.500V15M3 17h14" /><circle cx="10" cy="6.500" r="1.100" fill="currentColor" stroke="none" /></>, },
  // a sun over planted roofs
  sun_gardens: { style: 'solar', glyph: <><circle cx="10" cy="6.500" r="2.800" {...A} /><circle cx="10" cy="6.500" r="2.800" /><path d="M10 1.500v1.200M4.800 6.500H3.500M16.500 6.500h-1.300M6.200 2.800l.9.9M13.800 2.800l-.9.9" /><path d="M3 17.500l3.500-5 3.500 5 3.500-5 3.500 5zM3 17.500h14" /></>, },
  // a booster on the line
  rocket_works: { style: 'rocket', glyph: <><path d="M10 2c2.200 1.800 3 4.300 3 7v5H7V9c0-2.700.8-5.200 3-7z" {...A} /><path d="M10 2c2.200 1.800 3 4.300 3 7v5H7V9c0-2.700.8-5.200 3-7zM7 11l-2.500 3.500H7M13 11l2.500 3.500H13M8.500 14v2.500M11.500 14v2.500M3 17.500h14" /><circle cx="10" cy="7.500" r="1.200" /></>, },
};

/** The path a works belongs to, if it is one only a tradition can build. */
export function exclusiveStyle(kind: string | null | undefined): PunkStyle | null {
  return kind ? EXCLUSIVE_WORKS[kind]?.style ?? null : null;
}

/** The pictogram of a tradition's own works; nothing for any other works. */
export function ExclusiveIcon({ kind, size = 18, class: cls }: { kind: string; size?: number; class?: string }) {
  const w = EXCLUSIVE_WORKS[kind];
  if (!w) return null;
  const L = PUNK[w.style];
  const dark = w.style === 'neon';
  return (
    <span class={cx('punk-works', 'punk-' + w.style, cls)} data-testid={`exclusive-icon-${kind}`} data-style={w.style}
      title={t('{genre} works', { genre: t(L.name) })}
      style={{ '--pw-accent': dark ? L.accent : L.glow, background: dark ? L.wall : L.ground, color: dark ? L.glow : '#2b2620', borderColor: L.accent, width: size + 4 + 'px', height: size + 4 + 'px' } as JSX.CSSProperties}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.400" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        {w.glyph}
      </svg>
    </span>
  );
}
