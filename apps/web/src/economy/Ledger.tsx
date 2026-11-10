// Economy ledger: a full-screen account of the economy in four tabs.
//
//   Market         goods: stock, cover, supply against demand, who makes and uses each
//   Production     works as building cards, regional power and carriage, the supply chain
//   Workforce      where labour went, qualifications against posts, standing policy
//   Balance sheet  the round on one page, with ranked findings
//
// There are no prices in this game. Scarcity shows as stock, balance and
// blockers, so those are what the ledger measures. Figures the referee verified
// are set plain; figures this ledger reconstructs from recipes are prefixed with
// ≈ and dotted beneath (see ./model.ts for the arithmetic).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Good, Observation, RegionId } from '../protocol';
import { fmtYear, int } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { cx } from '../ui';
import { openPanel, selectRegion, type Intent, type PanelKey } from '../store';
import { buildLedger } from './model';
import { buildFindings } from './findings';
import { E, V, coverText, people, tip, useTips } from './parts';
import { MarketTab } from './Market';
import { ProductionTab } from './Production';
import { WorkforceTab } from './Workforce';
import { BalanceTab } from './Balance';
import './economy.css';

export type TabKey = 'market' | 'production' | 'workforce' | 'balance';

/** How the tabs send the player somewhere else, inside the ledger or out of it. */
export interface Nav {
  toTab: (tab: TabKey) => void;
  toGood: (good: Good) => void;
  toCard: (cardKey: string) => void;
  toRegion: (region: RegionId) => void;
  showOnMap: (region: RegionId) => void;
  build: (region?: RegionId) => void;
  train: (region?: RegionId) => void;
  open: (panel: PanelKey, intent?: Intent) => void;
}

const TABS: { key: TabKey; label: string; icon: string; hint: string }[] = [
  { key: 'market', label: 'Market', icon: 'balance', hint: 'Goods: stock, supply against demand, who makes and who uses each.' },
  { key: 'production', label: 'Production', icon: 'hammer', hint: 'Every works with its inputs, outputs and what holds it back; the supply chain.' },
  { key: 'workforce', label: 'Workforce', icon: 'labour', hint: 'Where labour went, qualifications against posts, standing policy.' },
  { key: 'balance', label: 'Balance sheet', icon: 'scroll', hint: 'The round on one page, with findings ranked by severity.' },
];

interface Focus { good: Good | null; card: string | null; region: RegionId | null; nonce: number }

