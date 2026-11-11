// Standalone harness for the map (3D and flat tiers): /dev/map.html
// Query: ?src=fixture|live|file&file=w48-r200&seed=11&n=48&mode=terrain&zoom=1.6&sel=ID&pick=1&insets=1&focus=ID&bare=1
//        &tier=3d|flat&lang=zh-Hans&cam=x,z,dist[,headingDeg]&q=high|low|auto&pan=dx,dy (pixels, after focus)
// `src=file` loads a real observation saved by scripts/map3d-worlds.mjs from dev/obs/<file>.json;
// add `spec=1` when the file is a spectator view (scripts/map-fixtures-r3.mjs): it is reshaped
// into the observer's world view exactly as the observer console does.
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Observation } from '../src/protocol';
import { MapView, type MapMode, type MapPick } from '../src/map/MapView';
import { makeFixture } from './map-fixture';
import { spectatorObservation } from '../src/observer/synthetic';
import type { SpectatorView } from '../src/protocol';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
// The tier and language are read by MapView and the i18n module from storage at start-up.
if (q.has('tier')) { try { localStorage.setItem('bts.mapTier', q.get('tier') === 'flat' ? 'flat' : '3d'); } catch { /* ignore */ } }
try { if (q.has('q') && q.get('q') !== 'auto') localStorage.setItem('bts.mapQuality', q.get('q') ?? ''); else localStorage.removeItem('bts.mapQuality'); } catch { /* ignore */ }
if (q.has('lang')) window.__btsI18n?.setLocale(q.get('lang') as 'en' | 'zh-Hans' | 'zh-Hant');

