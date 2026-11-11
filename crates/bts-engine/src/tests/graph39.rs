//! The deeper technology and practice graphs (design chapter 39, slices 6b and 6c):
//! content checks of section 6.6, path dependence, fragile know-how, investigation
//! lines, exclusive groups, repeal and the information boundary of family views.

use super::*;
use crate::content::{Req, ReqCtx, TechKind};
use crate::sim::knowledge;

/// Evaluates requirements against a set of allowed nodes.
struct Allowed<'a> {
    techs: &'a [bool],
    pracs: &'a [bool],
}

impl ReqCtx for Allowed<'_> {
    fn tech(&self, i: usize) -> bool {
        self.techs[i]
    }
    fn prac(&self, i: usize) -> bool {
        self.pracs[i]
    }
    fn fac(&self, _: usize) -> bool {
        true
    }
    fn pop(&self) -> u64 {
        u64::MAX
    }
    fn regions(&self) -> u32 {
        u32::MAX
    }
    fn qual(&self, _: Qual) -> u32 {
        u32::MAX
    }
    fn contact(&self) -> bool {
        true
    }
    fn religion(&self) -> bool {
        true
    }
    fn sci_method(&self) -> bool {
        true
    }
}

fn reachable_practices(forbidden: &[usize]) -> Vec<bool> {
    let c = content();
    let techs = vec![true; c.techs.len()];
    let mut pracs = vec![false; c.practices.len()];
    loop {
        let mut changed = false;
        for (i, p) in c.practices.iter().enumerate() {
            if !pracs[i] && !forbidden.contains(&i) && p.prereq.eval(&Allowed { techs: &techs, pracs: &pracs }) {
                pracs[i] = true;
                changed = true;
            }
        }
        if !changed {
            return pracs;
        }
    }
}

/// Section 6.6, step 4: sizes, no cross-graph prerequisites, the victory-critical
/// closure unchanged and self-sufficient, families and exclusive groups well formed.
#[test]
fn deeper_graphs_are_well_formed() {
    let c = content();
    assert_eq!(c.techs.len(), 300);
    assert_eq!(c.families.len(), 15);
    // no technology needs a practice and no practice a technology through `prereq`
    for t in &c.techs {
        let mut ps = Vec::new();
        t.prereq.pracs(&mut ps);
        assert!(ps.is_empty(), "{} has a practice prerequisite", t.id);
    }
    for p in &c.practices {
        let mut ts = Vec::new();
        p.prereq.techs(&mut ts);
        assert!(ts.is_empty(), "{} has a technology prerequisite", p.id);
    }
    // the critical sets: 84 and 35, none of them new, and each closed: every
    // critical node's prerequisites hold with critical nodes alone, so breadth never
    // lengthens the critical path (scripts/critical_set.py checks minimality)
    let crit_t: Vec<bool> = c.techs.iter().map(|t| t.critical).collect();
    let crit_p: Vec<bool> = c.practices.iter().map(|p| p.critical).collect();
    assert_eq!(crit_t.iter().filter(|x| **x).count(), 84);
    assert_eq!(crit_p.iter().filter(|x| **x).count(), 35);
    for (i, t) in c.techs.iter().enumerate().filter(|(_, t)| t.critical) {
        assert!(t.kind == TechKind::Core, "{} is critical but new", t.id);
        assert!(t.prereq.eval(&Allowed { techs: &crit_t, pracs: &crit_p }), "{} needs a node outside the critical set", t.id);
        let _ = i;
    }
    for p in c.practices.iter().filter(|p| p.critical) {
        assert!(p.prereq.eval(&Allowed { techs: &crit_t, pracs: &crit_p }), "{} needs a practice outside the critical set", p.id);
        assert!(p.id.as_str() <= "C064", "{} is critical but new", p.id);
    }
    for id in ["T167", "T140", "T141", "T142", "T144", "T145", "T146"] {
        assert!(c.techs[c.t(id)].critical, "{id}");
    }
    // critical nodes keep their tier work and thresholds, or are relieved of part of
    // them (design chapter 39, section 8.5: thresholds and work of critical tier 7-9
    // nodes are the first things loosened; job 4b) - never made dearer
    let pace = crate::content::pacing();
    for t in c.techs.iter().filter(|t| t.critical) {
        let n = pace.nodes.get(&t.id);
        let (work, hint) = (n.and_then(|n| n.work_bp).unwrap_or(10_000), n.and_then(|n| n.hint_bp).unwrap_or(10_000));
        assert!(work <= 10_000 && hint <= 10_000, "{} is dearer than its tier", t.id);
        assert!((work == 10_000 && hint == 10_000) || t.tier >= 7, "{} below tier 7 has its costs changed", t.id);
    }
    // families: at least two members; critical members are capped by the lock rule
    for f in &c.families {
        assert!(f.members.len() >= 2, "{}", f.id);
        for m in &f.members {
            assert_eq!(c.techs[*m].family, Some(c.families.iter().position(|g| g.id == f.id).unwrap()));
        }
    }
    // sealed nodes depend on a fictional node
    for t in c.techs.iter().filter(|t| t.kind == TechKind::Sealed) {
        let mut ts = Vec::new();
        t.prereq.techs(&mut ts);
        assert!(ts.iter().any(|x| c.techs[*x].label == "fictional"), "{}", t.id);
    }
    // and nothing is unreachable at all
    assert!(reachable_practices(&[]).iter().all(|x| *x));
    let _ = Req::True;
}

