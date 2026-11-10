// Small shared pieces of the economy ledger: the tooltip layer, verified and
// estimated figures, status chips, the balance bar, the utilisation ring and a
// handful of original pictograms that the shared icon set does not carry.
import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { Good } from '../protocol';
import { GOOD_LABEL, GOOD_SHORT, computeQty, energy, peopleNum, qty, qtySigned, int } from '../format';
import { isZh } from '../i18n';
import { t } from '../i18n';
import { Icon } from '../icons';
import { GoodIcon } from '../theme/goods';
import { cx } from '../ui';
import type { Status } from './model';

// --- tooltips ----------------------------------------------------------------------
// Any element carrying data-tip shows its text in one floating note owned by the
// ledger root. Lines are separated with "\n".

export function tip(text: string | null | undefined | false): { 'data-tip'?: string } {
  return text ? { 'data-tip': text } : {};
}

interface TipState { text: string; x: number; y: number; below: boolean }

export function useTips(): { handlers: JSX.HTMLAttributes<HTMLDivElement>; layer: JSX.Element | null } {
  const [tipState, setTip] = useState<TipState | null>(null);
  const current = useRef<Element | null>(null);
  const show = useCallback((e: Event) => {
    const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (el === current.current) return;
    current.current = el;
    if (!el) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    const below = r.top < 120;
    const x = Math.max(150, Math.min(window.innerWidth - 150, r.left + r.width / 2));
    setTip({ text: el.getAttribute('data-tip') ?? '', x, y: below ? r.bottom + 7 : r.top - 7, below });
  }, []);
  const hide = useCallback(() => { current.current = null; setTip(null); }, []);
  const handlers = { onMouseOver: show, onFocusIn: show, onMouseLeave: hide, onFocusOut: hide, onScrollCapture: hide } as unknown as JSX.HTMLAttributes<HTMLDivElement>;
  const layer = tipState ? (
    <div class={cx('ledger-tip', tipState.below && 'is-below')} role="tooltip" style={{ left: tipState.x + 'px', top: tipState.y + 'px' }}>
      {tipState.text.split('\n').map((line) => <p>{line}</p>)}
    </div>
  ) : null;
  return { handlers, layer };
}

// --- figures ---------------------------------------------------------------------------

/** A quantity of a good in its own unit (rations, t/kt/Mt, lots): docs/units-and-scale.md §2. */
export function amt(good: Good, n: number): string {
  return qty(good, n);
}

/** Signed quantity of a good ("+12 kt", "−3k rations"). */
export function amtSigned(good: Good, n: number): string {
  return qtySigned(good, n);
}

/** A service quantity: shaft or electric work in MWh/GWh, compute in machine-hall-months. */
export function svc(kind: 'shaft' | 'elec' | 'compute', n: number): string {
  return kind === 'compute' ? computeQty(n) : energy(n);
}

/** Lower-case a server-supplied name for use mid-sentence (left alone in Chinese). */
export function lcs(text: string): string {
  return isZh() ? text : text.toLowerCase();
}

/** "artisans × 2": a count of qualified posts or people, safe for 1 as well as many. */
export function qualCount(label: string, n: number): string {
  return t("{qual} × {n}", { qual: label, n: peopleNum(n) });
}

/** "12 kt/mo" — a monthly rate of a good, in its unit. */
export function perMo(n: number, good: Good): string {
  return t('{n}/mo', { n: qty(good, n) });
}

/** Months of cover: "1.8", "23", "99+". */
export function coverText(m: number | null): string {
  if (m === null) return '–';
  if (m >= 100) return '99+';
  return m < 10 ? m.toFixed(1) : String(Math.round(m));
}

/** A figure the referee verified. */
export function V({ children, tipText, class: cls }: { children: ComponentChildren; tipText?: string; class?: string }) {
  return <span class={cx('ledger-v', cls)} {...tip(tipText)}>{children}</span>;
}

/** A figure this ledger worked out: always prefixed with ≈ and dotted beneath (italic too, where the script has italics). */
export function E({ children, tipText, class: cls }: { children: ComponentChildren; tipText?: string; class?: string }) {
  return <span class={cx('ledger-e', cls)} {...tip(tipText)}><i class="ledger-approx" aria-label={t('about')}>≈</i>{children}</span>;
}

export const STATUS_LABEL: Record<Status, string> = {
  shortage: 'Shortage', tight: 'Tight', balanced: 'Balanced', surplus: 'Surplus', full: 'Stores full',
};
const STATUS_ICON: Record<Status, string> = { shortage: 'danger', tight: 'warn', balanced: 'good', surplus: 'up', full: 'box' };

export function StatusChip({ status, tipText }: { status: Status; tipText?: string }) {
  return (
    <span class={cx('ledger-chip', 'is-' + status)} {...tip(tipText)}>
      <Icon name={STATUS_ICON[status]} size={11} />{t(STATUS_LABEL[status])}
    </span>
  );
}

