// Match setup: language, seed, the world (Earth-like or classic), its size preset and the
// number of civilizations it takes (two to ten, design chapter 40), who plays each seat (a
// person, a built-in AI or an LLM agent), the calendar, the objective mode, and saved matches.
import './economy/construction.css';
import { useState } from 'preact/hooks';
import { api } from './api';
import type { AgentOptions, AgentProvider, NewMatchRequest, SetupController, WorldKind } from './protocol';
import { Btn, Field, cx } from './ui';
import { Icon } from './icons';
import { hasLiveMatch, loadGame, newMatch, setScreen, useApp } from './store';
import { LOCALES, setLocale, t, useLocale } from './i18n';
import { BrandMark } from './theme/brand';
import { Emblem } from './theme/emblem';
import { TitleBackdrop } from './theme/backdrop';
import { startTutorial } from './tutorial';
import { MAP_PRESETS, MAX_SEATS, SEAT_COLORS, presetOf, type MapPreset } from './theme/seats';

type SeatKind = 'human' | 'easy' | 'medium' | 'hard' | 'agent';
// i18n-fields
const KINDS: { value: SeatKind; label: string; hint: string; icon: string }[] = [
  { value: 'human', label: 'Human', hint: 'Played on this device', icon: 'people' },
  { value: 'easy', label: 'Easy AI', hint: 'Built-in opponent, cautious', icon: 'military' },
  { value: 'medium', label: 'Medium AI', hint: 'Built-in opponent', icon: 'military' },
  { value: 'hard', label: 'Hard AI', hint: 'Built-in opponent, demanding', icon: 'military' },
  { value: 'agent', label: 'LLM agent', hint: 'A language model plays this seat', icon: 'agent' },
];
// i18n-end

interface ProviderInfo {
  value: AgentProvider;
  label: string;
  blurb: string;
  model: string;
  modelHint: string;
  key: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | null;
  baseUrl: boolean;
  modelRequired: boolean;
}
// i18n-fields
const PROVIDERS: ProviderInfo[] = [
  { value: 'claude-api', label: 'Claude (API)', blurb: 'Calls the Anthropic API with a key.', model: 'claude-opus-5-5', modelHint: 'Model id', key: 'ANTHROPIC_API_KEY', baseUrl: false, modelRequired: false },
  { value: 'claude-code', label: 'Claude Code (subscription)', blurb: 'Uses the Claude Code CLI installed and signed in on this machine.', model: '', modelHint: 'Blank = the CLI’s default model', key: null, baseUrl: false, modelRequired: false },
  { value: 'codex', label: 'Codex (CLI)', blurb: 'Uses the Codex CLI installed and signed in on this machine.', model: '', modelHint: 'Blank = the CLI’s default model', key: null, baseUrl: false, modelRequired: false },
  { value: 'openai-api', label: 'OpenAI-compatible API', blurb: 'Any server that speaks the OpenAI chat API.', model: '', modelHint: 'Model id (required)', key: 'OPENAI_API_KEY', baseUrl: true, modelRequired: true },
];
// i18n-end
const providerOf = (p: AgentProvider) => PROVIDERS.find((x) => x.value === p)!;

interface SeatConfig {
  kind: SeatKind;
  provider: AgentProvider;
  model: string;
  consultEvery: number;
  apiKey: string;
  baseUrl: string;
  effort: string;
}
const seatDefault = (kind: SeatKind): SeatConfig => ({ kind, provider: 'claude-api', model: 'claude-opus-5-5', consultEvery: 1, apiKey: '', baseUrl: '', effort: '' });