fn family_world() -> (Match, usize, usize) {
    // F04: woodblock printing (T200) against movable type (T048)
    let mut m = Match::new(cfg("families"), 1);
    let c = content();
    let (wood, movable) = (c.t("T200"), c.t("T048"));
    know_everything(&mut m.world, 0);
    for t in [wood, movable] {
        m.world.civs[0].tech[t] = TechSt::default();
    }
    (m, wood, movable)
}

/// A seat that builds on one member of a family gathers evidence more slowly on
/// the others, may see their discovery capped, and pays more to investigate them;
/// a revisit study lifts the evidence lock and the cap (section 1.4).
#[test]
fn incumbent_standard_locks_its_rivals() {
    let (mut m, wood, movable) = family_world();
    let c = content();
    let installed = knowledge::installed_base(&m.world, 0);
    let free = knowledge::locks(&m.world, 0, &installed);
    assert_eq!((free.evidence_bp[wood], free.work_bp[wood], free.capped[wood]), (10_000, 10_000, false));
    // movable type understood and in use by a printing works
    m.world.civs[0].tech[movable].state = ST_ADOPTED;
    let mut installed = knowledge::installed_base(&m.world, 0);
    installed[movable] = 12;
    let lk = knowledge::locks(&m.world, 0, &installed);
    assert_eq!(lk.stands[c.techs[wood].family.unwrap()].share_bp, 10_000);
    assert_eq!((lk.evidence_bp[wood], lk.work_bp[wood], lk.capped[wood]), (4_000, 15_000, true));
    // understood but not built on: the share is capped at half
    let mut only = installed.clone();
    only[movable] = 0;
    let lk = knowledge::locks(&m.world, 0, &only);
    assert_eq!(lk.stands[c.techs[wood].family.unwrap()].share_bp, 5_000);
    assert!(!lk.capped[wood]);
    // a revisit study lifts the evidence lock and the cap, not the retooling cost
    let fam = c.techs[wood].family.unwrap();
    m.world.civs[0].revisit_until = vec![0; c.families.len()];
    m.world.civs[0].revisit_until[fam] = m.world.month + 240;
    let lk = knowledge::locks(&m.world, 0, &installed);
    assert_eq!((lk.evidence_bp[wood], lk.work_bp[wood], lk.capped[wood]), (10_000, 15_000, false));
}

/// Locks on a victory-critical member are bounded (T053 in F03) and refutation
/// halves what is left of a lock (section 1.4, 0.2).
#[test]
fn critical_members_are_capped_and_refutation_weakens_doctrine() {
    let mut m = Match::new(cfg("doctrine"), 1);
    let c = content();
    let (humoral, germs) = (c.t("T197"), c.t("T053"));
    m.world.civs[0].tech[humoral].state = ST_ADOPTED;
    let mut installed = knowledge::installed_base(&m.world, 0);
    installed[humoral] = 20;
    installed[germs] = 0;
    m.world.civs[0].tech[germs] = TechSt::default();
    for r in ["T045", "T212", "T214"] {
        m.world.civs[0].tech[c.t(r)] = TechSt::default();
    }
    let lk = knowledge::locks(&m.world, 0, &installed);
    assert_eq!((lk.evidence_bp[germs], lk.work_bp[germs], lk.capped[germs]), (knowledge::CRITICAL_LOCK_E, knowledge::CRITICAL_LOCK_W, false));
    // the lock on a non-critical member, halved by one refuting discovery
    m.world.civs[0].tech[germs].state = ST_ADOPTED;
    m.world.civs[0].tech[humoral] = TechSt::default();
    let mut installed = installed;
    installed[germs] = 20;
    installed[humoral] = 0;
    let before = knowledge::locks(&m.world, 0, &installed).evidence_bp[humoral];
    m.world.civs[0].tech[c.t("T045")].state = ST_UNDERSTOOD;
    let after = knowledge::locks(&m.world, 0, &installed).evidence_bp[humoral];
    assert_eq!(before, 4_000);
    assert_eq!(after, 7_000);
}