export function GoodTag({ good, size = 15, short = true }: { good: Good; size?: number; short?: boolean }) {
  return <span class="ledger-good"><GoodIcon good={good} size={size} /> {t((short ? GOOD_SHORT : GOOD_LABEL)[good])}</span>;
}

/** Icon and quantity, as used in recipe flows. */
export function GoodQtyChip({ good, amount, est, missing, tipText, unit }: { good: Good; amount: number; est?: boolean; missing?: boolean; tipText?: string; unit?: string }) {
  return (
    <span class={cx('ledger-qty', missing && 'is-missing', est && 'is-est')} {...tip(tipText ?? t(GOOD_LABEL[good]))}>
      <GoodIcon good={good} size={16} />
      <b>{est ? <i class="ledger-approx">≈</i> : null}{qty(good, amount)}</b>{unit ? <small>{unit}</small> : null}
      {missing ? <Icon name="warn" size={10} /> : null}
    </span>
  );
}

// --- charts --------------------------------------------------------------------------------

/**
 * Supply over demand for one round on a shared scale. Each bar is split into its
 * home part (made / used) and its traded part (hatched).
 */
export function BalanceBar({ good, made, tradedIn, used, tradedOut, scale, tipText }: {
  good: Good; made: number; tradedIn: number; used: number; tradedOut: number; scale?: number; tipText?: string;
}) {
  const max = Math.max(1, scale ?? Math.max(made + tradedIn, used + tradedOut));
  const w = (n: number) => (n <= 0 ? '0' : Math.max(1.5, (n / max) * 100).toFixed(1) + '%');
  return (
    <span class="ledger-bal" role="img" aria-label={t('Supply {s} against demand {d}', { s: qty(good, made + tradedIn), d: qty(good, used + tradedOut) })} {...tip(tipText)}>
      <span class="ledger-bal-row">
        {made > 0 ? <i class="ledger-bal-seg is-supply" style={{ width: w(made) }} /> : null}
        {tradedIn > 0 ? <i class="ledger-bal-seg is-supply is-trade" style={{ width: w(tradedIn) }} /> : null}
      </span>
      <span class="ledger-bal-row">
        {used > 0 ? <i class="ledger-bal-seg is-demand" style={{ width: w(used) }} /> : null}
        {tradedOut > 0 ? <i class="ledger-bal-seg is-demand is-trade" style={{ width: w(tradedOut) }} /> : null}
      </span>
    </span>
  );
}

