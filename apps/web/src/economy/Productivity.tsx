// Labour productivity, as the referee reports it (ruleset 3.0 slice 6): per region and
// sector the six factors whose product is the sector's productivity, the posts saved;
// per works the posts at the method's base, after shared support and after
// productivity, and for land works the yield of one level with its factors.
//
//   RegionProductivity   the full breakdown (regional works, Productivity tab)
//   ProductivityMini     a compact table for the region inspector
//   CivProductivity      every governed region at a glance (economy panel)
//   WorksLabour          one works: its posts chain and, for land works, its yield
//
// The factor names follow the design (chapter 36 §4): education, culture, religion,
// technology, city, health; automation for qualified posts; resources and site for
// land works; buildings and method for the shared support of a larger works.
import { useState } from 'preact/hooks';
import type { FacilityType, FacilityView, FactorView, Good, Observation, ProductivityView, RegionView, Sector } from '../protocol';
import { joinList, peopleNum, qty } from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { cx } from '../ui';
import { SECTOR_LABEL } from './labels';
import {
  SECTORS, SECTOR_FACTORS, deltaPct, detailParts, factorInfo, factorTone, isLandWorks, mult, postsChain, postsSaved, sectorOf, sectorView,
} from './labour';
import './productivity.css';

// --- small pieces -------------------------------------------------------------------------------

/** An era's name ("Industrial"); Chinese looks up "Industrial (era)" so it reads 工业时代, not the category word. */
export function eraText(label: string): string {
  if (!isZh()) return label;
  const k = label + ' (era)';
  const hit = t(k);
  return hit === k ? t(label) : hit;
}

/** A bar on a doubling scale centred on ×1: a halving fills the left half, a doubling the right. */
export function FactorBar({ bp, lo = 0.5, hi = 2, testid }: { bp: number; lo?: number; hi?: number; testid?: string }) {
  const L = Math.log2(lo);
  const H = Math.log2(hi);
  const pos = (v: number) => Math.max(0, Math.min(1, (Math.log2(Math.max(v, 1e-3)) - L) / (H - L)));
  const one = pos(1);
  const at = pos(bp / 10000);
  const tone = factorTone(bp);
  return (
    <span class={cx('prod-bar', 'is-' + tone)} data-testid={testid} aria-hidden="true">
      <i class="prod-bar-one" style={{ left: (one * 100).toFixed(1) + '%' }} />
      <b style={{ left: (Math.min(one, at) * 100).toFixed(1) + '%', width: (Math.abs(at - one) * 100).toFixed(1) + '%' }} />
    </span>
  );
}

function Mult({ bp, strong }: { bp: number; strong?: boolean }) {
  const tone = factorTone(bp);
  return <span class={cx('prod-mult', 'is-' + tone, strong && 'is-strong')} title={deltaPct(bp)}>{mult(bp)}</span>;
}

function factorName(source: string): string {
  const info = factorInfo(source);
  return info ? t(info.label) : tc(source);
}

/** The referee's wording of a factor, piece by piece ("Technology: …; Practice: …"). */
function Detail({ detail }: { detail: string }) {
  const { parts, olderPart } = detailParts(detail);
  if (!parts.length) return null;
  return (
    <span class="prod-detail-text">
      {parts.map((p) => <span class="prod-chip">{tc(p)}</span>)}
      {olderPart ? <small class="prod-older">{t('Works of older eras receive only part of this.')}</small> : null}
    </span>
  );
}

function factorTip(p: ProductivityView): string {
  return p.factors.map((f) => `${factorName(f.source)} ${mult(f.bp)}`).join(' · ');
}

// --- the explanation ------------------------------------------------------------------------------

