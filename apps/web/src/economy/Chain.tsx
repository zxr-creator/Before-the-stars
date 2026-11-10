// Supply chain: goods and the works that transform them, left to right, for
// what this civilization actually runs. Link thickness follows the estimated
// monthly flow; a link is red where the stage it feeds ran short of that good.
import { useMemo, useState } from 'preact/hooks';
import { GOOD_LABEL, GOOD_SHORT, RESEARCH_LABEL, lc, pct } from '../format';
import { t, tc } from '../i18n';
import { GoodIcon } from '../theme/goods';
import { cx } from '../ui';
import { buildChain, type Ledger, type Stage } from './model';
import { Glyph, lcs, milli, tip } from './parts';
import type { Nav } from './Ledger';

const ROW_MIN = 54;
const ROW_MAX = 64;
const PAD = 14;
const VB = 1000;

const DELIVER_GLYPH: Record<string, string> = { shaft: 'shaft', elec: 'elec', compute: 'compute', research: 'Research', launch: 'Space' };
const DELIVERS: Record<string, string> = {
  shaft: 'shaft power', elec: 'electricity', compute: 'computing', research: 'research', launch: 'launches and orbital work',
};

function stageTip(s: Stage): string {
  const ins = [...s.ins].map(([g, e]) => `${t(GOOD_SHORT[g])} ${milli(e.now)}${e.starved ? ' (' + t('short') + ')' : ''}`);
  const outs = [...s.outs].map(([g, e]) => `${t(GOOD_SHORT[g])} ${milli(e.now)}`);
  const lines = [
    t('{works} — {recipe}', { works: tc(s.name), recipe: tc(s.recipeName) }),
    t('{n} works, {levels} levels in all, running at {pct} of full output.', { n: s.works, levels: s.levels, pct: pct(s.rateBp) }),
  ];
  if (ins.length) lines.push(t('Takes per month ≈ {list}', { list: ins.join(', ') }));
  if (outs.length) lines.push(t('Makes per month ≈ {list}', { list: outs.join(', ') }));
  else if (s.delivers) lines.push(t('Delivers {what}.', { what: s.delivers === 'research' && s.cards[0].research ? lc(RESEARCH_LABEL[s.cards[0].research.cls]) : t(DELIVERS[s.delivers]) }));
  lines.push(t('Estimates from recipes × level × last month’s rate. Click to open the works.'));
  return lines.join('\n');
}