function randomSeed(): string {
  const a = ['amber', 'river', 'north', 'salt', 'cedar', 'iron', 'still', 'high', 'ash', 'tide', 'grey', 'long'];
  const b = ['reach', 'ford', 'coast', 'march', 'hollow', 'strand', 'vale', 'crossing', 'shoal', 'heath'];
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${a[r(a.length)]}-${b[r(b.length)]}-${100 + r(900)}`;
}

/** The language control: prominent on the setup screen, compact in the game menu. */
export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const locale = useLocale();
  return (
    <div class={cx('lang-switch', compact && 'is-compact')} role="radiogroup" aria-label="Language · 语言">
      <Icon name="globe" size={compact ? 14 : 16} />
      {LOCALES.map((l) => (
        <button type="button" role="radio" aria-checked={locale === l.value} lang={l.value} class={cx('lang-opt', locale === l.value && 'is-active')}
          data-testid={`lang-${l.value}`} onClick={() => setLocale(l.value)}>{l.label}</button>
      ))}
    </div>
  );
}

/** Seats resized to `n`: built-in AIs are added at the end, and removed from the end before any person or agent. */
export function resizeSeats(seats: SeatConfig[], n: number): SeatConfig[] {
  const out = [...seats];
  while (out.length < n) out.push(seatDefault('medium'));
  while (out.length > n) {
    let i = -1;
    for (let j = out.length - 1; j >= 0; j--) if (out[j].kind !== 'human' && out[j].kind !== 'agent') { i = j; break; }
    out.splice(i >= 0 ? i : out.length - 1, 1);
  }
  return out;
}

/** "Standard maps take 2 to 5 civilizations." */
function seatRange(p: MapPreset): string {
  return t('{size} maps take {lo} to {hi} civilizations.', { size: t(p.label), lo: p.minSeats, hi: p.maxSeats });
}

export function Setup() {
  const s = useApp();
  useLocale();
  const tutorial = s.setupPreset === 'tutorial';
  const observerPreset = s.setupPreset === 'observer';
  const [seed, setSeed] = useState(() => (tutorial ? 'first-light' : randomSeed()));
  const [regions, setRegions] = useState<MapPreset['regions']>(tutorial ? 30 : 60);
  const [seats, setSeats] = useState<SeatConfig[]>(() => (tutorial
    ? [seatDefault('human'), seatDefault('easy'), seatDefault('easy')]
    : [seatDefault(observerPreset ? 'medium' : 'human'), seatDefault('medium'), seatDefault('medium'), seatDefault(observerPreset ? 'hard' : 'medium')]));
  const [world, setWorld] = useState<WorldKind>('earth_like');
  const [calendar, setCalendar] = useState<'standard' | 'quick'>('standard');
  const [disclosed, setDisclosed] = useState(false);
  const preset = presetOf(regions);
  const pickPreset = (p: MapPreset) => {
    setRegions(p.regions);
    // keep the seats as they are where the new size allows them; otherwise its default count
    const n = seats.length >= p.minSeats && seats.length <= p.maxSeats ? seats.length : Math.max(p.minSeats, Math.min(p.maxSeats, seats.length < p.minSeats ? p.defaultSeats : p.maxSeats));
    setSeats(resizeSeats(seats, n));
  };
  const removeSeat = (i: number) => { if (seats.length > preset.minSeats) setSeats(seats.filter((_, j) => j !== i)); };
  const [error, setError] = useState<string | null>(null);
  const hasMatch = hasLiveMatch();
  const humans = seats.filter((c) => c.kind === 'human').length;
  const agents = seats.filter((c) => c.kind === 'agent').length;
  const missingModel = seats.findIndex((c) => c.kind === 'agent' && providerOf(c.provider).modelRequired && !c.model.trim());

  const patchSeat = (i: number, patch: Partial<SeatConfig>) => setSeats(seats.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pickProvider = (i: number, p: AgentProvider) => patchSeat(i, { provider: p, model: providerOf(p).model, apiKey: '', baseUrl: '' });

  const start = async () => {
    setError(null);
    const controllers: SetupController[] = seats.map((c) => (c.kind === 'agent' ? c.provider : c.kind));
    const agent_options: Record<string, AgentOptions> = {};
    seats.forEach((c, i) => {
      if (c.kind !== 'agent') return;
      const info = providerOf(c.provider);
      const o: AgentOptions = { consult_every: c.consultEvery };
      if (c.model.trim()) o.model = c.model.trim();
      if (info.key && c.apiKey.trim()) o.api_key = c.apiKey.trim();
      if (info.baseUrl && c.baseUrl.trim()) o.base_url = c.baseUrl.trim();
      if (c.effort) o.effort = c.effort;
      agent_options[String(i)] = o;
    });
    const req: NewMatchRequest = {
      seed: seed.trim() || undefined,
      regions,
      world,
      calendar,
      controllers,
      disclosed_objective: disclosed,
    };
    if (agents) req.agent_options = agent_options;
    const err = await newMatch(req);
    if (err) {
      setError(err);
      return;
    }
    // Keys are sent once and never kept by the client.
    setSeats(seats.map((c) => ({ ...c, apiKey: '' })));
    if (tutorial && humans > 0) startTutorial();
  };

  const seatLine = (c: SeatConfig): string => {
    if (c.kind === 'human') return t('A person on this device');
    if (c.kind !== 'agent') return t('Built-in AI · {level}', { level: t(c.kind === 'easy' ? 'Easy' : c.kind === 'medium' ? 'Medium' : 'Hard') });
    const parts = [t(providerOf(c.provider).label)];
    if (c.model.trim()) parts.push(c.model.trim());
    parts.push(c.consultEvery === 1 ? t('every round') : t('every {n} rounds', { n: c.consultEvery }));
    return parts.join(' · ');
  };

  const load = async (name: string) => {
    setError(null);
    const err = await loadGame(name);
    if (err) setError(err);
  };

  return (
    <div class="setup" data-testid="setup-screen">
      <TitleBackdrop dim />
      <div class="setup-scroll">
      <div class="setup-sheet">
        <div class="setup-top">
          <button type="button" class="setup-back" data-testid="setup-back" onClick={() => setScreen('title')}><Icon name="left" size={13} /> {t('Main menu')}</button>
          <div class="setup-heading">
            <BrandMark size={40} />
            <div>
              <h1>{tutorial ? t('Tutorial match') : observerPreset ? t('Observer mode') : t('New game')}</h1>
              <p>{t('History from 5000 BC: a round lasts fifty years in antiquity and two in the modern age. Every number you see is something your own people could know.')}</p>
            </div>
          </div>
          <div class="setup-lang"><LanguageSwitch /></div>
        </div>
        {tutorial ? (
          <p class="setup-tutorial" data-testid="setup-tutorial-note"><Icon name="compass" size={15} /> <span><b>{t('A gentle first match.')}</b> {t('A small world, two cautious neighbours, and a guided tour that starts as soon as the world is drawn. You can change anything below.')}</span></p>
        ) : null}

        <div class="setup-mode" role="radiogroup" aria-label={t('Match mode')}>
          <div class="setup-mode-seg">
            <button type="button" role="radio" aria-checked={humans > 0} class={cx('setup-mode-opt', humans > 0 && 'is-active')} data-testid="setup-mode-play"
              onClick={() => { if (humans === 0) patchSeat(0, { kind: 'human' }); }}><Icon name="flag" size={14} />{t('Play a civilization')}</button>
            <button type="button" role="radio" aria-checked={humans === 0} class={cx('setup-mode-opt', humans === 0 && 'is-active')} data-testid="setup-mode-observe"
              onClick={() => setSeats(seats.map(c => c.kind === 'human' ? { ...c, kind: 'medium' } : c))}><Icon name="eye" size={14} />{t('Observer mode')}</button>
          </div>
          <p class="muted small">{humans === 0 ? t('Watch the whole world or a civilization’s own view. Pause, advance a round, or run continuously.') : t('Play with fog of war. Whole-world observation is available in an AI-only match.')}</p>
        </div>
        <div class="setup-grid">
          <section class="setup-col">
            <h2>{t('World and seats')}</h2>
            <Field label={t('World seed')} hint={t('The same seed and settings give the same world.')}>
              <span class="row">
                <input type="text" class="text" value={seed} maxLength={64} data-testid="setup-seed" onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
                <Btn small kind="ghost" nav title={t('Draw another seed')} onClick={() => setSeed(randomSeed())}>{t('Shuffle')}</Btn>
              </span>
            </Field>

            <div class="field">
              <span class="field-label">{t('World')}</span>
              <div class="choice-cards" role="radiogroup" aria-label={t('World')}>
                <button type="button" role="radio" aria-checked={world === 'earth_like'} class={cx('choice', world === 'earth_like' && 'is-active')} data-testid="setup-world-earth_like" onClick={() => setWorld('earth_like')}>
                  <b>{t('Earth-like world')}</b>
                  <span>{t('A whole planet that wraps east to west: continents, climate belts from the poles to the tropics, rivers, coasts and harbours.')}</span>
                </button>
                <button type="button" role="radio" aria-checked={world === 'classic'} class={cx('choice', world === 'classic' && 'is-active')} data-testid="setup-world-classic" onClick={() => setWorld('classic')}>
                  <b>{t('Classic map')}</b>
                  <span>{t('The flat, bounded map of earlier versions.')}</span>
                </button>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{t('Map size')}</span>
              <div class="segmented setup-sizes" role="radiogroup" aria-label={t('Map size')}>
                {MAP_PRESETS.filter((p) => !p.test).map((p) => (
                  <button type="button" role="radio" aria-checked={regions === p.regions} class={cx('seg', regions === p.regions && 'is-active')} title={t(p.hint)}
                    data-testid={`setup-regions-${p.regions}`} onClick={() => pickPreset(p)}>
                    <span class="seg-main">{t(p.label)}</span><small>{t('{n} regions', { n: p.regions })} · {t('{lo}–{hi} civs', { lo: p.minSeats, hi: p.maxSeats })}</small>
                  </button>
                ))}
              </div>
              <span class="field-hint">{t(preset.hint)}{' '}
                {MAP_PRESETS.filter((p) => p.test).map((p) => (
                  <button type="button" class={cx('linklike is-quiet', regions === p.regions && 'is-active')} data-testid={`setup-regions-${p.regions}`} onClick={() => pickPreset(p)}>
                    {regions === p.regions ? t('Test size: {n} regions (chosen)', { n: p.regions }) : t('Test size: {n} regions', { n: p.regions })}
                  </button>
                ))}
              </span>
            </div>

            <div class="field">
              <span class="field-label setup-seats-head">
                <span>{t('Civilizations')}</span>
                <span class="seat-stepper" role="group" aria-label={t('Number of civilizations')}>
                  <button type="button" class="step-btn" disabled={seats.length <= preset.minSeats} aria-label={t('One civilization fewer')} data-testid="setup-seats-minus"
                    onClick={() => setSeats(resizeSeats(seats, seats.length - 1))}><Icon name="minus" size={12} /></button>
                  <b data-testid="setup-seat-count">{seats.length}</b>
                  <button type="button" class="step-btn" disabled={seats.length >= Math.min(MAX_SEATS, preset.maxSeats)} aria-label={t('One civilization more')} data-testid="setup-seats-plus"
                    onClick={() => setSeats(resizeSeats(seats, seats.length + 1))}><Icon name="plus" size={12} /></button>
                </span>
                <small class="muted">{seatRange(preset)}</small>
              </span>
              <div class={cx('seat-rows', seats.length > 5 && 'is-many')}>
                {seats.map((c, i) => {
                  const info = providerOf(c.provider);
                  return (
                    <div class={cx('seat-card', 'is-' + c.kind)} data-testid={`setup-seat-${i}`}>
                      <div class="seat-row">
                        <span class="seat-id"><Emblem seat={i} color={SEAT_COLORS[i % SEAT_COLORS.length]} name={'seat' + i} size={24} /> {t('Seat {n}', { n: i + 1 })}</span>
                        <div class="segmented" role="radiogroup" aria-label={t('Seat {n} controller', { n: i + 1 })}>
                          {KINDS.filter((o) => api.features.llmSeats || o.value !== 'agent').map((o) => (
                            <button type="button" role="radio" aria-checked={c.kind === o.value} class={cx('seg', c.kind === o.value && 'is-active')} title={t(o.hint)}
                              data-testid={`setup-seat-${i}-${o.value}`} onClick={() => patchSeat(i, { kind: o.value })}>
                              {o.value === 'agent' ? <Icon name="agent" size={13} /> : null}{t(o.label)}
                            </button>
                          ))}
                        </div>
                        <button type="button" class="seat-x" disabled={seats.length <= preset.minSeats} aria-label={t('Remove seat {n}', { n: i + 1 })}
                          title={seats.length <= preset.minSeats ? seatRange(preset) : t('Remove seat {n}', { n: i + 1 })} data-testid={`setup-seat-${i}-remove`} onClick={() => removeSeat(i)}>
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                      {c.kind === 'agent' ? (
                        <div class="agent-box" data-testid={`setup-agent-${i}`}>
                          <div class="chips" role="radiogroup" aria-label={t('Agent provider')}>
                            {PROVIDERS.map((p) => (
                              <button type="button" role="radio" aria-checked={c.provider === p.value} class={cx('chip', c.provider === p.value && 'is-active')}
                                data-testid={`setup-seat-${i}-${p.value}`} onClick={() => pickProvider(i, p.value)}>{t(p.label)}</button>
                            ))}
                          </div>
                          <p class="agent-blurb">{t(info.blurb)}</p>
                          <div class="agent-fields">
                            <label class="inline-field">
                              <span>{t('Model')}</span>
                              <input type="text" class="text" value={c.model} placeholder={t(info.modelHint)} spellcheck={false} autocomplete="off"
                                data-testid={`setup-agent-${i}-model`} onInput={(e) => patchSeat(i, { model: (e.target as HTMLInputElement).value })} />
                            </label>
                            <div class="inline-field">
                              <span>{t('Consult every')}</span>
                              <div class="segmented" role="radiogroup" aria-label={t('Consult every')}>
                                {[1, 2, 5, 10].map((n) => (
                                  <button type="button" role="radio" aria-checked={c.consultEvery === n} class={cx('seg', c.consultEvery === n && 'is-active')}
                                    data-testid={`setup-agent-${i}-every-${n}`} onClick={() => patchSeat(i, { consultEvery: n })}>{n === 1 ? t('round') : t('{n} rounds', { n })}</button>
                                ))}
                              </div>
                            </div>
                            <label class="inline-field">
                              <span>{t('Effort')}</span>
                              <select class="select" value={c.effort} data-testid={`setup-agent-${i}-effort`} onChange={(e) => patchSeat(i, { effort: (e.target as HTMLSelectElement).value })}>
                                <option value="">{t('Default')}</option>
                                <option value="low">{t('Low')}</option>
                                <option value="medium">{t('Medium')}</option>
                                <option value="high">{t('High')}</option>
                              </select>
                            </label>
                            {info.baseUrl ? (
                              <label class="inline-field wide">
                                <span>{t('Base URL')}</span>
                                <input type="url" class="text" value={c.baseUrl} placeholder="https://…/v1" spellcheck={false} autocomplete="off"
                                  data-testid={`setup-agent-${i}-baseurl`} onInput={(e) => patchSeat(i, { baseUrl: (e.target as HTMLInputElement).value })} />
                              </label>
                            ) : null}
                            {info.key ? (
                              <label class="inline-field wide">
                                <span>{t('API key (optional)')}</span>
                                <input type="password" class="text" value={c.apiKey} placeholder={t('Blank = the server’s {env}', { env: info.key })} autocomplete="off" spellcheck={false}
                                  data-testid={`setup-agent-${i}-key`} onInput={(e) => patchSeat(i, { apiKey: (e.target as HTMLInputElement).value })} />
                              </label>
                            ) : null}
                          </div>
                          <p class="agent-note">
                            <Icon name={info.key ? 'key' : 'info'} size={12} />{' '}
                            {info.key
                              ? t('A key typed here is sent to the local game server and kept in its memory only. It is never saved by this page.')
                              : t('No key is needed: the game server runs the CLI with the login already on this machine.')}
                            {c.consultEvery > 1 ? ' ' + t('Between consultations a built-in steward keeps this civilization running.') : ''}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {api.features.llmSeats ? null : <span class="field-hint" data-testid="setup-local-note">{t('Browser build: the whole game runs in this page. Seats played by language models or external agents need the desktop or server game.')}</span>}
              {humans === 0 ? (
                <p class="observer-note" data-testid="setup-observer-note">
                  <Icon name="eye" size={15} />
                  <span><b>{t('Observer mode.')}</b> {t('With no human seat you watch the match instead of playing it: the whole map, a scoreboard for every civilization, the world’s events and each agent’s notes. You step or play the rounds; you give no orders.')}</span>
                </p>
              ) : humans > 1 ? <span class="field-hint">{t('Hot seat: {n} people share this device and each finishes a phase separately.', { n: humans })}</span> : null}
            </div>

            <div class="field">
              <span class="field-label">{t('Calendar')}</span>
              <div class="segmented" role="radiogroup" aria-label={t('Calendar')}>
                <button type="button" role="radio" aria-checked={calendar === 'standard'} class={cx('seg', calendar === 'standard' && 'is-active')} data-testid="setup-calendar-standard" onClick={() => setCalendar('standard')}>{t('Standard · 525 rounds')}</button>
                <button type="button" role="radio" aria-checked={calendar === 'quick'} class={cx('seg', calendar === 'quick' && 'is-active')} data-testid="setup-calendar-quick" onClick={() => setCalendar('quick')}>{t('Quick · 230 rounds')}</button>
              </div>
              <span class="field-hint">{calendar === 'quick'
                ? t('The same 5000 BC to AD 2500 in fewer, longer rounds: up to a century each in antiquity, five years in the modern age.')
                : t('5000 BC to AD 2500: rounds of fifty years in antiquity, shortening to two years from 1950. Standing orders act year by year inside long rounds.')}</span>
            </div>

            <div class="field">
              <span class="field-label">{t('Final objective')}</span>
              <div class="choice-cards" role="radiogroup" aria-label={t('Objective mode')}>
                <button type="button" role="radio" aria-checked={!disclosed} class={cx('choice', !disclosed && 'is-active')} data-testid="setup-objective-discovery" onClick={() => setDisclosed(false)}>
                  <b>{t('Discovery')}</b>
                  <span>{t('The final objective is revealed only when your civilization discovers it.')}</span>
                </button>
                <button type="button" role="radio" aria-checked={disclosed} class={cx('choice', disclosed && 'is-active')} data-testid="setup-objective-disclosed" onClick={() => setDisclosed(true)}>
                  <b>{t('Disclosed')}</b>
                  <span>{t('Every seat knows the victory contract from the first year.')}</span>
                </button>
              </div>
            </div>

          </section>

          <section class="setup-col setup-saves">
            <div class="summary-card" data-testid="setup-summary">
              <h2>{t('This match')}</h2>
              <ul class={cx('summary-seats', seats.length > 5 && 'is-many')}>
                {seats.map((c, i) => (
                  <li>
                    <Emblem seat={i} color={SEAT_COLORS[i % SEAT_COLORS.length]} name={'seat' + i} size={22} />
                    <span><b>{t('Seat {n}', { n: i + 1 })}</b><small>{seatLine(c)}</small></span>
                  </li>
                ))}
              </ul>
              <dl class="summary-facts">
                <dt>{t('You')}</dt><dd>{humans === 0 ? t('Observe') : humans === 1 ? t('Play one civilization') : t('Hot seat, {n} players', { n: humans })}</dd>
                <dt>{t('World')}</dt><dd data-testid="setup-summary-world">{world === 'earth_like' ? t('Earth-like world') : t('Classic map')} · {t(preset.label)}, {t('{n} regions', { n: regions })} · {seed.trim() || t('random seed')}</dd>
                <dt>{t('Civilizations')}</dt><dd>{seats.length}</dd>
                <dt>{t('Calendar')}</dt><dd>{calendar === 'quick' ? t('Quick: 230 rounds, 5000 BC to AD 2500') : t('Standard: 525 rounds, 5000 BC to AD 2500')}</dd>
                <dt>{t('Objective')}</dt><dd>{disclosed ? t('Disclosed from year 1') : t('Revealed by discovery')}</dd>
              </dl>
              {error ? <p class="action-note is-bad" role="alert"><Icon name="cross" size={12} /> {error}</p> : null}
              {missingModel >= 0 ? <p class="summary-why"><Icon name="warn" size={12} /> {t('Seat {n} needs a model id.', { n: missingModel + 1 })}</p> : null}
              <div class="setup-actions">
                <Btn kind="primary" nav icon={humans === 0 ? 'eye' : 'flag'} disabled={s.busy} testid="setup-start"
                  why={missingModel >= 0 ? t('Seat {n} needs a model id.', { n: missingModel + 1 }) : null} onClick={() => void start()}>
                  {s.busy ? t('Drawing the world…') : humans === 0 ? t('Watch') : t('Start')}
                </Btn>
                {hasMatch ? <small class="muted">{t('Starting replaces the match in progress (its autosave is kept).')}</small> : null}
                {hasMatch ? <Btn kind="ghost" nav small onClick={() => setScreen('game')}>{t('Back to the current match')}</Btn> : null}
              </div>
            </div>
            <h2 style={{ marginTop: '14px' }}>{t('Saved matches')}</h2>
            {s.saves.length ? (
              <ul class="save-list">
                {s.saves.map((name) => (
                  <li>
                    <span class="save-name"><Icon name="save" size={14} /> {name}</span>
                    <Btn small nav disabled={s.busy} testid={`load-${name}`} onClick={() => void load(name)}>{t('Load')}</Btn>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="empty">{t('No saved matches yet. The referee keeps an autosave once a round has been resolved.')}</p>
            )}
            <div class="setup-note">
              <h3>{t('How a round runs')}</h3>
              <ol>
                <li><b>{t('Contact')}</b> — {t('choose up to three counterparts.')}</li>
                <li><b>{t('Negotiate')}</b> — {t('five windows; one envelope per counterpart in each.')}</li>
                <li><b>{t('Plan')}</b> — {t('settle projects, labour and orders.')}</li>
                <li>{t('The referee resolves the round — fifty years at first, two in the modern age — and reports back; standing orders act year by year inside it.')}</li>
              </ol>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
