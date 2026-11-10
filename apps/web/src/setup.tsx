// Match setup: seed, seats, world size, length, objective mode, and saved matches.
import { useState } from 'preact/hooks';
import type { NewMatchRequest, SetupController } from './protocol';
import { Btn, Field, cx } from './ui';
import { Icon } from './icons';
import { loadGame, newMatch, setScreen, useApp } from './store';

const SEAT_COLORS = ['#c1503a', '#2f73a0', '#5c8a36', '#8a59a8'];
const CONTROLLERS: { value: SetupController; label: string; hint: string }[] = [
  { value: 'human', label: 'Human', hint: 'Played on this device' },
  { value: 'easy', label: 'Easy AI', hint: 'Native opponent, cautious' },
  { value: 'medium', label: 'Medium AI', hint: 'Native opponent' },
  { value: 'hard', label: 'Hard AI', hint: 'Native opponent, demanding' },
];

function randomSeed(): string {
  const a = ['amber', 'river', 'north', 'salt', 'cedar', 'iron', 'still', 'high', 'ash', 'tide', 'grey', 'long'];
  const b = ['reach', 'ford', 'coast', 'march', 'hollow', 'strand', 'vale', 'crossing', 'shoal', 'heath'];
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${a[r(a.length)]}-${b[r(b.length)]}-${100 + r(900)}`;
}

export function Setup() {
  const s = useApp();
  const [seed, setSeed] = useState(randomSeed);
  const [controllers, setControllers] = useState<SetupController[]>(['human', 'medium', 'medium', 'medium']);
  const [regions, setRegions] = useState<24 | 48 | 72>(48);
  const [length, setLength] = useState<'standard' | 'short'>('standard');
  const [disclosed, setDisclosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMatch = !!s.summary?.exists && !!s.obs;
  const humans = controllers.filter((c) => c === 'human').length;

  const start = async () => {
    setError(null);
    const req: NewMatchRequest = {
      seed: seed.trim() || undefined,
      regions,
      horizon: length === 'short' ? 960 : 2880,
      pace_bp: length === 'short' ? 3300 : 10000,
      controllers,
      disclosed_objective: disclosed,
    };
    const err = await newMatch(req);
    if (err) setError(err);
  };

  const load = async (name: string) => {
    setError(null);
    const err = await loadGame(name);
    if (err) setError(err);
  };

  return (
    <div class="setup" data-testid="setup-screen">
      <div class="setup-sheet">
        <header class="setup-head">
          <p class="eyebrow">A strategy atlas for four civilizations</p>
          <h1>Before the Stars</h1>
          <p class="setup-lede">From the first camps to a governed world and a working road to the stars. Every round is twelve months; every number you see is something your own people could know.</p>
        </header>

        <div class="setup-grid">
          <section class="setup-col">
            <h2>New match</h2>
            <Field label="World seed" hint="The same seed and settings give the same world.">
              <span class="row">
                <input type="text" class="text" value={seed} maxLength={64} data-testid="setup-seed" onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
                <Btn small kind="ghost" title="Draw another seed" onClick={() => setSeed(randomSeed())}>Shuffle</Btn>
              </span>
            </Field>

            <div class="field">
              <span class="field-label">Seats</span>
              <div class="seat-rows">
                {controllers.map((c, i) => (
                  <div class="seat-row">
                    <span class="seat-id"><span class="civ-swatch" style={{ background: SEAT_COLORS[i] }} aria-hidden="true" /> Seat {i + 1}</span>
                    <div class="segmented" role="radiogroup" aria-label={`Seat ${i + 1} controller`}>
                      {CONTROLLERS.map((o) => (
                        <button type="button" role="radio" aria-checked={c === o.value} class={cx('seg', c === o.value && 'is-active')} title={o.hint}
                          data-testid={`setup-seat-${i}-${o.value}`}
                          onClick={() => setControllers(controllers.map((x, j) => (j === i ? o.value : x)))}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {humans === 0 ? <span class="field-hint is-warn">With no human seat the match runs unattended; you can still watch seat 1.</span>
                : humans > 1 ? <span class="field-hint">Hot seat: {humans} people share this device and each finishes a phase separately.</span> : null}
            </div>

            <div class="setup-pair">
              <div class="field">
                <span class="field-label">World size</span>
                <div class="segmented" role="radiogroup" aria-label="World size">
                  {([24, 48, 72] as const).map((n) => (
                    <button type="button" role="radio" aria-checked={regions === n} class={cx('seg', regions === n && 'is-active')}
                      data-testid={`setup-regions-${n}`} onClick={() => setRegions(n)}>{n} regions</button>
                  ))}
                </div>
                <span class="field-hint">{regions === 24 ? 'Compact: neighbours meet early.' : regions === 48 ? 'Standard.' : 'Large: long isolation, long frontiers.'}</span>
              </div>
              <div class="field">
                <span class="field-label">Length</span>
                <div class="segmented" role="radiogroup" aria-label="Length">
                  <button type="button" role="radio" aria-checked={length === 'standard'} class={cx('seg', length === 'standard' && 'is-active')} data-testid="setup-length-standard" onClick={() => setLength('standard')}>Standard · 240 rounds</button>
                  <button type="button" role="radio" aria-checked={length === 'short'} class={cx('seg', length === 'short' && 'is-active')} data-testid="setup-length-short" onClick={() => setLength('short')}>Short · 80 rounds</button>
                </div>
                <span class="field-hint">{length === 'short' ? 'Work is paced about three times faster to fit 80 years.' : '240 years at the standard pace.'}</span>
              </div>
            </div>

            <div class="field">
              <span class="field-label">Final objective</span>
              <div class="choice-cards" role="radiogroup" aria-label="Objective mode">
                <button type="button" role="radio" aria-checked={!disclosed} class={cx('choice', !disclosed && 'is-active')} data-testid="setup-objective-discovery" onClick={() => setDisclosed(false)}>
                  <b>Discovery</b>
                  <span>The final objective is revealed only when your civilization discovers it.</span>
                </button>
                <button type="button" role="radio" aria-checked={disclosed} class={cx('choice', disclosed && 'is-active')} data-testid="setup-objective-disclosed" onClick={() => setDisclosed(true)}>
                  <b>Disclosed</b>
                  <span>Every seat knows the victory contract from the first year.</span>
                </button>
              </div>
            </div>

            {error ? <p class="action-note is-bad" role="alert"><Icon name="cross" size={12} /> {error}</p> : null}
            <div class="setup-actions">
              {hasMatch ? <Btn kind="ghost" onClick={() => setScreen('game')}>Back to the current match</Btn> : <span />}
              <Btn kind="primary" icon="flag" disabled={s.busy} testid="setup-start" onClick={() => void start()}>{s.busy ? 'Drawing the world…' : hasMatch ? 'Start new match (replaces current)' : 'Start'}</Btn>
            </div>
          </section>

          <section class="setup-col setup-saves">
            <h2>Saved matches</h2>
            {s.saves.length ? (
              <ul class="save-list">
                {s.saves.map((name) => (
                  <li>
                    <span class="save-name"><Icon name="save" size={14} /> {name}</span>
                    <Btn small disabled={s.busy} testid={`load-${name}`} onClick={() => void load(name)}>Load</Btn>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="empty">No saved matches yet. The referee keeps an autosave once a round has been resolved.</p>
            )}
            <div class="setup-note">
              <h3>How a round runs</h3>
              <ol>
                <li><b>Contact</b> — choose up to three counterparts.</li>
                <li><b>Negotiate</b> — five windows; one envelope per counterpart in each.</li>
                <li><b>Plan</b> — settle projects, labour and orders.</li>
                <li>The referee resolves <b>twelve months</b> and reports back.</li>
              </ol>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