export function ChainView({ ledger, nav }: { ledger: Ledger; nav: Nav }) {
  const chain = useMemo(() => buildChain(ledger.cards), [ledger]);
  // hovering or focusing a node brings its own links forward and dims the rest
  const [hot, setHot] = useState<string | null>(null);
  const ROW_H = chain.rows <= 6 ? ROW_MAX : chain.rows <= 8 ? 58 : ROW_MIN;
  if (!chain.stages.length) {
    return <p class="ledger-empty"><Glyph name="Industry" size={18} /> {t('No works are turning one good into another yet.')}</p>;
  }
  const cols = chain.cols;
  const counts = new Array<number>(cols).fill(0);
  for (const g of chain.goods) counts[g.col] = Math.max(counts[g.col], g.row + 1);
  for (const s of chain.stages) counts[s.col] = Math.max(counts[s.col], s.row + 1);
  const height = chain.rows * ROW_H + PAD * 2;
  const x = (col: number) => ((col + 0.5) / cols) * VB;
  const y = (col: number, row: number) => PAD + ((chain.rows - counts[col]) / 2 + row + 0.5) * ROW_H;
  const pos = new Map<string, { x: number; y: number; col: number }>();
  for (const g of chain.goods) pos.set('g:' + g.good, { x: x(g.col), y: y(g.col, g.row), col: g.col });
  for (const s of chain.stages) pos.set(s.id, { x: x(s.col), y: y(s.col, s.row), col: s.col });
  const width = (flow: number) => (flow <= 0 ? 1.2 : 1.6 + 7 * Math.sqrt(flow / chain.maxFlow));
  const leftPct = (col: number) => ((col + 0.5) / cols) * 100 + '%';
  const nodeW = `calc(${100 / cols}% - 10px)`;
  const stageOf = new Map(chain.stages.map((s) => [s.id, s]));
  const starvedStages = chain.stages.filter((s) => s.starved).length;

  return (
    <div class="ledger-chain-wrap" data-testid="ledger-chain">
      <p class="ledger-chain-lede">
        {t('What our works turn into what, left to right. Thickness is the estimated flow per month; every figure here is an estimate from recipes and last month’s rates.')}
        {starvedStages ? <span class="ledger-chain-alert"> {t('Stages that ran short of an input: {n}.', { n: starvedStages })}</span> : null}
      </p>
      <div class="ledger-chain-scroll">
        <div class={cx('ledger-chain', hot && 'has-hot')} style={{ height: height + 'px', minWidth: cols * 96 + 'px' }} onMouseLeave={() => setHot(null)}>
          <svg class="ledger-chain-links" viewBox={`0 0 ${VB} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
            {chain.edges.map((e) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              const mid = (a.x + b.x) / 2;
              const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}C${mid.toFixed(1)} ${a.y.toFixed(1)} ${mid.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
              const s = stageOf.get(e.kind === 'in' ? e.to : e.from)!;
              const text = e.kind === 'in'
                ? t('{good} into {works}: ≈ {n}/mo of {full} at full rate.', { good: t(GOOD_LABEL[e.good]), works: lcs(tc(s.name)), n: milli(e.flow), full: milli(e.full) }) + (e.starved ? '\n' + t('The works ran short of it last month.') : '')
                : t('{good} out of {works}: ≈ {n}/mo of {full} at full rate.', { good: t(GOOD_LABEL[e.good]), works: lcs(tc(s.name)), n: milli(e.flow), full: milli(e.full) }) + (e.starved ? '\n' + t('Held down because the works ran short of an input.') : '');
              return (
                <g class={cx('ledger-link', e.kind === 'in' ? 'is-in' : 'is-out', e.starved && 'is-starved', e.flow <= 0 && 'is-idle', hot !== null && (e.from === hot || e.to === hot) && 'is-hot')}>
                  <path d={d} fill="none" stroke-width={width(e.flow)} vector-effect="non-scaling-stroke" />
                  <path d={d} fill="none" class="ledger-link-hit" stroke-width="12" vector-effect="non-scaling-stroke" {...tip(text)} />
                </g>
              );
            })}
          </svg>
          {chain.goods.map((g) => {
            const row = ledger.byGood.get(g.good);
            const p = pos.get('g:' + g.good)!;
            return (
              <button type="button" class={cx('ledger-node is-good', row && 'is-' + row.status, hot === 'g:' + g.good && 'is-hot')} style={{ left: leftPct(g.col), top: p.y + 'px', maxWidth: nodeW }}
                onClick={() => nav.toGood(g.good)} onMouseEnter={() => setHot('g:' + g.good)} onFocus={() => setHot('g:' + g.good)} onBlur={() => setHot(null)}
                {...tip(t(GOOD_LABEL[g.good]) + '\n' + (row ? t('In store {n}. Click to see who makes and uses it.', { n: milli(row.line.stock) }) : ''))}>
                <GoodIcon good={g.good} size={18} /><span>{t(GOOD_SHORT[g.good])}</span>
              </button>
            );
          })}
          {chain.stages.map((s) => {
            const p = pos.get(s.id)!;
            const worst = [...s.cards].sort((a, b) => Number(b.troubled) - Number(a.troubled) || a.rateBp - b.rateBp)[0];
            return (
              <button type="button" class={cx('ledger-node is-stage', s.starved && 'is-starved', !s.starved && s.troubled > 0 && 'is-troubled', hot === s.id && 'is-hot')}
                style={{ left: leftPct(s.col), top: p.y + 'px', width: nodeW }} onClick={() => nav.toCard(worst.key)}
                onMouseEnter={() => setHot(s.id)} onFocus={() => setHot(s.id)} onBlur={() => setHot(null)} {...tip(stageTip(s))}>
                <span class="ledger-node-name">{tc(s.name)}</span>
                <span class="ledger-node-meta">
                  <i class="ledger-node-rate"><i style={{ width: Math.round(s.rateBp / 100) + '%' }} /></i>
                  <small>{pct(s.rateBp)}</small>
                  {s.works > 1 ? <small class="ledger-node-count">×{s.works}</small> : null}
                  {s.delivers ? <Glyph name={DELIVER_GLYPH[s.delivers]} size={12} class="ledger-node-delivers" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <ul class="ledger-chain-legend">
        <li><i class="ledger-node-swatch is-good" /> {t('a good')}</li>
        <li><i class="ledger-node-swatch is-stage" /> {t('works that transform it, with last month’s rate')}</li>
        <li><Glyph name="shaft" size={13} /><Glyph name="elec" size={13} /><Glyph name="Research" size={13} /> {t('delivers power or research instead of a good')}</li>
        <li><svg width="34" height="10" aria-hidden="true"><path d="M1 5h32" class="ledger-legend-thin" /></svg> {t('small flow')}</li>
        <li><svg width="34" height="10" aria-hidden="true"><path d="M1 5h32" class="ledger-legend-thick" /></svg> {t('large flow')}</li>
        <li><svg width="34" height="10" aria-hidden="true"><path d="M1 5h32" class="ledger-legend-starved" /></svg> {t('stage ran short')}</li>
        <li><svg width="34" height="10" aria-hidden="true"><path d="M1 5h32" class="ledger-legend-idle" /></svg> {t('nothing flowing')}</li>
        <li class="muted">{t('Point at a node to trace its links.')}</li>
      </ul>
    </div>
  );
}
