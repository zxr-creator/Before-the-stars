// Shared interface primitives. Plain Preact components over hand-written CSS.
import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './icons';
import { GOOD_SHORT, compact, milli } from './format';
import type { Check, Epistemic, GoodQty, KnownRequirement, RegionId } from './protocol';
import { getState, selectRegion, useApp } from './store';

type Children = { children?: ComponentChildren };

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- buttons -------------------------------------------------------------------

export interface BtnProps extends Children {
  kind?: 'primary' | 'default' | 'ghost' | 'danger';
  small?: boolean;
  icon?: string;
  disabled?: boolean;
  /** When set, the button is disabled and the reason is exposed as tooltip text. */
  why?: string | null | false;
  title?: string;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  testid?: string;
  pressed?: boolean;
  type?: 'button' | 'submit';
}

export function Btn({ kind = 'default', small, icon, disabled, why, title, onClick, children, class: cls, testid, pressed, type = 'button' }: BtnProps) {
  const off = disabled || !!why;
  return (
    <button type={type} class={cx('btn', 'btn-' + kind, small && 'btn-sm', !children && 'btn-icon', cls)}
      disabled={off} title={why || title} aria-label={!children ? title : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      data-testid={testid} onClick={off ? undefined : onClick}>
      {icon ? <Icon name={icon} size={small ? 13 : 15} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

/** A disabled-reason line shown beside a control so the rule is visible without hovering. */
export function Why({ children }: Children) {
  if (!children) return null;
  return (
    <p class="why"><Icon name="lock" size={12} /> <span>{children}</span></p>
  );
}

export function Stepper({ value, min, max, step = 1, onChange, label, unit, disabled, testid }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; unit?: string;
  disabled?: boolean; testid?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <span class="stepper" role="group" aria-label={label} data-testid={testid}>
      <button type="button" class="stepper-btn" disabled={disabled || value <= min} aria-label={`Lower ${label}`}
        data-testid={testid ? testid + '-dec' : undefined} onClick={() => onChange(clamp(value - step))}>
        <Icon name="minus" size={12} />
      </button>
      <span class="stepper-val" aria-live="polite">{value}{unit ? <small> {unit}</small> : null}</span>
      <button type="button" class="stepper-btn" disabled={disabled || value >= max} aria-label={`Raise ${label}`}
        data-testid={testid ? testid + '-inc' : undefined} onClick={() => onChange(clamp(value + step))}>
        <Icon name="plus" size={12} />
      </button>
    </span>
  );
}

export function NumInput({ value, min, max, step = 1, onChange, label, unit, width = 84, testid }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; unit?: string;
  width?: number; testid?: string;
}) {
  return (
    <span class="numinput">
      <input type="number" value={value} min={min} max={max} step={step} aria-label={label} style={{ width: width + 'px' }}
        data-testid={testid}
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          const c = Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
          if (c !== v) onChange(c);
        }} />
      {unit ? <small>{unit}</small> : null}
    </span>
  );
}

export function Select<T extends string | number>({ value, options, onChange, label, testid, class: cls }: {
  value: T; options: { value: T; label: string; disabled?: boolean; group?: string }[]; onChange: (v: T) => void;
  label: string; testid?: string; class?: string;
}) {
  const numeric = typeof value === 'number';
  const groups: { group: string | undefined; items: typeof options }[] = [];
  for (const o of options) {
    const g = groups.find((x) => x.group === o.group);
    if (g) g.items.push(o);
    else groups.push({ group: o.group, items: [o] });
  }
  const opt = (o: (typeof options)[number]) => (
    <option value={String(o.value)} disabled={o.disabled} selected={o.value === value}>{o.label}</option>
  );
  return (
    <select class={cx('select', cls)} aria-label={label} data-testid={testid} value={String(value)}
      onChange={(e) => {
        const raw = (e.target as HTMLSelectElement).value;
        onChange((numeric ? Number(raw) : raw) as T);
      }}>
      {groups.map((g) => (g.group ? <optgroup label={g.group}>{g.items.map(opt)}</optgroup> : g.items.map(opt)))}
    </select>
  );
}

