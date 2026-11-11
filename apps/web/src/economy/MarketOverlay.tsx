// The seat's market (key M): prices by good with their trend, standing buy and sell orders with
// last month's fills, trade credit, routes and embargoes (bts-protocol/2.4). Members see
// aggregates only; every figure is as the referee sent it.
import { useState } from 'preact/hooks';
import type { Good, MarketOrderView, MarketSide, Observation } from '../protocol';
import { GOOD_SHORT, compact, displayUnit, int, pct, qty } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { ActionNote, Btn, Empty, Field, NumInput, Section, Select, cx } from '../ui';
import { OverlayFrame } from '../theme/overlay';
import { GoodIcon, goodOrder } from '../theme/goods';
import { act, civName, isReadOnly, useApp } from '../store';
import './r3.css';

const TAG = 'market';
const gname = (g: Good) => (GOOD_SHORT[g] ? t(GOOD_SHORT[g]) : g);

export function MarketOverlay({ obs }: { obs: Observation }) {
  useLocale();
  const m = obs.market ?? null;
  const [draft, setDraft] = useState<{ good: Good; side: MarketSide; per: number; limit: number | null; keep: number } | null>(null);
  const lines = (m?.lines ?? []).slice().sort((a, b) => goodOrder(a.good) - goodOrder(b.good));
  const orders = m?.orders ?? [];
  const edit = (o: MarketOrderView) => setDraft({ good: o.good, side: o.side, per: o.per_month / 1000, limit: o.limit_price, keep: o.keep_stock / 1000 });
  return (
    <OverlayFrame icon="economy" title={t('Market')} kicker={t('Prices, orders and routes')} testid="overlay-market" class="mk-frame">
      <div class="mk" data-testid="market">
        <div class="mk-summary">
          <span><small class="muted">{t('Trade credit')}</small><br /><b data-testid="market-credit">{compact(m?.credit ?? 0)}</b></span>
          <span><small class="muted">{t('Members')}</small><br /><b>{m && m.members.length ? m.members.map((x) => tc(civName(obs, x))).join(' · ') : t('none yet')}</b></span>
          <span><small class="muted">{t('Embargoes')}</small><br /><b>{m && m.embargoes.length ? m.embargoes.map((x) => tc(civName(obs, x))).join(' · ') : t('none')}</b></span>
        </div>
        {!m || (!m.routes.length && !m.members.length) ? <p class="note"><Icon name="info" size={12} /> {t('A market forms among civilizations that have met, are at peace, do not embargo each other and are joined by a route over land or sea. Standing orders you place now take part once one exists.')}</p> : null}
        <div class="mk-cols">
          <Section title={t('Prices')} aside={<small class="muted">{t('credit per thousand base units')}</small>}>
            {lines.length ? (
              <table class="mk-table" data-testid="market-prices">
                <thead><tr><th>{t('Good')}</th><th class="num">{t('Price')}</th><th>{t('Trend')}</th><th class="num">{t('Base')}</th><th class="num">{t('Cleared')}</th><th class="num">{t('Sell')}</th><th class="num">{t('Buy')}</th></tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const d = l.price - l.prev_price;
                    return (
                      <tr data-testid={`market-line-${l.good}`}>
                        <th scope="row" class="mk-good"><GoodIcon good={l.good} size={14} /> {gname(l.good)}</th>
                        <td class="num"><b>{int(l.price)}</b></td>
                        <td class={d > 0 ? 'mk-up' : d < 0 ? 'mk-down' : 'muted'} title={t('Last month {n}', { n: int(l.prev_price) })}>{d > 0 ? '▲ +' + int(d) : d < 0 ? '▼ −' + int(-d) : '–'}</td>
                        <td class="num muted">{int(l.base_price)}</td>
                        <td class="num">{l.volume ? compact(l.volume) : '–'}</td>
                        <td class="num">{l.sale_orders || '–'}</td>
                        <td class="num">{l.buy_orders || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <Empty>{t('No good has been priced yet.')}</Empty>}
          </Section>
          <div>
            <Section title={t('Standing orders')}>
              {orders.length ? (
                <table class="mk-table" data-testid="market-orders">
                  <thead><tr><th>{t('Good')}</th><th>{t('Side')}</th><th class="num">{t('A month')}</th><th class="num">{t('Last month')}</th><th /></tr></thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr data-testid={`market-order-${o.good}`}>
                        <th scope="row" class="mk-good"><GoodIcon good={o.good} size={14} /> {gname(o.good)}</th>
                        <td>{o.side === 'buy' ? t('Buy') : t('Sell')}</td>
                        <td class="num">{qty(o.good, o.per_month)}{o.limit_price !== null ? <small class="muted"> · {t('limit {n}', { n: int(o.limit_price) })}</small> : null}{o.keep_stock ? <small class="muted"> · {t('keep {n}', { n: qty(o.good, o.keep_stock) })}</small> : null}</td>
                        <td class="num">{o.side === 'buy' ? t('bought {a}, received {b}', { a: compact(o.bought), b: compact(o.received) }) : t('sold {a}', { a: compact(o.sold) })} · {t('credit {n}', { n: (o.credit > 0 ? '+' : '') + compact(o.credit) })}</td>
                        <td>
                          <Btn small kind="ghost" testid={`market-edit-${o.good}`} onClick={() => edit(o)}>{t('Edit')}</Btn>
                          <Btn small kind="ghost" icon="trash" title={t('Remove this order')} testid={`market-remove-${o.good}`} onClick={() => void act({ kind: 'set_policy', setting: { kind: 'market_order', good: o.good, side: o.side, per_month: 0 } }, TAG)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Empty>{t('No standing order. One side per good; a buyer pays with what it sells.')}</Empty>}
              <OrderForm obs={obs} draft={draft} setDraft={setDraft} />
              <ActionNote tag={TAG} />
            </Section>
            <Section title={t('Routes')}>
              {m && m.routes.length ? (
                <table class="mk-table" data-testid="market-routes">
                  <thead><tr><th>{t('With')}</th><th>{t('By')}</th><th class="num">{t('Length')}</th><th class="num">{t('Loss')}</th><th class="num">{t('Capacity')}</th></tr></thead>
                  <tbody>
                    {m.routes.map((r) => (
                      <tr><th scope="row" class="mk-good">{tc(civName(obs, r.partner))}</th><td>{r.sea ? t('sea') : t('land')}</td><td class="num">{r.length}</td><td class="num">{pct(r.loss_bp)}</td><td class="num">{t('{n} t a month', { n: int(r.capacity_t) })}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <Empty>{t('No route is open. Roads, canals, ports or rail toward a neighbour at peace make one.')}</Empty>}
            </Section>
          </div>
        </div>
      </div>
    </OverlayFrame>
  );
}

function OrderForm({ obs, draft, setDraft }: { obs: Observation; draft: { good: Good; side: MarketSide; per: number; limit: number | null; keep: number } | null; setDraft: (d: null | { good: Good; side: MarketSide; per: number; limit: number | null; keep: number }) => void }) {
  const s = useApp();
  const goods = obs.civ.goods.map((g) => g.good).sort((a, b) => goodOrder(a) - goodOrder(b));
  const d = draft ?? { good: goods.includes('food') ? ('food' as Good) : goods[0], side: 'sell' as MarketSide, per: 10, limit: null, keep: 0 };
  const upd = (p: Partial<typeof d>) => setDraft({ ...d, ...p });
  if (!goods.length) return null;
  return (
    <div class="card form mk-order-form" data-testid="market-order-form">
      <Field label={t('Good')}><Select value={d.good} label={t('Good')} testid="mo-good" options={goods.map((g) => ({ value: g, label: gname(g) }))} onChange={(v) => upd({ good: v })} /></Field>
      <Field label={t('Side')}>
        <div class="segmented" role="radiogroup" aria-label={t('Side')}>
          {(['sell', 'buy'] as MarketSide[]).map((x) => <button type="button" role="radio" aria-checked={d.side === x} class={cx('seg', d.side === x && 'is-active')} data-testid={`mo-${x}`} onClick={() => upd({ side: x })}>{x === 'buy' ? t('Buy') : t('Sell')}</button>)}
        </div>
      </Field>
      <Field label={t('A month')}><NumInput value={d.per} min={1} max={1_000_000} width={80} unit={displayUnit(d.good)} label={t('Amount a month')} testid="mo-per" onChange={(v) => upd({ per: v })} /></Field>
      <Field label={t('Limit price')}><NumInput value={d.limit ?? 0} min={0} max={1_000_000} width={70} label={t('Limit price (0 for none)')} testid="mo-limit" onChange={(v) => upd({ limit: v > 0 ? v : null })} /></Field>
      <Field label={t('Keep in stock')}><NumInput value={d.keep} min={0} max={1_000_000} width={70} unit={displayUnit(d.good)} label={t('Stock to keep')} testid="mo-keep" onChange={(v) => upd({ keep: v })} /></Field>
      <Btn kind="primary" disabled={s.busy || isReadOnly()} testid="mo-submit"
        onClick={() => { void act({ kind: 'set_policy', setting: { kind: 'market_order', good: d.good, side: d.side, per_month: Math.round(d.per * 1000), limit_price: d.limit, keep_stock: Math.round(d.keep * 1000) } }, TAG); setDraft(null); }}>{t('Place the order')}</Btn>
    </div>
  );
}
