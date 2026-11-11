// Match setup: language, seed, the world (Earth-like or classic), its size preset and the
// number of civilizations it takes (two to ten, design chapter 40), who plays each seat (a
// person, a built-in AI or an LLM agent), the calendar, the objective mode, and saved matches.
import './economy/construction.css';
import { useState } from 'preact/hooks';
import { api } from './api';
import type { AgentOptions, NewMatchRequest, SetupController, WorldKind } from './protocol';
import { AGENT_DEFAULTS, AgentBox, agentLine, agentOptions, agentProblem, type AgentSeatConfig } from './agents/setup-agent';
import { openConnect } from './agents/connect';
import { Btn, Field, cx } from './ui';
import { Icon } from './icons';
import { hasLiveMatch, loadGame, newMatch, setScreen, useApp } from './store';
import { LOCALES, setLocale, t, useLocale } from './i18n';
import { BrandMark } from './theme/brand';
import { Emblem } from './theme/emblem';
import { TitleBackdrop } from './theme/backdrop';
import { startTutorial } from './tutorial';
import { MAP_PRESETS, MAX_SEATS, SEAT_COLORS, presetOf, type MapPreset } from './theme/seats';

type SeatKind = 'human' | 'easy' | 'medium' | 'hard' | 'agent' | 'external';
// i18n-fields
const KINDS: { value: SeatKind; label: string; hint: string; icon: string }[] = [
  { value: 'human', label: 'Human', hint: 'Played on this device', icon: 'people' },
  { value: 'easy', label: 'Easy AI', hint: 'Built-in opponent, cautious', icon: 'military' },
  { value: 'medium', label: 'Medium AI', hint: 'Built-in opponent', icon: 'military' },
  { value: 'hard', label: 'Hard AI', hint: 'Built-in opponent, demanding', icon: 'military' },
  { value: 'agent', label: 'LLM agent', hint: 'A language model plays this seat', icon: 'agent' },
  { value: 'external', label: 'Your own agent', hint: 'An agent you run yourself connects over MCP or HTTP', icon: 'external' },
];
// i18n-end


interface SeatConfig extends AgentSeatConfig {
  kind: SeatKind;
}
const seatDefault = (kind: SeatKind): SeatConfig => ({ kind, ...AGENT_DEFAULTS });
const offSeat = (k: SeatKind) => k !== 'human' && k !== 'agent' && k !== 'external';

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
    for (let j = out.length - 1; j >= 0; j--) if (offSeat(out[j].kind)) { i = j; break; }
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
  const externals = seats.filter((c) => c.kind === 'external').length;
  const problemSeat = seats.findIndex((c) => c.kind === 'agent' && agentProblem(c) !== null);
  const problem = problemSeat >= 0 ? (agentProblem(seats[problemSeat]) === 'needs an API key' ? t('Seat {n} needs an API key.', { n: problemSeat + 1 }) : t('Seat {n} needs a model id.', { n: problemSeat + 1 })) : null;

  const patchSeat = (i: number, patch: Partial<SeatConfig>) => setSeats((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const start = async () => {
    setError(null);
    const controllers: SetupController[] = seats.map((c) => (c.kind === 'agent' ? c.provider : c.kind));
    const agent_options: Record<string, AgentOptions> = {};
    seats.forEach((c, i) => {
      if (c.kind === 'agent') agent_options[String(i)] = agentOptions(c);
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
    // an agent you run yourself needs its seat's token and the game's MCP server
    if (externals > 0) openConnect();
  };

  const seatLine = (c: SeatConfig): string => {
    if (c.kind === 'human') return t('A person on this device');
    if (c.kind === 'external') return t('An agent you run yourself (MCP or HTTP)');
    if (c.kind !== 'agent') return t('Built-in AI · {level}', { level: t(c.kind === 'easy' ? 'Easy' : c.kind === 'medium' ? 'Medium' : 'Hard') });
    return agentLine(c);
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
                  return (
                    <div class={cx('seat-card', 'is-' + c.kind)} data-testid={`setup-seat-${i}`}>
                      <div class="seat-row">
                        <span class="seat-id"><Emblem seat={i} color={SEAT_COLORS[i % SEAT_COLORS.length]} name={'seat' + i} size={24} /> {t('Seat {n}', { n: i + 1 })}</span>
                        <div class="segmented" role="radiogroup" aria-label={t('Seat {n} controller', { n: i + 1 })}>
                          {KINDS.filter((o) => (api.features.llmSeats || o.value !== 'agent') && (api.features.externalAgents || o.value !== 'external')).map((o) => (
                            <button type="button" role="radio" aria-checked={c.kind === o.value} class={cx('seg', c.kind === o.value && 'is-active')} title={t(o.hint)}
                              data-testid={`setup-seat-${i}-${o.value}`} onClick={() => patchSeat(i, { kind: o.value })}>
                              {o.value === 'agent' || o.value === 'external' ? <Icon name={o.icon} size={13} /> : null}{t(o.label)}
                            </button>
                          ))}
                        </div>
                        <button type="button" class="seat-x" disabled={seats.length <= preset.minSeats} aria-label={t('Remove seat {n}', { n: i + 1 })}
                          title={seats.length <= preset.minSeats ? seatRange(preset) : t('Remove seat {n}', { n: i + 1 })} data-testid={`setup-seat-${i}-remove`} onClick={() => removeSeat(i)}>
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                      {c.kind === 'agent' ? <AgentBox seat={i} c={c} onChange={(patch) => patchSeat(i, patch)} /> : null}
                      {c.kind === 'external' ? (
                        <div class="external-box" data-testid={`setup-external-${i}`}>
                          <p><Icon name="external" size={12} /> {t('When the match starts, the game shows this seat’s token and a ready-made MCP configuration for your own Claude Code or Codex session (or any MCP client). The match waits for your agent at every phase.')}</p>
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
              {problem ? <p class="summary-why"><Icon name="warn" size={12} /> {problem}</p> : null}
              <div class="setup-actions">
                <Btn kind="primary" nav icon={humans === 0 ? 'eye' : 'flag'} disabled={s.busy} testid="setup-start"
                  why={problem} onClick={() => void start()}>
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
