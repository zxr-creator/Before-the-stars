// Application shell: top bar, the atlas as the main stage, the panel rail and
// drawer, the region inspector, the chronicle sheet, the round dock and
// notifications over the map, full-screen overlays, toasts and dialogs.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { api } from './api';
import {
  PANEL_ORDER, PANEL_TITLE, boot, cancelPick, closeOverlay, dismissHandover, dismissResult, dismissToast, observerTick,
  openPanel, pollWhileWaiting, selectRegion, setMarked, setMenu, setWide, switchSeat, toggleOverlay, togglePanel, useApp,
  seatName, civName, viewAsSeat,
} from './store';
import type { AppState, OverlayKey, PanelKey } from './store';
import type { Observation } from './protocol';
import { Icon } from './icons';
import { Btn, cx } from './ui';
import { TopBar } from './topbar';
import { Setup } from './setup';
import { Inspector } from './inspector';
import { MapView } from './map/MapView';
import { BriefingPanel } from './panels/briefing';
import { EconomyPanel } from './panels/economy';
import { ProjectsPanel } from './panels/projects';
import { PeoplePanel } from './panels/people';
import { KnowledgePanel } from './panels/knowledge';
import { CulturePanel } from './panels/culture';
import { SpacePanel } from './panels/space';
import { PoliticsPanel } from './panels/politics';
import { DiplomacyPanel } from './panels/diplomacy';
import { MilitaryPanel } from './panels/military';
import { ObjectivesPanel } from './panels/objectives';
import { ChronicleSheet, ChronicleTab } from './panels/chronicle';
import { GameMenu } from './menu';
import { ConnectHost } from './agents/connect';
import { fmtYear, yearOf } from './format';
import { StandingOrders } from './panels/orders';
import { t, tc, useLocale } from './i18n';
import { MomentBanner, NotifyColumn, RoundDock } from './theme/hud';
import { BrandMark } from './theme/brand';
import { Emblem } from './theme/emblem';
import { OverlayFrame, StatePlate } from './theme/overlay';
import { Title } from './theme/title';
import { TechTree, CivicsTree } from './trees';
import { EraScreen } from './era';
import { Almanac } from './tutorial/almanac';
import { RegionalWorks, openWorks } from './economy/Construction';
import { BuildingTreeOverlay } from './economy/BuildingTree';
import { MarketOverlay } from './economy/MarketOverlay';
import { TutorialLayer } from './tutorial';
import { ObserverConsole } from './observer';
import { Playback } from './observer/controls';

export const RAIL_W = 58;
export const INSPECTOR_W = 324;
export const TOPBAR_H = 56;
/** Width kept clear at the right of the map for the notification column. */
export const NOTIFY_W = 52;

// The economy ledger is built by another team; the app must build without it.
type LedgerComponent = (props: { obs: Observation; onClose: () => void }) => JSX.Element;
const ledgerModules = import.meta.glob('./economy/Ledger.tsx', { eager: true }) as Record<string, { EconomyLedger?: LedgerComponent }>;
const EconomyLedger: LedgerComponent | null = Object.values(ledgerModules)[0]?.EconomyLedger ?? null;

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

const PANELS: Record<Exclude<PanelKey, 'chronicle'>, () => JSX.Element> = {
  briefing: BriefingPanel,
  economy: EconomyPanel,
  projects: ProjectsPanel,
  people: PeoplePanel,
  knowledge: KnowledgePanel,
  culture: CulturePanel,
  politics: PoliticsPanel,
  diplomacy: DiplomacyPanel,
  military: MilitaryPanel,
  objectives: ObjectivesPanel,
  space: SpacePanel,
};

