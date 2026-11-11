// Boost (运载力) in the top bar (design chapter 39 §7.6): "Boost 4.8 kt ▲1.6 kt/mo (cap 7.2 kt)".
// It appears only when the observation carries boost; the engine does not send it yet.
import type { JSX } from 'preact';
import type { Observation } from '../protocol';
import { int, pct, tonnes } from '../format';
import { t, tc } from '../i18n';
import { spaceView } from './adapter';
import { SpaceGlyph } from './icons';

/** "4.8 kt ▲1.6 kt/mo (cap 7.2 kt)" — the counter's text, also used by tests. */
export function boostText(stock: number, made: number, cap: number): { value: string; rate: string; cap: string } {
  return {
    value: tonnes(stock),
    rate: t('▲{n}/mo', { n: tonnes(made) }),
    cap: t('(cap {n})', { n: tonnes(cap) }),
  };
}

export function BoostYield({ obs }: { obs: Observation }): JSX.Element | null {
  const b = spaceView(obs)?.boost;
  if (!b || !Number.isFinite(b.stock)) return null;
  const txt = boostText(b.stock, b.made_last, b.cap);
  const atCap = b.cap > 0 && b.stock >= b.cap;
  const nearCap = !atCap && b.cap > 0 && b.stock + b.made_last >= b.cap;
  const stages = b.by_stage ?? [];
  return (
    <div class={'yield yield-boost tip-right' + (nearCap ? ' is-cap' : '') + (atCap ? ' is-idle' : '')}>
      <button type="button" class="yield-btn" aria-label={t('Boost')} aria-describedby="tip-boost" data-testid="yield-boost">
        <span class="yield-icon"><SpaceGlyph name="rocket" size={21} /></span>
        <span class="yield-text">
          <span class="yield-val">{txt.value}<em class="pos">{txt.rate}</em></span>
          <span class="yield-sub">{t('Boost')} {txt.cap}</span>
        </span>
      </button>
      <div class="yield-tip" role="tooltip" id="tip-boost">
        <div class="tip-head"><span class="tip-icon"><SpaceGlyph name="rocket" size={21} /></span><b>{t('Boost')}</b></div>
        <p class="tip-lede">{t('Tonnes your launch sites can put into low Earth orbit, already paid for. Boost keeps; at the cap the launch sites stand down.')}</p>
        <div class="tip-rows">
          <div class="tip-row"><span>{t('In stock')}</span><b>{tonnes(b.stock)}<small> / {tonnes(b.cap)}</small></b></div>
          <div class="tip-row"><span>{t('Made last month')}</span><b class="pos">+{tonnes(b.made_last)}</b></div>
          <div class="tip-row"><span>{t('Spent last month')}</span><b class="neg">−{tonnes(b.spent_last)}</b></div>
          {b.failure_rate_bp != null ? <div class="tip-row"><span>{t('Launch failure risk per 1,000 t')}</span><b>{pct(b.failure_rate_bp)}</b></div> : null}
        </div>
        {stages.length ? (
          <>
            <p class="tip-kicker">{t('By launch stage')}</p>
            <div class="tip-rows">
              {stages.map((s) => (
                <div class="tip-row"><span>{tc(s.stage)} × {int(s.levels)}</span><b>{s.standing_down ? t('standing down') : '+' + tonnes(s.made)}</b></div>
              ))}
            </div>
          </>
        ) : null}
        {atCap ? <p class="tip-risk is-soft">{t('At the cap: the launch sites stand down until boost is spent.')}</p>
          : nearCap ? <p class="tip-risk">{t('Within a month of the cap: launch sites will stand down.')}</p> : null}
      </div>
    </div>
  );
}
