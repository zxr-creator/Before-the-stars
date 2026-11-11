// Setup of one LLM agent seat: the three ways to put a model in a seat (Claude Code as
// an agent, Codex as an agent, a direct API), how it signs in, its model and effort,
// what this machine offers (detected without calling a model), a Test button that makes
// one tiny real call, and the cost guard.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import type { AgentOptions, AgentProvider, AgentTestResult, CliStatus, ProviderDetection } from '../protocol';
import { Btn, cx } from '../ui';
import { Icon } from '../icons';
import { t, tc } from '../i18n';
import './agents.css';

export interface AgentSeatConfig {
  provider: AgentProvider;
  model: string;
  consultEvery: number;
  apiKey: string;
  baseUrl: string;
  effort: string;
  auth: 'login' | 'api_key';
  budgetSeconds: number;
  maxCalls: number;
  maxUsd: number;
  maxTokens: number;
  maxFailures: number;
}

/** Conservative defaults: a seat left alone for a whole match should not run up a surprising bill. */
export const AGENT_DEFAULTS: AgentSeatConfig = {
  provider: 'claude-code', model: '', consultEvery: 1, apiKey: '', baseUrl: '', effort: '', auth: 'login',
  budgetSeconds: 300, maxCalls: 12, maxUsd: 0.5, maxTokens: 16000, maxFailures: 3,
};

type Way = 'claude-code' | 'codex' | 'api';
const wayOf = (p: AgentProvider): Way => (p === 'claude-api' || p === 'openai-api' ? 'api' : p);

// i18n-fields
const WAYS: { value: Way; label: string; badge?: string; blurb: string }[] = [
  { value: 'claude-code', label: 'Claude Code as the agent', badge: 'Recommended',
    blurb: 'The Claude Code on this computer plays the seat as an agent: once per round it reads its civilization through the game’s two tools, decides, submits its orders and checks the receipts. Its file, shell and web tools are switched off and it runs in an empty folder.' },
  { value: 'codex', label: 'Codex as the agent',
    blurb: 'The Codex CLI on this computer plays the seat the same way, with the game’s two tools only. Your Codex settings file is neither read nor changed.' },
  { value: 'api', label: 'Direct API',
    blurb: 'One request per round with a text briefing; the model answers with its orders. The least expensive way: Claude over the Anthropic API, or any OpenAI-compatible server.' },
];
// i18n-end

const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Maximum' };

let detection: Promise<ProviderDetection | null> | null = null;
/** What this machine offers, asked once per setup screen (the server caches it too). */
function detect(refresh = false): Promise<ProviderDetection | null> {
  if (!detection || refresh) detection = api.agentProviders(refresh).catch(() => null);
  return detection;
}

/** The options a new-match request carries for this seat. A key is sent only where it is used. */
export function agentOptions(c: AgentSeatConfig): AgentOptions {
  const o: AgentOptions = { consult_every: c.consultEvery, budget_seconds: c.budgetSeconds, max_failures: c.maxFailures };
  if (c.model.trim()) o.model = c.model.trim();
  if (c.effort) o.effort = c.effort;
  const way = wayOf(c.provider);
  if (way === 'api') {
    o.max_tokens = c.maxTokens;
    if (c.apiKey.trim()) o.api_key = c.apiKey.trim();
    if (c.provider === 'openai-api' && c.baseUrl.trim()) o.base_url = c.baseUrl.trim();
  } else {
    o.auth = c.auth;
    o.max_calls = c.maxCalls;
    if (c.provider === 'claude-code') o.max_usd = c.maxUsd;
    if (c.auth === 'api_key' && c.apiKey.trim()) o.api_key = c.apiKey.trim();
  }
  return o;
}

/** Why this seat cannot start yet, or null. */
export function agentProblem(c: AgentSeatConfig): string | null {
  if (c.provider === 'openai-api' && !c.model.trim()) return 'needs a model id';
  if (wayOf(c.provider) !== 'api' && c.auth === 'api_key' && !c.apiKey.trim()) return 'needs an API key';
  return null;
}

/** One line for the match summary. */
export function agentLine(c: AgentSeatConfig): string {
  const name = c.provider === 'claude-code' ? t('Claude Code agent') : c.provider === 'codex' ? t('Codex agent') : c.provider === 'claude-api' ? t('Claude (API)') : t('OpenAI-compatible API');
  const parts = [name];
  if (c.model.trim()) parts.push(c.model.trim());
  if (wayOf(c.provider) !== 'api') parts.push(c.auth === 'api_key' ? t('API key') : t('own sign-in'));
  parts.push(c.consultEvery === 1 ? t('every round') : t('every {n} rounds', { n: c.consultEvery }));
  return parts.join(' · ');
}