/** Short labels under the rail icons (the full title is the tooltip). */
// i18n-table
const RAIL_LABEL: Record<PanelKey, string> = {
  briefing: 'Briefing', economy: 'Economy', projects: 'Projects', people: 'People', knowledge: 'Knowledge',
  culture: 'Culture', politics: 'Politics', diplomacy: 'Diplomacy', military: 'Military', objectives: 'Objectives',
  space: 'Space', chronicle: 'Chronicle',
};
// i18n-end
// i18n-fields
const OVERLAYS: { key: OverlayKey; icon: string; label: string; title: string; hotkey: string }[] = [
  { key: 'tech', icon: 'techtree', label: 'Tech', title: 'Technology tree', hotkey: 'T' },
  { key: 'civics', icon: 'civics', label: 'Civics', title: 'Civics tree', hotkey: 'C' },
  { key: 'ledger', icon: 'layers', label: 'Ledger', title: 'Economy ledger', hotkey: 'L' },
  { key: 'works', icon: 'hammer', label: 'Works', title: 'Regional works', hotkey: 'B' },
  { key: 'buildings', icon: 'techtree', label: 'Buildings', title: 'Building tree', hotkey: 'U' },
  { key: 'market', icon: 'economy', label: 'Market', title: 'Market', hotkey: 'M' },
  { key: 'orders', icon: 'scroll', label: 'Orders', title: 'Standing orders', hotkey: 'O' },
  { key: 'almanac', icon: 'almanac', label: 'Almanac', title: 'Almanac', hotkey: '?' },
];
// i18n-end

/** Width of the drawer for a panel; the map must stay visible beside it. */
export function drawerWidth(panel: PanelKey | null, vw: number, wide: boolean): number {
  if (!panel || panel === 'chronicle') return 0;
  const base = vw < 1360 ? 440 : 480;
  if (!wide) return base;
  return Math.max(base, Math.min(790, vw - RAIL_W - 400));
}