export function ProductivityExplainer({ open: initial = false }: { open?: boolean }) {
  useLocale();
  const [open, setOpen] = useState(initial);
  return (
    <div class="prod-explain" data-testid="prod-explain">
      <p>
        <b>{t('Productivity frees people; it never adds output.')}</b>{' '}
        {t('A level of a works makes what its method says, however many people it takes. When productivity rises, each level needs fewer people, and those freed can staff more levels, study, research, build or serve.')}
      </p>
      <button type="button" class="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'up' : 'down'} size={10} /> {open ? t('Hide how it is reckoned') : t('How it is reckoned')}
      </button>
      {open ? (
        <ul class="prod-rules">
          <li>{t('Each sector’s productivity is the product of six factors: education, culture, religion, technology, city and health. It is kept between ×0.5 and ×4.')}</li>
          <li>{t('General posts per level = the method’s posts, less shared support, divided by the productivity. Qualified posts are divided only by automation.')}</li>
          <li>{t('Land works (fields, plantations, forestry, herds, fishing) also have a yield per level: the land factor raises it, at most to twice the method’s yield.')}</li>
          <li>{t('Construction: a called-up worker does as many worker-months as the construction productivity, at most 1.5.')}</li>
          <li>{t('Factors from technologies you have not understood and practices you have not established are never shown.')}</li>
        </ul>
      ) : null}
    </div>
  );
}

// --- one region, in full -------------------------------------------------------------------------

