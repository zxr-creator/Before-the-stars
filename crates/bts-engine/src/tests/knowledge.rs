//! Knowledge pacing (design chapter 36, slice 3).

use super::*;
use crate::sim::knowledge;

/// Research capacity is never more than staffed research posts times research
/// effectiveness, and effectiveness rises with the institutions of knowledge.
#[test]
fn research_used_never_exceeds_posts_times_effectiveness() {
    let mut m = Match::new(cfg("effectiveness"), 1);
    let c = content();
    let home = m.world.civs[0].capital as usize;
    // oral tradition: two tenths of a researcher-month per post
    assert_eq!(knowledge::research_effectiveness(&m.world.civs[0]), 2_000);
    put_works(&mut m.world.regions[home], "makers_circle", 2);
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 10_000_000;
    }
    crate::sim::economy::step(&mut m.world, 0);
    let posts: i64 = m.world.regions[home].fac(c.f("makers_circle")).map(|f| f.staffed as i64).unwrap_or(0);
    let cap: i64 = m.world.civs[0].research_cap.iter().sum();
    assert!(posts > 0 && cap > 0, "{posts} posts, {cap} capacity");
    assert!(cap <= posts * 2_000 / 10_000, "{cap} researcher-months from {posts} posts");
    // writing, archives, printing, the scientific method, a research commons and digital networks
    m.world.civs[0].tech[c.t("T025")].state = ST_UNDERSTOOD;
    assert_eq!(knowledge::research_effectiveness(&m.world.civs[0]), 3_500);
    know_everything(&mut m.world, 0);
    m.world.civs[0].milestones.sci_method = Some(1);
    assert_eq!(knowledge::research_effectiveness(&m.world.civs[0]), 10_000);
    // and over months of investigation, what is used never exceeds what the posts supply
    run_rounds(&mut m, 2);
    for c in &m.world.civs {
        for (u, k) in c.research_used.iter().zip(c.research_cap.iter()) {
            assert!(u <= k, "{}: used {u} of {k}", c.name);
        }
    }
}

/// All else equal, a people with writing and archives gathers evidence faster.
#[test]
fn writing_and_archives_gather_evidence_faster() {
    let gather = |institutions: bool| -> i64 {
        let mut m = Match::new(cfg("channels"), 1);
        let c = content();
        if institutions {
            m.world.civs[0].tech[c.t("T025")].state = ST_UNDERSTOOD;
            let p = c.p("C013");
            m.world.civs[0].practice[p].state = 3;
            m.world.civs[0].practice[p].adoption_bp = 10_000;
        }
        for t in m.world.civs[0].tag_activity.iter_mut() {
            *t = 2_000;
        }
        let before: i64 = m.world.civs[0].tech.iter().map(|t| t.evidence).sum();
        m.world.month += 1;
        knowledge::step(&mut m.world, 0);
        m.world.civs[0].tech.iter().map(|t| t.evidence).sum::<i64>() - before
    };
    let (oral, archives) = (gather(false), gather(true));
    assert!(oral > 0);
    // archives: 13,000 against oral 6,000 (the nodes writing opens add more again)
    assert!(archives * 10 >= oral * 20, "{archives} against {oral}");
}

/// Contact with a peaceful people that has prototyped a node raises the evidence for it.
#[test]
fn contact_with_a_prototyping_people_raises_evidence() {
    let gain = |contact: bool| -> i64 {
        let mut m = Match::new(cfg("contact-evidence"), 1);
        let c = content();
        let t = c.t("T025");
        for s in 0..2 {
            m.world.civs[s].tag_activity.iter_mut().for_each(|x| *x = 1_000);
        }
        for id in ["T009", "T016", "T001", "T003", "T012", "T004", "T002"] {
            m.world.civs[0].tech[c.t(id)].state = ST_UNDERSTOOD;
        }
        m.world.civs[1].tech[t].state = ST_PROTOTYPED;
        if contact {
            m.world.civs[0].contacts[1].met = true;
            m.world.civs[1].contacts[0].met = true;
        }
        let before = m.world.civs[0].tech[t].evidence;
        m.world.month += 1;
        knowledge::step(&mut m.world, 0);
        m.world.civs[0].tech[t].evidence - before
    };
    let (alone, met) = (gain(false), gain(true));
    assert!(alone > 0 && met > alone * 13 / 10, "{met} with contact against {alone} alone");
}

/// Pacing comes from content/pacing.json: every node has a threshold, era nodes
/// take their era's, and work and minimum months follow the tier table.
#[test]
fn pacing_is_read_from_content() {
    let c = content();
    let p = crate::content::pacing();
    for t in &c.techs {
        let tp = p.tiers[t.tier as usize];
        assert_eq!((t.work, t.min_months), (tp.work_k * 1000, tp.min_months), "{}", t.id);
        let expect = p.nodes.get(&t.id).and_then(|n| n.era.as_ref()).map(|e| p.eras[e].hint).unwrap_or(tp.hint);
        assert_eq!(t.hint, expect, "{}", t.id);
    }
    assert!(c.techs[c.t("T049")].hint < c.techs[c.t("T048")].hint);
}