export function chronicleHeight(vh: number): number {
  return Math.max(300, Math.min(432, Math.round((vh - TOPBAR_H) * 0.56)));
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function Splash({ children, tone }: { children: ComponentChildren; tone?: 'bad' }) {
  return (
    <div class="splash">
      <div class={cx('splash-card', tone && 'is-' + tone)}>
        <BrandMark size={84} />
        <h1>{t('Before the Stars')}</h1>
        {children}
      </div>
    </div>
  );
}

export function App() {
  const s = useApp();
  useLocale();
  const vp = useViewport();
  const wide = s.wide;

  useEffect(() => {
    void boot();
    const poll = setInterval(() => void pollWhileWaiting(), 2500);
    const watch = setInterval(() => void observerTick(), 1500);
    return () => { clearInterval(poll); clearInterval(watch); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.boot !== 'ready' || st.screen !== 'game') return;
      // The tutorial owns the keyboard while one of its cards is open.
      if (document.querySelector('[data-tutorial-modal]')) return;
      const world = st.mode === 'observe' && st.viewAs === null;
      if (e.key === 'Escape') {
        if (st.menuOpen) setMenu(false);
        else if (st.pick) cancelPick();
        else if (document.querySelector('[data-esc-layer]')) return; // a nested drawer handles its own Esc
        else if (st.overlay) closeOverlay();
        else if (st.panel) openPanel(null);
        else if (st.selectedRegion !== null) selectRegion(null);
        else if (st.marked.length) setMarked([]);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        toggleOverlay('almanac');
        e.preventDefault();
        return;
      }
      if (world || !st.obs) return;
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        togglePanel(PANEL_ORDER[idx]);
        e.preventDefault();
      } else if (k === 't' || k === 'c' || k === 'l' || k === 'b' || k === 'o' || k === 'u' || k === 'm') {
        toggleOverlay(k === 't' ? 'tech' : k === 'c' ? 'civics' : k === 'b' ? 'works' : k === 'o' ? 'orders' : k === 'u' ? 'buildings' : k === 'm' ? 'market' : 'ledger');
        e.preventDefault();
      } else if (k === 'k') {
        togglePanel('space');
        e.preventDefault();
      } else if (k === 'h') {
        togglePanel('chronicle');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  stateRef.current = s;

  if (s.boot === 'loading') {
    return <Splash><p class="splash-wait"><span class="spinner" aria-hidden="true" /> {t('Opening the atlas…')}</p></Splash>;
  }
  if (s.boot === 'closed') {
    return (
      <Splash>
        <p class="splash-lede">{t('The match is saved and the game has stopped.')}</p>
        <p class="muted" data-testid="closed-screen">{t('You can close this window.')}</p>
      </Splash>
    );
  }
  if (s.boot === 'unreachable') {
    return (
      <Splash tone="bad">
        <p class="splash-error" role="alert"><Icon name="warn" /> {s.bootError ?? t('The local referee is not reachable.')}</p>
        {api.features.local
          ? <p class="muted" data-testid="engine-failure-note">{t('The game runs inside this page. Trying again starts a fresh engine; a match that was not saved is gone.')}</p>
          : <p class="muted">{t('Start it with')} <code>scripts/run.sh</code>{t(', then try again.')}</p>}
        <Btn kind="primary" nav onClick={() => void boot()}>{t('Try again')}</Btn>
      </Splash>
    );
  }
  if (s.screen === 'setup') return <Setup key={s.setupPreset ?? 'new'} />;
  if (s.screen === 'title' || !s.summary) return <Title />;

  if (s.mode === 'observe' && s.viewAs === null) {
    return (
      <div class="app is-world" style={{ '--topbar-h': TOPBAR_H + 'px', '--rail-w': '0px', '--drawer-w': '0px', '--inspector-open': '0px' } as JSX.CSSProperties}>
        <ObserverConsole />
        {s.overlay === 'almanac' ? <div class="world-overlay"><Almanac /></div> : null}
        <Toasts state={s} />
        {s.menuOpen ? <GameMenu /> : null}
      <ConnectHost />
        <ConnectHost />
      </div>
    );
  }
  if (!s.obs) return <Title />;

  const obs = s.obs;
  const watching = s.mode === 'observe';
  const dw = drawerWidth(s.panel, vp.w, wide);
  const ch = s.panel === 'chronicle' ? chronicleHeight(vp.h) : 0;
  const inspectorOpen = s.selectedRegion !== null && obs.regions.some((r) => r.id === s.selectedRegion);
  const Panel = s.panel && s.panel !== 'chronicle' ? PANELS[s.panel] : null;
  const finished = obs.phase === 'finished' || !!obs.outcome;
  const mapW = vp.w - RAIL_W - dw - (inspectorOpen ? INSPECTOR_W : 0);
  const stageH = vp.h - TOPBAR_H;
  const notifyMax = Math.max(2, Math.min(8, Math.floor((stageH - ch - 170) / 46)));
  const winner = obs.outcome ? obs.outcome.winner : null;

  return (
    <div class={cx('app', s.pick && 'is-picking', watching && 'is-observing', s.overlay && 'has-overlay', s.banners.length > 0 && 'has-banner', mapW < 620 && 'is-narrow')}
      style={{ '--rail-w': RAIL_W + 'px', '--drawer-w': dw + 'px', '--inspector-w': INSPECTOR_W + 'px', '--topbar-h': TOPBAR_H + 'px', '--chron-h': ch + 'px', '--inspector-open': (inspectorOpen ? INSPECTOR_W : 0) + 'px' } as JSX.CSSProperties}>
      <TopBar />
      {s.offline ? (
        <div class="offline-bar" role="alert"><Icon name="warn" size={14} /> {t('The local referee is not answering. Your last orders may not have been recorded; the client will retry.')}</div>
      ) : null}
      <div class="stage">
        <div class="map-host">
          <MapView
            obs={obs}
            selected={s.selectedRegion}
            onBuild={(id) => openWorks(id)}
            onSelect={(id) => selectRegion(id)}
            pick={s.pick ? { prompt: s.pick.prompt, targets: s.pick.targets, onPick: s.pick.onPick, onCancel: cancelPick } : null}
            marked={s.marked}
            focus={s.focus}
            insets={{ left: RAIL_W + dw, right: (inspectorOpen ? INSPECTOR_W : 0) + NOTIFY_W, top: 0, bottom: ch || 34 }}
          />
        </div>
        <Rail state={s} />
        {Panel ? (
          <aside class={cx('drawer', wide && 'is-wide')} aria-label={t(PANEL_TITLE[s.panel!])} data-testid={`panel-${s.panel}`}>
            <header class="drawer-head">
              <span class="drawer-crest" aria-hidden="true"><Icon name={s.panel!} size={18} /></span>
              <h2>{t(PANEL_TITLE[s.panel!])}</h2>
              <div class="drawer-tools">
                <Btn kind="ghost" small nav icon={wide ? 'left' : 'right'} title={wide ? t('Narrow this sheet') : t('Widen this sheet')} onClick={() => setWide(!wide)} />
                <Btn kind="ghost" small nav icon="close" title={t('Close (Esc)')} testid="panel-close" onClick={() => openPanel(null)} />
              </div>
            </header>
            <div class="drawer-body" key={s.panel}><Panel /></div>
          </aside>
        ) : null}
        {inspectorOpen ? <Inspector /> : null}
        {s.panel === 'chronicle' ? <ChronicleSheet /> : <ChronicleTab />}
        {!s.pick ? <NotifyColumn state={s} max={notifyMax} /> : null}
        {!s.pick ? <MomentBanner state={s} /> : null}
        {watching ? <Playback state={s} docked /> : <RoundDock state={s} compact={mapW < 620} />}
        {s.overlay ? <Overlay state={s} /> : null}
        <Toasts state={s} />
      </div>
      {s.menuOpen ? <GameMenu /> : null}
      <ConnectHost />
      {s.handover !== null ? (
        <div class="overlay" role="dialog" aria-modal="true" aria-label={t('Hand over')}>
          <div class="overlay-card">
            <p class="eyebrow">{t('Hot seat')}</p>
            <h2>{t('{name} has finished this phase', { name: civName(obs, obs.seat) })}</h2>
            <p>{t('Pass the device to')} <b>{seatName(s.handover)}</b>. {t('Each civilization sees only its own records.')}</p>
            <div class="row-end">
              <Btn kind="ghost" nav onClick={dismissHandover}>{t('Stay on this seat')}</Btn>
              <Btn kind="primary" nav testid="handover-continue" onClick={() => void switchSeat(s.handover!)}>{t('Continue as {name}', { name: seatName(s.handover) })}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {finished && obs.outcome && !s.resultDismissed ? (
        <div class="overlay" role="dialog" aria-modal="true" aria-label={t('Match result')} data-testid="result-screen">
          <div class="overlay-card result-card">
            <div class="result-crest" aria-hidden="true">
              {winner !== null
                ? <Emblem seat={winner} color={s.summary.seats?.find((x) => x.seat === winner)?.color ?? obs.civ.color} name={s.summary.seats?.find((x) => x.seat === winner)?.name ?? ''} size={64} />
                : <BrandMark size={64} />}
            </div>
            <p class="eyebrow">{t('{year} · the match has ended', { year: fmtYear(obs.outcome.finished_month, obs.outcome.finished_month === obs.month ? obs.date : null) })}</p>
            <h2>{winner === null ? t('No civilization prevailed') : t('{name} prevails', { name: winner === obs.seat ? tc(obs.civ.name) : civName(obs, winner) })}</h2>
            <p class="result-reason">{tc(obs.outcome.reason)}</p>
            <dl class="kvs">
              <div class="kv"><dt>{t('Winner')}</dt><dd>{winner === null ? t('None') : civName(obs, winner)}</dd></div>
              <div class="kv"><dt>{t('{name}’s reward', { name: tc(obs.civ.name) })}</dt><dd><b>{obs.outcome.reward.toFixed(3)}</b> <small class="muted">{t('(2 − T/H for the sole winner, otherwise −1)')}</small></dd></div>
            </dl>
            <div class="row-end">
              {watching && s.spectatorSupported ? <Btn kind="ghost" nav icon="globe" onClick={() => { dismissResult(); void viewAsSeat(null); }}>{t('World view')}</Btn> : null}
              <Btn kind="ghost" nav onClick={dismissResult}>{t('Look at the map')}</Btn>
              <Btn kind="primary" nav icon="chronicle" onClick={() => { dismissResult(); openPanel('chronicle'); }}>{t('Read the chronicle')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <TutorialLayer />
    </div>
  );
}

const stateRef: { current: AppState } = { current: null as unknown as AppState };

function Overlay({ state }: { state: AppState }) {
  if (state.overlay === 'tech') return <TechTree />;
  if (state.overlay === 'civics') return <CivicsTree />;
  if (state.overlay === 'era') return <EraScreen />;
  if (state.overlay === 'almanac') return <Almanac />;
  if (state.overlay === 'buildings' && state.obs) return <BuildingTreeOverlay obs={state.obs} />;
  if (state.overlay === 'market' && state.obs) return <MarketOverlay obs={state.obs} />;
  if (state.overlay === 'orders' && state.obs) return <StandingOrders obs={state.obs} arg={state.overlayArg} />;
  if (state.overlay === 'works' && state.obs) {
    const arg = state.overlayArg !== null ? Number(state.overlayArg) : null;
    return <RegionalWorks obs={state.obs} region={arg !== null && Number.isFinite(arg) ? arg : null} onClose={closeOverlay} />;
  }
  if (EconomyLedger && state.obs) {
    return <section class="fs-overlay fs-bare" role="dialog" aria-label={t('Economy ledger')} data-testid="overlay-ledger"><EconomyLedger obs={state.obs} onClose={closeOverlay} /></section>;
  }
  return (
    <OverlayFrame icon="layers" title={t('Economy ledger')} testid="overlay-ledger">
      <StatePlate icon="layers" title={t('The ledger is not part of this build yet')}>{t('Markets, production and population accounts will open here. The Economy panel has the current figures.')}</StatePlate>
    </OverlayFrame>
  );
}

function Rail({ state }: { state: AppState }) {
  const obs = state.obs!;
  const counts: Partial<Record<PanelKey, number>> = {
    briefing: obs.briefing.filter((b) => b.severity === 'danger' || b.severity === 'warning').length,
    diplomacy: obs.diplomacy.offers.filter((o) => o.to === obs.seat && o.status === 'open').length,
    chronicle: state.freshMoments.length,
  };
  return (
    <nav class="rail" aria-label={t('Panels')} data-tut="rail">
      {PANEL_ORDER.map((p, i) => {
        const key = p === 'chronicle' ? 'H' : p === 'space' ? 'K' : i < 9 ? String(i + 1) : '0';
        const n = counts[p] ?? 0;
        return (
          <button type="button" class={cx('rail-btn', state.panel === p && !state.overlay && 'is-active')} aria-pressed={state.panel === p}
            title={`${t(PANEL_TITLE[p])} (${key})`} data-testid={`rail-${p}`} onClick={() => togglePanel(p)}>
            <Icon name={p} size={20} />
            <span class="rail-label">{t(RAIL_LABEL[p])}</span>
            {n ? <span class="rail-count" aria-label={t('{n} items', { n })}>{n}</span> : null}
          </button>
        );
      })}
      <span class="rail-rule" aria-hidden="true" />
      {OVERLAYS.map((o) => (
        <button type="button" class={cx('rail-btn', 'rail-feature', state.overlay === o.key && 'is-active')} aria-pressed={state.overlay === o.key}
          title={`${t(o.title)} (${o.hotkey})`} data-testid={`rail-${o.key === 'tech' ? 'techtree' : o.key}`} onClick={() => toggleOverlay(o.key)}>
          <Icon name={o.icon} size={20} />
          <span class="rail-label">{t(o.label)}</span>
        </button>
      ))}
    </nav>
  );
}

function Toasts({ state }: { state: AppState }) {
  if (!state.toasts.length) return null;
  return (
    <div class="toasts" aria-live="polite">
      {state.toasts.map((x) => (
        <div class={cx('toast', 'toast-' + x.tone)} role={x.tone === 'bad' ? 'alert' : 'status'} data-testid={`toast-${x.tone}`}>
          <Icon name={x.tone === 'ok' ? 'check' : x.tone === 'bad' ? 'cross' : x.tone === 'moment' ? 'chronicle' : 'info'} size={15} />
          <div class="toast-body">
            <b>{x.title}</b>
            {x.detail ? <span>{x.detail}</span> : null}
          </div>
          {x.action ? <button type="button" class="linklike" onClick={() => { x.action!.run(); dismissToast(x.id); }}>{x.action.label}</button> : null}
          <button type="button" class="toast-x" aria-label={t('Dismiss')} onClick={() => dismissToast(x.id)}><Icon name="close" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