function Dev() {
  const [src, setSrc] = useState(q.get('src') ?? 'fixture');
  const [live, setLive] = useState<Observation | null>(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<MapMode>((q.get('mode') as MapMode) ?? 'political');
  const [selected, setSelected] = useState<number | null>(q.has('sel') ? num('sel', 0) : null);
  const [picking, setPicking] = useState(q.get('pick') === '1');
  const [insetsOn, setInsetsOn] = useState(q.get('insets') === '1');
  const [focus, setFocus] = useState<{ region: number; nonce: number } | null>(null);
  const [log, setLog] = useState('');
  const fixture = useMemo(() => makeFixture(num('seed', 11), num('n', 48)), []);

  useEffect(() => {
    if (src !== 'live' && src !== 'file') return;
    // Read-only: the harness never posts to the referee.
    fetch(src === 'file' ? `./obs/${q.get('file') ?? 'w48-r200'}.json` : `/api/observation?seat=${num('seat', 0)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((o: Observation | SpectatorView) => setLive(q.get('spec') === '1' ? spectatorObservation(o as SpectatorView, 'Observer') : (o as Observation)))
      .catch((e: Error) => setErr(String(e.message)));
  }, [src]);

  const base = src === 'live' || src === 'file' ? live : fixture;
  // ?build=1 queues a few building projects in the viewer's largest regions, so the
  // construction markers and the development card can be judged on saved fixtures.
  const obs = useMemo(() => {
    if (!base || q.get('build') !== '1') return base;
    const own = base.regions.filter((r) => r.own).sort((a, b) => (b.own?.population ?? 0) - (a.own?.population ?? 0)).slice(0, 4);
    const projects = own.flatMap((r, i) => (r.own?.facilities ?? []).slice(0, i === 0 ? 3 : 1).map((f, j) => ({
      id: 9000 + i * 10 + j, kind: 'build', title: 'Build ' + f.name, region: r.id, target: f.kind, levels: 1 + ((i + j) % 3),
      work_needed: 1000, work_done: 180 + 230 * ((i + j) % 4), inputs_needed: [], inputs_committed: [], priority: 5, paused: i === 3,
      started_month: base.month - 6, last_progress: 40, blockers: [], eta_months_low: 6, eta_months_high: 14,
    })));
    return { ...base, projects: [...base.projects, ...projects] };
  }, [base]);
  (window as unknown as { __devObs?: Observation | null }).__devObs = obs;

  useEffect(() => {
    if (!obs) return;
    const z = num('zoom', 0);
    const f = q.has('focus') ? num('focus', 0) : null;
    const t = setTimeout(() => {
      if (f != null) setFocus({ region: f, nonce: 1 });
      if (q.has('cam')) {
        const [x, z, dist, hd] = (q.get('cam') ?? '').split(',').map(Number);
        window.__map3d?.lookAt(x, z, dist, ((hd || 0) * Math.PI) / 180);
      }
      if (q.has('pan')) {
        const [px, py] = (q.get('pan') ?? '').split(',').map(Number);
        setTimeout(() => window.__atlas?.panBy?.(px || 0, py || 0), 500);
      }
      if (z > 0) {
        const btn = document.querySelector<HTMLButtonElement>(z > 1 ? '[data-testid="map-zoom-in"]' : '[data-testid="map-zoom-out"]');
        const steps = Math.round(Math.abs(Math.log(z) / Math.log(1.35)));
        for (let i = 0; i < steps; i++) btn?.click();
      }
    }, q.has('cam') ? 400 : 60);
    return () => clearTimeout(t);
  }, [obs]);

  const pick: MapPick | null = useMemo(() => {
    if (!picking || !obs) return null;
    const mine = new Set(obs.regions.filter((r) => r.owner === obs.seat).map((r) => r.id));
    const targets = obs.regions
      .filter((r) => !mine.has(r.id) && r.neighbors.some((n) => mine.has(n.region)))
      .map((r) => r.id);
    return {
      prompt: 'Choose a neighbouring region for the survey party',
      targets,
      onPick: (id) => { setLog('picked ' + id); setPicking(false); },
      onCancel: () => { setLog('cancelled'); setPicking(false); },
    };
  }, [picking, obs]);

  const insets = useMemo(
    () => (insetsOn ? { left: 56, right: 340, top: 52, bottom: 40 } : { left: 0, right: 0, top: 0, bottom: 0 }),
    [insetsOn],
  );
  const marked = useMemo(() => (q.has('mark') ? [num('mark', 0)] : []), []);

  if (!obs) return <div style={{ padding: 20, fontFamily: 'sans-serif' }}>{err ? 'Could not load live observation: ' + err : 'Loading…'}</div>;
  const bare = q.get('bare') === '1';
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapView
        obs={obs}
        selected={selected}
        onSelect={(id) => { setSelected(id); setLog('select ' + id); }}
        pick={pick}
        marked={marked}
        focus={focus}
        insets={insets}
        mode={mode}
        onModeChange={setMode}
      />
      {insetsOn && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 52, background: 'rgba(60,45,25,.82)' }} />
          <div style={{ position: 'absolute', left: 0, top: 52, bottom: 0, width: 56, background: 'rgba(60,45,25,.7)' }} />
          <div style={{ position: 'absolute', right: 0, top: 52, bottom: 0, width: 340, background: 'rgba(247,241,225,.96)', borderLeft: '1px solid #8a7d6a' }} />
          <div style={{ position: 'absolute', left: 56, right: 340, bottom: 0, height: 40, background: 'rgba(60,45,25,.5)' }} />
        </>
      )}
      <span data-testid="dev-sel" style={{ display: 'none' }}>{selected ?? ''}</span>
      <span data-testid="dev-status" style={{ display: 'none' }}>{log}</span>
      {!bare && (
        <div
          data-testid="dev-bar"
          style={{ position: 'absolute', top: insetsOn ? 60 : 8, left: insetsOn ? 64 : 8, display: 'flex', gap: 6, font: '12px sans-serif', background: 'rgba(247,241,225,.9)', padding: '4px 6px', border: '1px solid #8a7d6a', borderRadius: 4 }}
        >
          <button onClick={() => setSrc(src === 'live' ? 'fixture' : 'live')}>{src === 'live' ? 'Use fixture' : 'Use live seat 0'}</button>
          <button data-testid="dev-pick" onClick={() => setPicking(!picking)}>{picking ? 'End pick' : 'Pick mode'}</button>
          <button data-testid="dev-insets" onClick={() => setInsetsOn(!insetsOn)}>Insets</button>
          <button onClick={() => selected != null && setFocus({ region: selected, nonce: Date.now() })}>Focus selected</button>
          <span data-testid="dev-log">{log} · {obs.regions.length} regions known · draw {window.__atlas?.lastDrawMs().toFixed(1)} ms</span>
        </div>
      )}
    </div>
  );
}

render(<Dev />, document.getElementById('app')!);