/// A family view appears only once two members are discovered and never names an
/// undiscovered member; two worlds that differ only in a hidden member give the
/// same knowledge view (section 8.2).
#[test]
fn family_views_disclose_only_discovered_members() {
    let (mut m, wood, movable) = family_world();
    m.world.civs[0].tech[movable].state = ST_ADOPTED;
    let lone = m.observe(0);
    let card = |o: &Observation, name: &str| o.knowledge.techs.iter().find(|t| t.name == name).cloned();
    let c = content();
    assert!(card(&lone, &c.techs[movable].name).unwrap().family_view.is_none(), "a lone member shows nothing of its rivals");
    // a hidden rival with evidence changes nothing the seat sees
    let mut other = m.world.clone();
    other.civs[0].tech[wood].evidence = 123_456;
    let a = serde_json::to_string(&m.observe(0).knowledge).unwrap();
    let b = serde_json::to_string(&crate::observe::observe(&other, 0).knowledge).unwrap();
    assert_eq!(a, b);
    // once discovered, both cards carry the family, and the rival's lock
    m.world.civs[0].tech[wood].state = ST_DISCOVERED;
    let o = m.observe(0);
    let fv = card(&o, &c.techs[wood].name).unwrap().family_view.expect("family view");
    assert_eq!(fv.rivals_discovered.len(), 1);
    assert!(fv.lock_w_bp > 10_000);
    // a revisit of an undiscovered member is refused with the uniform unknown error
    let mut hidden = m.world.clone();
    hidden.civs[0].tech[wood] = TechSt::default();
    let mut mm = Match { world: hidden, ..Match::new(cfg("families"), 1) };
    let r = mm.act(0, vec![Action::StartProject { spec: ProjectSpec::Revisit { card: "k-unknown".into() }, priority: None }]);
    assert_eq!(r[0].status, "rejected");
}

/// Fragile know-how lapses after a century unused without archives, keeps its
/// evidence and is relearned for half the work (section 1.5).
#[test]
fn fragile_know_how_lapses_without_archives() {
    let mut m = Match::new(cfg("fragile"), 1);
    let c = content();
    let steel = c.t("T191");
    assert!(c.techs[steel].fragile);
    m.world.civs[0].tech[steel].state = ST_UNDERSTOOD;
    m.world.civs[0].tech[steel].evidence = 9_999;
    m.world.civs[0].tech[steel].und_month = 1;
    for p in m.world.civs[0].practice.iter_mut() {
        *p = PracSt::default();
    }
    m.world.month = 12 * 101;
    knowledge::step(&mut m.world, 0);
    let st = &m.world.civs[0].tech[steel];
    assert_eq!(st.state, ST_DISCOVERED);
    assert_eq!(st.evidence, 9_999);
    assert_eq!(st.discount_bp, 5_000);
}

/// Investigations at once are bounded by the research staff (section 1.6).
#[test]
fn investigation_lines_follow_research_staff() {
    let mut m = Match::new(cfg("lines"), 1);
    m.world.civs[0].research_cap = vec![0; ResearchClass::COUNT];
    assert_eq!(knowledge::investigation_lines(&m.world, 0), knowledge::LINES_BASE as u32);
    // four times the staff, twice the extra lines
    let re = knowledge::research_effectiveness(&m.world.civs[0]);
    m.world.civs[0].research_cap[0] = 4 * knowledge::LINES_STAFF * re / 10_000;
    assert_eq!(knowledge::investigation_lines(&m.world, 0), knowledge::LINES_BASE as u32 + 2);
    m.world.civs[0].research_cap[0] = 16 * knowledge::LINES_STAFF * re / 10_000;
    assert_eq!(knowledge::investigation_lines(&m.world, 0), knowledge::LINES_BASE as u32 + 4);
    m.world.civs[0].research_cap[0] = i64::MAX / 20_000;
    assert_eq!(knowledge::investigation_lines(&m.world, 0), 24);
}

