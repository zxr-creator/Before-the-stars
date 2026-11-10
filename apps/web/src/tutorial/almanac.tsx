// The Almanac: a searchable reference of concise, illustrated topic pages with
// a glossary. It needs no match: opened from the title screen or the observer
// world view it simply leaves out the links that would open a panel.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from '../ui';
import { closeOverlay, getState, openOverlay, openPanel, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { GOODS, GOOD_LABEL, KSTATE_LABEL } from '../format';
import type { KnowledgeState } from '../protocol';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { GoodIcon } from '../theme/goods';
import { Emblem } from '../theme/emblem';
import { Vignette } from '../art/vignette';
import { GLOSSARY, SEAT_KINDS, TOPICS, TOPIC_GROUPS, blockStrings } from './topics';
import type { Block, Topic, TopicAction } from './topics';
import { startTutorial } from './state';
import './tutorial.css';

const STATES: KnowledgeState[] = ['discovered', 'investigating', 'understood', 'prototyped', 'adopted'];
const SEAT_COLORS = ['#c1503a', '#2f73a0', '#5c8a36', '#8a59a8'];
const SEAT_NAMES = ['Amberfen', 'Longstrand', 'Riverland', 'Clearbay'];

interface Hit { topic: Topic; snippet: string; term?: string }

function norm(s: string): string {
  return s.toLowerCase();
}

function search(query: string): Hit[] {
  const q = norm(query.trim());
  if (!q) return [];
  const hits: Hit[] = [];
  for (const topic of TOPICS) {
    if (topic.key === 'glossary') continue;
    const title = t(topic.title);
    const texts = [t(topic.lede), ...topic.blocks.flatMap(blockStrings).map((x) => t(x))];
    const inTitle = norm(title).includes(q);
    const body = texts.find((x) => norm(x).includes(q));
    if (inTitle || body) hits.push({ topic, snippet: body ?? t(topic.lede) });
  }
  const glossary = TOPICS.find((x) => x.key === 'glossary')!;
  for (const [term, def] of GLOSSARY) {
    if (norm(t(term)).includes(q) || norm(t(def)).includes(q)) hits.push({ topic: glossary, snippet: t(def), term });
  }
  return hits;
}

function Mark({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? norm(text).indexOf(norm(q)) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function BlockView({ block, query, term, canAct }: { block: Block; query: string; term: string | null; canAct: boolean }) {
  const s = getState();
  switch (block.kind) {
    case 'p': return <p><Mark text={t(block.text)} query={query} /></p>;
    case 'h': return <h4>{t(block.text)}</h4>;
    case 'note': return <p class="alm-note"><Icon name="info" size={13} /> <span><Mark text={t(block.text)} query={query} /></span></p>;
    case 'list': return <ul class="alm-list">{block.items.map((x) => <li><Mark text={t(x)} query={query} /></li>)}</ul>;
    case 'steps': return <ol class="alm-steps">{block.items.map((x, i) => <li><span class="alm-step-n" aria-hidden="true">{i + 1}</span><span><Mark text={t(x)} query={query} /></span></li>)}</ol>;
    case 'defs': return (
      <dl class="alm-defs">
        {block.items.map(([a, b]) => (
          <div class={cx('alm-def', term === a && 'is-target')} data-term={a}>
            <dt><Mark text={t(a)} query={query} /></dt>
            <dd><Mark text={t(b)} query={query} /></dd>
          </div>
        ))}
      </dl>
    );
    case 'keys': return (
      <ul class="alm-keys">
        {block.items.map(([keys, label]) => (
          <li><span class="alm-keycaps">{keys.map((k) => (k === '–' ? <span class="alm-dash">–</span> : <kbd>{k}</kbd>))}</span><span>{t(label)}</span></li>
        ))}
      </ul>
    );
    case 'goods': return (
      <ul class="alm-goods">
        {GOODS.map((g) => <li><span class="alm-good-icon"><GoodIcon good={g} size={20} /></span><span>{t(GOOD_LABEL[g])}</span></li>)}
      </ul>
    );
    case 'states': return (
      <ol class="alm-states" aria-label={t('States of a technology card')}>
        {STATES.map((st, i) => (
          <li class={'alm-state-' + st}>
            <span class="alm-state-pips" aria-hidden="true">{STATES.map((_, j) => <i class={j <= i ? 'on' : ''} />)}</span>
            <span>{t(KSTATE_LABEL[st])}</span>
          </li>
        ))}
      </ol>
    );
    case 'seats': return (
      <>
        <div class="alm-emblems" aria-hidden="true">
          {SEAT_COLORS.map((c, i) => <Emblem seat={i} color={c} name={SEAT_NAMES[i]} size={34} />)}
        </div>
        <ul class="alm-seats">
          {SEAT_KINDS.map((k) => (
            <li><span class="alm-seat-icon"><Icon name={k.icon} size={15} /></span><span><b>{t(k.name)}</b> <span class="alm-seat-text">{t(k.text)}</span></span></li>
          ))}
        </ul>
      </>
    );
    case 'objective': {
      if (!canAct || !s.obs) return null;
      const v = s.obs.objectives.victory;
      return v
        ? <p class="alm-note is-gold"><Icon name="star" size={13} /> <span><b>{t('Revealed to your civilization:')}</b> {tc(v.summary)}</span></p>
        : <p class="alm-note"><Icon name="question" size={13} /> <span>{t('In this match it has not been revealed to your civilization yet.')}</span></p>;
    }
    default: return null;
  }
}

function runAction(a: TopicAction): void {
  if (a.panel) openPanel(a.panel);
  else if (a.overlay) openOverlay(a.overlay);
}

export function Almanac() {
  const s = useApp();
  useLocale();
  const known = (k: string | null | undefined) => (k && TOPICS.some((x) => x.key === k) ? k : null);
  const [key, setKey] = useState<string>(() => known(s.overlayArg) ?? TOPICS[0].key);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);

  // Another part of the interface asked for a particular topic.
  useEffect(() => {
    const k = known(s.overlayArg);
    if (k) { setKey(k); setQuery(''); setTerm(null); }
  }, [s.overlayArg]);

  // Outside the game shell nothing else handles Esc for us.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = getState();
      if (e.key === 'Escape' && (st.screen !== 'game' || st.boot !== 'ready')) closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const target = term ? el.querySelector('.alm-def.is-target') : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else el.scrollTop = 0;
  }, [key, term]);

  const hits = useMemo(() => search(query), [query, s.overlay]);
  const topic = TOPICS.find((x) => x.key === key) ?? TOPICS[0];
  const world = s.mode === 'observe' && s.viewAs === null;
  const canAct = s.screen === 'game' && !!s.obs && !world;
  const playing = canAct && s.mode === 'play';
  const actions = canAct ? topic.actions ?? [] : [];
  const go = (k: string, tm: string | null = null) => { setKey(k); setTerm(tm); };

  return (
    <OverlayFrame icon="almanac" title={t('Almanac')} kicker={t('Reference')} testid="overlay-almanac" class="almanac"
      tools={<input type="search" class="fs-search" value={query} placeholder={t('Search the almanac')} aria-label={t('Search the almanac')}
        data-testid="almanac-search" onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />}>
      <nav class="alm-nav" aria-label={t('Topics')} data-testid="almanac-nav">
        {query.trim() ? (
          <div class="alm-results" data-testid="almanac-results">
            <p class="alm-group">{hits.length === 1 ? t('1 result') : t('{n} results', { n: hits.length })}</p>
            {hits.length ? hits.map((hit) => (
              <button type="button" class={cx('alm-hit', hit.topic.key === key && (hit.term ?? null) === term && 'is-active')} data-testid="almanac-hit"
                onClick={() => go(hit.topic.key, hit.term ?? null)}>
                <span class="alm-hit-title"><Icon name={hit.topic.icon} size={14} /> {hit.term ? <>{t('Glossary')} · <Mark text={t(hit.term)} query={query} /></> : <Mark text={t(hit.topic.title)} query={query} />}</span>
                <span class="alm-hit-snippet"><Mark text={hit.snippet} query={query} /></span>
              </button>
            )) : <p class="alm-none">{t('Nothing in the almanac matches. Try a shorter word.')}</p>}
          </div>
        ) : TOPIC_GROUPS.map((g) => (
          <div class="alm-group-box">
            <p class="alm-group">{t(g)}</p>
            {TOPICS.filter((x) => x.group === g).map((x) => (
              <button type="button" class={cx('alm-topic', x.key === key && 'is-active')} aria-current={x.key === key ? 'page' : undefined}
                data-testid={`almanac-topic-${x.key}`} onClick={() => go(x.key)}>
                <span class="alm-topic-icon"><Icon name={x.icon} size={15} /></span><span>{t(x.title)}</span>
              </button>
            ))}
          </div>
        ))}
        {playing ? (
          <button type="button" class="alm-tour" data-testid="almanac-tour" onClick={() => { closeOverlay(); startTutorial(); }}>
            <Icon name="compass" size={15} /> <span>{t('Take the guided tour')}</span>
          </button>
        ) : null}
      </nav>
      <div class="alm-page-wrap" ref={page}>
        {topic ? (
          <article class={cx('alm-page', !topic.art && 'no-art')} data-testid="almanac-page" data-topic={topic.key} key={topic.key}>
            <header class="alm-hero">
              {topic.art ? <div class="alm-art"><Vignette art={topic.art} /></div> : null}
              <div class="alm-hero-text">
                <span class="alm-kicker"><Icon name={topic.icon} size={12} /> {t(topic.group)}</span>
                <h3>{t(topic.title)}</h3>
                <p class="alm-lede">{t(topic.lede)}</p>
              </div>
            </header>
            <div class="alm-body">
              {topic.blocks.map((b) => <BlockView block={b} query={query} term={term} canAct={canAct} />)}
            </div>
            {actions.length ? (
              <div class="alm-actions">
                {actions.map((a) => (
                  <button type="button" class="btn btn-default btn-sm" data-testid="almanac-action" onClick={() => runAction(a)}>
                    <Icon name={a.panel ?? (a.overlay === 'tech' ? 'techtree' : a.overlay === 'civics' ? 'civics' : 'layers')} size={13} /><span>{t(a.label)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {topic.see?.length ? (
              <footer class="alm-see">
                <span class="alm-see-label">{t('See also')}</span>
                {topic.see.map((k) => {
                  const x = TOPICS.find((y) => y.key === k);
                  return x ? <button type="button" class="alm-chip" data-testid="almanac-see" onClick={() => { setQuery(''); go(k); }}><Icon name={x.icon} size={12} /> {t(x.title)}</button> : null;
                })}
              </footer>
            ) : null}
          </article>
        ) : <StatePlate icon="almanac" title={t('Almanac')} />}
      </div>
    </OverlayFrame>
  );
}
