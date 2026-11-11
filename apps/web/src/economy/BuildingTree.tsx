// Building tree overlay (key U): every line and stage of the public tree (GET /api/building-tree),
// laid out by era. Requirements are shown exactly as the referee sends them: technologies and
// practices appear only by era and field. Stages the seat has built are marked.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { BuildingNode, BuildingTree as Tree, Observation, ReqExpr } from '../protocol';
import { api } from '../api';
import { fmtMonths, int, joinList, lc, peopleNum, workMonths } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { GoodsList, cx } from '../ui';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { DEPOSIT_LABEL } from '../format';
import { ERA_LABEL, SITE_LABEL, lineLabel, LINE_LABEL } from './labels';
import './r3.css';

let cache: Tree | null = null;
let inflight: Promise<Tree> | null = null;

/** The public tree, fetched once per content hash. */
export function useBuildingTree(hash: string | undefined): { tree: Tree | null; error: boolean } {
  const [tree, setTree] = useState<Tree | null>(cache && (!hash || cache.hash === hash) ? cache : null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (cache && (!hash || cache.hash === hash)) { setTree(cache); return; }
    let live = true;
    inflight = inflight ?? api.buildingTree().finally(() => { inflight = null; });
    inflight.then((x) => { cache = x; if (live) setTree(x); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [hash]);
  return { tree, error };
}

/** One requirement, as sent: technologies and practices by era and field only. */
export function reqText(r: ReqExpr): string {
  switch (r.kind) {
    case 'none': return t('No requirement');
    case 'all': return joinList(r.of.map(reqText));
    case 'any': return t('one of: {list}', { list: r.of.map(reqText).join(' / ') });
    case 'tech': return t('Technology: {field} ({era} era)', { field: tc(r.field), era: t(ERA_LABEL[r.era] ?? String(r.era)) });
    case 'practice': return t('Practice: {field} ({era} era)', { field: tc(r.field), era: t(ERA_LABEL[r.era] ?? String(r.era)) });
    case 'facility': return t('Works: {name}', { name: tc(r.key.replace(/_/g, ' ')) });
    case 'tradition': return t('Tradition: {name}', { name: tc(r.key.replace(/_/g, ' ')) });
    case 'religion': return t('A local religious tradition');
    default: return tc(r.text);
  }
}

/** A line's name: the translated table, else its first stage's name (tradition lines). */
function lineName(tree: Tree, l: Tree['lines'][number]): string {
  if (LINE_LABEL[l.key]) return t(lineLabel(l.key));
  const first = tree.nodes.filter((n) => n.line === l.key).sort((a, b) => a.stage - b.stage)[0];
  return tc(first ? first.name : l.name);
}

function siteText(key: string): string {
  if (SITE_LABEL[key]) return t(SITE_LABEL[key]);
  if (key.startsWith('deposit:')) return t('A deposit of {kind}', { kind: lc(t(DEPOSIT_LABEL[key.slice(8) as keyof typeof DEPOSIT_LABEL] ?? key.slice(8))) });
  if (key.startsWith('with:')) return t('Beside {name}', { name: tc(key.slice(5).replace(/_/g, ' ')) });
  return tc(key);
}

export function BuildingTreeOverlay({ obs }: { obs: Observation }) {
  useLocale();
  const { tree, error } = useBuildingTree(obs.building_tree_hash);
  const [cat, setCat] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const built = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of obs.regions) for (const f of r.own?.facilities ?? []) m.set(f.kind, (m.get(f.kind) ?? 0) + f.level);
    return m;
  }, [obs]);
  const cats = useMemo(() => Array.from(new Set(tree?.lines.map((l) => l.category) ?? [])), [tree]);
  const byKey = useMemo(() => new Map((tree?.nodes ?? []).map((n) => [n.key, n])), [tree]);
  if (!tree) {
    return (
      <OverlayFrame icon="layers" title={t('Building tree')} testid="overlay-buildings">
        <StatePlate icon="layers" title={error ? t('The building tree could not be loaded') : t('Loading the building tree…')} tone={error ? 'bad' : 'muted'} />
      </OverlayFrame>
    );
  }
  const eras = Array.from(new Set(tree.nodes.map((n) => n.era))).sort((a, b) => a - b);
  const lines = tree.lines.filter((l) => !cat || l.category === cat);
  const sel = pick ? byKey.get(pick) ?? null : null;
  const tabs = (
    <>
      <button type="button" class={cx('fs-tab', !cat && 'is-active')} onClick={() => setCat('')}>{t('All')}</button>
      {cats.map((c) => <button type="button" class={cx('fs-tab', cat === c && 'is-active')} onClick={() => setCat(c)}>{tc(c)}</button>)}
    </>
  );
  return (
    <OverlayFrame icon="layers" title={t('Building tree')} kicker={t('{n} lines · {m} stages', { n: tree.lines.length, m: tree.nodes.length })} tabs={tabs} testid="overlay-buildings" class="bt">
      <div class="bt-main" data-testid="building-tree">
        <div class="bt-scroll">
          <div class="bt-grid" style={{ gridTemplateColumns: `150px repeat(${eras.length}, minmax(112px, 1fr))` }}>
            <div class="bt-corner" />
            {eras.map((e) => <div class="bt-era">{t(ERA_LABEL[e] ?? String(e))}</div>)}
            {lines.map((l) => {
              const nodes = tree.nodes.filter((n) => n.line === l.key).sort((a, b) => a.stage - b.stage);
              if (!nodes.length) return null;
              return (
                <>
                  <div class="bt-line" title={tc(l.category)}><b>{lineName(tree, l)}</b><small>{tc(l.category)}</small></div>
                  {eras.map((e) => (
                    <div class="bt-cell">
                      {nodes.filter((n) => n.era === e).map((n) => {
                        const up = tree.edges.some((x) => x.from === n.key && x.kind === 'upgrade');
                        const have = built.get(n.key) ?? 0;
                        return (
                          <button type="button" class={cx('bt-node', have > 0 && 'is-built', sel?.key === n.key && 'is-sel', n.tradition && 'is-tradition')}
                            data-testid={`bt-node-${n.key}`} data-built={have > 0 ? have : undefined} onClick={() => setPick(n.key)}
                            title={have > 0 ? t('Built: {n} levels in all', { n: have }) : undefined}>
                            <span class="bt-stage">{n.stage}</span><span class="bt-name">{tc(n.name)}</span>
                            {up ? <i class="bt-up" aria-label={t('Can be upgraded in place')}>↗</i> : null}
                            {have > 0 ? <Icon name="check" size={11} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              );
            })}
          </div>
        </div>
        <aside class="bt-detail" aria-label={t('Stage details')}>
          {sel ? <NodeDetail n={sel} tree={tree} byKey={byKey} built={built.get(sel.key) ?? 0} /> : <p class="muted">{t('Choose a stage to read its bill, posts and requirements. Stages you have built are marked.')}</p>}
        </aside>
      </div>
    </OverlayFrame>
  );
}

function NodeDetail({ n, tree, byKey, built }: { n: BuildingNode; tree: Tree; byKey: Map<string, BuildingNode>; built: number }) {
  const out = tree.edges.filter((e) => e.from === n.key);
  const inn = tree.edges.filter((e) => e.to === n.key);
  const nm = (k: string) => tc(byKey.get(k)?.name ?? k);
  return (
    <div data-testid="bt-detail">
      <p class="eyebrow">{tc(n.category)} · {t('stage {n}', { n: n.stage })} · {t(ERA_LABEL[n.era] ?? String(n.era))}{n.tradition ? ' · ' + t('tradition works') : ''}</p>
      <h3>{tc(n.name)}</h3>
      {built > 0 ? <p class="bt-have"><Icon name="check" size={12} /> {t('Built: {n} levels in all', { n: built })}</p> : null}
      <p>{tc(n.desc)}</p>
      <dl class="kvs">
        <div class="kv"><dt>{t('Requires')}</dt><dd data-testid="bt-requires">{reqText(n.requires)}</dd></div>
        <div class="kv"><dt>{t('Site')}</dt><dd>{siteText(n.site)}</dd></div>
        <div class="kv"><dt>{t('Bill per level')}</dt><dd><GoodsList items={n.cost} empty={t('labour only')} /></dd></div>
        <div class="kv"><dt>{t('Work')}</dt><dd>{workMonths(n.work)} · {t('at least {m}', { m: fmtMonths(n.build_months) })}</dd></div>
        <div class="kv"><dt>{t('Posts per level')}</dt><dd>{peopleNum(n.general_posts)} {t('general')}{n.skilled_posts.length ? ' · ' + t('{n} skilled', { n: peopleNum(n.skilled_posts.reduce((a, j) => a + j.count, 0)) }) : ''}</dd></div>
        {n.upkeep.length ? <div class="kv"><dt>{t('Upkeep')}</dt><dd><GoodsList items={n.upkeep} per={t('a month')} /></dd></div> : null}
        {n.provides.length ? <div class="kv"><dt>{t('Provides')}</dt><dd>{n.provides.map(tc).join(' · ')}</dd></div> : null}
        {n.land_milli ? <div class="kv"><dt>{t('Land')}</dt><dd>{t('{n} land units a level', { n: (n.land_milli / 1000).toFixed(2) })}</dd></div> : null}
        {n.houses ? <div class="kv"><dt>{t('Housing')}</dt><dd>{t('{n} residents a level', { n: int(n.houses) })}</dd></div> : null}
        <div class="kv"><dt>{t('Most levels')}</dt><dd>{int(n.max_level)}</dd></div>
      </dl>
      {inn.length || out.length ? (
        <ul class="plain-list bt-edges">
          {inn.map((e) => <li>{e.kind === 'upgrade' ? t('Upgrades in place from {name} ({pct}% of this stage’s bill and work)', { name: nm(e.from), pct: e.cost_bp / 100 }) : t('Built new beside {name}, not converted', { name: nm(e.from) })}</li>)}
          {out.map((e) => <li>{e.kind === 'upgrade' ? t('Upgrades in place to {name} ({pct}% of its bill and work)', { name: nm(e.to), pct: e.cost_bp / 100 }) : t('Built new beside {name}, not converted', { name: nm(e.to) })}</li>)}
        </ul>
      ) : null}
      <small class="muted">{lc(t('Requirements are shown as the referee sends them; technologies and practices appear only by era and field.'))}</small>
    </div>
  );
}
