//! The market (design chapter 36, section 6; lean scope of chapter 41).
//!
//! Seats that have met, are at peace, do not embargo each other and are joined by a
//! physical route form a market (a connected component of the route graph). Each
//! seat holds standing orders, at most one side per good. Every month each market
//! prices every good from its total orders; goods ship along the routes and lose
//! cargo on the way; buyers pay sellers in trade credit, which is never created,
//! never negative and only ever transferred. With no credit to start with, a seat
//! pays for what it buys with what it sells the same month, so members are matched
//! pair by pair (see [`clear_market`]). Members see aggregates only.

use crate::content::{base_price, good_mass_kg};
use crate::sim::network::{link, net, Net};
use crate::state::*;
use bts_protocol::*;

/// Most loss along a route, basis points.
pub const MAX_LOSS_BP: i64 = 5_000;

fn active(w: &World, s: usize) -> bool {
    w.civs[s].status != SeatStatus::Eliminated
}

fn embargoed(w: &World, a: SeatId, b: SeatId) -> bool {
    w.civs[a as usize].embargo.contains(&b) || w.civs[b as usize].embargo.contains(&a)
}

/// Can goods between `a` and `b` cross a region governed by `c`?
fn transit_ok(w: &World, a: SeatId, b: SeatId, c: SeatId) -> bool {
    c == a || c == b || (!w.at_war(c, a) && !w.at_war(c, b) && !embargoed(w, c, a) && !embargoed(w, c, b))
}

/// The least-loss path between the capitals of `a` and `b` (design 6.2): its loss,
/// the least capacity of its links (tonnes a month), its length and whether it
/// crosses the sea. Raider camps and regions with a hostile army in them are closed.
fn path(w: &World, a: SeatId, b: SeatId, nets: &[Net]) -> Option<Route> {
    let n = w.regions.len();
    let (ca, cb) = (w.civs[a as usize].capital as usize, w.civs[b as usize].capital as usize);
    let (ka, kb) = (&w.civs[a as usize], &w.civs[b as usize]);
    let boats = ka.knows_id("T013") && kb.knows_id("T013");
    let sail = ka.knows_id("T028") && kb.knows_id("T028");
    let open = |ri: usize| -> bool {
        let r = &w.regions[ri];
        let Some(c) = r.controller else { return false };
        transit_ok(w, a, b, c) && !w.armies.iter().any(|x| x.region as usize == ri && w.at_war(x.owner, c))
    };
    if !open(ca) || !open(cb) {
        return None;
    }
    let mut dist = vec![i64::MAX; n];
    let mut prev: Vec<Option<(usize, i64, bool)>> = vec![None; n];
    let mut done = vec![false; n];
    dist[ca] = 0;
    loop {
        let mut best: Option<usize> = None;
        for i in 0..n {
            if !done[i] && dist[i] != i64::MAX && best.map(|x| dist[i] < dist[x]).unwrap_or(true) {
                best = Some(i);
            }
        }
        let Some(x) = best else { break };
        if x == cb {
            break;
        }
        done[x] = true;
        for (nb, kind) in &w.regions[x].neighbors {
            let nb = *nb as usize;
            if done[nb] || !open(nb) || (*kind == LinkKind::Sea && !boats) {
                continue;
            }
            let (l, cap) = link(&nets[x], &nets[nb], *kind, boats, sail);
            let d = dist[x] + l;
            if d < dist[nb] {
                dist[nb] = d;
                prev[nb] = Some((x, cap, *kind == LinkKind::Sea));
            }
        }
    }
    if dist[cb] == i64::MAX {
        return None;
    }
    let (mut cur, mut cap, mut len, mut sea) = (cb, i64::MAX, 0u16, false);
    while let Some((p, c, s)) = prev[cur] {
        cap = cap.min(c);
        len += 1;
        sea |= s;
        cur = p;
    }
    Some(Route { a, b, loss_bp: dist[cb].min(MAX_LOSS_BP), cap_t: if cap == i64::MAX { 0 } else { cap * 1000 }, length: len, sea })
}