export function Field({ label, hint, children }: Children & { label: string; hint?: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <span class="field-body">{children}</span>
      {hint ? <span class="field-hint">{hint}</span> : null}
    </label>
  );
}

// --- structure -----------------------------------------------------------------

export function Section({ title, aside, children, class: cls, id }: Children & { title: ComponentChildren; aside?: ComponentChildren; class?: string; id?: string }) {
  return (
    <section class={cx('section', cls)} id={id}>
      <header class="section-head">
        <h3>{title}</h3>
        {aside ? <div class="section-aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Card({ children, class: cls, tone, onClick, selected, testid }: Children & {
  class?: string; tone?: string; onClick?: () => void; selected?: boolean; testid?: string;
}) {
  if (onClick) {
    return (
      <div class={cx('card', 'card-click', tone && 'card-' + tone, selected && 'is-selected', cls)} role="button" tabIndex={0}
        data-testid={testid} onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}>
        {children}
      </div>
    );
  }
  return <div class={cx('card', tone && 'card-' + tone, cls)} data-testid={testid}>{children}</div>;
}

export function Empty({ children }: Children) {
  return <p class="empty">{children}</p>;
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: {
  value: T; tabs: { key: T; label: string; count?: number }[]; onChange: (k: T) => void; label: string;
}) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button type="button" role="tab" class={cx('tab', value === t.key && 'is-active')} aria-selected={value === t.key}
          data-testid={`tab-${t.key}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined ? <span class="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Expander({ label, children, open: initial = false }: Children & { label: ComponentChildren; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div class={cx('expander', open && 'is-open')}>
      <button type="button" class="expander-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'down' : 'right'} size={12} /> <span>{label}</span>
      </button>
      {open ? <div class="expander-body">{children}</div> : null}
    </div>
  );
}

// --- data display ----------------------------------------------------------------

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'accent' | 'gold';

export function Badge({ tone = 'muted', icon, children, title }: Children & { tone?: Tone; icon?: string; title?: string }) {
  return (
    <span class={cx('badge', 'badge-' + tone)} title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}{children}
    </span>
  );
}

/** A value that is an estimate, report or forecast rather than a verified fact. */
export function Est({ children, kind = 'estimated', title }: Children & { kind?: Epistemic | string; title?: string }) {
  const label = kind === 'reported' ? 'Reported, not verified' : kind === 'forecast' ? 'Forecast' : kind === 'unknown' ? 'Unknown' : 'Estimate';
  return <span class={cx('est', 'est-' + kind)} title={title ?? label}>{children}</span>;
}

/** Marks a number as verified or not, by the protocol's epistemic label. */
export function EpistemicTag({ kind }: { kind: Epistemic }) {
  if (kind === 'verified') return <Badge tone="ok" icon="check" title="Verified by our own records">Verified</Badge>;
  if (kind === 'reported') return <Badge tone="warn" icon="question" title="A claim received, not verified">Reported</Badge>;
  if (kind === 'estimated') return <Badge tone="info" title="Estimated from partial evidence">≈ Estimated</Badge>;
  if (kind === 'forecast') return <Badge tone="info" title="A forecast, not an observation">Forecast</Badge>;
  return <Badge tone="muted" title="No evidence">Unknown</Badge>;
}

export function Meter({ value, max = 1, tone = 'accent', label, height = 8, mark }: {
  value: number; max?: number; tone?: Tone; label?: string; height?: number; mark?: number;
}) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span class={cx('meter', 'meter-' + tone)} role="img" aria-label={label ?? `${Math.round(f * 100)}%`} title={label}
      style={{ height: height + 'px' }}>
      <span class="meter-fill" style={{ width: (f * 100).toFixed(1) + '%' }} />
      {mark !== undefined ? <span class="meter-mark" style={{ left: (Math.max(0, Math.min(1, mark)) * 100).toFixed(1) + '%' }} /> : null}
    </span>
  );
}

export function toneOfBp(bp: number, good = 9000, fair = 6000): Tone {
  return bp >= good ? 'ok' : bp >= fair ? 'warn' : 'bad';
}

export function Stat({ label, value, unit, sub, tone, title }: {
  label: string; value: ComponentChildren; unit?: string; sub?: ComponentChildren; tone?: Tone; title?: string;
}) {
  return (
    <div class={cx('stat', tone && 'stat-' + tone)} title={title}>
      <span class="stat-label">{label}</span>
      <span class="stat-value">{value}{unit ? <small> {unit}</small> : null}</span>
      {sub ? <span class="stat-sub">{sub}</span> : null}
    </div>
  );
}

export function Checklist({ items, unknown }: { items: (KnownRequirement | Check)[]; unknown?: boolean }) {
  if (!items.length && !unknown) return null;
  return (
    <ul class="checklist">
      {items.map((it) => {
        const ok = 'satisfied' in it ? it.satisfied : it.ok;
        const text = 'text' in it ? it.text : it.label;
        const detail = 'detail' in it ? it.detail : null;
        return (
          <li class={ok ? 'is-ok' : 'is-missing'}>
            <span class="check-mark" aria-hidden="true"><Icon name={ok ? 'check' : 'cross'} size={12} /></span>
            <span><span class="sr-only">{ok ? 'Met: ' : 'Not met: '}</span>{text}{detail ? <small class="check-detail"> {detail}</small> : null}</span>
          </li>
        );
      })}
      {unknown ? (
        <li class="is-unknown">
          <span class="check-mark" aria-hidden="true"><Icon name="question" size={12} /></span>
          <span>Further knowledge not yet identified</span>
        </li>
      ) : null}
    </ul>
  );
}

/** "12 Tools · 3.5 Materials" from milli-unit quantities. */
export function GoodsList({ items, per, empty = 'none' }: { items: GoodQty[]; per?: string; empty?: string }) {
  if (!items.length) return <span class="muted">{empty}</span>;
  return (
    <span class="goods-list">
      {items.map((g, i) => (
        <span class="goods-item">{i ? <span class="sep"> · </span> : null}<b>{milli(g.amount)}</b> {GOOD_SHORT[g.good]}</span>
      ))}
      {per ? <span class="muted"> {per}</span> : null}
    </span>
  );
}

/** Work quantities are milli person-months on the wire. */
export function work(n: number): string {
  return compact(n / 1000);
}

export function RegionLink({ id, children }: Children & { id: RegionId }) {
  const obs = getState().obs;
  const name = obs?.regions.find((r) => r.id === id)?.name ?? 'Unmapped land';
  return (
    <button type="button" class="linklike region-link" title="Show on the map" onClick={(e) => {
      e.stopPropagation();
      selectRegion(id, true);
    }}>
      <Icon name="pin" size={11} />{children ?? name}
    </button>
  );
}

/** Shows the server's verdict for the most recent action submitted with `tag`. */
export function ActionNote({ tag }: { tag: string }) {
  const { lastResult } = useApp();
  if (!lastResult || lastResult.tag !== tag) return null;
  const rejected = lastResult.receipts.filter((r) => r.status !== 'accepted' && r.status !== 'applied');
  if (lastResult.error) return <p class="action-note is-bad" role="alert"><Icon name="cross" size={12} /> {lastResult.error}</p>;
  if (rejected.length) {
    return (
      <div class="action-note is-bad" role="alert">
        {rejected.map((r) => <p><Icon name="cross" size={12} /> Not accepted: {r.reason}</p>)}
      </div>
    );
  }
  const ok = lastResult.receipts[lastResult.receipts.length - 1];
  if (!ok) return null;
  return <p class="action-note is-ok" role="status"><Icon name="check" size={12} /> {ok.reason}</p>;
}

export function KV({ k, children, title }: Children & { k: string; title?: string }) {
  return (
    <div class="kv" title={title}><dt>{k}</dt><dd>{children}</dd></div>
  );
}

export function SeatDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span class="seat-dot" style={{ background: color, width: size + 'px', height: size + 'px' }} aria-hidden="true" />;
}

export type Jsx = JSX.Element;
