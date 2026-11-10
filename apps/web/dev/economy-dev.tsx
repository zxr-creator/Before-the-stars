// Standalone harness for the economy ledger: /dev/economy.html
//   ?lang=zh-Hans        interface language (en | zh-Hans | zh-Hant)
//   ?obs=/dev/obs/x.json render a saved observation instead of the live referee
// Live mode boots the real store against the referee behind the Vite proxy, so
// the ledger's orders (set_policy) go through act() exactly as in the game.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../src/styles.css';
import '../src/theme/chrome.css';
import type { Observation } from '../src/protocol';
import { EconomyLedger } from '../src/economy/Ledger';
import { boot, useApp } from '../src/store';
import { setLocale, useLocale, type Locale } from '../src/i18n';

const q = new URLSearchParams(location.search);
setLocale((q.get('lang') as Locale) ?? 'en');

function Dev() {
  useLocale();
  const s = useApp();
  const [saved, setSaved] = useState<Observation | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(true);
  const src = q.get('obs');

  useEffect(() => {
    if (src) {
      fetch(src).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then(setSaved).catch((e: Error) => setErr(e.message));
    } else {
      void boot();
    }
  }, []);

  const obs = src ? saved : s.obs;
  if (err || s.boot === 'unreachable') return <p style={{ padding: '20px' }} data-testid="dev-error">Could not load an observation: {err || s.bootError}</p>;
  if (!obs) return <p style={{ padding: '20px' }}>Loading…</p>;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {open ? <EconomyLedger obs={obs} onClose={() => setOpen(false)} /> : (
        <div style={{ padding: '20px' }} data-testid="dev-closed">
          <p>Ledger closed. Store: panel = <b data-testid="dev-panel">{String(s.panel)}</b>, intent = <b data-testid="dev-intent">{s.intent ? JSON.stringify(s.intent) : 'none'}</b>, selected region = <b data-testid="dev-region">{String(s.selectedRegion)}</b></p>
          <button type="button" class="btn" data-testid="dev-reopen" onClick={() => setOpen(true)}>Reopen</button>
        </div>
      )}
    </div>
  );
}

render(<Dev />, document.getElementById('app')!);
