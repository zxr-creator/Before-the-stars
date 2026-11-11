//! Static public content compiled into the native AI (design chapter 39, section
//! 3.1): which technologies and practices are victory-critical, their depth below
//! the goal, rival families and their refuting nodes, tradition branches and
//! exclusive practice groups. The same for every match and every seat, and
//! published in this repository: it is the design, not match state. The policy
//! scores only cards present in its own observation, looked up here by their
//! public names, so it never learns of a node it has not discovered.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Deserialize)]
struct TechJson {
    id: String,
    name: String,
    prereq: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    evidence: Option<String>,
}

#[derive(Deserialize)]
struct PracJson {
    id: String,
    name: String,
    prereq: String,
    #[serde(default)]
    era: Option<u8>,
    #[serde(default)]
    tension: Vec<String>,
}

#[derive(Deserialize, Default)]
struct FamiliesJson {
    #[serde(default)]
    families: Vec<FamilyJson>,
    #[serde(default)]
    exclusive_groups: Vec<GroupJson>,
    #[serde(default)]
    critical_technologies: Vec<String>,
    #[serde(default)]
    critical_practices: Vec<String>,
}

#[derive(Deserialize)]
struct FamilyJson {
    members: Vec<String>,
    #[serde(default)]
    refuted_by: Vec<String>,
}

#[derive(Deserialize)]
struct GroupJson {
    id: String,
    members: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct TechInfo {
    pub id: String,
    pub critical: bool,
    /// Critical nodes that depend on this one (directly or not): how much of the
    /// goal waits on it.
    pub critical_below: u32,
    pub family: Option<usize>,
    /// A tradition branch node.
    pub branch: bool,
}

#[derive(Clone, Debug, Default)]
pub struct PracInfo {
    pub id: String,
    pub critical: bool,
    pub era: u8,
    pub exclusive: Option<usize>,
    pub tension: Vec<String>,
    pub critical_below: u32,
}

pub struct Family {
    /// Member names.
    pub members: Vec<String>,
    pub refuted_by: Vec<String>,
}

pub struct Group {
    pub id: String,
    /// Member names.
    pub members: Vec<String>,
}

pub struct Tables {
    pub techs: HashMap<String, TechInfo>,
    pub practices: HashMap<String, PracInfo>,
    pub families: Vec<Family>,
    pub groups: Vec<Group>,
    /// Practice names by id (for world-order routes).
    pub prac_name: HashMap<String, String>,
    /// Practice prerequisites by id.
    pub prac_prereq: HashMap<String, Vec<String>>,
}

fn ids(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_ascii_alphanumeric()).filter(|x| x.len() == 4 && (x.starts_with('T') || x.starts_with('C'))).map(|x| x.to_string()).collect()
}

/// For every node, the critical nodes at or below which it lies.
fn critical_below(prereq: &HashMap<String, Vec<String>>, critical: &[String]) -> HashMap<String, u32> {
    let mut out: HashMap<String, u32> = HashMap::new();
    for c in critical {
        // every ancestor of a critical node counts it once
        let mut stack = vec![c.clone()];
        let mut seen = std::collections::HashSet::new();
        while let Some(n) = stack.pop() {
            if !seen.insert(n.clone()) {
                continue;
            }
            *out.entry(n.clone()).or_insert(0) += 1;
            if let Some(ps) = prereq.get(&n) {
                stack.extend(ps.iter().cloned());
            }
        }
    }
    out
}

pub fn tables() -> &'static Tables {
    static T: OnceLock<Tables> = OnceLock::new();
    T.get_or_init(|| {
        let tj: Vec<TechJson> = serde_json::from_str(include_str!("../../../content/technologies.json")).expect("technologies.json");
        let pj: Vec<PracJson> = serde_json::from_str(include_str!("../../../content/practices.json")).expect("practices.json");
        let fj: FamiliesJson = serde_json::from_str(include_str!("../../../content/families.json")).unwrap_or_default();
        let tprereq: HashMap<String, Vec<String>> = tj.iter().map(|t| (t.id.clone(), ids(&t.prereq))).collect();
        let pprereq: HashMap<String, Vec<String>> = pj.iter().map(|p| (p.id.clone(), ids(&p.prereq))).collect();
        let tbelow = critical_below(&tprereq, &fj.critical_technologies);
        let pbelow = critical_below(&pprereq, &fj.critical_practices);
        let tname: HashMap<String, String> = tj.iter().map(|t| (t.id.clone(), t.name.clone())).collect();
        let pname: HashMap<String, String> = pj.iter().map(|p| (p.id.clone(), p.name.clone())).collect();
        let fam_of = |id: &str| fj.families.iter().position(|f| f.members.iter().any(|m| m == id));
        let group_of = |id: &str| fj.exclusive_groups.iter().position(|g| g.members.iter().any(|m| m == id));
        let techs = tj
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    TechInfo {
                        id: t.id.clone(),
                        critical: fj.critical_technologies.contains(&t.id),
                        critical_below: tbelow.get(&t.id).copied().unwrap_or(0),
                        family: fam_of(&t.id),
                        branch: t.kind.as_deref() == Some("branch") || t.evidence.as_deref().map(|e| e.starts_with("tradition:")).unwrap_or(false) && t.kind.as_deref() != Some("entry"),
                    },
                )
            })
            .collect();
        let practices = pj
            .iter()
            .map(|p| {
                (
                    p.name.clone(),
                    PracInfo {
                        id: p.id.clone(),
                        critical: fj.critical_practices.contains(&p.id),
                        era: p.era.unwrap_or(0),
                        exclusive: group_of(&p.id),
                        tension: p.tension.iter().filter_map(|x| pname.get(x).cloned()).collect(),
                        critical_below: pbelow.get(&p.id).copied().unwrap_or(0),
                    },
                )
            })
            .collect();
        let families = fj.families.iter().map(|f| Family { members: f.members.iter().filter_map(|m| tname.get(m).cloned()).collect(), refuted_by: f.refuted_by.iter().filter_map(|m| tname.get(m).cloned()).collect() }).collect();
        let groups = fj.exclusive_groups.iter().map(|g| Group { id: g.id.clone(), members: g.members.iter().filter_map(|m| pname.get(m).cloned()).collect() }).collect();
        Tables { techs, practices, families, groups, prac_name: pname, prac_prereq: pprereq }
    })
}