/// Find the routes and markets again (first month of a round, and after a war,
/// peace or embargo).
pub fn recompute_routes(w: &mut World) {
    let n = w.civs.len();
    let nets: Vec<Net> = w.regions.iter().map(net).collect();
    let mut routes = Vec::new();
    for a in 0..n {
        for b in a + 1..n {
            if !active(w, a) || !active(w, b) || !w.civs[a].contacts[b].met || w.at_war(a as SeatId, b as SeatId) || embargoed(w, a as SeatId, b as SeatId) {
                continue;
            }
            if let Some(r) = path(w, a as SeatId, b as SeatId, &nets) {
                routes.push(r);
            }
        }
    }
    let mut market: Vec<SeatId> = (0..n as SeatId).collect();
    // union by lowest seat id until stable (at most ten seats)
    loop {
        let mut changed = false;
        for r in &routes {
            let m = market[r.a as usize].min(market[r.b as usize]);
            for s in [r.a, r.b] {
                if market[s as usize] != m {
                    market[s as usize] = m;
                    changed = true;
                }
            }
        }
        for s in 0..n {
            let m = market[market[s] as usize];
            if m != market[s] {
                market[s] = m;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    w.routes = routes;
    w.market_of = market;
    if w.market_lines.len() < n {
        w.market_lines.resize(n, Vec::new());
    }
    w.routes_dirty = false;
}

/// Pairwise loss between members of a market over its routes (bp, capped).
fn pair_loss(w: &World, members: &[usize]) -> Vec<Vec<i64>> {
    let n = w.civs.len();
    let mut d = vec![vec![i64::MAX / 4; n]; n];
    for s in members {
        d[*s][*s] = 0;
    }
    for r in &w.routes {
        let (a, b) = (r.a as usize, r.b as usize);
        d[a][b] = d[a][b].min(r.loss_bp);
        d[b][a] = d[a][b];
    }
    for &k in members {
        for &i in members {
            for &j in members {
                if d[i][k] + d[k][j] < d[i][j] {
                    d[i][j] = d[i][k] + d[k][j];
                }
            }
        }
    }
    for i in members {
        for j in members {
            d[*i][*j] = d[*i][*j].min(MAX_LOSS_BP);
        }
    }
    d
}

fn price_for(p0: i64, base: i64, s: i64, b: i64) -> i64 {
    let p = p0 * (10_000 + 5_000 * (b - s) / (b + s).max(1)) / 10_000;
    p.clamp(p0 * 85 / 100, p0 * 115 / 100 + 1).clamp((base / 5).max(1), base * 5)
}

/// The month's price of a good from its orders (design 6.4 steps 1-3), and the
/// orders that stand at that price.
fn price_good(p0: i64, base: i64, s: &mut [i64], b: &mut [i64], slim: &[Option<i64>], blim: &[Option<i64>]) -> (i64, i64, i64) {
    let (so, bo) = (s.iter().sum::<i64>(), b.iter().sum::<i64>());
    let mut p = price_for(p0, base, so, bo);
    for _ in 0..4 {
        let mut dropped = false;
        for i in 0..s.len() {
            if s[i] > 0 && slim[i].map(|l| l > p).unwrap_or(false) {
                s[i] = 0;
                dropped = true;
            }
            if b[i] > 0 && blim[i].map(|l| l < p).unwrap_or(false) {
                b[i] = 0;
                dropped = true;
            }
        }
        if !dropped {
            break;
        }
        p = price_for(p0, base, s.iter().sum(), b.iter().sum());
    }
    (p, so, bo)
}

/// Clear one market for a month.
///
/// Prices are set per good from all orders. Trade credit starts at zero and can
/// neither be created nor overdrawn, so a seat can pay for what it buys only with
/// what it sells the same month (design 6.1, 6.10). The clearing therefore matches
/// each pair of members in seat order: what the first can send the second against
/// what the second can send the first, at the month's prices, up to the smaller
/// value, the larger side scaled down in proportion. Each side then pays the other
/// the smaller of the two values shipped, so neither ends the month in debt; the
/// side that shipped a fraction of a unit's worth more bears it.
pub(crate) fn clear_market(w: &mut World, members: &[usize]) {
    let key = members[0];
    let m = members.len();
    if w.market_lines[key].len() < NG {
        w.market_lines[key] = Good::ALL.iter().map(|g| MarketLine { price: base_price(*g), prev_price: base_price(*g), ..Default::default() }).collect();
    }
    // each seat's cargo capacity a month: the sum over its routes (design 6.2),
    // shared equally among its orders that have a counterpart in the market, so that
    // one bulky order cannot crowd out the rest
    let side = |g: Good, sell: bool| members.iter().any(|s| w.civs[*s].orders.iter().any(|o| o.good == g && o.sell == sell));
    let cap: Vec<i64> = members
        .iter()
        .map(|s| {
            let live = w.civs[*s].orders.iter().filter(|o| side(o.good, !o.sell)).count().max(1) as i64;
            w.routes.iter().filter(|r| r.a as usize == *s || r.b as usize == *s).map(|r| r.cap_t).sum::<i64>() / live
        })
        .collect();
    // remaining sales and buys by good and member, and the month's prices
    let mut sells = vec![vec![0i64; m]; NG];
    let mut buys = vec![vec![0i64; m]; NG];
    let mut price = vec![0i64; NG];
    let mut traded_any = false;
    for g in Good::ALL.iter().copied() {
        let gi = g.index();
        let kg = good_mass_kg(g).max(1);
        let (mut slim, mut blim) = (vec![None; m], vec![None; m]);
        let mut any = false;
        for (k, &seat) in members.iter().enumerate() {
            let civ = &w.civs[seat];
            let Some(o) = civ.orders.iter().find(|o| o.good == g) else { continue };
            any = true;
            let room = cap[k] * 1000 / kg;
            if o.sell {
                // a sale never takes stock below what is kept and a month of own use
                let free = civ.stock_of(g) - o.keep.max(civ.use_ema[gi]);
                sells[gi][k] = o.per_month.min(free).min(room).max(0);
                slim[k] = o.limit;
            } else {
                let want = if o.keep > 0 { (o.keep - civ.stock_of(g)).max(0) } else { o.per_month };
                buys[gi][k] = o.per_month.min(want).min(room).max(0);
                blim[k] = o.limit;
            }
        }
        let line = &mut w.market_lines[key][gi];
        line.prev_price = line.price;
        line.volume = 0;
        if !any {
            // a good with no orders drifts 2% a month toward its base price
            let base = base_price(g);
            line.price += (base - line.price) / 50;
            line.sale_orders = 0;
            line.buy_orders = 0;
            continue;
        }
        let (p, so, bo) = price_good(line.price, base_price(g), &mut sells[gi], &mut buys[gi], &slim, &blim);
        line.price = p;
        line.sale_orders = so;
        line.buy_orders = bo;
        price[gi] = p;
        traded_any = true;
    }
    for &seat in members {
        w.civs[seat].fills.clear();
    }
    if !traded_any {
        return;
    }
    let loss = pair_loss(w, members);
    // shipments [from][to][good] and credit paid between each pair (thousandths)
    let mut ship = vec![vec![vec![0i64; NG]; m]; m];
    let mut paid = vec![vec![0i64; m]; m];
    for i in 0..m {
        for j in i + 1..m {
            let value = |from: usize, to: usize, sells: &Vec<Vec<i64>>, buys: &Vec<Vec<i64>>| -> i64 { (0..NG).map(|g| sells[g][from].min(buys[g][to]) * price[g]).sum() };
            let (a, b) = (value(i, j, &sells, &buys), value(j, i, &sells, &buys));
            let v = a.min(b);
            if v == 0 {
                continue;
            }
            let mut sent = [0i64; 2];
            for (k, (from, to, full)) in [(i, j, a), (j, i, b)].into_iter().enumerate() {
                for g in 0..NG {
                    let q = (sells[g][from].min(buys[g][to]) as i128 * v as i128 / full as i128) as i64;
                    if q > 0 {
                        ship[from][to][g] += q;
                        sells[g][from] -= q;
                        buys[g][to] -= q;
                        sent[k] += q * price[g];
                    }
                }
            }
            let x = sent[0].min(sent[1]);
            paid[i][j] += x;
            paid[j][i] += x;
        }
    }
    // goods move: sellers hand over, buyers receive less what the way loses
    let mut fills: Vec<Vec<(Good, i64, i64, i64, i64)>> = vec![Vec::new(); m];
    for g in Good::ALL.iter().copied() {
        let gi = g.index();
        let mut volume = 0;
        let (mut bought, mut got, mut sold, mut value_in, mut value_out) = (vec![0i64; m], vec![0i64; m], vec![0i64; m], vec![0i64; m], vec![0i64; m]);
        for i in 0..m {
            for j in 0..m {
                let q = ship[i][j][gi];
                if q == 0 {
                    continue;
                }
                let out = w.civs[members[i]].trade_out(g, q);
                let civ = &mut w.civs[members[j]];
                civ.trade_in(g, out);
                let l = civ.lose(g, out * loss[members[i]][members[j]] / 10_000);
                volume += out;
                sold[i] += out;
                bought[j] += out;
                got[j] += out - l;
                value_out[i] += out * price[gi];
                value_in[j] += out * price[gi];
            }
        }
        if volume == 0 {
            continue;
        }
        w.market_lines[key][gi].volume = volume;
        for k in 0..m {
            if bought[k] > 0 || sold[k] > 0 {
                fills[k].push((g, bought[k], got[k], sold[k], if bought[k] > 0 { value_in[k] } else { value_out[k] }));
            }
        }
    }
    for k in 0..m {
        let (pay, rec): (i64, i64) = ((0..m).map(|j| paid[k][j]).sum(), (0..m).map(|j| paid[j][k]).sum());
        let civ = &mut w.civs[members[k]];
        civ.credit += rec - pay;
        civ.credit_earned += rec;
        civ.credit_spent += pay;
        civ.fills = std::mem::take(&mut fills[k]);
    }
}

/// Step 1b of the month: routes when needed, then every market clears.
pub fn step(w: &mut World) {
    if w.routes_dirty || w.first_month_of_round() || w.market_of.len() != w.civs.len() {
        recompute_routes(w);
    }
    if w.civs.iter().all(|c| c.orders.is_empty()) {
        return;
    }
    let n = w.civs.len();
    for key in 0..n {
        let members: Vec<usize> = (0..n).filter(|s| w.market_of[*s] as usize == key && active(w, *s)).collect();
        if members.len() < 2 || members[0] != key {
            for s in members {
                w.civs[s].fills.clear();
            }
            continue;
        }
        clear_market(w, &members);
    }
}

/// The seat's market as it may see it (design 6.8): members, aggregates for goods
/// it knows, its own orders, fills and routes, and its credit.
pub fn view(w: &World, seat: SeatId) -> Option<MarketView> {
    let si = seat as usize;
    let civ = &w.civs[si];
    let key = *w.market_of.get(si)? as usize;
    let members: Vec<SeatId> = (0..w.civs.len()).filter(|s| w.market_of[*s] as usize == key && active(w, *s)).map(|s| s as SeatId).collect();
    if members.len() < 2 && civ.orders.is_empty() && civ.credit == 0 {
        return None;
    }
    let known = crate::observe::known_goods(w, seat);
    let lines = w.market_lines.get(key).filter(|_| members.len() >= 2).map(|ls| {
        ls.iter()
            .enumerate()
            .filter(|(gi, l)| known[*gi] && (l.volume > 0 || l.sale_orders > 0 || l.buy_orders > 0 || l.price != base_price(Good::from_index(*gi))))
            .map(|(gi, l)| MarketLineView { good: Good::from_index(gi), price: l.price, prev_price: l.prev_price, base_price: base_price(Good::from_index(gi)), volume: l.volume, sale_orders: l.sale_orders, buy_orders: l.buy_orders })
            .collect()
    });
    let orders = civ
        .orders
        .iter()
        .map(|o| {
            let f = civ.fills.iter().find(|f| f.0 == o.good).copied().unwrap_or((o.good, 0, 0, 0, 0));
            MarketOrderView { good: o.good, side: if o.sell { MarketSide::Sell } else { MarketSide::Buy }, per_month: o.per_month, limit_price: o.limit, keep_stock: o.keep, bought: f.1, received: f.2, sold: f.3, credit: f.4 / 1000 }
        })
        .collect();
    let routes = w
        .routes
        .iter()
        .filter(|r| r.a == seat || r.b == seat)
        .map(|r| RouteView { partner: if r.a == seat { r.b } else { r.a }, sea: r.sea, length: r.length, loss_bp: r.loss_bp, capacity_t: r.cap_t })
        .collect();
    Some(MarketView { members, lines: lines.unwrap_or_default(), orders, routes, credit: civ.credit / 1000, embargoes: civ.embargo.clone() })
}