export function Ring({ bp, size = 46, tone, tipText, off }: { bp: number; size?: number; tone: 'ok' | 'warn' | 'bad' | 'muted'; tipText?: string; off?: boolean }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, bp / 10000));
  return (
    <span class={cx('ledger-ring', 'is-' + tone)} {...tip(tipText)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('Utilisation {pct}', { pct: Math.round(f * 100) + '%' })}>
        <circle class="ledger-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" stroke-width="4" />
        {f > 0 ? (
          <circle class="ledger-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke-width="4" stroke-linecap="round"
            stroke-dasharray={`${(c * f).toFixed(2)} ${c.toFixed(2)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
        <text x={size / 2} y={size / 2 + 4} text-anchor="middle" class="ledger-ring-text">{off ? '–' : Math.round(f * 100)}</text>
      </svg>
    </span>
  );
}

/** A thin bar with an optional marker; `parts` stack left to right. */
export function Bar({ parts, max, mark, height = 8, tipText, label }: {
  parts: { value: number; cls: string }[]; max: number; mark?: number; height?: number; tipText?: string; label?: string;
}) {
  const m = Math.max(1e-9, max);
  return (
    <span class="ledger-bar" style={{ height: height + 'px' }} role="img" aria-label={label} {...tip(tipText)}>
      {parts.filter((p) => p.value > 0).map((p) => <i class={cx('ledger-bar-seg', p.cls)} style={{ width: Math.min(100, (p.value / m) * 100).toFixed(2) + '%' }} />)}
      {mark !== undefined ? <i class="ledger-bar-mark" style={{ left: Math.max(0, Math.min(100, (mark / m) * 100)).toFixed(2) + '%' }} /> : null}
    </span>
  );
}

// --- pictograms (20×20, stroke = currentColor) ---------------------------------------------------

const GLYPH: Record<string, JSX.Element> = {
  // a pick over a rock face
  Extraction: <><path d="M4 16.500 11.500 9" /><path d="M7.500 4.500c3.500-.8 6.500.5 8.500 3.500" /><path d="M11.500 9l1.500-1.500" /><path d="M3 17.500h6" /></>,
  // saw-tooth roof and a stack
  Industry: <><path d="M2.500 16.500V9.500l4 2.500V9.500l4 2.500V9.500l3 2V4.500h2.500v12z" /><path d="M5 14.500h1.500M9 14.500h1.500" /></>,
  // a bolt
  Power: <path d="M11.500 2.500 5 11h4.500l-1 6.500L15 9h-4.500z" />,
  // a spoked wheel on a track
  Transport: <><circle cx="10" cy="9.500" r="5.500" /><circle cx="10" cy="9.500" r="1.200" /><path d="M10 4v4.300M10 10.700V15M4.500 9.500h4.300M11.200 9.500h4.300M2.500 17.500h15" /></>,
  // a granary with a sheaf mark
  Food: <><path d="M4 17V8.500L10 4l6 4.500V17z" /><path d="M10 15.500V10M10 12c-1.300-.3-2-1.200-2-2.300M10 12c1.300-.3 2-1.200 2-2.300" /></>,
  // a hall with columns
  Civic: <><path d="M3 7.500 10 3.500l7 4z" /><path d="M5 8.500v6.500M8.300 8.500v6.500M11.700 8.500v6.500M15 8.500v6.500M3 17h14" /></>,
  // an open book
  Education: <><path d="M10 5.500c-2-1.300-4.500-1.500-7-.8v10c2.500-.7 5-.5 7 .8 2-1.300 4.500-1.500 7-.8v-10c-2.500-.7-5-.5-7 .8z" /><path d="M10 5.500v10" /></>,
  // a retort
  Research: <><path d="M8 3h4M8.500 3v4.500L4.500 15a1.300 1.300 0 0 0 1.200 2h8.600a1.300 1.300 0 0 0 1.200-2L11.500 7.500V3" /><path d="M6.500 12.500h7" /></>,
  // an orbit
  Space: <><circle cx="10" cy="10" r="2.500" /><ellipse cx="10" cy="10" rx="8" ry="3.500" transform="rotate(-28 10 10)" /><circle cx="15.800" cy="5.800" r=".9" fill="currentColor" stroke="none" /></>,
  Other: <><rect x="4" y="4" width="12" height="12" rx="1.500" /><path d="M7.500 10h5" /></>,
  // drive shaft: a gear
  shaft: <><circle cx="10" cy="10" r="6.400" stroke-width="2.600" stroke-dasharray="2.500 2.527" stroke-linecap="butt" /><circle cx="10" cy="10" r="4.600" /><circle cx="10" cy="10" r="1.300" /></>,
  elec: <path d="M11.500 2.500 5 11h4.500l-1 6.500L15 9h-4.500z" />,
  // a processor
  compute: <><rect x="5.500" y="5.500" width="9" height="9" rx="1" /><path d="M8 5.500V3M12 5.500V3M8 17v-2.500M12 17v-2.500M5.500 8H3M5.500 12H3M17 8h-2.500M17 12h-2.500" /></>,
  // a wrench for upkeep
  upkeep: <><path d="M13 3.500a3.500 3.500 0 0 0-3.300 4.700L3.500 14.400a1.500 1.500 0 0 0 2.100 2.100l6.200-6.200A3.500 3.500 0 0 0 16.500 7l-2.200 2.200-2-.5-.5-2L14 4.500a3.500 3.500 0 0 0-1-.2z" /></>,
  // a link of chain for carriage losses
  carriage: <><path d="M3 13h9.500V7H3z" /><path d="M12.500 9h2.500l2 2.300V13h-4.500" /><circle cx="6" cy="14.500" r="1.500" /><circle cx="14.500" cy="14.500" r="1.500" /></>,
  // a figure without a post
  idle: <><circle cx="10" cy="6" r="2.500" /><path d="M5.500 17v-2a4.500 4.500 0 0 1 9 0v2" /><path d="M3 17h14" stroke-dasharray="1.500 2" /></>,
};

export function Glyph({ name, size = 16, class: cls }: { name: string; size?: number; class?: string }) {
  return (
    <svg class={cx('icon', 'ledger-glyph', cls)} width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      stroke-width="1.500" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {GLYPH[name] ?? GLYPH.Other}
    </svg>
  );
}

export const CATEGORY_ORDER = ['Extraction', 'Industry', 'Power', 'Research', 'Space', 'Food', 'Transport', 'Civic', 'Education', 'Other'];

/** Compact people count (exact below ten thousand). */
export function people(n: number): string {
  return peopleNum(n);
}

export function Seg<T extends string>({ value, options, onChange, label, testid }: {
  value: T; options: { value: T; label: string; count?: number; tipText?: string }[]; onChange: (v: T) => void; label: string; testid?: string;
}) {
  return (
    <span class="segmented ledger-seg" role="group" aria-label={label} data-testid={testid}>
      {options.map((o) => (
        <button type="button" class={cx('seg', value === o.value && 'is-active')} aria-pressed={value === o.value}
          data-testid={testid ? `${testid}-${o.value}` : undefined} onClick={() => onChange(o.value)} {...tip(o.tipText)}>
          {o.label}{o.count !== undefined ? <small class="ledger-seg-count">{o.count}</small> : null}
        </button>
      ))}
    </span>
  );
}