export function RegionProductivity({ obs, r, onWorks }: { obs: Observation; r: RegionView; onWorks?: (kind: string) => void }) {
  useLocale();
  const own = r.own!;
  const views = SECTORS.map((s) => ({ sector: s, p: sectorView(own, s) })).filter((x): x is { sector: Sector; p: ProductivityView } => x.p !== null);
  const [sel, setSel] = useState<Sector>(() => {
    // open on the sector that employs most people in works here
    const by = new Map<Sector, number>();
    for (const f of own.facilities) {
      const fac = obs.catalog.facilities.find((x) => x.kind === f.kind);
      const s = sectorOf(fac);
      by.set(s, (by.get(s) ?? 0) + f.staffed);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'food';
  });
  if (!views.length) {
    return (
      <div class="prod" data-testid="prod-region">
        <ProductivityExplainer />
        <p class="prod-none">{t('This referee does not report labour productivity.')}</p>
      </div>
    );
  }
  const cur = views.find((v) => v.sector === sel) ?? views[0];
  const saved = postsSaved(own);
  return (
    <div class="prod" data-testid="prod-region">
      <ProductivityExplainer />
      <div class="prod-sectors" role="tablist" aria-label={t('Sectors')}>
        {views.map(({ sector, p }) => (
          <button type="button" role="tab" aria-selected={sector === cur.sector} class={cx('prod-sector', sector === cur.sector && 'is-active')}
            data-testid={`prod-sector-${sector}`} title={factorTip(p)} onClick={() => setSel(sector)}>
            <span class="prod-sector-name">{t(SECTOR_LABEL[sector])}</span>
            <Mult bp={p.total_bp} strong />
            <FactorBar bp={p.total_bp} lo={0.5} hi={4} />
            <small>{p.posts_saved > 0 ? t('{n} posts saved', { n: peopleNum(p.posts_saved) }) : t('no posts saved')}</small>
          </button>
        ))}
      </div>
      <p class="prod-saved">{saved > 0
        ? t('Last month productivity saved {n} posts in {region}: people free for other work.', { n: peopleNum(saved), region: tc(r.name) })
        : t('Last month productivity saved no posts in {region}.', { region: tc(r.name) })}</p>

      <section class="prod-card" data-testid={`prod-detail-${cur.sector}`}>
        <header class="prod-card-head">
          <h4>{t(SECTOR_LABEL[cur.sector])}</h4>
          <span>{t('productivity')} <Mult bp={cur.p.total_bp} strong /></span>
          <small class="muted">{t('{n} posts saved last month', { n: peopleNum(cur.p.posts_saved) })}</small>
        </header>
        <table class="prod-factors">
          <thead><tr><th>{t('Factor')}</th><th class="prod-col-bar"><span class="prod-scale"><i>×0.5</i><i>×1</i><i>×2</i></span></th><th class="num">{t('Multiplier')}</th><th>{t('Why, as the referee states it')}</th></tr></thead>
          <tbody>
            {SECTOR_FACTORS.map((src) => {
              const f = cur.p.factors.find((x) => x.source === src);
              const info = factorInfo(src)!;
              return (
                <tr class={cx(!f && 'is-absent')} data-factor={src}>
                  <th scope="row">
                    <b>{t(info.label)}</b>
                    <small>{t(info.what)}</small>
                  </th>
                  <td class="prod-col-bar">{f ? <FactorBar bp={f.bp} /> : null}</td>
                  <td class="num">{f ? <Mult bp={f.bp} /> : <span class="muted">–</span>}</td>
                  <td>
                    {f ? <Detail detail={f.detail} /> : <span class="muted">{t('not reported')}</span>}
                    <small class="prod-raise"><Icon name="up" size={9} /> {t(info.raise)}</small>
                  </td>
                </tr>
              );
            })}
            {cur.p.factors.filter((f) => !(SECTOR_FACTORS as readonly string[]).includes(f.source)).map((f) => {
              const info = factorInfo(f.source);
              return (
                <tr class="is-extra" data-factor={f.source}>
                  <th scope="row"><b>{factorName(f.source)}</b>{info ? <small>{t(info.what)}</small> : null}</th>
                  <td class="prod-col-bar"><FactorBar bp={f.bp} /></td>
                  <td class="num"><Mult bp={f.bp} /></td>
                  <td><Detail detail={f.detail} /><small class="prod-raise">{t('Not part of the sector’s total.')}</small></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><th scope="row">{t('Product, kept within ×0.5–×4')}</th><td class="prod-col-bar"><FactorBar bp={cur.p.total_bp} lo={0.5} hi={4} /></td><td class="num"><Mult bp={cur.p.total_bp} strong /></td><td><small class="muted">{t('General posts of this sector’s works are divided by this.')}</small></td></tr>
          </tfoot>
        </table>
      </section>

      <section class="prod-card" data-testid="prod-matrix">
        <header class="prod-card-head"><h4>{t('All sectors at a glance')}</h4><small class="muted">{t('hover a figure for the referee’s reason')}</small></header>
        <div class="prod-matrix-wrap">
          <table class="prod-matrix">
            <thead><tr><th>{t('Factor')}</th>{views.map((v) => <th class={cx('num', v.sector === cur.sector && 'is-sel')}><button type="button" class="linklike" onClick={() => setSel(v.sector)}>{t(SECTOR_LABEL[v.sector])}</button></th>)}</tr></thead>
            <tbody>
              {SECTOR_FACTORS.map((src) => (
                <tr><th scope="row">{factorName(src)}</th>{views.map((v) => {
                  const f = v.p.factors.find((x) => x.source === src);
                  return <td class={cx('num', v.sector === cur.sector && 'is-sel')} title={f ? detailParts(f.detail).parts.map(tc).join('\n') : undefined}>{f ? <Mult bp={f.bp} /> : <span class="muted">–</span>}</td>;
                })}</tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">{t('Productivity')}</th>{views.map((v) => <td class={cx('num', v.sector === cur.sector && 'is-sel')}><Mult bp={v.p.total_bp} strong /></td>)}</tr>
              <tr><th scope="row">{t('Posts saved')}</th>{views.map((v) => <td class={cx('num', v.sector === cur.sector && 'is-sel')}>{v.p.posts_saved ? peopleNum(v.p.posts_saved) : <span class="muted">0</span>}</td>)}</tr>
            </tfoot>
          </table>
        </div>
      </section>

      <WorksPostsTable obs={obs} r={r} onWorks={onWorks} />
    </div>
  );
}

/** Every works of a region: posts at base, after shared support, after productivity. */
function WorksPostsTable({ obs, r, onWorks }: { obs: Observation; r: RegionView; onWorks?: (kind: string) => void }) {
  const own = r.own!;
  const rows = own.facilities.map((f) => ({ f, fac: obs.catalog.facilities.find((x) => x.kind === f.kind) ?? null, c: postsChain(f) }))
    .filter((x) => x.c.base > 0)
    .sort((a, b) => (b.c.bySupport + b.c.byProductivity) - (a.c.bySupport + a.c.byProductivity) || b.c.base - a.c.base);
  if (!rows.length) return null;
  const tot = rows.reduce((a, x) => ({ base: a.base + x.c.base, s: a.s + x.c.bySupport, p: a.p + x.c.byProductivity, after: a.after + x.c.afterProd }), { base: 0, s: 0, p: 0, after: 0 });
  return (
    <section class="prod-card" data-testid="prod-works">
      <header class="prod-card-head"><h4>{t('Posts by works')}</h4><small class="muted">{t('people for all levels; click a works for its methods')}</small></header>
      <div class="prod-matrix-wrap">
        <table class="prod-works">
          <thead><tr>
            <th>{t('Works')}</th><th>{t('Sector')}</th>
            <th class="num" title={t('Posts the method asks for all levels, before any saving')}>{t('At the method’s base')}</th>
            <th class="num" title={t(factorInfo('support')!.what)}>{t('Shared support')}</th>
            <th class="num" title={t('Saved by the works’ productivity (and automation for qualified posts)')}>{t('Productivity')}</th>
            <th class="num">{t('Posts needed')}</th>
            <th class="num" title={t('The productivity this works receives: its sector’s, less technologies of eras it is too old for')}>{t('Works ×')}</th>
          </tr></thead>
          <tbody>
            {rows.map(({ f, fac, c }) => (
              <tr class={cx(onWorks && 'is-link')} onClick={onWorks ? () => onWorks(f.kind) : undefined} data-testid={`prod-works-${f.kind}`}>
                <th scope="row">{tc(f.name)} <small class="muted">{t('level {n}', { n: f.level })}</small></th>
                <td><small>{t(SECTOR_LABEL[sectorOf(fac)])}</small></td>
                <td class="num">{peopleNum(c.base)}</td>
                <td class="num">{c.bySupport ? <span class="pos">−{peopleNum(c.bySupport)}</span> : <span class="muted">0</span>}</td>
                <td class="num">{c.byProductivity ? <span class="pos">−{peopleNum(c.byProductivity)}</span> : c.afterProd > c.afterScale ? <span class="neg">+{peopleNum(c.afterProd - c.afterScale)}</span> : <span class="muted">0</span>}</td>
                <td class="num"><b>{peopleNum(c.afterProd)}</b></td>
                <td class="num"><Mult bp={c.productivityBp} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <th scope="row" colSpan={2}>{t('All works')}</th>
            <td class="num">{peopleNum(tot.base)}</td>
            <td class="num pos">{tot.s ? '−' + peopleNum(tot.s) : '0'}</td>
            <td class="num pos">{tot.p ? '−' + peopleNum(tot.p) : '0'}</td>
            <td class="num"><b>{peopleNum(tot.after)}</b></td>
            <td />
          </tr></tfoot>
        </table>
      </div>
      {own.facilities.some((f) => f.kind === 'fields' || f.kind === 'pasture' || f.kind === 'fishery') ? (
        <p class="prod-note">{t('Fields, pastures and fishing grounds are staffed by the food plan; the referee reports their posts at the base, and the food sector’s saving is in its posts saved.')}</p>
      ) : null}
    </section>
  );
}

// --- one region, compact (inspector) --------------------------------------------------------------

export function ProductivityMini({ r, onOpen }: { r: RegionView; onOpen?: () => void }) {
  useLocale();
  const own = r.own!;
  const views = SECTORS.map((s) => ({ sector: s, p: sectorView(own, s) })).filter((x): x is { sector: Sector; p: ProductivityView } => x.p !== null);
  if (!views.length) return null;
  const saved = postsSaved(own);
  return (
    <div class="prod-mini" data-testid="prod-mini">
      <ul>
        {views.map(({ sector, p }) => {
          const low = p.factors.filter((f) => f.bp < 9951).map((f) => factorName(f.source));
          const high = [...p.factors].filter((f) => f.bp > 10049).sort((a, b) => b.bp - a.bp).slice(0, 2).map((f) => factorName(f.source));
          return (
            <li title={factorTip(p)}>
              <span class="prod-mini-name">{t(SECTOR_LABEL[sector])}</span>
              <FactorBar bp={p.total_bp} lo={0.5} hi={4} />
              <Mult bp={p.total_bp} strong />
              <small class="prod-mini-why">{high.length ? t('raised by {list}', { list: joinList(high) }) : null}{high.length && low.length ? ' · ' : null}{low.length ? <span class="neg">{t('held down by {list}', { list: joinList(low) })}</span> : null}</small>
            </li>
          );
        })}
      </ul>
      <p class="prod-mini-foot">
        {saved > 0 ? t('{n} posts saved last month.', { n: peopleNum(saved) }) : t('No posts saved last month.')}{' '}{t('Productivity frees people; it adds no output.')}{' '}
        {onOpen ? <button type="button" class="linklike" data-testid="prod-mini-open" onClick={onOpen}>{t('Full breakdown')} <Icon name="right" size={10} /></button> : null}
      </p>
    </div>
  );
}

// --- every region (economy panel) -----------------------------------------------------------------

export function CivProductivity({ obs, onRegion }: { obs: Observation; onRegion: (id: number) => void }) {
  useLocale();
  const regions = obs.regions.filter((r) => r.own?.productivity?.length);
  if (!regions.length) return <p class="prod-none">{t('This referee does not report labour productivity.')}</p>;
  const saved = regions.reduce((n, r) => n + postsSaved(r.own!), 0);
  const sorted = [...regions].sort((a, b) => (a.id === obs.civ.capital ? -1 : b.id === obs.civ.capital ? 1 : b.own!.population - a.own!.population));
  return (
    <div class="prod-civ" data-testid="prod-civ">
      <p class="prod-civ-lede">{saved > 0
        ? t('Across our regions productivity saved {n} posts last month: people free for other work. A level makes the same whatever the productivity.', { n: peopleNum(saved) })
        : t('Productivity saved no posts last month. A level makes the same whatever the productivity; productivity only changes how many people it needs.')}</p>
      <div class="prod-matrix-wrap">
        <table class="prod-matrix prod-civ-table">
          <thead><tr><th>{t('Region')}</th>{SECTORS.map((s) => <th class="num" title={t(SECTOR_LABEL[s])}>{t(SECTOR_SHORT[s])}</th>)}<th class="num">{t('Posts saved')}</th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr>
                <th scope="row"><button type="button" class="linklike" data-testid={`prod-civ-${r.id}`} onClick={() => onRegion(r.id)}>{tc(r.name)}</button></th>
                {SECTORS.map((s) => {
                  const p = sectorView(r.own!, s);
                  return <td class="num" title={p ? factorTip(p) : undefined}>{p ? <Mult bp={p.total_bp} /> : <span class="muted">–</span>}</td>;
                })}
                <td class="num">{peopleNum(postsSaved(r.own!))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// i18n-table
const SECTOR_SHORT: Record<Sector, string> = {
  food: 'Food', extraction: 'Extr.', industry: 'Ind.', services: 'Serv.', knowledge: 'Know.', construction: 'Constr.',
};
// i18n-end

// --- one works ---------------------------------------------------------------------------------

/** The output good of a land works' yield: food for fields, else the first output of its first method. */
function yieldGood(fac: FacilityType | null | undefined, f: FacilityView): Good {
  if (f.kind === 'fields' || f.kind === 'pasture' || f.kind === 'fishery') return 'food';
  return fac?.recipes[0]?.outputs[0]?.good ?? 'food';
}

export function WorksLabour({ r, f, fac }: { r: RegionView; f: FacilityView; fac: FacilityType | null | undefined }) {
  useLocale();
  const c = postsChain(f);
  if (!c.known && !isLandWorks(f)) return null;
  const sector = sectorOf(fac);
  const sv = sectorView(r.own!, sector);
  const max = Math.max(1, c.base);
  const food = f.kind === 'fields' || f.kind === 'pasture' || f.kind === 'fishery';
  const older = sv && !food && c.productivityBp < sv.total_bp - 50;
  const steps: { key: string; label: string; n: number; minus?: number; hint: string }[] = [
    { key: 'base', label: t('At the method’s base'), n: c.base, hint: t('Posts the method asks for {n} levels before any saving.', { n: f.level }) },
    { key: 'scale', label: t('After shared support'), n: c.afterScale, minus: c.bySupport, hint: t(factorInfo('support')!.what) },
    { key: 'prod', label: t('After productivity'), n: c.afterProd, minus: c.byProductivity, hint: t('General posts divided by the works’ productivity; qualified posts by automation.') },
  ];
  const yf = f.yield_factors ?? [];
  const good = yieldGood(fac, f);
  return (
    <section class="wd-labour prod-works-card" data-testid={`works-labour-${f.kind}`}>
      <div class="wd-sub"><h5>{t('Labour and productivity')}</h5><span class="muted small">{t(SECTOR_LABEL[sector])}</span></div>
      {c.known ? (
        <>
          <ol class="prod-steps">
            {steps.map((s) => (
              <li data-step={s.key} title={s.hint}>
                <span class="prod-step-label">{s.label}</span>
                <span class="prod-step-bar"><i style={{ width: ((s.n / max) * 100).toFixed(1) + '%' }} />{s.minus ? <em style={{ left: ((s.n / max) * 100).toFixed(1) + '%', width: ((s.minus / max) * 100).toFixed(1) + '%' }} /> : null}</span>
                <span class="prod-step-n"><b>{peopleNum(s.n)}</b>{s.minus ? <small class="pos"> −{peopleNum(s.minus)}</small> : null}</span>
              </li>
            ))}
          </ol>
          <p class="prod-works-line">
            {t('This works’ productivity')} <Mult bp={c.productivityBp} strong />
            {sv ? <span class="muted"> · {t('{sector} in {region}: {m}', { sector: t(SECTOR_LABEL[sector]), region: tc(r.name), m: mult(sv.total_bp) })}</span> : null}
          </p>
          {older ? <p class="prod-note"><Icon name="info" size={11} /> {t('Below the sector’s figure: this works belongs to an older era and misses newer technology. Upgrading or replacing it would recover the difference.')}</p> : null}
          {food ? <p class="prod-note"><Icon name="info" size={11} /> {t('Fields, pastures and fishing grounds are staffed by the food plan; the referee reports their posts at the base, and the food sector’s saving is in its posts saved.')}</p> : null}
          <p class="prod-note">{f.staff_needed ? t('{n} of {total} posts filled last month.', { n: peopleNum(f.staffed), total: peopleNum(f.staff_needed) }) : null} {t('What a level makes does not change with productivity.')}</p>
        </>
      ) : null}
      {isLandWorks(f) ? (
        <div class="prod-yield" data-testid={`works-yield-${f.kind}`}>
          <p><span>{t('Yield of one level')}</span> <b>{qty(good, f.yield_per_level ?? 0)}</b> <small class="muted">{t('a month at full staffing · all {n} levels: {total}', { n: f.level, total: qty(good, (f.yield_per_level ?? 0) * f.level) })}</small></p>
          {yf.length ? (
            <ul class="prod-yield-factors">
              {yf.map((x: FactorView) => (
                <li title={factorInfo(x.source) ? t(factorInfo(x.source)!.what) : undefined}><span>{factorName(x.source)}</span><FactorBar bp={x.bp} /><Mult bp={x.bp} /><Detail detail={x.detail} /></li>
              ))}
            </ul>
          ) : <p class="prod-note">{t('No site bonus or other land factor applies here: the method’s yield.')}</p>}
          <p class="prod-note">{t('The land factor is capped at twice the method’s yield.')}</p>
        </div>
      ) : null}
    </section>
  );
}