export function EconomyLedger(props: { obs: Observation; onClose: () => void }) {
  const locale = useLocale();
  const { obs, onClose } = props;
  const [tab, setTab] = useState<TabKey>('market');
  const [focus, setFocus] = useState<Focus>({ good: null, card: null, region: null, nonce: 0 });
  const ledger = useMemo(() => buildLedger(obs), [obs]);
  const tips = useTips();
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Capture phase, so the shell's own number hotkeys (which switch drawers) stay quiet while the ledger is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (typing) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) {
        e.stopPropagation();
        e.preventDefault();
        setTab(TABS[i].key);
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const top = () => { if (bodyRef.current) bodyRef.current.scrollTop = 0; };

  const nav: Nav = useMemo(() => {
    const bump = (f: Partial<Focus>) => setFocus((old) => ({ good: null, card: null, region: null, ...f, nonce: old.nonce + 1 }));
    return {
      toTab: (k) => { bump({}); setTab(k); top(); },
      toGood: (good) => { bump({ good }); setTab('market'); },
      toCard: (card) => { bump({ card }); setTab('production'); },
      toRegion: (region) => { bump({ region }); setTab('production'); },
      showOnMap: (region) => { selectRegion(region, true); closeRef.current(); },
      build: (region) => { openPanel('projects', { kind: 'build', region }); closeRef.current(); },
      train: (region) => { openPanel('people', { kind: 'program', region }); closeRef.current(); },
      open: (panel, intent) => { openPanel(panel, intent); closeRef.current(); },
    };
  }, []);

  const findings = useMemo(() => buildFindings(obs, ledger, nav), [obs, ledger, nav, locale]);
  const active = ledger.rows.filter((r) => r.active);
  const short = active.filter((r) => r.status === 'shortage').length;
  const tight = active.filter((r) => r.status === 'tight').length;
  const held = ledger.cards.filter((c) => c.troubled).length;
  const vacancies = ledger.regions.reduce((a, r) => a + r.vacancies, 0);
  const serious = findings.filter((f) => f.sev === 'bad').length;
  const warns = findings.filter((f) => f.sev === 'warn').length;
  const badge: Record<TabKey, { n: number; tone: string } | null> = {
    market: short ? { n: short, tone: 'bad' } : tight ? { n: tight, tone: 'warn' } : null,
    production: held ? { n: held, tone: 'warn' } : null,
    workforce: vacancies ? { n: vacancies, tone: 'warn' } : null,
    balance: serious ? { n: serious, tone: 'bad' } : warns ? { n: warns, tone: 'warn' } : null,
  };
  const badgeTip: Record<TabKey, string> = {
    market: short ? t('{n} goods in shortage', { n: short }) : t('{n} goods running tight', { n: tight }),
    production: t('{n} works held back', { n: held }),
    workforce: t('{n} posts standing empty', { n: int(vacancies) }),
    balance: serious ? t('{n} serious findings', { n: serious }) : t('{n} findings to look at', { n: warns }),
  };

  return (
    <div class="ledger" data-testid="economy-ledger" {...tips.handlers}>
      <header class="ledger-head">
        <div class="ledger-brand">
          <span class="ledger-crest" aria-hidden="true"><Icon name="balance" size={20} /></span>
          <div>
            <span class="ledger-kicker">{tc(obs.civ.name)} · {fmtYear(obs.month)} · {t('round {n}', { n: obs.round })}</span>
            <h2>{t('Economy ledger')}</h2>
          </div>
        </div>
        <nav class="ledger-tabs" role="tablist" aria-label={t('Ledger sections')}>
          {TABS.map((x, i) => (
            <button type="button" role="tab" aria-selected={tab === x.key} class={cx('ledger-tab', tab === x.key && 'is-active')}
              data-testid={`ledger-tab-${x.key}`} onClick={() => nav.toTab(x.key)} {...tip(t(x.hint) + '\n' + t('Key {n}', { n: i + 1 }))}>
              <Icon name={x.icon} size={15} />
              <span>{t(x.label)}</span>
              {badge[x.key] ? <i class={cx('ledger-tab-badge', 'is-' + badge[x.key]!.tone)} {...tip(badgeTip[x.key])}>{badge[x.key]!.n > 999 ? '999+' : badge[x.key]!.n}</i> : null}
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </nav>
        <div class="ledger-head-stats">
          <span {...tip(t('Months of food in store at what people and soldiers eat. Stock is verified; the need is one unit a head.'))}>
            <small>{t('Food cover')}</small><b>{coverText(ledger.foodCover)} <i>{t('mo')}</i></b>
          </span>
          <span {...tip(t('Working-age people with no post last month. Verified by the referee.'))}>
            <small>{t('Without post')}</small><b>{people(obs.civ.labor.household)}</b>
          </span>
          <span {...tip(t('Works held back by staff, inputs, power or upkeep, of all works.'))}>
            <small>{t('Held back')}</small><b>{held}<i>/{ledger.cards.length}</i></b>
          </span>
        </div>
        <button type="button" class="ledger-close" aria-label={t('Close (Esc)')} data-testid="ledger-close" onClick={onClose} {...tip(t('Close (Esc)'))}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div class="ledger-strap">
        <span><V>123</V> {t('= verified by the referee, totals for the last round of {n} months', { n: ledger.months })}</span>
        <span><E>123</E> {t('= this ledger’s estimate: recipe × level × last month’s rate')}</span>
        <span class="ledger-strap-unit">{t('units of goods · hover any figure for its source')}</span>
      </div>
      <div class="ledger-body" ref={bodyRef} role="tabpanel">
        {tab === 'market' ? <MarketTab obs={obs} ledger={ledger} nav={nav} focusGood={focus.good} focusNonce={focus.nonce} /> : null}
        {tab === 'production' ? <ProductionTab obs={obs} ledger={ledger} nav={nav} focusCard={focus.card} focusRegion={focus.region} focusNonce={focus.nonce} /> : null}
        {tab === 'workforce' ? <WorkforceTab obs={obs} ledger={ledger} nav={nav} /> : null}
        {tab === 'balance' ? <BalanceTab obs={obs} ledger={ledger} nav={nav} findings={findings} /> : null}
      </div>
      {tips.layer}
    </div>
  );
}
