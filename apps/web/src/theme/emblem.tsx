// A procedural heraldic emblem for each civilization, drawn from its seat,
// colour and name. Entirely generated: shield outline, a field division in two
// tinctures and one charge in metal. The same inputs always give the same arms.
import type { JSX } from 'preact';

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(c.trim());
  if (!m) return [138, 125, 106];
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend colour `a` toward `b` by `t` (0–1). */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a), B = parseHex(b);
  const ch = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return '#' + ch(0) + ch(1) + ch(2);
}

export const darker = (c: string, t = 0.35) => mix(c, '#14100c', t);
export const lighter = (c: string, t = 0.35) => mix(c, '#fff6df', t);

const SHIELDS = [
  'M4 3.500h32V22c0 11-7 17.500-16 21.500C11 39.500 4 33 4 22z',
  'M4 3.500h32V25a16 16 0 0 1-32 0z',
  'M4 6l6-2.500h20L36 6v16c0 11-7 17.500-16 21.500C11 39.500 4 33 4 22z',
  'M20 2.500 36 9v15c0 9.500-6.500 15.500-16 19.500C10.500 39.500 4 33.500 4 24V9z',
  // ten seats (design chapter 40, section 2.7): kite, oval, swallowtail banner, notched
  // tournament shield, Iberian point, roundel
  'M20 2.500 36.500 15 20 44 3.500 15z',
  'M20 2.500c9 0 16 8.500 16 20.500S29 43.500 20 43.500 4 35 4 23 11 2.500 20 2.500z',
  'M5 3.500h30v38.500l-15-8.500-15 8.500z',
  'M4 3.500h8l4 3.500 4-3.500 4 3.500 4-3.500h8V22c0 11-7 17.500-16 21.500C11 39.500 4 33 4 22z',
  'M4 3.500h32v24.500L20 43.500 4 28z',
  'M20 4.500a18 18 0 1 1 0 36 18 18 0 1 1 0-36z',
];

type Division = (b: string) => JSX.Element | null;
const DIVISIONS: Division[] = [
  () => null,
  (b) => <rect x="20" y="0" width="20" height="46" fill={b} />,
  (b) => <rect x="0" y="23" width="40" height="23" fill={b} />,
  (b) => <path d="M0 0h14L40 34v12H26L0 12z" fill={b} />,
  (b) => <path d="M0 46V30L20 12l20 18v16H30V34L20 25 10 34v12z" fill={b} />,
  (b) => <><rect x="20" y="0" width="20" height="22" fill={b} /><rect x="0" y="22" width="20" height="24" fill={b} /></>,
  (b) => <rect x="0" y="0" width="40" height="14" fill={b} />,
  (b) => <rect x="14" y="0" width="12" height="46" fill={b} />,
];

type Charge = (m: string, ink: string) => JSX.Element;
const CHARGES: Charge[] = [
  // star
  (m, ink) => <path d="m20 12 2.500 5.300 5.800.7-4.300 4 1.200 5.700L20 24.800l-5.200 2.900 1.200-5.700-4.300-4 5.800-.7z" fill={m} stroke={ink} stroke-width=".9" stroke-linejoin="round" />,
  // sun
  (m, ink) => <g stroke={ink} stroke-width=".9"><path d="M20 10.500v3M20 26.500v3M10.500 20h3M26.500 20h3M13.300 13.300l2.100 2.100M24.600 24.600l2.100 2.100M26.700 13.300l-2.100 2.100M15.400 24.600l-2.100 2.100" stroke={m} stroke-width="2" stroke-linecap="round" /><circle cx="20" cy="20" r="4.600" fill={m} /></g>,
  // tower
  (m, ink) => <path d="M14 29V15h-1.500v-4h3v2h2.500v-2h4v2h2.500v-2h3v4H26v14zM18.500 29v-5a1.500 1.500 0 0 1 3 0v5" fill={m} stroke={ink} stroke-width=".9" stroke-linejoin="round" />,
  // tree
  (m, ink) => <g stroke={ink} stroke-width=".9" stroke-linejoin="round"><path d="M18.700 30v-7h2.600v7z" fill={m} /><path d="M20 10c4 0 7 3 7 6.800S24 24 20 24s-7-3.400-7-7.200S16 10 20 10z" fill={m} /></g>,
  // waves
  (m) => <path d="M11 16c2.200-2.600 4.500-2.600 6.700 0s4.500 2.600 6.700 0 3.400-2.400 4.600-1.300M11 22c2.200-2.600 4.500-2.600 6.700 0s4.500 2.600 6.700 0 3.400-2.400 4.600-1.300M11 28c2.200-2.600 4.500-2.600 6.700 0s4.500 2.600 6.700 0 3.400-2.400 4.600-1.300" fill="none" stroke={m} stroke-width="2.200" stroke-linecap="round" />,
  // crescent
  (m, ink) => <path d="M24.500 11.500a9 9 0 1 0 0 17 7.300 7.300 0 0 1 0-17z" fill={m} stroke={ink} stroke-width=".9" stroke-linejoin="round" />,
  // wheel
  (m, ink) => <g fill="none"><circle cx="20" cy="20" r="8" stroke={ink} stroke-width="3.800" /><circle cx="20" cy="20" r="8" stroke={m} stroke-width="2.200" /><path d="M20 12v16M12 20h16M14.300 14.300l11.400 11.400M25.700 14.300 14.300 25.700" stroke={m} stroke-width="1.300" /><circle cx="20" cy="20" r="2" fill={m} stroke={ink} stroke-width=".7" /></g>,
  // twin peaks
  (m, ink) => <path d="M9.500 28 17 14l4 7 2.500-4L30.500 28z" fill={m} stroke={ink} stroke-width=".9" stroke-linejoin="round" />,
];

const GOLD = '#f0d894';
const SILVER = '#f4efe2';

export interface EmblemProps {
  seat: number;
  color: string;
  name?: string;
  size?: number;
  class?: string;
  title?: string;
}

export function Emblem({ seat, color, name = '', size = 28, class: cls, title }: EmblemProps) {
  const h = hashStr(name || 'seat' + seat);
  const shield = SHIELDS[((seat % SHIELDS.length) + SHIELDS.length) % SHIELDS.length];
  const division = DIVISIONS[(h >>> 4) % DIVISIONS.length];
  const charge = CHARGES[((h >>> 9) + seat * 3) % CHARGES.length];
  const second = (h >>> 14) % 2 === 0 ? darker(color, 0.42) : lighter(color, 0.5);
  const metal = (h >>> 16) % 3 === 0 ? SILVER : GOLD;
  const id = `emb-${seat}-${(h % 100000).toString(36)}`;
  return (
    <svg class={'emblem' + (cls ? ' ' + cls : '')} width={size} height={Math.round(size * 1.15)} viewBox="0 0 40 46"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={id}><path d={shield} /></clipPath>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".28" /><stop offset=".5" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".22" />
        </linearGradient>
      </defs>
      <path d={shield} fill="#1a1510" opacity=".35" transform="translate(0 1.200)" />
      <g clip-path={`url(#${id})`}>
        <rect width="40" height="46" fill={color} />
        {division(second)}
        {charge(metal, darker(color, 0.7))}
        <rect width="40" height="46" fill={`url(#${id}g)`} />
      </g>
      <path d={shield} fill="none" stroke="#8a6a26" stroke-width="2.600" stroke-linejoin="round" />
      <path d={shield} fill="none" stroke="#e7c873" stroke-width="1.200" stroke-linejoin="round" />
    </svg>
  );
}
