// Original two-tone pictograms for the 22 goods (20×20 grid). The outline follows
// `currentColor`, so the same drawing reads on dark chrome and on paper; the
// fill is the good's own tint.
import type { JSX } from 'preact';
import type { Good } from '../protocol';

export const GOOD_TINT: Record<Good, string> = {
  food: '#e0b84c', materials: '#b98958', tools: '#a8b9c4', copper_ore: '#c97f55', iron_ore: '#a8705f',
  coal: '#77747c', crude: '#7d6c96', copper: '#dd8f58', metal: '#9fb2c8',
  components: '#cfa650', conductors: '#e3a25e', insulation: '#bcae8e', fuel: '#d8763e', chemicals: '#86b565',
  substrate: '#93bbdc', electronics: '#71c29c', hardware: '#819fe2', spares: '#b3a78c', media: '#c8a8dc',
  instruments: '#e5c678', medicine: '#dc6f6f',
  timber: '#9a7246', fibres: '#e8dcb0', horses: '#b07a4e', salt: '#e8e6e0', spices: '#c4572e', precious: '#e8c547',
  tin: '#b8bcc2', saltpetre: '#d9d2c0', gas: '#9ec4d8', bauxite: '#c7704a', uranium_ore: '#a9c45a', rare_earths: '#8f7fb8',
  lithium: '#d8e4ea', cobalt_nickel: '#6f8fb0', quartz: '#7fbcb2', helium: '#c9e3f2', aluminium: '#c5ccd4',
  fertilizer: '#9cb85a', munitions: '#8a7a5a', magnets: '#c0504d', batteries: '#7ab87a', nuclear_fuel: '#b6d84a',
  textiles: '#d89ab8', consumer_goods: '#e0a070', fine_wares: '#d4a4e0', lattice: '#a0e0f0', volatiles: '#a8d8f0',
  propellant: '#f0a060', helium3: '#e0f0ff',
};

type Draw = (f: string) => JSX.Element;

