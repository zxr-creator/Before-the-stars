// Top bar: who you are, when it is, what phase the round is in, the stocks
// that matter every round, and the two ways to hand time back to the referee.
import { NEGOTIATION_WINDOWS } from './protocol';
import type { Observation } from './protocol';
import { GOOD_SHORT, PHASE_LABEL, int, milli, milliSigned, yearOf } from './format';
import { Icon } from './icons';
import { Btn, SeatDot, cx } from './ui';
import { humanSeatList, openPanel, ready, seatName, setMenu, switchSeat, useApp } from './store';

function nextLabel(obs: Observation): { label: string; hint: string } {
  if (obs.phase === 'contact') return { label: 'Open negotiations', hint: 'Finish contact selection and open the first negotiation window' };
  if (obs.phase === 'negotiate') {
    return obs.window < NEGOTIATION_WINDOWS
      ? { label: 'Next window', hint: `Close window ${obs.window} and open window ${obs.window + 1}` }
      : { label: 'To planning', hint: 'Close the last negotiation window and move to planning' };
  }
  return { label: 'Finish planning', hint: 'Finish planning; the referee then resolves twelve months' };
}

export function TopBar() {
  const s = useApp();
  const obs = s.obs!;
  const summary = s.summary!;
  const civ = obs.civ;
  const finished = obs.phase === 'finished';
  const rounds = Math.round(obs.horizon / obs.months_per_round);
  const humans = humanSeatList();
  const waitingOthers = (summary.waiting_on ?? []).filter((x) => x !== obs.seat);
  const food = civ.goods.find((g) => g.good === 'food');
  const foodPerMonth = food && food.consumed > 0 ? food.consumed / obs.months_per_round : 0;
  const foodMonths = food && foodPerMonth > 0 ? food.stock / foodPerMonth : null;
  const stocks = civ.goods.filter((g) => g.good === 'food' || g.good === 'materials' || g.good === 'tools');
  const next = nextLabel(obs);
  const stabTone = civ.stability >= 60 ? 'ok' : civ.stability >= 35 ? 'warn' : 'bad';

  return (
    <header class="topbar">
      <button type="button" class="topbar-menu" aria-label="Game menu" title="Game menu" data-testid="menu-button" onClick={() => setMenu(!s.menuOpen)}>
        <Icon name="menu" size={18} />
      </button>
      <div class="topbar-civ">
        <span class="civ-swatch" style={{ background: civ.color }} aria-hidden="true" />
        <div class="civ-text">
          <span class="civ-name" data-testid="civ-name">{civ.name}</span>
          {humans.length > 1 ? (
            <span class="seat-switch">
              {humans.map((h) => (
                <button type="button" class={cx('seat-chip', h === obs.seat && 'is-active')} disabled={h === obs.seat}
                  title={h === obs.seat ? 'You are playing this seat' : `Switch to ${seatName(h)}`} data-testid={`seat-${h}`}
                  onClick={() => void switchSeat(h)}>
                  <SeatDot color={summary.seats?.find((x) => x.seat === h)?.color ?? '#888'} size={8} />{seatName(h)}
                </button>
              ))}
            </span>
          ) : (
            <span class="civ-sub">{obs.status === 'active' ? 'Your civilization' : obs.status}</span>
          )}
        </div>
      </div>

      <div class="topbar-date" title={`Month ${obs.month} of ${obs.horizon}`}>
        <span class="date-year" data-testid="year">Year {yearOf(obs.month)}</span>
        <span class="date-round">Round {int(obs.round)} of {int(rounds)}</span>
      </div>

      <div class="phase" role="group" aria-label={`Phase: ${PHASE_LABEL[obs.phase]}${obs.window ? `, window ${obs.window} of ${NEGOTIATION_WINDOWS}` : ''}`} data-testid="phase" data-phase={obs.phase} data-window={obs.window}>
        <span class={cx('phase-step', obs.phase === 'contact' && 'is-now')} title="Contact selection: choose up to three counterparts for this round">Contact</span>
        <span class={cx('phase-step', obs.phase === 'negotiate' && 'is-now')} title="Negotiation: five simultaneous windows, one envelope per counterpart per window">
          Negotiate
          <span class="phase-windows" aria-hidden="true">
            {Array.from({ length: NEGOTIATION_WINDOWS }, (_, i) => (
              <i class={cx('phase-win', obs.phase === 'negotiate' && obs.window === i + 1 && 'is-now', (obs.phase === 'plan' || (obs.phase === 'negotiate' && obs.window > i + 1)) && 'is-done')}>{i + 1}</i>
            ))}
          </span>
        </span>
        <span class={cx('phase-step', obs.phase === 'plan' && 'is-now')} title="Planning: orders are settled, then twelve months are resolved">Plan</span>
        {finished ? <span class="phase-step is-now">Finished</span> : null}
      </div>

      <div class="topbar-stats">
        {stocks.map((g) => {
          const net = g.produced - g.consumed + g.traded_in - g.traded_out;
          const low = g.good === 'food' && foodMonths !== null && foodMonths < 2;
          return (
            <button type="button" class={cx('tstat', 'tstat-' + g.good, low && 'is-bad')} onClick={() => openPanel('economy')}
              title={`${GOOD_SHORT[g.good]} in store: ${milli(g.stock)} units. Net last round: ${milliSigned(net)} units.${g.good === 'food' && foodMonths !== null ? ` About ${foodMonths.toFixed(1)} months of consumption in store.` : ''}`}>
              <span class="tstat-label">{GOOD_SHORT[g.good]}</span>
              <span class="tstat-value">{milli(g.stock)}<small class={net < 0 ? 'neg' : 'pos'}>{net === 0 ? '' : ' ' + milliSigned(net)}</small></span>
            </button>
          );
        })}
        <button type="button" class="tstat" onClick={() => openPanel('people')} title={`Population: ${int(civ.population)} people (${int(civ.working_age)} of working age)`}>
          <span class="tstat-label">People</span>
          <span class="tstat-value" data-testid="population">{int(civ.population)}</span>
        </button>
        <button type="button" class={cx('tstat', 'tstat-stab', 'is-' + stabTone)} onClick={() => openPanel('politics')} title={`Stability ${civ.stability} of 100`}>
          <span class="tstat-label">Stability</span>
          <span class="tstat-value">{civ.stability}<small> /100</small></span>
        </button>
      </div>

      <div class="topbar-actions">
        {finished ? (
          <span class="waiting"><Icon name="flag" size={14} /> Match finished</span>
        ) : obs.ready ? (
          <span class="waiting" data-testid="waiting"><Icon name="clock" size={14} /> Waiting for {waitingOthers.length ? waitingOthers.map(seatName).join(', ') : 'the referee'}</span>
        ) : (
          <>
            <Btn kind="default" title={next.hint} disabled={s.advancing || s.busy} testid="next-phase" onClick={() => void ready(false)}>{next.label}</Btn>
            <Btn kind="primary" icon="hourglass" title="Pass every remaining phase and resolve twelve months" disabled={s.advancing || s.busy} testid="end-round" onClick={() => void ready(true)}>
              {s.advancing ? 'Resolving…' : 'End round'}
            </Btn>
          </>
        )}
      </div>
    </header>
  );
}