/// Section 6.6 for the practice graph: 174 practices, 17 exclusive groups, every
/// side of every group leaves a route to C064, tensions are symmetric.
#[test]
fn deeper_practice_graph_is_well_formed() {
    let c = content();
    assert_eq!(c.practices.len(), 174);
    assert_eq!(c.exclusive_groups.len(), 17);
    let c064 = c.p("C064");
    for g in &c.exclusive_groups {
        assert!(g.members.len() >= 2, "{}", g.id);
        for &m in &g.members {
            assert_eq!(c.practices[m].exclusive.map(|x| &c.exclusive_groups[x].id), Some(&g.id));
            let others: Vec<usize> = g.members.iter().copied().filter(|x| *x != m).collect();
            assert!(reachable_practices(&others)[c064], "choosing {} in {} closes every route to C064", c.practices[m].id, g.id);
        }
    }
    for (i, p) in c.practices.iter().enumerate() {
        for &j in &p.tension {
            assert!(c.practices[j].tension.contains(&i), "{} and {}", p.id, c.practices[j].id);
        }
        // the victory-critical practices keep their present costs
        if p.critical {
            assert!(p.evidence_needed <= 12_000 && p.work <= 260_000, "{}", p.id);
        }
    }
    // late reforms cost more than early ones
    assert!(c.practices[c.p("C160")].work > c.practices[c.p("C068")].work);
}

/// A polity holds one member of an exclusive group: reforming the other is refused
/// until a repeal returns the held one to recognized (section 2.2).
#[test]
fn exclusive_groups_need_a_repeal() {
    let mut m = Match::new(cfg("exclusive"), 1);
    let c = content();
    let (elders, chiefs) = (c.p("C068"), c.p("C069"));
    for p in [c.p("C003"), c.p("C011"), c.p("C009")] {
        m.world.civs[0].practice[p].state = 3;
        m.world.civs[0].practice[p].adoption_bp = 10_000;
    }
    m.world.civs[0].practice[elders].state = 3;
    m.world.civs[0].practice[elders].adoption_bp = 10_000;
    m.world.civs[0].practice[chiefs].state = 1;
    let h = |m: &Match, p: usize| crate::actions::prac_handle(&m.world, 0, p);
    let chiefs_h = h(&m, chiefs);
    let r = m.act(0, vec![Action::ProposeReform { practice: chiefs_h.clone() }]);
    assert_eq!(r[0].status, "rejected", "{:?}", r[0]);
    assert!(r[0].reason.contains("repealed first"), "{}", r[0].reason);
    let elders_h = h(&m, elders);
    let r = m.act(0, vec![Action::Repeal { practice: elders_h }]);
    assert_eq!(r[0].status, "accepted", "{:?}", r[0]);
    let o = m.observe(0);
    let card = o.culture.practices.iter().find(|p| p.handle == chiefs_h).unwrap();
    assert_eq!(card.exclusive_with.len(), 1);
}

/// Institutional load, capacity and reform slots (section 2.3).
#[test]
fn institutions_load_the_offices_and_slots_follow_administration() {
    let mut m = Match::new(cfg("load"), 1);
    let c = content();
    for p in m.world.civs[0].practice.iter_mut() {
        *p = PracSt::default();
    }
    assert_eq!(crate::sim::culture::reform_slots(&m.world, 0), 1);
    assert_eq!(crate::sim::culture::institutional_load(&m.world, 0), 0);
    let cap0 = crate::sim::culture::institutional_capacity(&m.world, 0);
    for id in ["C026", "C036"] {
        let p = c.p(id);
        m.world.civs[0].practice[p].state = 3;
        m.world.civs[0].practice[p].adoption_bp = 10_000;
    }
    assert_eq!(crate::sim::culture::reform_slots(&m.world, 0), 3);
    assert_eq!(crate::sim::culture::institutional_capacity(&m.world, 0), cap0 + 20);
    // an established Modern-era practice adds two
    let modern = (0..c.practices.len()).find(|i| c.practices[*i].era == 5 && !c.practices[*i].critical).unwrap();
    m.world.civs[0].practice[modern].state = 3;
    m.world.civs[0].practice[modern].adoption_bp = 10_000;
    assert_eq!(crate::sim::culture::institutional_load(&m.world, 0), 2 + c.practices[c.p("C026")].load + c.practices[c.p("C036")].load);
}
