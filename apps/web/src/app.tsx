// Application shell: top bar, the atlas as the main stage, the panel rail and
// drawer, the region inspector, the chronicle sheet, toasts and overlays.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  PANEL_ORDER, PANEL_TITLE, boot, cancelPick, dismissHandover, dismissResult, dismissToast, openPanel,
  pollWhileWaiting, selectRegion, setMarked, setMenu, setWide, switchSeat, togglePanel, useApp, seatName, civName,
} from './store';
import type { AppState, PanelKey } from './store';
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
import { PoliticsPanel } from './panels/politics';
import { DiplomacyPanel } from './panels/diplomacy';
import { MilitaryPanel } from './panels/military';
import { ObjectivesPanel } from './panels/objectives';
import { ChronicleSheet, ChronicleTab } from './panels/chronicle';
import { GameMenu } from './menu';
import { fmtYear } from './format';

export const RAIL_W = 58;
export const INSPECTOR_W = 324;
export const TOPBAR_H = 54;

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
};

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
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function App() {
  const s = useApp();
  const vp = useViewport();
  const wide = s.wide;

  useEffect(() => {
    void boot();
    const t = setInterval(() => void pollWhileWaiting(), 2500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.screen !== 'game' || !st.obs) return;
      if (e.key === 'Escape') {
        if (st.menuOpen) setMenu(false);
        else if (st.pick) cancelPick();
        else if (document.querySelector('[data-esc-layer]')) return; // a nested drawer handles its own Esc
        else if (st.panel) openPanel(null);
        else if (st.selectedRegion !== null) selectRegion(null);
        else if (st.marked.length) setMarked([]);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        togglePanel(PANEL_ORDER[idx]);
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        togglePanel('chronicle');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  stateRef.current = s;

  if (s.boot === 'loading') {
    return <div class="splash"><div class="splash-card"><h1>Before the Stars</h1><p class="muted">Opening the atlas…</p></div></div>;
  }
  if (s.boot === 'unreachable') {
    return (
      <div class="splash">
        <div class="splash-card">
          <h1>Before the Stars</h1>
          <p class="splash-error"><Icon name="warn" /> {s.bootError ?? 'The local referee is not reachable.'}</p>
          <p class="muted">Start it with <code>scripts/run.sh</code>, then try again.</p>
          <Btn kind="primary" onClick={() => void boot()}>Try again</Btn>
        </div>
      </div>
    );
  }
  if (s.screen === 'setup' || !s.obs || !s.summary) return <Setup />;

  const obs = s.obs;
  const dw = drawerWidth(s.panel, vp.w, wide);
  const ch = s.panel === 'chronicle' ? chronicleHeight(vp.h) : 0;
  const inspectorOpen = s.selectedRegion !== null && obs.regions.some((r) => r.id === s.selectedRegion);
  const Panel = s.panel && s.panel !== 'chronicle' ? PANELS[s.panel] : null;
  const finished = obs.phase === 'finished' || !!obs.outcome;

  return (
    <div class={cx('app', s.pick && 'is-picking')} style={{ '--rail-w': RAIL_W + 'px', '--drawer-w': dw + 'px', '--inspector-w': INSPECTOR_W + 'px', '--topbar-h': TOPBAR_H + 'px', '--chron-h': ch + 'px', '--inspector-open': (inspectorOpen ? INSPECTOR_W : 0) + 'px' } as JSX.CSSProperties}>
      <TopBar />
      {s.offline ? (
        <div class="offline-bar" role="alert"><Icon name="warn" size={14} /> The local referee is not answering. Your last orders may not have been recorded; the client will retry.</div>
      ) : null}
      <div class="stage">
        <div class="map-host">
          <MapView
            obs={obs}
            selected={s.selectedRegion}
            onSelect={(id) => selectRegion(id)}
            pick={s.pick ? { prompt: s.pick.prompt, targets: s.pick.targets, onPick: s.pick.onPick, onCancel: cancelPick } : null}
            marked={s.marked}
            focus={s.focus}
            insets={{ left: RAIL_W + dw, right: inspectorOpen ? INSPECTOR_W : 0, top: 0, bottom: ch || 34 }}
          />
        </div>
        <Rail state={s} />
        {Panel ? (
          <aside class={cx('drawer', wide && 'is-wide')} aria-label={PANEL_TITLE[s.panel!]} data-testid={`panel-${s.panel}`}>
            <header class="drawer-head">
              <h2>{PANEL_TITLE[s.panel!]}</h2>
              <div class="drawer-tools">
                <Btn kind="ghost" small icon={wide ? 'left' : 'right'} title={wide ? 'Narrow this sheet' : 'Widen this sheet'} onClick={() => setWide(!wide)} />
                <Btn kind="ghost" small icon="close" title="Close (Esc)" testid="panel-close" onClick={() => openPanel(null)} />
              </div>
            </header>
            <div class="drawer-body" key={s.panel}><Panel /></div>
          </aside>
        ) : null}
        {inspectorOpen ? <Inspector /> : null}
        {s.panel === 'chronicle' ? <ChronicleSheet /> : <ChronicleTab />}
        <Toasts state={s} />
      </div>
      {s.menuOpen ? <GameMenu /> : null}
      {s.handover !== null ? (
        <div class="overlay" role="dialog" aria-modal="true" aria-label="Hand over">
          <div class="overlay-card">
            <p class="eyebrow">Hot seat</p>
            <h2>{civName(obs, obs.seat)} has finished this phase</h2>
            <p>Pass the device to <b>{seatName(s.handover)}</b>. Each civilization sees only its own records.</p>
            <div class="row-end">
              <Btn kind="ghost" onClick={dismissHandover}>Stay on this seat</Btn>
              <Btn kind="primary" testid="handover-continue" onClick={() => void switchSeat(s.handover!)}>Continue as {seatName(s.handover)}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {finished && obs.outcome && !s.resultDismissed ? (
        <div class="overlay" role="dialog" aria-modal="true" aria-label="Match result" data-testid="result-screen">
          <div class="overlay-card result-card">
            <p class="eyebrow">{fmtYear(obs.outcome.finished_month)} · the match has ended</p>
            <h2>{obs.outcome.winner === null ? 'No civilization prevailed' : obs.outcome.winner === obs.seat ? `${obs.civ.name} prevails` : `${civName(obs, obs.outcome.winner)} prevails`}</h2>
            <p class="result-reason">{obs.outcome.reason}</p>
            <dl class="kvs">
              <div class="kv"><dt>Winner</dt><dd>{obs.outcome.winner === null ? 'None' : civName(obs, obs.outcome.winner)}</dd></div>
              <div class="kv"><dt>{obs.civ.name}’s reward</dt><dd><b>{obs.outcome.reward.toFixed(3)}</b> <small class="muted">(2 − T/H for the sole winner, otherwise −1)</small></dd></div>
            </dl>
            <div class="row-end">
              <Btn kind="ghost" onClick={dismissResult}>Look at the map</Btn>
              <Btn kind="primary" icon="chronicle" onClick={() => { dismissResult(); openPanel('chronicle'); }}>Read the chronicle</Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const stateRef: { current: AppState } = { current: null as unknown as AppState };

function Rail({ state }: { state: AppState }) {
  const obs = state.obs!;
  const counts: Partial<Record<PanelKey, number>> = {
    briefing: obs.briefing.filter((b) => b.severity === 'danger' || b.severity === 'warning').length,
    diplomacy: obs.diplomacy.offers.filter((o) => o.to === obs.seat && o.status === 'open').length,
    chronicle: state.freshMoments.length,
  };
  return (
    <nav class="rail" aria-label="Panels">
      {PANEL_ORDER.map((p, i) => {
        const key = i < 9 ? String(i + 1) : i === 9 ? '0' : 'C';
        const n = counts[p] ?? 0;
        return (
          <button type="button" class={cx('rail-btn', state.panel === p && 'is-active')} aria-pressed={state.panel === p}
            title={`${PANEL_TITLE[p]} (${key})`} data-testid={`rail-${p}`} onClick={() => togglePanel(p)}>
            <Icon name={p} size={20} />
            <span class="rail-label">{PANEL_TITLE[p].split(' ')[0]}</span>
            {n ? <span class="rail-count" aria-label={`${n} items`}>{n}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

function Toasts({ state }: { state: AppState }) {
  if (!state.toasts.length) return null;
  return (
    <div class="toasts" aria-live="polite">
      {state.toasts.map((t) => (
        <div class={cx('toast', 'toast-' + t.tone)} role={t.tone === 'bad' ? 'alert' : 'status'} data-testid={`toast-${t.tone}`}>
          <Icon name={t.tone === 'ok' ? 'check' : t.tone === 'bad' ? 'cross' : t.tone === 'moment' ? 'chronicle' : 'info'} size={15} />
          <div class="toast-body">
            <b>{t.title}</b>
            {t.detail ? <span>{t.detail}</span> : null}
          </div>
          {t.action ? <button type="button" class="linklike" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button> : null}
          <button type="button" class="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="close" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