// Goods of ruleset 3.0 without a pictogram of their own are drawn with a near one
// (`DRAW_LIKE`), in their own tint.
const DRAW: Partial<Record<Good, Draw>> = {
  food: (f) => <>
    <path d="M10 18V8" />
    <path d="M10 8.500c-2.400-.8-3.200-2.800-2.800-5 2 .4 3.200 2.200 2.800 5zM10 8.500c2.400-.8 3.200-2.800 2.800-5-2 .4-3.200 2.200-2.800 5z" fill={f} />
    <path d="M10 13c-2.600-.3-4-2-4-4.300 2.200 0 4 1.400 4 4.300zM10 13c2.600-.3 4-2 4-4.300-2.200 0-4 1.400-4 4.300z" fill={f} />
  </>,
  materials: (f) => <>
    <circle cx="6.300" cy="13.200" r="3.300" fill={f} /><circle cx="13.700" cy="13.200" r="3.300" fill={f} /><circle cx="10" cy="6.900" r="3.300" fill={f} />
    <circle cx="6.300" cy="13.200" r="1.100" /><circle cx="13.700" cy="13.200" r="1.100" /><circle cx="10" cy="6.900" r="1.100" />
  </>,
  tools: (f) => <>
    <path d="M3.500 16.500 10 10" />
    <path d="M8.500 5.500 11.500 3l5.500 5.500-2.500 3z" fill={f} />
    <path d="M16.500 16.500 12 12" /><path d="m15 18 3-3" />
  </>,
  copper_ore: (f) => <>
    <path d="M2.500 15 5.500 7l5-3 5.500 3.500 1.500 7.500z" fill={f} />
    <circle cx="8" cy="10" r="1.100" /><circle cx="12.500" cy="12" r="1.100" /><circle cx="11" cy="7.500" r=".8" />
  </>,
  iron_ore: (f) => <>
    <path d="M2.500 15 5 8l4.500-4 6 3.500 2 7.500z" fill={f} />
    <path d="M9.500 4 8 10l-3 5M8 10l5.500 1.500 2-4M13.500 11.500 15 15" />
  </>,
  coal: (f) => <>
    <path d="M3 13.500 5 7.500l5-3.500 5 2.500 2 6-3.500 4h-7z" fill={f} />
    <path d="m10 4-1 5 4.500 2.500M9 9l-3.500 3.500 1.500 4M13.500 11.500 17 12.500" />
  </>,
  crude: (f) => <>
    <path d="M10 2.500c3.200 4 5.200 6.600 5.200 9.300a5.200 5.200 0 0 1-10.400 0c0-2.700 2-5.300 5.200-9.300z" fill={f} />
    <path d="M7.500 12a2.600 2.600 0 0 0 2 2.800" />
  </>,
  quartz: (f) => <>
    <path d="M10 2.500 15 8l-5 9.500L5 8z" fill={f} />
    <path d="M5 8h10M10 2.500 8 8l2 9.500L12 8z" />
  </>,
  copper: (f) => <>
    <path d="M3 16 5 11h10l2 5z" fill={f} />
    <path d="M6.500 11 8 7h4l1.500 4" fill={f} />
    <path d="M7 13.500h6" />
  </>,
  metal: (f) => <>
    <path d="M4.500 3.500h11v3H12v7h3.500v3h-11v-3H8v-7H4.500z" fill={f} />
  </>,
  components: (f) => <>
    <path d="M10 2.500 11.200 5l2.600-1 .4 2.800 2.800.4-1 2.600 2.500 1.200-2.500 1.200 1 2.600-2.800.4-.4 2.800-2.600-1L10 19.500 8.800 17l-2.600 1-.4-2.800-2.800-.4 1-2.600L1.500 11 4 9.800l-1-2.600 2.800-.4.4-2.800 2.600 1z" fill={f} transform="translate(1.150 .9) scale(.885)" />
    <circle cx="10" cy="10.600" r="2.300" />
  </>,
  conductors: (f) => <>
    <rect x="5" y="5" width="10" height="10" rx="5" fill={f} />
    <path d="M2 10h3M15 10h3" />
    <path d="M7 8c.8-1.600 1.500-1.600 2.300 0s1.500 1.600 2.300 0 1.500-1.600 2.300 0M7 12c.8-1.600 1.500-1.600 2.300 0s1.500 1.600 2.300 0 1.500-1.600 2.300 0" transform="translate(-.45 0)" />
  </>,
  insulation: (f) => <>
    <circle cx="10" cy="10" r="7.300" fill={f} />
    <circle cx="10" cy="10" r="3.300" fill="none" />
    <path d="m4.900 7.200 2 1.300M15.100 7.200l-2 1.300M10 15.300v2M4.900 12.800l2-1.300M15.100 12.800l-2-1.300M10 2.700v2" />
  </>,
  fuel: (f) => <>
    <path d="M5 7h7.500l2.500 2.500V17H5z" fill={f} />
    <path d="M7.500 7V4h4v3" /><path d="m7.500 10.500 5 4M12.500 10.500l-5 4" />
  </>,
  chemicals: (f) => <>
    <path d="M8.500 3v4.800L4.200 15.300A1.400 1.400 0 0 0 5.400 17.500h9.200a1.400 1.400 0 0 0 1.200-2.200L11.500 7.800V3" />
    <path d="M6.300 12h7.400l2.100 3.300a1.400 1.400 0 0 1-1.200 2.200H5.400a1.400 1.400 0 0 1-1.200-2.200z" fill={f} />
    <path d="M7.500 3h5" />
  </>,
  substrate: (f) => <>
    <path d="M5.200 15.500a7.300 7.300 0 1 1 9.600 0z" fill={f} />
    <path d="M4.500 7h11M3.200 11h13.600M7.500 3.500v12M12.500 3.500v12" />
  </>,
  electronics: (f) => <>
    <rect x="5.500" y="5.500" width="9" height="9" rx="1" fill={f} />
    <path d="M8 5.500v-3M12 5.500v-3M8 17.500v-3M12 17.500v-3M5.500 8h-3M5.500 12h-3M17.500 8h-3M17.500 12h-3" />
    <rect x="8.200" y="8.200" width="3.600" height="3.600" rx=".4" />
  </>,
  hardware: (f) => <>
    <rect x="3.500" y="3.500" width="13" height="5.500" rx="1" fill={f} /><rect x="3.500" y="11" width="13" height="5.500" rx="1" fill={f} />
    <path d="M6 6.250h.2M6 13.750h.2M9 6.250h5M9 13.750h5" />
  </>,
  spares: (f) => <>
    <path d="M10 2.500 16.500 6.250v7.500L10 17.500 3.500 13.750v-7.500z" fill={f} />
    <circle cx="10" cy="10" r="2.800" />
  </>,
  media: (f) => <>
    <circle cx="10" cy="10" r="7.300" fill={f} />
    <circle cx="10" cy="10" r="1.300" />
    <circle cx="10" cy="5.800" r="1.200" /><circle cx="6.400" cy="12.100" r="1.200" /><circle cx="13.600" cy="12.100" r="1.200" />
  </>,
  instruments: (f) => <>
    <path d="M3 14a7 7 0 0 1 14 0z" fill={f} />
    <path d="M10 14 13 8.500" /><path d="M5.500 14v-.2M10 9v-.2M14.500 14v-.2M6.800 10.600l-.1-.1" />
    <path d="M3 16.500h14" />
  </>,
  medicine: (f) => <>
    <path d="M6 7.500h8V17H6z" fill={f} />
    <path d="M7.500 7.500V4h5v3.500" /><path d="M10 10v4.500M7.800 12.250h4.400" />
  </>,
};

const DRAW_LIKE: Partial<Record<Good, Good>> = {
  timber: 'materials', fibres: 'food', horses: 'food', salt: 'materials', spices: 'food', precious: 'copper',
  tin: 'copper_ore', saltpetre: 'materials', gas: 'crude', bauxite: 'iron_ore', uranium_ore: 'quartz', rare_earths: 'quartz',
  lithium: 'quartz', cobalt_nickel: 'iron_ore', helium: 'crude', aluminium: 'metal', fertilizer: 'chemicals',
  munitions: 'tools', magnets: 'conductors', batteries: 'electronics', nuclear_fuel: 'quartz', textiles: 'media',
  consumer_goods: 'components', fine_wares: 'instruments', lattice: 'substrate', volatiles: 'crude', propellant: 'fuel',
  helium3: 'quartz',
};

export function GoodIcon({ good, size = 16, class: cls, title }: { good: Good; size?: number; class?: string; title?: string }) {
  const draw = DRAW[good] ?? DRAW[DRAW_LIKE[good] ?? 'materials'];
  if (!draw) return null;
  return (
    <svg class={'icon good-icon' + (cls ? ' ' + cls : '')} width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" stroke-width="1.350" stroke-linecap="round" stroke-linejoin="round"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title ? <title>{title}</title> : null}
      {draw(GOOD_TINT[good])}
    </svg>
  );
}