function CliLine({ status, name }: { status: CliStatus | undefined; name: string }) {
  if (!status) return <span class="muted">{t('Checking this computer…')}</span>;
  if (!status.installed) return <span class="agent-status is-bad"><Icon name="cross" size={11} /> {t('{name} is not installed on this computer.', { name })} {status.hint ? tc(status.hint) : null}</span>;
  const signed = status.logged_in === true ? (status.login === 'chatgpt' ? t('signed in with ChatGPT') : t('signed in'))
    : status.logged_in === false ? t('not signed in') : t('sign-in unknown');
  return (
    <span class={cx('agent-status', status.logged_in === false ? 'is-warn' : 'is-ok')}>
      <Icon name={status.logged_in === false ? 'warn' : 'check'} size={11} /> {status.version ?? name} · {signed}
      {status.logged_in === false && status.hint ? <span class="agent-status-hint"> {tc(status.hint)}</span> : null}
    </span>
  );
}

export function AgentBox({ seat, c, onChange }: { seat: number; c: AgentSeatConfig; onChange: (patch: Partial<AgentSeatConfig>) => void }) {
  const [found, setFound] = useState<ProviderDetection | null | undefined>(undefined);
  const [test, setTest] = useState<{ busy: boolean; result: AgentTestResult | null; failed?: string }>({ busy: false, result: null });
  useEffect(() => { let live = true; void detect().then((d) => { if (live) setFound(d); }); return () => { live = false; }; }, []);
  const way = wayOf(c.provider);
  const pickWay = (w: Way) => {
    if (w === way) return;
    onChange({ provider: w === 'api' ? 'claude-api' : w, model: w === 'api' ? 'claude-opus-5-5' : '', apiKey: '', baseUrl: '', effort: '', auth: 'login' });
    setTest({ busy: false, result: null });
  };
  const runTest = async () => {
    setTest({ busy: true, result: null });
    try {
      const o = agentOptions(c);
      const result = await api.agentTest({ provider: c.provider, model: o.model, effort: o.effort, auth: o.auth, api_key: o.api_key, base_url: o.base_url });
      setTest({ busy: false, result });
    } catch (e) {
      setTest({ busy: false, result: null, failed: e instanceof Error ? e.message : String(e) });
    }
  };
  const codexModels = found?.codex.models ?? [];
  const envKey = c.provider === 'openai-api' ? 'OPENAI_API_KEY' : c.provider === 'codex' ? 'CODEX_API_KEY' : 'ANTHROPIC_API_KEY';
  const keyInEnv = !!found?.env?.[envKey as keyof ProviderDetection['env']];
  const keyField = (way === 'api') || c.auth === 'api_key';
  const listId = `agent-models-${seat}`;
  const info = WAYS.find((w) => w.value === way)!;
  const r = test.result;

  return (
    <div class="agent-box" data-testid={`setup-agent-${seat}`}>
      <div class="agent-ways" role="radiogroup" aria-label={t('How a model plays this seat')}>
        {WAYS.map((w) => (
          <button type="button" role="radio" aria-checked={way === w.value} class={cx('agent-way', way === w.value && 'is-active')} data-testid={`setup-seat-${seat}-${w.value}`} onClick={() => pickWay(w.value)}>
            <b>{t(w.label)}</b>{w.badge ? <small class="agent-badge">{t(w.badge)}</small> : null}
          </button>
        ))}
      </div>
      <p class="agent-blurb">{t(info.blurb)}</p>

      {way === 'claude-code' ? <CliLine status={found === undefined ? undefined : found?.claude_code ?? { installed: false }} name="Claude Code" /> : null}
      {way === 'codex' ? <CliLine status={found === undefined ? undefined : found?.codex ?? { installed: false }} name="Codex" /> : null}
      {way === 'api' ? (
        <div class="chips" role="radiogroup" aria-label={t('API')}>
          {(['claude-api', 'openai-api'] as AgentProvider[]).map((p) => (
            <button type="button" role="radio" aria-checked={c.provider === p} class={cx('chip', c.provider === p && 'is-active')} data-testid={`setup-seat-${seat}-${p}`}
              onClick={() => onChange({ provider: p, model: p === 'claude-api' ? 'claude-opus-5-5' : '', apiKey: '', baseUrl: '' })}>{p === 'claude-api' ? t('Claude (Anthropic API)') : t('OpenAI-compatible API')}</button>
          ))}
        </div>
      ) : null}

      {way !== 'api' ? (
        <div class="inline-field">
          <span>{t('Sign-in')}</span>
          <div class="segmented" role="radiogroup" aria-label={t('Sign-in')}>
            <button type="button" role="radio" aria-checked={c.auth === 'login'} class={cx('seg', c.auth === 'login' && 'is-active')} data-testid={`setup-agent-${seat}-auth-login`} onClick={() => onChange({ auth: 'login', apiKey: '' })}>
              {way === 'claude-code' ? t('My Claude Code sign-in') : t('My Codex sign-in')}
            </button>
            <button type="button" role="radio" aria-checked={c.auth === 'api_key'} class={cx('seg', c.auth === 'api_key' && 'is-active')} data-testid={`setup-agent-${seat}-auth-key`} onClick={() => onChange({ auth: 'api_key' })}>
              {way === 'claude-code' ? t('Anthropic API key') : t('OpenAI API key')}
            </button>
          </div>
        </div>
      ) : null}

      <div class="agent-fields">
        <label class="inline-field">
          <span>{t('Model')}</span>
          <input type="text" class="text" list={listId} value={c.model} spellcheck={false} autocomplete="off" data-testid={`setup-agent-${seat}-model`}
            placeholder={way === 'claude-code' ? t('Claude Code’s default') : way === 'codex' ? t('Codex’s default') : c.provider === 'openai-api' ? t('Model id (required)') : 'claude-opus-5-5'}
            onInput={(e) => onChange({ model: (e.target as HTMLInputElement).value })} />
          <datalist id={listId}>
            {way === 'codex' ? codexModels.map((m) => <option value={m.id}>{m.name}</option>) : c.provider !== 'openai-api' ? CLAUDE_MODELS.map((m) => <option value={m} />) : null}
          </datalist>
        </label>
        <label class="inline-field">
          <span>{t('Effort')}</span>
          <select class="select" value={c.effort} data-testid={`setup-agent-${seat}-effort`} onChange={(e) => onChange({ effort: (e.target as HTMLSelectElement).value })}>
            <option value="">{t('Default')}</option>
            {EFFORTS.map((e) => <option value={e}>{t(EFFORT_LABEL[e])}</option>)}
          </select>
        </label>
        <div class="inline-field">
          <span>{t('Consult every')}</span>
          <div class="segmented" role="radiogroup" aria-label={t('Consult every')}>
            {[1, 2, 5, 10].map((n) => (
              <button type="button" role="radio" aria-checked={c.consultEvery === n} class={cx('seg', c.consultEvery === n && 'is-active')}
                data-testid={`setup-agent-${seat}-every-${n}`} onClick={() => onChange({ consultEvery: n })}>{n === 1 ? t('round') : t('{n} rounds', { n })}</button>
            ))}
          </div>
        </div>
        {c.provider === 'openai-api' ? (
          <label class="inline-field wide">
            <span>{t('Base URL')}</span>
            <input type="url" class="text" value={c.baseUrl} placeholder="https://…/v1" spellcheck={false} autocomplete="off"
              data-testid={`setup-agent-${seat}-baseurl`} onInput={(e) => onChange({ baseUrl: (e.target as HTMLInputElement).value })} />
          </label>
        ) : null}
        {keyField ? (
          <label class="inline-field wide">
            <span>{way === 'api' ? t('API key (optional)') : t('API key')}</span>
            <input type="password" class="text" value={c.apiKey} autocomplete="off" spellcheck={false} data-testid={`setup-agent-${seat}-key`}
              placeholder={way === 'api' ? (keyInEnv ? t('Blank = the server’s {env} (set)', { env: envKey }) : t('Blank = the server’s {env} (not set)', { env: envKey })) : t('Used by this seat only')}
              onInput={(e) => onChange({ apiKey: (e.target as HTMLInputElement).value })} />
          </label>
        ) : null}
      </div>
      {way === 'codex' && codexModels.length ? (
        <p class="agent-hint"><Icon name="info" size={11} /> {t('Models your Codex offers: {list}. A model your plan does not include fails with “not supported”: pick another.', { list: codexModels.map((m) => m.id).join(', ') })}</p>
      ) : null}

      <details class="agent-guard">
        <summary>{t('Cost guard and failures')}</summary>
        <div class="agent-fields">
          <label class="inline-field">
            <span>{t('Time per consultation')}</span>
            <select class="select" value={String(c.budgetSeconds)} data-testid={`setup-agent-${seat}-budget`} onChange={(e) => onChange({ budgetSeconds: Number((e.target as HTMLSelectElement).value) })}>
              {[60, 120, 300, 600, 1200].map((s) => <option value={String(s)}>{s < 120 ? t('{n} s', { n: s }) : t('{n} min', { n: s / 60 })}</option>)}
            </select>
          </label>
          {way !== 'api' ? (
            <label class="inline-field">
              <span>{t('Game tool calls')}</span>
              <select class="select" value={String(c.maxCalls)} data-testid={`setup-agent-${seat}-calls`} onChange={(e) => onChange({ maxCalls: Number((e.target as HTMLSelectElement).value) })}>
                {[6, 12, 20, 40].map((n) => <option value={String(n)}>{t('up to {n}', { n })}</option>)}
              </select>
            </label>
          ) : null}
          {c.provider === 'claude-code' ? (
            <label class="inline-field">
              <span>{t('Spending per consultation')}</span>
              <select class="select" value={String(c.maxUsd)} data-testid={`setup-agent-${seat}-usd`} onChange={(e) => onChange({ maxUsd: Number((e.target as HTMLSelectElement).value) })}>
                {[0.25, 0.5, 1, 2, 5].map((n) => <option value={String(n)}>{t('up to ${n}', { n: n.toFixed(2) })}</option>)}
              </select>
            </label>
          ) : null}
          {way === 'api' ? (
            <label class="inline-field">
              <span>{t('Reply length')}</span>
              <select class="select" value={String(c.maxTokens)} data-testid={`setup-agent-${seat}-tokens`} onChange={(e) => onChange({ maxTokens: Number((e.target as HTMLSelectElement).value) })}>
                {[4000, 8000, 16000, 32000].map((n) => <option value={String(n)}>{t('{n} tokens', { n: n.toLocaleString() })}</option>)}
              </select>
            </label>
          ) : null}
          <label class="inline-field">
            <span>{t('Stop after failures in a row')}</span>
            <select class="select" value={String(c.maxFailures)} data-testid={`setup-agent-${seat}-failures`} onChange={(e) => onChange({ maxFailures: Number((e.target as HTMLSelectElement).value) })}>
              {[2, 3, 5, 10].map((n) => <option value={String(n)}>{String(n)}</option>)}
            </select>
          </label>
        </div>
        <p class="agent-hint">{t('A failed consultation is retried, then the built-in steward plays that round. After the failures above in a row the seat stops and the steward carries on alone; resume it from the observer console.')}</p>
      </details>

      <div class="agent-test">
        <Btn small nav icon={test.busy ? 'clock' : 'spark'} disabled={test.busy} testid={`setup-agent-${seat}-test`} onClick={() => void runTest()}>
          {test.busy ? t('Testing…') : t('Test')}
        </Btn>
        <span class="agent-test-k">{t('One tiny real call with these settings.')}</span>
        {r ? (
          r.ok ? (
            <p class="agent-test-result is-ok" role="status" data-testid={`setup-agent-${seat}-test-ok`}>
              <Icon name="check" size={12} /> {t('Works: replied “{reply}” in {s} s.', { reply: r.reply ?? '', s: (r.seconds ?? 0).toFixed(1) })}
              {r.mcp === 'connected' ? ' ' + t('The game’s tools are connected.') : r.mcp === 'failed' ? ' ' + t('But the game’s tools did not start.') : ''}
              {r.cost_usd ? ' ' + t('Cost ${n}.', { n: r.cost_usd.toFixed(4) }) : r.tokens ? ' ' + t('{n} tokens.', { n: r.tokens.toLocaleString() }) : ''}
            </p>
          ) : (
            <p class="agent-test-result is-bad" role="alert" data-testid={`setup-agent-${seat}-test-error`}>
              <Icon name="cross" size={12} /> <span>{r.error}</span>
              {r.hint ? <span class="agent-test-hint"><Icon name="info" size={11} /> {tc(r.hint)}</span> : null}
            </p>
          )
        ) : test.failed ? <p class="agent-test-result is-bad" role="alert"><Icon name="cross" size={12} /> {test.failed}</p> : null}
      </div>

      <p class="agent-note">
        <Icon name={keyField ? 'key' : 'info'} size={12} />{' '}
        {keyField
          ? (way === 'api'
            ? t('A key typed here is sent to the local game server and kept in its memory only. It is never saved by this page.')
            : t('The key goes to this seat’s CLI process only, in its environment: never on a command line, never in a save, a log or this page after the match starts.'))
          : t('No key is needed: the game server runs the CLI with the sign-in already on this computer.')}
        {c.consultEvery > 1 ? ' ' + t('Between consultations a built-in steward keeps this civilization running.') : ''}
      </p>
    </div>
  );
}
