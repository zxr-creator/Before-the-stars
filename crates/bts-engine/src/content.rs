//! Fixed, versioned content: the complete technology and practice graphs, course
//! templates, facilities, recipes and military tiers.
//!
//! The graphs (IDs, names, AND/OR prerequisites) are extracted from the design
//! atlases into `content/*.json` and are identical in every match. Gameplay
//! numbers in this module are provisional calibration parameters.
//!
//! Units (normative: `docs/units-and-scale.md`). Head counts are real people.
//! Goods are stored in base units (one ration, one tonne or one standard lot),
//! project work in worker-months, research work in researcher-months and shaft
//! or electric service in units of 0.1 MWh. The tables below are written in
//! display units (1,000 base units) and converted by `m()`. Anything stated per
//! person is stored per thousand people and applied as
//! `people * per_thousand / 1000`, dividing last.

use bts_protocol::{Deposit, Good, LaborCategory, Qual, ResearchClass, Role};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const CONTENT_VERSION: &str = "bts-content/3.0.0-s10";
/// Ruleset 2.0 counts real people, posts and base units of goods
/// (`docs/units-and-scale.md`). Ruleset 3.0 (design chapter 36) puts the game on a
/// historical calendar from 5000 BC with historical population and knowledge
/// pacing; saves written by earlier rulesets are refused. Until ruleset 3.0 is
/// released each slice that changes saved state carries a pre-release tag
/// (`-s4` = through slice 4 of the merged plan, design chapter 37 section 11), so
/// that a save of an earlier slice is refused by name.
pub const RULESET_VERSION: &str = "bts-rules/3.0.0-s10";
/// Generator 2.0 (design chapter 37, section 5.1): the Earth-like world by default.
pub const GENERATOR_VERSION: &str = "bts-worldgen/2.0.0-s5";

/// Base units in one display unit of goods, work, research or service.
pub const DISPLAY_DIVISOR: i64 = 1000;
/// Divisor for coefficients stored per thousand people.
pub const PER_THOUSAND: i64 = 1000;
/// Rations one resident or soldier eats in a month.
pub const FOOD_PER_PERSON_MONTH: i64 = 1;

/// Mass of one base unit of a good in kilograms: a tonne of bulk goods, a 50 kg
/// ration, a 500 kg horse, or the standard lot of a manufacture (units chapter,
/// section 2; design chapter 36, table 5.2).
pub fn good_mass_kg(g: Good) -> i64 {
    match g {
        Good::Food => 50,
        Good::Horses => 500,
        Good::Tools | Good::Spares => 250,
        Good::Electronics | Good::Munitions | Good::Batteries => 50,
        Good::Hardware => 500,
        Good::Media => 150,
        Good::Instruments => 400,
        Good::Medicine => 40,
        Good::ConsumerGoods => 100,
        Good::Textiles | Good::FineWares | Good::Lattice => 10,
        Good::Precious | Good::NuclearFuel | Good::Helium3 => 1,
        _ => 1000,
    }
}

/// Name of one base unit of a good: "ration", "head", "t" (tonne) or "lot".
pub fn good_unit(g: Good) -> &'static str {
    match g {
        Good::Food => "ration",
        Good::Horses => "head",
        _ if good_mass_kg(g) == 1000 => "t",
        _ => "lot",
    }
}

/// Goods that are grown rather than made: food, fibres, horses, spices and timber
/// come out of the land and the works that grow them are extractive (design
/// chapter 36, section 5.4); they are outside the mass balance like food.
pub fn grown(g: Good) -> bool {
    matches!(g, Good::Food | Good::Fibres | Good::Horses | Good::Spices | Good::Timber)
}

/// The good a deposit yields.
pub fn deposit_good(d: Deposit) -> Good {
    match d {
        Deposit::CopperOre => Good::CopperOre,
        Deposit::IronOre => Good::IronOre,
        Deposit::Coal => Good::Coal,
        Deposit::Crude => Good::Crude,
        Deposit::Tin => Good::Tin,
        Deposit::Salt => Good::Salt,
        Deposit::Saltpetre => Good::Saltpetre,
        Deposit::Precious => Good::Precious,
        Deposit::Gas => Good::Gas,
        Deposit::Bauxite => Good::Bauxite,
        Deposit::UraniumOre => Good::UraniumOre,
        Deposit::RareEarths => Good::RareEarths,
        Deposit::Lithium => Good::Lithium,
        Deposit::CobaltNickel => Good::CobaltNickel,
        Deposit::Quartz => Good::Quartz,
        Deposit::Volatiles => Good::Volatiles,
        Deposit::Helium3 => Good::Helium3,
    }
}

/// The technologies whose understanding reveals a deposit kind (any one of them;
/// design chapter 36, section 5.3). Empty: seen from the start. Volatiles and
/// helium-3 lie only off the Earth and are revealed by technologies of a later
/// slice: until then no technology reveals them.
pub fn deposit_reveal(d: Deposit) -> &'static [&'static str] {
    match d {
        Deposit::Salt | Deposit::Precious => &[],
        Deposit::CopperOre | Deposit::Tin | Deposit::Coal => &["T014"],
        Deposit::IronOre => &["T023"],
        Deposit::Saltpetre => &["T036"],
        Deposit::Crude => &["T064", "T090"],
        Deposit::Gas => &["T090"],
        Deposit::CobaltNickel => &["T060"],
        Deposit::Bauxite | Deposit::Quartz => &["T103"],
        Deposit::RareEarths => &["T103", "T043"],
        Deposit::Lithium => &["T105"],
        Deposit::UraniumOre => &["T146"],
        Deposit::Volatiles | Deposit::Helium3 => &["-"],
    }
}

/// Goods of the off-world economy (design chapter 37, section 1.1): in the catalog
/// from now, made and used only once the space slice (14) adds their works.
pub fn offworld_good(g: Good) -> bool {
    matches!(g, Good::Volatiles | Good::Propellant | Good::Helium3)
}

/// The technology whose understanding shows the helium content of gas fields.
pub const HELIUM_REVEAL: &str = "T108";

/// Class of a resource for display (design chapter 36, section 5.1).
pub fn deposit_class(d: Deposit) -> &'static str {
    match d {
        Deposit::Salt => "bonus",
        Deposit::Precious => "luxury",
        _ => "strategic",
    }
}

// ---------------------------------------------------------------------------
// Requirement expressions
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub enum Req {
    True,
    Tech(usize),
    Prac(usize),
    Fac(usize),
    Pop(u64),
    Regions(u32),
    QualAtLeast(Qual, u32),
    Contact,
    Religion,
    SciMethod,
    /// The seat holds (or held within a century) an industrial or information
    /// tradition (design chapter 37, section 4; slice 13). Never true before then.
    Tradition(String),
    All(Vec<Req>),
    Any(Vec<Req>),
}

/// Facts a requirement can be evaluated against.
pub trait ReqCtx {
    fn tech(&self, i: usize) -> bool;
    fn prac(&self, i: usize) -> bool;
    fn fac(&self, i: usize) -> bool;
    fn pop(&self) -> u64;
    fn regions(&self) -> u32;
    fn qual(&self, q: Qual) -> u32;
    fn contact(&self) -> bool;
    fn religion(&self) -> bool;
    fn sci_method(&self) -> bool;
    /// Whether the seat holds the tradition (design chapter 37, section 4).
    fn tradition(&self, _key: &str) -> bool {
        false
    }
}

impl Req {
    pub fn eval(&self, c: &dyn ReqCtx) -> bool {
        match self {
            Req::True => true,
            Req::Tech(i) => c.tech(*i),
            Req::Prac(i) => c.prac(*i),
            Req::Fac(i) => c.fac(*i),
            Req::Pop(n) => c.pop() >= *n,
            Req::Regions(n) => c.regions() >= *n,
            Req::QualAtLeast(q, n) => c.qual(*q) >= *n,
            Req::Contact => c.contact(),
            Req::Religion => c.religion(),
            Req::SciMethod => c.sci_method(),
            Req::Tradition(k) => c.tradition(k),
            Req::All(v) => v.iter().all(|r| r.eval(c)),
            Req::Any(v) => v.iter().any(|r| r.eval(c)),
        }
    }

    /// Top-level conjuncts, for display as a checklist.
    pub fn conjuncts(&self) -> Vec<&Req> {
        match self {
            Req::True => vec![],
            Req::All(v) => v.iter().collect(),
            other => vec![other],
        }
    }

    pub fn techs(&self, out: &mut Vec<usize>) {
        match self {
            Req::Tech(i) => out.push(*i),
            Req::All(v) | Req::Any(v) => v.iter().for_each(|r| r.techs(out)),
            _ => {}
        }
    }

    pub fn pracs(&self, out: &mut Vec<usize>) {
        match self {
            Req::Prac(i) => out.push(*i),
            Req::All(v) | Req::Any(v) => v.iter().for_each(|r| r.pracs(out)),
            _ => {}
        }
    }
}

struct Parser<'a> {
    toks: Vec<&'a str>,
    pos: usize,
    tech_ix: &'a HashMap<String, usize>,
    prac_ix: &'a HashMap<String, usize>,
    fac_ix: &'a HashMap<String, usize>,
}

fn tokenize(s: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c.is_whitespace() {
            i += 1;
        } else if c == '(' || c == ')' || c == '&' || c == '|' {
            out.push(&s[i..i + 1]);
            i += 1;
        } else {
            let start = i;
            while i < bytes.len() {
                let c = bytes[i] as char;
                if c.is_whitespace() || c == '(' || c == ')' || c == '&' || c == '|' {
                    break;
                }
                i += 1;
            }
            out.push(&s[start..i]);
        }
    }
    out
}

impl<'a> Parser<'a> {
    fn or(&mut self) -> Req {
        let mut items = vec![self.and()];
        while self.pos < self.toks.len() && self.toks[self.pos] == "|" {
            self.pos += 1;
            items.push(self.and());
        }
        if items.len() == 1 {
            items.pop().unwrap()
        } else {
            Req::Any(items)
        }
    }
    fn and(&mut self) -> Req {
        let mut items = vec![self.atom()];
        while self.pos < self.toks.len() && self.toks[self.pos] == "&" {
            self.pos += 1;
            items.push(self.atom());
        }
        if items.len() == 1 {
            items.pop().unwrap()
        } else {
            Req::All(items)
        }
    }
    fn atom(&mut self) -> Req {
        let t = self.toks[self.pos];
        self.pos += 1;
        if t == "(" {
            let r = self.or();
            assert_eq!(self.toks[self.pos], ")", "unbalanced requirement");
            self.pos += 1;
            return r;
        }
        if let Some(i) = self.tech_ix.get(t) {
            return Req::Tech(*i);
        }
        if let Some(i) = self.prac_ix.get(t) {
            return Req::Prac(*i);
        }
        if let Some(k) = t.strip_prefix("F:") {
            return Req::Fac(*self.fac_ix.get(k).unwrap_or_else(|| panic!("unknown facility {k}")));
        }
        if let Some(k) = t.strip_prefix("TRAD:") {
            return Req::Tradition(k.to_string());
        }
        if let Some(n) = t.strip_prefix("POP>=") {
            return Req::Pop(n.parse().unwrap());
        }
        if let Some(n) = t.strip_prefix("REG>=") {
            return Req::Regions(n.parse().unwrap());
        }
        if let Some(rest) = t.strip_prefix("Q:") {
            let (name, n) = rest.split_once(">=").expect("Q:name>=n");
            let q = Qual::ALL
                .iter()
                .find(|q| format!("{:?}", q).to_lowercase() == name.to_lowercase())
                .unwrap_or_else(|| panic!("unknown qualification {name}"));
            return Req::QualAtLeast(*q, n.parse().unwrap());
        }
        match t {
            "CONTACT" => Req::Contact,
            "REL" => Req::Religion,
            "SCI" => Req::SciMethod,
            _ => panic!("unknown requirement atom {t}"),
        }
    }
}

fn parse_req(
    s: &str,
    tech_ix: &HashMap<String, usize>,
    prac_ix: &HashMap<String, usize>,
    fac_ix: &HashMap<String, usize>,
) -> Req {
    let toks = tokenize(s);
    if toks.is_empty() {
        return Req::True;
    }
    let mut p = Parser { toks, pos: 0, tech_ix, prac_ix, fac_ix };
    let r = p.or();
    assert_eq!(p.pos, p.toks.len(), "trailing tokens in requirement {s}");
    r
}

// ---------------------------------------------------------------------------
// Context tags (evidence domains)
// ---------------------------------------------------------------------------

macro_rules! tags {
    ($($v:ident => $key:expr, $name:expr, $desc:expr;)+) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub enum Tag { $($v),+ }
        impl Tag {
            pub const ALL: &'static [Tag] = &[$(Tag::$v),+];
            pub const COUNT: usize = Self::ALL.len();
            pub fn key(self) -> &'static str { match self { $(Tag::$v => $key),+ } }
            pub fn name(self) -> &'static str { match self { $(Tag::$v => $name),+ } }
            pub fn desc(self) -> &'static str { match self { $(Tag::$v => $desc),+ } }
            pub fn from_key(k: &str) -> Option<Tag> { Self::ALL.iter().copied().find(|t| t.key() == k) }
        }
    };
}

tags! {
    Forage => "forage", "Wild food and seasons", "Gathering, hunting, fishing and what the seasons do to them.";
    Farm => "farm", "Cultivation and herds", "Fields, seed, soil, animals and the labour they demand.";
    Craft => "craft", "Materials and handwork", "Working stone, wood, fibre and clay; why tools fail.";
    Build => "build", "Structures and works", "Buildings, roads, bridges and the loads they carry.";
    Water => "water", "Water and flow", "Wells, channels, mills and the behaviour of moving water.";
    Sea => "sea", "Coasts and navigation", "Boats, currents, landmarks and distant shores.";
    Mine => "mine", "Rock and ore", "What lies in the ground and how to reach it.";
    Metal => "metal", "Furnaces and metal", "Smelting, forging and the quality of what comes out.";
    Record => "record", "Records and reckoning", "Marks, accounts, archives and administration.";
    Trade => "trade", "Exchange and contact", "What other peoples make, want and know.";
    Teach => "teach", "Teaching and transmission", "How skills pass between people and generations.";
    Measure => "measure", "Measurement and comparison", "Standards, instruments and repeatable trials.";
    Science => "science", "Natural philosophy", "Models, experiments and their disagreement with the world.";
    Health => "health", "Bodies and healing", "Injury, sickness, care and what actually helps.";
    War => "war", "Arms and defence", "Weapons, drill, fortification and supply under threat.";
    Steam => "steam", "Heat and steam", "Boilers, pressure, engines and wasted heat.";
    Fuel => "fuel", "Fuels and engines", "Liquid fuels, combustion and mobile machinery.";
    Chem => "chem", "Substances and reactions", "Separation, purity and industrial chemistry.";
    Electric => "electric", "Electricity", "Generation, conductors, control and electronics.";
    Compute => "compute", "Computation and networks", "Algorithms, machines that execute them and the data they need.";
    Bio => "bio", "Living systems", "Organisms as producers, patients and habitats.";
    Space => "space", "Orbit and vacuum", "Launch, orbital work and life beyond the air.";
    HighEnergy => "highenergy", "High-energy phenomena", "Particles, plasmas and extreme field states.";
    Machine => "machine", "Machines and tolerances", "Precision, interchangeable parts and reliable throughput.";
}

// ---------------------------------------------------------------------------
// Technologies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TechJson {
    id: String,
    name: String,
    label: String,
    group: String,
    group_title: String,
    prereq: String,
    requirements: String,
    capability: String,
    /// Kind of node (design chapter 39, section 1.2): absent for the nodes of the
    /// atlas and of doc 37; "side", "alt", "dead", "sealed", "entry" or "branch".
    #[serde(default)]
    kind: Option<String>,
    /// Rival family as the drafts named it (membership is read from
    /// `content/families.json`; kept for the client and the lore check).
    #[serde(default)]
    #[allow(dead_code)]
    family: Option<String>,
    /// Know-how lost when unused for a century without archives (section 1.5).
    #[serde(default)]
    fragile: bool,
    /// Evidence source: absent for ordinary evidence, "tradition:<path>" for a
    /// tradition branch node, "sealed" for a node absent until the objective.
    #[serde(default)]
    evidence: Option<String>,
}

/// What a node is in the graph of design chapter 39 (section 1.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TechKind {
    /// The atlas's nodes and doc 37's.
    Core,
    Side,
    Alt,
    Dead,
    Sealed,
    Entry,
    Branch,
}

#[derive(Clone, Debug)]
pub struct Tech {
    pub id: String,
    pub name: String,
    pub label: String,
    pub group: String,
    pub group_title: String,
    pub prereq: Req,
    pub requirements: String,
    pub capability: String,
    pub tier: u8,
    pub tags: Vec<Tag>,
    pub class: ResearchClass,
    /// Research work in researcher-months before scenario pace scaling.
    pub work: i64,
    pub min_months: u32,
    /// Investigation needs this kind of installation to be operating.
    pub needs_facility: Option<&'static str>,
    /// Evidence at which the node becomes a lead, before scenario pace scaling: its
    /// tier's `H[t]`, or its pacing era's (`content/pacing.json`).
    pub hint: i64,
    /// The era of the technology (design chapter 37, section 8.3): a works receives
    /// its productivity only if this is at most the works' era plus one.
    pub era: u8,
    pub kind: TechKind,
    /// Index into [`Content::families`].
    pub family: Option<usize>,
    pub fragile: bool,
    /// A tradition branch node's tradition (its practice evidence comes only from
    /// that tradition's works; slice 13). Before traditions exist only studies,
    /// contact and capture reach it.
    pub tradition: Option<String>,
    /// Victory-critical (design chapter 39, section 0.2; `content/families.json`).
    pub critical: bool,
}

fn tech_needs_facility(id: &str) -> Option<&'static str> {
    if let Some(k) = pacing().nodes.get(id).and_then(|n| n.needs_facility.as_deref()) {
        return match k {
            "launch_complex" => Some("launch_complex"),
            "high_energy" => Some("high_energy"),
            "jump_testbed" => Some("jump_testbed"),
            // off-world research stations and inhabited sites arrive with slice 15;
            // until then the Earth-orbit station stands in for them
            "orbital_station" | "offworld_station" | "offworld_inhabited" => Some("orbital_station"),
            other => panic!("pacing.json: {id} needs an unknown installation {other}"),
        };
    }
    match id {
        "T147" | "T148" | "T149" | "T161" | "T162" | "T163" => Some("high_energy"),
        "T144" | "T145" | "T152" => Some("launch_complex"),
        "T150" | "T151" | "T153" => Some("orbital_station"),
        "T164" | "T165" | "T166" | "T167" => Some("jump_testbed"),
        _ => None,
    }
}

/// Knowledge pacing read from `content/pacing.json` (design chapter 36, section
/// 2.7): per tier the lead threshold `H[t]`, research work and minimum months;
/// pacing eras for nodes whose tier misplaces them in history; and, for nodes the
/// code does not know, their tier and evidence tags. Nothing is paced by id in code.
#[derive(Deserialize)]
pub struct PacingJson {
    pub tiers: Vec<TierPacing>,
    #[serde(default)]
    pub map_scale: MapScale,
    #[serde(default)]
    pub eras: HashMap<String, EraPacing>,
    #[serde(default)]
    pub nodes: HashMap<String, NodePacing>,
}

/// How knowledge pacing scales with the size of the map (`content/pacing.json`).
#[derive(Deserialize, Clone, Copy)]
pub struct MapScale {
    pub reference_regions: u16,
    pub evidence_bp: i64,
    pub work_bp: i64,
}

impl Default for MapScale {
    fn default() -> Self {
        MapScale { reference_regions: 48, evidence_bp: 0, work_bp: 0 }
    }
}

impl MapScale {
    fn factor(&self, regions: u16, bp: i64) -> i64 {
        let r = self.reference_regions.max(1) as i64;
        (10_000 + bp * (regions as i64 - r) / r).max(2_500)
    }
    /// Multiplier (basis points) of evidence thresholds on a map of `regions`.
    pub fn evidence(&self, regions: u16) -> i64 {
        self.factor(regions, self.evidence_bp)
    }
    /// Multiplier (basis points) of research and reform work on a map of `regions`.
    pub fn work(&self, regions: u16) -> i64 {
        self.factor(regions, self.work_bp)
    }
}

#[derive(Deserialize, Clone, Copy)]
pub struct TierPacing {
    pub tier: u8,
    pub hint: i64,
    pub work_k: i64,
    pub min_months: u32,
}

#[derive(Deserialize, Clone)]
pub struct EraPacing {
    pub hint: i64,
    /// Median-seat target window the threshold was calibrated for (historical years).
    #[serde(default)]
    pub target: Vec<i32>,
}

#[derive(Deserialize, Clone, Default)]
pub struct NodePacing {
    #[serde(default)]
    pub era: Option<String>,
    #[serde(default)]
    pub tier: Option<u8>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Era band 0-9 (design chapter 37, section 8.3) where the id range misplaces it.
    #[serde(default)]
    pub band: Option<u8>,
    /// Per-node multipliers of the tier's research work and lead threshold (design
    /// chapter 39, section 1.6), basis points.
    #[serde(default)]
    pub work_bp: Option<i64>,
    #[serde(default)]
    pub hint_bp: Option<i64>,
    #[serde(default)]
    pub min_months: Option<u32>,
    /// Installation the investigation needs to be operating.
    #[serde(default)]
    pub needs_facility: Option<String>,
}

pub fn pacing() -> &'static PacingJson {
    static P: OnceLock<PacingJson> = OnceLock::new();
    P.get_or_init(|| {
        let p: PacingJson = serde_json::from_str(include_str!("../../../content/pacing.json")).expect("pacing.json");
        assert_eq!(p.tiers.len(), 10, "pacing.json has one entry per tier");
        for (i, t) in p.tiers.iter().enumerate() {
            assert_eq!(t.tier as usize, i, "pacing.json tiers are in order");
        }
        for (id, n) in &p.nodes {
            if let Some(e) = &n.era {
                assert!(p.eras.contains_key(e), "pacing.json: {id} names an unknown era {e}");
            }
        }
        p
    })
}

pub fn class_for_tier(tier: u8) -> ResearchClass {
    match tier {
        0 | 1 => ResearchClass::Craft,
        2 => ResearchClass::Scholarly,
        3 => ResearchClass::Scientific,
        4 | 5 => ResearchClass::Industrial,
        6 | 7 => ResearchClass::Advanced,
        _ => ResearchClass::Frontier,
    }
}

/// The graph tier of a node: from `content/pacing.json` if it states one, then the
/// tier table of the atlas, then (a node added later) one above its deepest
/// prerequisite that has a tier.
fn tech_tier_known(id: &str) -> Option<u8> {
    if let Some(t) = pacing().nodes.get(id).and_then(|n| n.tier) {
        return Some(t);
    }
    let n: u32 = id[1..].parse().ok()?;
    Some(match n {
        1..=16 => 0,
        36 | 37 => 2,
        38 => 5,
        20..=35 => 1,
        40..=49 => 2,
        57 | 58 => 5,
        50..=56 => 3,
        60..=71 => 4,
        80..=82 => 4,
        83..=85 => 5,
        86 | 87 => 6,
        96 | 97 => 6,
        90..=95 => 5,
        100..=105 => 5,
        106..=109 => 6,
        110 => 5,
        111..=113 => 6,
        120 | 122 | 125 => 8,
        114..=124 => 7,
        130..=132 => 6,
        133 | 134 => 7,
        135..=137 => 8,
        140..=144 | 146 => 7,
        145..=153 => 8,
        160 => 6,
        161 => 8,
        162..=167 => 9,
        _ => return None,
    })
}

/// The evidence tags of a node: from `content/pacing.json` if it lists them, then
/// the atlas table, then materials and handwork.
fn tech_tags(id: &str) -> Vec<Tag> {
    use Tag::*;
    let listed: Vec<Tag> = pacing().nodes.get(id).map(|n| n.tags.iter().filter_map(|k| Tag::from_key(k)).collect()).unwrap_or_default();
    if !listed.is_empty() {
        return listed;
    }
    let n: u32 = id[1..].parse().unwrap_or(0);
    let t: &[Tag] = match n {
        1 => &[Craft],
        2 => &[Craft],
        3 => &[Forage],
        4 => &[Craft, Forage],
        5 => &[Forage, Farm],
        6 => &[Forage, Farm],
        7 => &[Forage, Farm],
        8 => &[Craft],
        9 => &[Forage, Craft],
        10 => &[Farm, Forage],
        11 => &[Farm, Water],
        12 => &[Craft, Build],
        13 => &[Sea],
        14 => &[Craft, Mine],
        15 => &[Mine, Craft],
        16 => &[Craft, Record],
        20 => &[Farm],
        21 => &[Water, Farm],
        22 => &[Metal],
        23 => &[Metal, Mine],
        24 => &[Build],
        25 => &[Record],
        26 => &[Record, Trade],
        27 => &[Build, Trade],
        28 => &[Sea],
        29 => &[Water, Craft],
        30 => &[Record, Teach],
        31 => &[Craft],
        32 => &[Health, Forage],
        33 => &[Water, Build],
        34 => &[Craft, Metal],
        35 => &[Craft, War],
        36 => &[Mine, Measure],
        37 => &[War, Metal],
        38 => &[Machine, Fuel, Electric],
        40 => &[Measure, Craft, Record],
        41 => &[Craft, Measure],
        42 => &[Water, Measure],
        43 => &[Measure, Metal],
        44 => &[Measure, Craft],
        45 => &[Measure, Record],
        46 => &[Health, Record],
        47 => &[Measure, Record, Sea],
        48 => &[Record, Teach],
        49 => &[Measure, Science],
        50 => &[Metal, Measure],
        51 => &[Science],
        52 => &[Science, Metal],
        53 => &[Health, Science],
        54 => &[Science, Measure],
        55 => &[Science, Record],
        56 => &[Farm, Science],
        57 => &[Science],
        58 => &[Science],
        60 => &[Metal, Science],
        61 => &[Machine, Craft],
        62 => &[Machine, Craft],
        63 => &[Mine, Machine],
        64 => &[Chem, Science, Metal],
        65 => &[Teach, Machine],
        66 => &[Machine],
        67 => &[Metal, Machine],
        68 => &[Machine, Trade, Build],
        69 => &[Water, Health, Chem],
        70 => &[Health, Chem],
        71 => &[Machine, Teach],
        80 => &[Mine, Machine],
        81 => &[Steam],
        82 => &[Steam, Machine],
        83 => &[Steam],
        84 => &[Steam, Build],
        85 => &[Steam, Chem],
        86 => &[Steam, Electric],
        87 => &[Steam, Chem],
        90 => &[Chem, Mine],
        91 => &[Fuel, Machine],
        92 => &[Fuel],
        93 => &[Chem],
        94 => &[Fuel, Trade],
        95 => &[Chem, Farm],
        96 => &[Fuel, Electric, Chem],
        97 => &[Fuel, Machine],
        100 => &[Science, Machine, Steam, Water],
        101 => &[Electric, Machine],
        102 => &[Electric],
        103 => &[Electric, Chem],
        104 => &[Electric, Science],
        105 => &[Electric, Chem],
        106 => &[Electric, Science],
        107 => &[Electric, Compute],
        108 => &[Science, Electric],
        109 => &[Science, Electric],
        110 => &[Science, Record],
        111 => &[Compute, Electric],
        112 => &[Compute],
        113 => &[Compute, Record],
        114 => &[Compute, Machine],
        115 => &[Compute],
        116 => &[Compute, Science],
        117 => &[Compute, Electric],
        118 => &[Compute, Science],
        119 => &[Health, Compute],
        120 => &[Health, Compute],
        121 => &[Compute, Machine],
        122 => &[Compute],
        123 => &[Compute, Electric],
        124 => &[Compute, Record],
        125 => &[Compute, Record],
        130 => &[Farm, Science, Bio],
        131 => &[Bio, Health, Science],
        132 => &[Bio, Chem],
        133 => &[Bio, Farm],
        134 => &[Bio, Compute],
        135 => &[Bio, Space],
        136 => &[Bio, Health],
        137 => &[Bio, Space],
        140 => &[Fuel, Science, Machine],
        141 => &[Science, Compute],
        142 => &[Space],
        143 => &[Space, Science, Electric],
        144 => &[Space, Health],
        145 => &[Space],
        146 => &[Science, Electric],
        147 => &[HighEnergy, Electric],
        148 => &[HighEnergy],
        149 => &[HighEnergy],
        150 => &[Space, Electric],
        151 => &[Space, Science],
        152 => &[Space, Compute],
        153 => &[Space],
        160 => &[Science],
        161 => &[HighEnergy, Space],
        162 => &[HighEnergy],
        163 => &[HighEnergy, Compute],
        164 => &[HighEnergy, Space],
        165 => &[HighEnergy, Space],
        166 => &[Space, HighEnergy],
        167 => &[Space, Machine, Teach],
        _ => &[Craft],
    };
    t.to_vec()
}

// ---------------------------------------------------------------------------
// Rival families and exclusive groups (design chapter 39, sections 1.4 and 2.2)
// ---------------------------------------------------------------------------

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
    id: String,
    name: String,
    kind: String,
    members: Vec<String>,
    #[serde(default)]
    refuted_by: Vec<String>,
    #[serde(default)]
    critical_members: Vec<String>,
}

#[derive(Deserialize)]
struct GroupJson {
    id: String,
    name: String,
    members: Vec<String>,
}

/// Technologies that solve one problem in incompatible ways: building on one makes
/// the others harder to learn (design chapter 39, section 1.4).
#[derive(Clone, Debug)]
pub struct Family {
    pub id: String,
    pub name: String,
    /// "standard", "approach" or "doctrine".
    pub kind: String,
    pub members: Vec<usize>,
    /// Understood refuting nodes each halve what is left of a lock.
    pub refuted_by: Vec<usize>,
}

/// Practices of which a seat may hold at most one (section 2.2).
#[derive(Clone, Debug)]
pub struct ExclusiveGroup {
    pub id: String,
    pub name: String,
    pub members: Vec<usize>,
}

fn families_json() -> FamiliesJson {
    serde_json::from_str(include_str!("../../../content/families.json")).expect("families.json")
}

// ---------------------------------------------------------------------------
// Cultural practices
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PracJson {
    id: String,
    name: String,
    group: String,
    prereq: String,
    requirements: String,
    behavior: String,
    /// Era 0-8 (design chapter 39, section 2.3); costs follow it.
    #[serde(default)]
    era: Option<u8>,
    /// Material preconditions (the `practice_hard` grammar plus `TRAD:<path>`).
    #[serde(default)]
    hard: Option<String>,
    #[serde(default)]
    exclusive: Option<String>,
    #[serde(default)]
    tension: Vec<String>,
    #[serde(default)]
    tradition: Option<String>,
}

/// Display name of an industrial or information tradition (design chapter 37,
/// section 4) by its key in `TRAD:<key>`.
pub fn tradition_name(key: &str) -> &'static str {
    match key {
        "steam" => "Coal and Steam",
        "engine" => "Oil and Engine",
        "wire" => "Current and Wire",
        "atom" => "Atom",
        "network" => "Network",
        "living" => "Living Systems",
        "synthetic" => "Synthetic Minds",
        _ => "unknown",
    }
}

/// Costs of a practice by era (design chapter 39, section 2.3): evidence to
/// recognize, reform work (thousand worker-months), media (lots), minimum months,
/// institutional load. Calibrated (slice 6c): evidence and work of eras 4-8 at
/// 1.5x (era 4) and 2x (eras 5-8) the design's, which every seat met by AD 2300.
pub const PRACTICE_ERA_COSTS: [(i64, i64, f64, i64, i64); 9] = [
    (1_200, 10, 0.0, 24, 0),
    (4_000, 40, 3.0, 60, 0),
    (10_000, 90, 8.0, 60, 0),
    (24_000, 160, 15.0, 72, 1),
    (75_000, 450, 30.0, 84, 1),
    (200_000, 1_100, 55.0, 96, 2),
    (360_000, 1_800, 90.0, 108, 2),
    (600_000, 2_800, 140.0, 120, 3),
    (900_000, 4_000, 200.0, 120, 3),
];

#[derive(Clone, Debug)]
pub struct Practice {
    pub id: String,
    pub name: String,
    pub group: String,
    pub group_ix: u8,
    pub prereq: Req,
    pub hard: Req,
    pub requirements: String,
    pub behavior: String,
    pub work: i64,
    pub cost: Vec<(Good, i64)>,
    pub evidence_needed: i64,
    /// Index into the eight private tendencies that most affects adoption speed.
    pub affinity: usize,
    pub effect: &'static str,
    /// Era 0-8 (design chapter 39, section 2.3).
    pub era: u8,
    /// Minimum months of the reform.
    pub min_months: i64,
    /// Institutional load while established (section 2.3).
    pub load: i64,
    /// Index into [`Content::exclusive_groups`].
    pub exclusive: Option<usize>,
    /// Practices in tension with this one (section 2.2).
    pub tension: Vec<usize>,
    /// A tradition institution (C168-C174): recognizable only under its tradition.
    pub tradition: Option<String>,
    pub critical: bool,
}

/// Material preconditions of a reform. `POP>=n` and `Q:name>=n` count people.
fn practice_hard(id: &str) -> &'static str {
    match id {
        "C004" => "T007",
        "C006" => "T010",
        "C007" => "F:fields | F:pasture",
        "C008" => "T011 & F:fields",
        "C009" => "POP>=400000",
        "C010" => "F:granary",
        "C011" => "POP>=300000",
        "C012" => "CONTACT",
        "C013" => "T025",
        "C014" => "REL & F:holy_site",
        "C015" => "POP>=500000",
        "C016" => "POP>=400000",
        "C017" => "T025 & F:fields",
        "C018" => "F:workshop & Q:artisan>=12000",
        "C019" => "POP>=1500000 & (T021 | T033)",
        "C020" => "T025 & Q:scribe>=4000",
        "C021" => "CONTACT & T026",
        "C022" => "T026",
        "C023" => "T025 & F:lodge & Q:scribe>=4000",
        "C024" => "CONTACT & T030",
        "C025" => "F:school",
        "C026" => "T026 & Q:scribe>=10000 & POP>=1500000",
        "C027" => "F:school & Q:scholar>=4000",
        "C028" => "T030 & F:archive",
        "C029" => "T045 & T040 & T049",
        "C030" => "F:workshop & REG>=2",
        "C031" => "CONTACT",
        "C032" => "F:school & Q:teacher>=10000 & (T030 | T048)",
        "C033" => "T061 | T060",
        "C034" => "POP>=3000000",
        "C035" => "T066",
        "C036" => "F:admin",
        "C037" => "F:barracks & Q:scribe>=10000",
        "C038" => "F:admin",
        "C039" => "F:granary & F:admin",
        "C040" => "F:admin & F:archive",
        "C041" => "F:admin",
        "C042" => "REG>=3",
        "C043" => "CONTACT",
        "C044" => "F:institute | F:laboratory",
        "C045" => "F:institute | F:laboratory",
        "C046" => "F:tech_institute",
        "C047" => "T112 | T113",
        "C048" => "T112",
        "C049" => "T116 & F:datacenter",
        "C050" => "T124 & F:datacenter",
        "C051" => "T116",
        "C052" => "T112",
        "C053" => "T125 & F:datacenter",
        "C054" => "T119",
        "C055" => "T130",
        "C056" => "F:admin & T071",
        "C057" => "T104 & REG>=4",
        "C058" => "T144",
        "C059" => "T122",
        "C060" => "T113 & F:archive",
        "C061" => "REG>=6",
        "C062" => "CONTACT & REG>=6",
        "C063" => "F:barracks & REG>=6",
        "C064" => "T166",
        _ => "",
    }
}

/// Tendency order: Openness, Revisability, Exploration, Agricultural stewardship,
/// Industrial workmanship, Urban organization, Exchange orientation, Martial obligation.
pub const TENDENCY_NAMES: [&str; 8] = [
    "Openness",
    "Revisability",
    "Exploration",
    "Agricultural stewardship",
    "Industrial workmanship",
    "Urban organization",
    "Exchange orientation",
    "Martial obligation",
];
pub const TRAIT_NAMES: [(&str, &str); 8] = [
    ("Outward-looking", "Sustained willingness to admit outsiders and unfamiliar methods."),
    ("Questioning", "Procedures are openly tested and errors reported."),
    ("Venturesome", "People readily join surveys, trials and uncertain journeys."),
    ("Land-keeping", "Close attention to fields, water and seasonal continuity."),
    ("Workshop-oriented", "Craft precision and reliable throughput carry prestige."),
    ("Civic", "Shared services and dense settlement are broadly supported."),
    ("Mercantile", "Trade, bargaining and specialization are ordinary pursuits."),
    ("Martial", "Training and collective defence duties are widely accepted."),
];

fn practice_affinity(id: &str) -> usize {
    let n: u32 = id[1..].parse().unwrap();
    match n {
        12 | 24 | 42 | 43 | 62 => 0,
        28 | 29 | 40 | 44 | 45 | 51 => 1,
        57 | 58 | 64 => 2,
        4 | 6 | 7 | 8 | 10 | 17 | 55 => 3,
        5 | 18 | 30 | 33 | 34 | 35 | 46 => 4,
        15 | 19 | 26 | 32 | 36 | 39 | 52 | 61 => 5,
        21 | 22 | 31 | 47 | 48 => 6,
        16 | 37 | 41 | 63 => 7,
        _ => 5,
    }
}

fn practice_effect(id: &str) -> &'static str {
    match id {
        "C001" => "Lets teaching lodges pass on oral ecology.",
        "C002" => "Care obligations protect infants and elders.",
        "C003" => "A share of spare labour can be called up for common tasks.",
        "C004" => "Stores are shared: shortages are spread instead of starving the poorest first.",
        "C005" => "Enables teaching lodges and craft apprenticeships.",
        "C006" => "Seasonal cooperation raises the labour that can be called up.",
        "C007" => "Fields and pastures can expand beyond a few family plots.",
        "C008" => "Irrigation works can be extended and shared.",
        "C010" => "Disaster granaries: stored food spoils more slowly.",
        "C011" => "Mediation steadies communities and makes simple exchanges credible.",
        "C012" => "Regular contact: foreign methods are noticed sooner.",
        "C013" => "Enables archives and scholarly study.",
        "C014" => "Religious organizations provide relief and teaching.",
        "C015" => "Local mutual aid improves care and stability.",
        "C016" => "Rotating defence duty: barracks and urban-craft levies.",
        "C017" => "Large field systems can be organized.",
        "C018" => "Guild apprenticeships train larger craft classes.",
        "C019" => "Urban public works: sewers and larger towns.",
        "C020" => "Written procedure steadies larger polities.",
        "C021" => "Escrow makes multi-month delivery treaties possible.",
        "C022" => "Joint ventures allow larger enterprises.",
        "C023" => "Enables schools.",
        "C024" => "Foreign records can be translated: licensed knowledge is absorbed faster.",
        "C025" => "Enables technical institutes and examined professions.",
        "C026" => "Enables administrative offices; more labour can be called up.",
        "C027" => "Enables colleges and laboratories.",
        "C028" => "Open criticism: laboratories can operate.",
        "C029" => "With verified methods this completes the scientific method.",
        "C030" => "Evidence crosses between crafts.",
        "C031" => "Knowledge can be licensed by treaty.",
        "C032" => "Public schooling doubles foundational class sizes.",
        "C033" => "Industrial employment allows large works.",
        "C034" => "Collective bargaining steadies industrial populations.",
        "C035" => "Professional enterprises allow the largest works.",
        "C036" => "Public budgets raise callable labour and service scale.",
        "C037" => "Professional command: industrial and later formations.",
        "C039" => "Basic provision keeps services reliable in hard months.",
        "C040" => "Bounded public power steadies large populations.",
        "C041" => "Hierarchical inspection extends administrative reach.",
        "C042" => "Federal contracts: subordination treaties become possible.",
        "C043" => "Standing arrangements: defensive pacts become possible.",
        "C044" => "Research commons allow the largest institutes.",
        "C045" => "Hazard review is required for dangerous engineering.",
        "C046" => "Transition support shortens retraining.",
        "C047" => "Accountable data use enables computing centres at scale.",
        "C049" => "Verified algorithmic advice: automated experiment halls.",
        "C050" => "Bounded algorithmic administration extends administrative reach.",
        "C053" => "An authorized high-autonomy administration greatly extends reach.",
        "C056" => "Intergenerational commitments fund works that take decades.",
        "C057" => "Delegated authority lets distant nodes act under delay.",
        "C058" => "Life-support contracts sustain orbital yards.",
        "C060" => "Recoverable archives protect what has been learned.",
        "C061" => "A constitutional global community can hold highest authority.",
        "C062" => "Negotiated standing institutions can hold highest authority.",
        "C063" => "A unified command government can hold highest authority.",
        "C064" => "A common mission charter binds fleet-wide operations across sites.",
        _ => "",
    }
}

// ---------------------------------------------------------------------------
// Facilities and recipes
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Site {
    Any,
    Arable,
    Pasture,
    Fishery,
    Forest,
    River,
    Coast,
    Hydro,
    /// Warm, wet land fit for spice plantations (`Region.spice_land`).
    SpiceLand,
    Deposit(Deposit),
    TestNode,
    /// Requires another facility in the same region.
    With(&'static str),
}

/// Capacity a facility level provides. `Water`, `Health`, the four `Seats*` kinds
/// and `Barracks` are stated in people; `Storage` in rations; `GenCap` in service
/// base units; the others are indices in thousandths (1000 = one step).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Cap {
    Storage,
    Water,
    Health,
    SeatsLodge,
    SeatsSchool,
    SeatsCollege,
    SeatsInstitute,
    Admin,
    Irrigation,
    GenCap,
    GridLink,
    Transport,
    Port,
    Barracks,
    FtlYard,
    FtlBase,
    Launch,
    OrbitalStation,
    OrbitalYard,
    Sacred,
}

#[derive(Clone, Debug)]
/// One way of running a facility: a production method. Goods, services and
/// research are per level per month at full rate, in base units.
///
/// Where a facility has several, the seat may choose one per region
/// (`Facility::method`); left alone, the works run the first one in the list
/// whose requirement holds and whose inputs are in store. The order of the list
/// is therefore the order of preference of the automatic choice, and a method
/// that trades one scarce thing for another (electricity for coal, compute for
/// hands) is listed after the plain one, so that it runs only when it is chosen
/// or the plain one has nothing to work with.
pub struct Recipe {
    pub key: &'static str,
    pub name: &'static str,
    pub req_src: &'static str,
    pub req: Req,
    /// Share of the facility's general posts this method needs, basis points
    /// (10,000 = all of them).
    pub general_bp: u16,
    /// Qualified posts per level this method needs beside the facility's own, in
    /// people: acceptable qualifications in order of preference.
    pub extra_skilled: Vec<(Vec<Qual>, u32)>,
    pub inputs: Vec<(Good, i64)>,
    pub outputs: Vec<(Good, i64)>,
    pub shaft: i64,
    pub elec: i64,
    pub compute: i64,
    pub out_shaft: i64,
    pub out_elec: i64,
    pub out_compute: i64,
    pub research: Option<(ResearchClass, i64)>,
    /// Extraction recipes draw on this deposit. The output stated is what the
    /// workings raise; `disturb_bp` of it is drawn from the ground, and the ore's
    /// quality decides how much of what is raised is delivered.
    pub depletes: Option<Deposit>,
    /// Tonnes drawn from the deposit for every 10,000 tonnes raised; never below
    /// 10,000. Shallow workings take the easy ore and spoil as much again.
    pub disturb_bp: i64,
    /// Progress toward one jump assembly per month at full rate, in thousandths.
    pub assembly: i64,
    /// Separation at a gas well: helium comes out with the gas raised, at the
    /// field's helium content (`DepositState::helium_bp`), never more than the
    /// stated output.
    pub helium: bool,
    /// The latest era among the technologies the method rests on (set at load).
    pub era: u8,
}

impl Recipe {
    /// Whether the recipe delivers nothing but services, research or assembly progress.
    pub fn service_only(&self) -> bool {
        self.outputs.is_empty()
    }
}

impl FacDef {
    /// General posts of `levels` levels run by a method that needs `general_bp` of
    /// them, in people, rounded up, before any saving from shared support.
    pub fn general_under(&self, general_bp: u16, levels: u32) -> u32 {
        ((self.general as u64 * levels as u64 * general_bp.min(10_000) as u64 + 9_999) / 10_000) as u32
    }
}

/// Mass in kilograms of a list of goods (per level-month when taken from a recipe).
pub fn mass_kg(goods: &[(Good, i64)]) -> i64 {
    goods.iter().map(|(g, a)| a * good_mass_kg(*g)).sum()
}

#[derive(Clone, Debug)]
pub struct FacDef {
    pub key: &'static str,
    pub name: &'static str,
    pub category: &'static str,
    pub desc: &'static str,
    pub req_src: &'static str,
    pub req: Req,
    pub site: Site,
    /// Goods per level, base units.
    pub cost: Vec<(Good, i64)>,
    /// Worker-months per level.
    pub work: i64,
    /// Qualified posts per level, in people: acceptable qualifications in order of preference.
    pub skilled: Vec<(Vec<Qual>, u32)>,
    /// General posts per level, in people.
    pub general: u32,
    pub recipes: Vec<Recipe>,
    /// Goods per level per month, base units.
    pub upkeep: Vec<(Good, i64)>,
    /// Capacity per level; see [`Cap`] for the unit of each kind.
    pub provides: Vec<(Cap, i64)>,
    pub labor: Option<LaborCategory>,
    pub tags: Vec<Tag>,
    pub max_level: u16,
    /// Level caps lifted by established practices: `(cap_without, practice)`.
    pub scale: Vec<(u16, Req, &'static str)>,
    pub food: bool,
    pub power_source: bool,
    /// The works take their material out of the site itself: a deposit, a forest
    /// and its quarries, or the clay under a kiln. Only such works may have a
    /// recipe that puts out goods without goods going in; every other recipe must
    /// take in at least the mass it puts out.
    pub extractive: bool,
    /// Qualified site crew per level under construction, in people: acceptable
    /// qualifications in order of preference. Reserved from the region's qualified
    /// residents while the order is active; they hold no other post meanwhile.
    pub crew: Vec<(Vec<Qual>, u32)>,
    /// Shaft service the site draws per level in a month of full work, base units.
    pub build_power: i64,
    /// Months a level takes at least, whatever is supplied.
    pub build_months: u16,
    /// Building line, stage within it and era of the stage (design chapter 37,
    /// section 8.2): metadata, inert until the building lifecycle (slice 7), and the
    /// era that gates productivity technologies (slice 6).
    pub line: &'static str,
    pub stage: u8,
    pub era: u8,
    /// A land works whose grown output follows the land's yield (design chapter 36,
    /// section 4.1, channel 2): capped at twice its recipe.
    pub land: bool,
}

/// Service a tonne of coal, and of refined fuel, gives when burned in site engines:
/// the conversion of the first steam and combustion engines (units chapter, section 5).
pub const SITE_ENGINE_PER_T_COAL: i64 = 5;
pub const SITE_ENGINE_PER_T_FUEL: i64 = 10;

/// What building one level takes besides goods and work: the qualified site crew,
/// the shaft service drawn in a month of full work (display units) and the
/// minimum months. Classes and magnitudes follow design chapter 35, slice C.
///
/// No entry may be satisfiable only by a qualification whose course cannot be
/// opened before the facility exists; the engine test
/// `no_site_crew_needs_people_who_cannot_exist_yet` walks every chain. Hence:
/// artisans stand in for builders everywhere below the nuclear class, because the
/// starting people include artisans; smiths and artisans stand in for mechanics at
/// every works that can be built before a technical institute trains mechanics,
/// and the institute itself and the other teaching venues need no engineers at
/// all; technicians stand in for electricians until the nuclear class; the launch
/// complex needs no orbital crews (life support is investigated there) and the
/// first station accepts technicians in their place; the jump testbed needs no
/// jump engineers (their course follows from the experiments run there).
fn build_terms(key: &str) -> (Vec<(Vec<Qual>, u32)>, i64, u16) {
    use Qual::*;
    // builders, or artisans doing a builder's work
    const B: &[Qual] = &[Builder, Artisan];
    // millwrights of the first industrial works: mechanics once they exist
    const ME: &[Qual] = &[Mechanic, Smith, Artisan];
    // engineers trained at a technical institute
    const MT: &[Qual] = &[Mechanic, Technician];
    // the first electrical works are wired by whoever understands machines
    const EL1: &[Qual] = &[Electrician, Mechanic, Technician];
    const EL: &[Qual] = &[Electrician, Technician];
    let (crew, power, months): (&[(&[Qual], u32)], f64, u16) = match key {
        // subsistence and simple works: hands and time
        "fields" | "pasture" | "fishery" | "granary" | "camp" | "workshop" | "kiln" | "clinic" | "lodge" | "makers_circle" => (&[], 0.0, 2),
        "quarry" | "salt_pans" | "fibre_farm" | "spice_farm" | "horse_farm" | "weaving" => (&[], 0.0, 2),
        "salt_works" | "nitre_works" | "fine_wares" | "powder_mill" => (&[(B, 500)], 0.0, 3),
        "mine_tin" | "mine_precious" | "mine_bauxite" | "mine_uranium" | "mine_rare_earths" | "mine_cobalt_nickel" | "mine_quartz" => (&[(B, 500)], 0.0, 4),
        "textile_mill" | "consumer_works" | "nitrate_works" | "arsenal" | "brine_works" | "gas_well" => (&[(B, 1_000), (ME, 500)], 5.0, 6),
        "ammonia_plant" | "magnet_works" | "battery_works" => (&[(B, 2_000), (MT, 500)], 10.0, 9),
        "aluminium_smelter" => (&[(B, 2_000), (MT, 500), (EL, 500)], 20.0, 12),
        "fuel_plant" => (&[(&[Builder], 2_000), (&[Technician], 1_000), (&[Scientist], 500)], 50.0, 24),
        "lattice_works" => (&[(&[Builder], 4_000), (&[Technician], 2_000), (&[Scientist], 2_000), (&[FtlEngineer, Scientist], 1_000)], 200.0, 24),
        "holy_site" => (&[], 0.0, 3),
        // civil works and early industry: builders
        "copper_smelter" | "bloomery" | "press" | "instrument_shop" | "archive" | "barracks" => (&[(B, 500)], 0.0, 3),
        "irrigation" | "mine_copper" | "mine_iron" | "mine_coal" | "waterwheel" | "waterworks" | "school" => (&[(B, 500)], 0.0, 4),
        "port" | "admin" | "insulation_works" => (&[(B, 1_000)], 0.0, 5),
        "roads" | "sewers" | "hospital" | "college" | "laboratory" | "tech_institute" => (&[(B, 1_000)], 0.0, 6),
        // industrial works: builders, millwrights and site power
        "oilwell" | "machine_shop" | "parts_works" | "wire_works" => (&[(B, 1_000), (ME, 500)], 5.0, 6),
        "diesel" => (&[(B, 1_000), (ME, 1_000)], 10.0, 8),
        "steelworks" | "chem_plant" | "steam" => (&[(B, 2_000), (ME, 1_000)], 10.0, 9),
        "water_treatment" => (&[(B, 2_000), (ME, 500)], 10.0, 9),
        "institute" => (&[(B, 2_000), (ME, 500)], 5.0, 9),
        "pharma" => (&[(B, 2_000), (MT, 500)], 10.0, 9),
        "depot" => (&[(B, 1_000), (MT, 1_000)], 10.0, 8),
        "rail" => (&[(B, 2_000), (ME, 1_000)], 20.0, 12),
        "refinery" => (&[(B, 2_000), (MT, 1_000)], 20.0, 12),
        // electrical and computing works: builders, engineers and electricians
        "generator" => (&[(B, 1_000), (EL1, 500)], 10.0, 9),
        "grid" => (&[(B, 1_000), (EL, 1_000)], 10.0, 9),
        "datacenter" => (&[(B, 1_000), (MT, 500), (EL, 1_000)], 20.0, 9),
        "computer_works" => (&[(B, 1_000), (MT, 500), (EL, 1_000)], 20.0, 10),
        "synfuel" => (&[(B, 2_000), (MT, 1_000), (EL, 500)], 30.0, 12),
        "food_synthesis" => (&[(B, 2_000), (MT, 1_000), (EL, 500)], 30.0, 12),
        "purifier" => (&[(B, 2_000), (MT, 1_000), (EL, 1_000)], 20.0, 12),
        "fab" => (&[(B, 2_000), (MT, 1_000), (EL, 1_000)], 30.0, 12),
        "advanced_lab" => (&[(B, 2_000), (MT, 1_000), (EL, 1_000)], 20.0, 12),
        "auto_lab" => (&[(B, 2_000), (MT, 1_000), (EL, 2_000)], 30.0, 12),
        "hydro" => (&[(B, 3_000), (ME, 1_000), (EL1, 1_000)], 20.0, 15),
        // nuclear, orbital and jump works: the engineers themselves, and years
        "high_energy" => (&[(&[Builder], 4_000), (&[Technician], 2_000), (&[Electrician], 2_000), (&[Scientist], 1_000)], 100.0, 24),
        "fission" => (&[(&[Builder], 4_000), (&[Technician], 2_000), (&[Electrician], 2_000), (&[Scientist], 1_000)], 100.0, 30),
        "fusion" => (&[(&[Builder], 6_000), (&[Technician], 4_000), (&[Electrician], 4_000), (&[Scientist], 2_000)], 200.0, 36),
        // (slice E: the crews of the launch complex, the orbital yard, the testbed,
        // the lines and the nodes grew with the works they build)
        "launch_complex" => (&[(&[Builder], 8_000), (&[Mechanic], 4_000), (&[Technician], 4_000), (&[Electrician], 2_000), (&[Scientist], 1_000)], 150.0, 24),
        "orbital_station" => (&[(&[Builder], 4_000), (&[Technician], 3_000), (&[Electrician], 2_000), (&[Scientist], 1_000), (&[Orbital, Technician], 4_000)], 150.0, 30),
        "orbital_yard" => (&[(&[Builder], 8_000), (&[Mechanic], 6_000), (&[Technician], 6_000), (&[Electrician], 3_000), (&[Orbital], 8_000)], 300.0, 36),
        "orbital_power" => (&[(&[Builder], 4_000), (&[Technician], 2_000), (&[Electrician], 2_000), (&[Orbital], 2_000)], 150.0, 24),
        "interferometer" => (&[(&[Builder], 2_000), (&[Technician], 2_000), (&[Scientist], 2_000), (&[Orbital], 3_000)], 100.0, 24),
        "jump_testbed" => (&[(&[Builder], 6_000), (&[Technician], 4_000), (&[Electrician], 6_000), (&[Scientist], 4_000), (&[Orbital], 4_000)], 400.0, 36),
        "jump_yard" => (&[(&[Builder], 8_000), (&[Mechanic], 6_000), (&[Technician], 6_000), (&[Electrician], 4_000), (&[FtlEngineer], 4_000)], 400.0, 48),
        "jump_base" => (&[(&[Builder], 4_000), (&[Technician], 3_000), (&[Electrician], 2_000), (&[Orbital], 3_000), (&[FtlEngineer], 2_000)], 200.0, 24),
        // tradition works
        "steam_hammer" | "motor_works" => (&[(B, 1_000), (ME, 500)], 5.0, 6),
        "tramways" => (&[(B, 2_000), (EL, 500)], 10.0, 12),
        "compact_reactor" => (&[(&[Builder], 1_000), (&[Technician], 500), (&[Electrician], 500), (&[Scientist], 200)], 20.0, 24),
        "isotope_works" | "biofoundry" => (&[(B, 1_000), (MT, 500)], 10.0, 9),
        "noc" | "implant_clinic" | "machine_governance" => (&[(B, 1_000), (MT, 500), (EL, 500)], 10.0, 9),
        _ => panic!("no construction terms for {key}"),
    };
    (crew.iter().map(|(qs, n)| (qs.to_vec(), *n)).collect(), m(power), months)
}

impl Cap {
    /// Whether the capacity is a head count.
    pub fn in_people(self) -> bool {
        matches!(self, Cap::Water | Cap::Health | Cap::SeatsLodge | Cap::SeatsSchool | Cap::SeatsCollege | Cap::SeatsInstitute | Cap::Barracks)
    }
}

/// Display units to base units.
fn m(v: f64) -> i64 {
    (v * 1000.0).round() as i64
}

struct RB(Recipe);
fn rec(key: &'static str, name: &'static str) -> RB {
    RB(Recipe {
        key,
        name,
        req_src: "",
        req: Req::True,
        general_bp: 10_000,
        extra_skilled: vec![],
        inputs: vec![],
        outputs: vec![],
        shaft: 0,
        elec: 0,
        compute: 0,
        out_shaft: 0,
        out_elec: 0,
        out_compute: 0,
        research: None,
        depletes: None,
        disturb_bp: 10_000,
        assembly: 0,
        helium: false,
        era: 0,
    })
}
impl RB {
    fn req(mut self, s: &'static str) -> Self {
        self.0.req_src = s;
        self
    }
    fn inp(mut self, v: &[(Good, f64)]) -> Self {
        self.0.inputs = v.iter().map(|(g, a)| (*g, m(*a))).collect();
        self
    }
    fn out(mut self, v: &[(Good, f64)]) -> Self {
        self.0.outputs = v.iter().map(|(g, a)| (*g, m(*a))).collect();
        self
    }
    fn shaft(mut self, v: f64) -> Self {
        self.0.shaft = m(v);
        self
    }
    fn elec(mut self, v: f64) -> Self {
        self.0.elec = m(v);
        self
    }
    fn compute(mut self, v: f64) -> Self {
        self.0.compute = m(v);
        self
    }
    fn gives_shaft(mut self, v: f64) -> Self {
        self.0.out_shaft = m(v);
        self
    }
    fn gives_elec(mut self, v: f64) -> Self {
        self.0.out_elec = m(v);
        self
    }
    fn gives_compute(mut self, v: f64) -> Self {
        self.0.out_compute = m(v);
        self
    }
    fn research(mut self, c: ResearchClass, v: f64) -> Self {
        self.0.research = Some((c, m(v)));
        self
    }
    fn depletes(mut self, d: Deposit) -> Self {
        self.0.depletes = Some(d);
        self
    }
    /// Tonnes drawn from the deposit per tonne raised (at least one).
    fn disturbs(mut self, v: f64) -> Self {
        self.0.disturb_bp = ((v * 10_000.0).round() as i64).max(10_000);
        self
    }
    fn assembly(mut self, v: f64) -> Self {
        self.0.assembly = m(v);
        self
    }
    fn helium(mut self) -> Self {
        self.0.helium = true;
        self
    }
    /// The method needs only this share of the facility's general posts (basis points).
    fn general_bp(mut self, bp: u16) -> Self {
        self.0.general_bp = bp.min(10_000);
        self
    }
    /// `n` further qualified people per level beside the facility's own.
    fn extra(mut self, quals: &[Qual], n: u32) -> Self {
        self.0.extra_skilled.push((quals.to_vec(), n));
        self
    }
}

/// Mechanized workings of a mine: cutting, loading and haulage by engines. They
/// raise what drained deep workings raise and draw the same from the deposit,
/// with half the hands, a thousand mechanics a level and several times the shaft
/// work (which a steam or diesel station turns coal or fuel into).
fn mechanized_workings(ore: Good, raised: f64, deposit: Deposit, shaft: f64) -> RB {
    rec("mechanized", "Mechanized workings").req("T063 & T094").shaft(shaft).out(&[(ore, raised)]).depletes(deposit)
        .general_bp(5_000).extra(&[Qual::Mechanic, Qual::Technician], 1_000)
}

/// Workings on a deposit of the ruleset 3.0 kinds: shallow workings that spoil as
/// much again as they raise, drained deep workings (T063) and mechanized workings
/// (T063 and T094), as for the copper, iron and coal mines. `raised` is what the
/// deep workings raise per level-month, display units.
#[allow(clippy::too_many_arguments)]
fn deposit_works(key: &'static str, name: &'static str, desc: &'static str, req: &'static str, d: Deposit, raised: f64, general: u32, shaft: f64, tags: &[Tag]) -> FB {
    let g = deposit_good(d);
    fac(key, name, "Extraction", desc)
        .req(req).site(Site::Deposit(d)).cost(&[(Good::Materials, 6.0), (Good::Tools, 3.0)]).work(40.0).general(general)
        .recipe(rec("deep", "Drained deep workings").req("T063").shaft(shaft).out(&[(g, raised)]).depletes(d))
        .recipe(rec("shallow", "Shallow workings").out(&[(g, raised / 2.0)]).depletes(d).disturbs(2.0))
        .recipe(mechanized_workings(g, raised, d, shaft * 4.0))
        .upkeep(&[(Good::Tools, 0.5)]).labor(LaborCategory::Extraction).tags(tags).extracts()
}

struct FB(FacDef);
fn fac(key: &'static str, name: &'static str, category: &'static str, desc: &'static str) -> FB {
    FB(FacDef {
        key,
        name,
        category,
        desc,
        req_src: "",
        req: Req::True,
        site: Site::Any,
        cost: vec![],
        work: m(10.0),
        skilled: vec![],
        general: 0,
        recipes: vec![],
        upkeep: vec![],
        provides: vec![],
        labor: None,
        tags: vec![],
        max_level: 40,
        scale: vec![],
        food: false,
        power_source: false,
        extractive: false,
        crew: vec![],
        build_power: 0,
        build_months: 2,
        line: "",
        stage: 0,
        era: 0,
        land: false,
    })
}
impl FB {
    fn req(mut self, s: &'static str) -> Self {
        self.0.req_src = s;
        self
    }
    fn site(mut self, s: Site) -> Self {
        self.0.site = s;
        self
    }
    fn cost(mut self, v: &[(Good, f64)]) -> Self {
        self.0.cost = v.iter().map(|(g, a)| (*g, m(*a))).collect();
        self
    }
    fn work(mut self, v: f64) -> Self {
        self.0.work = m(v);
        self
    }
    /// `n` qualified people per level.
    fn skilled(mut self, quals: &[Qual], n: u32) -> Self {
        self.0.skilled.push((quals.to_vec(), n));
        self
    }
    /// `n` people in general posts per level.
    fn general(mut self, n: u32) -> Self {
        self.0.general = n;
        self
    }
    fn recipe(mut self, r: RB) -> Self {
        self.0.recipes.push(r.0);
        self
    }
    fn upkeep(mut self, v: &[(Good, f64)]) -> Self {
        self.0.upkeep = v.iter().map(|(g, a)| (*g, m(*a))).collect();
        self
    }
    fn provides(mut self, c: Cap, v: f64) -> Self {
        debug_assert!(!c.in_people());
        self.0.provides.push((c, m(v)));
        self
    }
    /// Capacity for `n` people per level (water, care, teaching places, barracks).
    fn people(mut self, c: Cap, n: i64) -> Self {
        debug_assert!(c.in_people());
        self.0.provides.push((c, n));
        self
    }
    fn labor(mut self, l: LaborCategory) -> Self {
        self.0.labor = Some(l);
        self
    }
    fn tags(mut self, t: &[Tag]) -> Self {
        self.0.tags = t.to_vec();
        self
    }
    fn max(mut self, n: u16) -> Self {
        self.0.max_level = n;
        self
    }
    fn scale(mut self, cap: u16, practice: &'static str) -> Self {
        self.0.scale.push((cap, Req::True, practice));
        self
    }
    fn food(mut self) -> Self {
        self.0.food = true;
        self
    }
    fn power(mut self) -> Self {
        self.0.power_source = true;
        self
    }
    /// The works take their material out of the site (see `FacDef::extractive`).
    fn extracts(mut self) -> Self {
        self.0.extractive = true;
        self
    }
    /// A land works: it grows its output and takes it out of the site.
    fn grows(mut self) -> Self {
        self.0.extractive = true;
        self.0.land = true;
        self
    }
}

fn facilities() -> Vec<FacDef> {
    use Good::*;
    use LaborCategory as L;
    use Qual as Q;
    use ResearchClass as RC;
    let craft_any = [Q::Artisan, Q::Lorekeeper, Q::Smith, Q::Builder, Q::Agronomist, Q::Navigator, Q::Tallier];
    let v = vec![
        // ---- food -------------------------------------------------------
        fac("fields", "Fields", "Food", "Cleared and tended plots. Ten thousand cultivators work each level; yield depends on seed, traction, water and inputs actually supplied, and falls by three tenths when no tools are in store.")
            .req("T005").site(Site::Arable).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(24.0).general(10_000)
            .tags(&[Tag::Farm]).max(250).scale(4, "C007").scale(14, "C017").scale(20, "T056").food(),
        fac("pasture", "Pastures", "Food", "Managed herds on rough grazing. Animals also provide traction once the methods are known.")
            .req("T006").site(Site::Pasture).cost(&[(Materials, 2.0)]).work(16.0).general(5_000)
            .tags(&[Tag::Farm, Tag::Forage]).scale(4, "C007").food(),
        fac("fishery", "Fishing grounds", "Food", "Nets, weirs and boats working a stretch of coast or river.")
            .req("T004").site(Site::Fishery).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(12.0).general(8_000)
            .tags(&[Tag::Forage, Tag::Sea]).food(),
        fac("granary", "Granaries", "Food", "Dry stores with custodians. Each level keeps 2.5 million rations and slows spoilage.")
            .req("T007").cost(&[(Materials, 6.0)]).work(20.0).general(1_000).provides(Cap::Storage, 2500.0)
            .labor(L::Services).tags(&[Tag::Farm, Tag::Record]),
        fac("irrigation", "Irrigation works", "Food", "Channels and gates. Each level waters five levels of fields.")
            .req("T011").site(Site::River).cost(&[(Materials, 8.0), (Tools, 1.0)]).work(40.0).general(1_000)
            .provides(Cap::Irrigation, 5.0).labor(L::Services).tags(&[Tag::Water, Tag::Farm]).scale(1, "C008"),
        // ---- extraction -------------------------------------------------
        // ruleset 3.0 splits timber from building materials (design chapter 36, 5.2)
        fac("camp", "Forestry camps", "Extraction", "Felling and hauling timber within what the forest renews: fuel for furnaces, ships, handles and frames.")
            .site(Site::Forest).cost(&[(Tools, 1.0)]).work(8.0).general(8_000)
            .recipe(rec("timber", "Felling").out(&[(Timber, 12.0)]))
            .upkeep(&[(Tools, 0.25)]).labor(L::Extraction).tags(&[Tag::Craft, Tag::Build]).grows(),
        fac("quarry", "Quarries and clay pits", "Extraction", "Stone, clay and sand dug wherever the ground allows: building material for everything that is built.")
            .cost(&[(Tools, 1.0)]).work(8.0).general(8_000)
            .recipe(rec("materials", "Stone, clay and sand").out(&[(Materials, 16.0)]))
            .upkeep(&[(Tools, 0.25)]).labor(L::Extraction).tags(&[Tag::Craft, Tag::Build]).extracts(),
        fac("salt_works", "Salt works", "Extraction", "Rock salt and brine springs on a known salt deposit. Salt keeps stored food from spoiling.")
            .req("T007").site(Site::Deposit(Deposit::Salt)).cost(&[(Materials, 4.0), (Tools, 1.0)]).work(20.0).general(6_000)
            .recipe(rec("salt", "Salt working").out(&[(Salt, 8.0)]).depletes(Deposit::Salt))
            .upkeep(&[(Tools, 0.2)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Farm]).extracts(),
        fac("salt_pans", "Coastal salt pans", "Extraction", "Sea water evaporated in shallow pans: a little salt that never runs out.")
            .req("T007").site(Site::Coast).cost(&[(Materials, 2.0)]).work(8.0).general(1_000)
            .recipe(rec("sea_salt", "Evaporation").out(&[(Salt, 0.5)]))
            .labor(L::Extraction).tags(&[Tag::Sea, Tag::Farm]).max(20).extracts(),
        fac("fibre_farm", "Fibre plantations", "Extraction", "Flax, hemp and cotton on arable land: the raw fibre of cloth, taken from the same land as the fields.")
            .req("T004 & T005").site(Site::Arable).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(20.0).general(8_000)
            .recipe(rec("fibre", "Fibre crops").out(&[(Fibres, 2.0)]))
            .labor(L::Extraction).tags(&[Tag::Farm, Tag::Craft]).grows(),
        fac("spice_farm", "Spice plantations", "Extraction", "Pepper, tea, cane and dyes on warm, wet land: luxuries every people prizes.")
            .req("T005").site(Site::SpiceLand).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(20.0).general(8_000)
            .recipe(rec("spices", "Spice crops").out(&[(Spices, 0.5)]))
            .labor(L::Extraction).tags(&[Tag::Farm, Tag::Trade]).grows(),
        fac("horse_farm", "Horse breeding", "Extraction", "Studs and herds on grazing land: draught animals for fields and roads, mounts for armies. Shares the pasture with the herds.")
            .req("T006").site(Site::Pasture).cost(&[(Materials, 2.0)]).work(16.0).general(5_000)
            .recipe(rec("horses", "Breeding").out(&[(Horses, 0.3)]))
            .labor(L::Extraction).tags(&[Tag::Farm]).grows(),
        fac("mine_copper", "Copper mines", "Extraction", "Workings on a surveyed copper orebody. Every tonne raised comes out of the deposit; shallow workings spoil as much again, drained deep workings do not.")
            .req("T014").site(Site::Deposit(Deposit::CopperOre)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12_000)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(CopperOre, 36.0)]).depletes(Deposit::CopperOre))
            .recipe(rec("shallow", "Shallow workings").out(&[(CopperOre, 18.0)]).depletes(Deposit::CopperOre).disturbs(2.0))
            .recipe(mechanized_workings(CopperOre, 36.0, Deposit::CopperOre, 40.0))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine]).extracts(),
        fac("mine_iron", "Iron mines", "Extraction", "Workings on a surveyed iron orebody. Every tonne raised comes out of the deposit; shallow workings spoil as much again, drained deep workings do not.")
            .req("T014").site(Site::Deposit(Deposit::IronOre)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12_000)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(IronOre, 36.0)]).depletes(Deposit::IronOre))
            .recipe(rec("shallow", "Shallow workings").out(&[(IronOre, 18.0)]).depletes(Deposit::IronOre).disturbs(2.0))
            .recipe(mechanized_workings(IronOre, 36.0, Deposit::IronOre, 40.0))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine]).extracts(),
        fac("mine_coal", "Coal pits", "Extraction", "Coal workings. Every tonne raised comes out of the seam; shallow pits spoil as much again, drained deep workings do not.")
            .req("T014").site(Site::Deposit(Deposit::Coal)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12_000)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(Coal, 36.0)]).depletes(Deposit::Coal))
            .recipe(rec("shallow", "Shallow workings").out(&[(Coal, 18.0)]).depletes(Deposit::Coal).disturbs(2.0))
            .recipe(mechanized_workings(Coal, 36.0, Deposit::Coal, 40.0))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Steam]).extracts(),
        deposit_works("mine_tin", "Tin mines", "Workings on a rare tin lode: the other half of bronze.", "T014", Deposit::Tin, 3.0, 8_000, 4.0, &[Tag::Mine, Tag::Metal]),
        deposit_works("mine_precious", "Precious-metal mines", "Gold and silver workings: luxury, fine wares and, much later, the contacts of electronics.", "T014", Deposit::Precious, 0.004, 6_000, 2.0, &[Tag::Mine, Tag::Trade]),
        deposit_works("mine_bauxite", "Bauxite mines", "Open workings on a bauxite deposit: the ore of aluminium.", "T103", Deposit::Bauxite, 24.0, 10_000, 10.0, &[Tag::Mine, Tag::Electric]),
        deposit_works("mine_uranium", "Uranium mines", "Workings on a uranium orebody under safeguards.", "T146", Deposit::UraniumOre, 0.8, 6_000, 4.0, &[Tag::Mine, Tag::HighEnergy]),
        deposit_works("mine_rare_earths", "Rare-earth workings", "Workings on a rare-earth orebody: magnets and lasers.", "T043 | T103", Deposit::RareEarths, 2.0, 8_000, 6.0, &[Tag::Mine, Tag::Chem]),
        deposit_works("mine_cobalt_nickel", "Cobalt and nickel mines", "Workings on a cobalt-nickel orebody: alloy steel and batteries.", "T060", Deposit::CobaltNickel, 2.0, 8_000, 6.0, &[Tag::Mine, Tag::Metal]),
        deposit_works("mine_quartz", "Quartz quarries", "Quarries of high-purity quartz: semiconductors and optics.", "T103", Deposit::Quartz, 4.0, 6_000, 6.0, &[Tag::Mine, Tag::Electric]),
        fac("nitre_works", "Nitre works", "Extraction", "Saltpetre leached from a known nitre deposit: powder for guns, nitrate for fields.")
            .req("T036").site(Site::Deposit(Deposit::Saltpetre)).cost(&[(Materials, 4.0), (Tools, 2.0)]).work(30.0).general(6_000)
            .recipe(rec("saltpetre", "Leaching").out(&[(Saltpetre, 2.0)]).depletes(Deposit::Saltpetre))
            .upkeep(&[(Tools, 0.3)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Chem]).extracts(),
        fac("brine_works", "Lithium brine works", "Extraction", "Evaporation ponds on an arid basin's brine: lithium for batteries and fusion fuel.")
            .req("T105").site(Site::Deposit(Deposit::Lithium)).cost(&[(Metal, 4.0), (Components, 1.0), (Materials, 6.0)]).work(60.0)
            .skilled(&[Q::Technician, Q::Mechanic], 500).general(2_000)
            .recipe(rec("lithium", "Brine evaporation").shaft(4.0).out(&[(Lithium, 0.5)]).depletes(Deposit::Lithium))
            .upkeep(&[(Spares, 0.1)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Chem]).extracts(),
        fac("gas_well", "Gas wells", "Extraction", "Wells and gathering lines on a known gas field; with cryogenic separation, helium from helium-rich gas.")
            .req("T090").site(Site::Deposit(Deposit::Gas)).cost(&[(Metal, 6.0), (Components, 2.0), (Tools, 2.0)]).work(60.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 1_000).general(4_000)
            .recipe(rec("separation", "Gas with helium separation").req("T108").shaft(6.0).elec(20.0).out(&[(Gas, 30.0), (Helium, 0.45)]).depletes(Deposit::Gas).helium())
            .recipe(rec("gas", "Gas extraction").shaft(6.0).out(&[(Gas, 30.0)]).depletes(Deposit::Gas))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Fuel]).extracts(),
        fac("oilwell", "Oil wells", "Extraction", "Drilled wells and gathering lines on a known field. Every tonne pumped comes out of the field.")
            .req("T090").site(Site::Deposit(Deposit::Crude)).cost(&[(Metal, 6.0), (Components, 2.0), (Tools, 2.0)]).work(60.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 1_000).general(6_000)
            .recipe(rec("crude", "Crude extraction").shaft(6.0).out(&[(Crude, 30.0)]).depletes(Deposit::Crude))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Fuel]).extracts(),
        // ---- craft and industry ----------------------------------------
        fac("workshop", "Craft workshops", "Industry", "Toolmakers. Better metal gives more and better tools from the same hands.")
            .cost(&[(Materials, 4.0)]).work(14.0).skilled(&[Q::Artisan], 2_000).general(4_000)
            .recipe(rec("iron_tools", "Iron tools").req("T023").inp(&[(Metal, 1.5), (Timber, 2.0)]).out(&[(Tools, 12.0)]))
            // bronze (design chapter 36, 5.4): copper alloyed with a little tin makes
            // half as many tools again as soft copper; copper tools are its substitute
            .recipe(rec("bronze_tools", "Bronze tools").req("T022").inp(&[(Copper, 1.4), (Tin, 0.2), (Timber, 2.0)]).out(&[(Tools, 9.0)]))
            .recipe(rec("copper_tools", "Copper tools").req("T015").inp(&[(Copper, 1.5), (Timber, 2.0)]).out(&[(Tools, 6.0)]))
            .recipe(rec("stone_tools", "Stone, bone and wood tools").inp(&[(Materials, 4.0)]).out(&[(Tools, 5.0)]))
            .labor(L::Industry).tags(&[Tag::Craft]).scale(3, "C018").scale(10, "C022"),
        fac("kiln", "Kilns", "Industry", "Fired brick, tile and vessels from clay dug at the works: building material without a forest.")
            .req("T008").cost(&[(Materials, 5.0)]).work(16.0).skilled(&[Q::Artisan], 1_000).general(5_000)
            .recipe(rec("brick", "Fired building material").out(&[(Materials, 15.0)]))
            .upkeep(&[(Tools, 0.2)]).labor(L::Industry).tags(&[Tag::Craft, Tag::Build]).extracts(),
        fac("copper_smelter", "Copper furnaces", "Industry", "Charcoal furnaces reducing copper ore.")
            .req("T015").cost(&[(Materials, 8.0), (Tools, 2.0)]).work(30.0).skilled(&[Q::Smith, Q::Artisan], 2_000).general(4_000)
            .recipe(rec("copper", "Copper smelting").inp(&[(CopperOre, 8.0), (Timber, 4.0)]).out(&[(Copper, 4.0)]))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Metal]),
        fac("bloomery", "Iron bloomeries", "Industry", "Small furnaces and forges turning ore into workable iron.")
            .req("T023").cost(&[(Materials, 8.0), (Tools, 2.0)]).work(30.0).skilled(&[Q::Smith, Q::Artisan], 2_000).general(4_000)
            .recipe(rec("iron", "Bloomery iron").inp(&[(IronOre, 8.0), (Timber, 6.0)]).out(&[(Metal, 4.0)]))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Metal]),
        fac("steelworks", "Steelworks", "Industry", "Coke furnaces and controlled steelmaking at scale.")
            .req("T060").cost(&[(Metal, 20.0), (Materials, 20.0), (Tools, 5.0)]).work(160.0)
            .skilled(&[Q::Smith, Q::Mechanic], 4_000).general(12_000)
            // Coal and Steam (design chapter 37, section 4.1): coke ovens that recover
            // their tar - a little more coal, the same steel and chemicals besides
            .recipe(rec("tar_recovery", "Coke steel with tar recovery").req("T274 & TRAD:steam").inp(&[(IronOre, 40.0), (Coal, 22.0)]).out(&[(Metal, 30.0), (Chemicals, 3.0)]).shaft(12.0))
            .recipe(rec("steel", "Coke steel").inp(&[(IronOre, 40.0), (Coal, 20.0)]).out(&[(Metal, 30.0)]).shaft(10.0))
            // electric furnaces: the same steel from the same ore, with a fifth of the
            // coal (the carbon of the charge) and 150 units of electricity in place of
            // the rest and of the blowing engines. Made from coal in turbines and
            // generator halls, that electricity costs as much coal as it saves; from
            // falling water or a reactor it frees the coal. Fewer hands, more electricians.
            // Current and Wire: the same furnaces one technology early
            .recipe(rec("arc_early", "Early electric-arc furnaces").req("T287 & TRAD:wire").inp(&[(IronOre, 40.0), (Coal, 4.0)]).out(&[(Metal, 30.0)]).elec(150.0)
                .general_bp(7_000).extra(&[Q::Electrician, Q::Technician], 1_000))
            .recipe(rec("electric", "Electric steelmaking").req("T103").inp(&[(IronOre, 40.0), (Coal, 4.0)]).out(&[(Metal, 30.0)]).elec(150.0)
                .general_bp(7_000).extra(&[Q::Electrician, Q::Technician], 1_000))
            .upkeep(&[(Tools, 1.5)]).labor(L::Industry).tags(&[Tag::Metal, Tag::Machine]).scale(2, "C033").scale(6, "C035"),
        fac("machine_shop", "Machine shops", "Industry", "Standardized machine tools cutting components to gauge. Needs shaft power.")
            .req("T061").cost(&[(Metal, 12.0), (Tools, 6.0), (Materials, 8.0)]).work(120.0)
            .skilled(&[Q::Mechanic, Q::Artisan, Q::Smith], 4_000).general(6_000)
            .recipe(rec("components", "Precision machining").inp(&[(Metal, 12.5), (Tools, 1.0)]).out(&[(Components, 10.0)]).shaft(30.0))
            // programmed machines: the same components from the same metal, a little
            // less tool wear, electric drives and compute in place of four tenths of
            // the hands, and programmers and technicians to keep them cutting
            .recipe(rec("nc", "Numerically controlled machining").req("T114").inp(&[(Metal, 12.5), (Tools, 0.8)]).out(&[(Components, 10.0)]).elec(40.0).compute(20.0)
                .general_bp(6_000).extra(&[Q::Programmer, Q::Technician], 500).extra(&[Q::Technician, Q::Electrician], 500))
            // Synthetic Minds: lights-out cells, seven tenths of the hands replaced by
            // electricity and compute (chosen, never automatic)
            .recipe(rec("lights_out", "Lights-out machining").req("T319 & TRAD:synthetic").inp(&[(Metal, 12.5), (Tools, 0.8)]).out(&[(Components, 10.0)]).elec(100.0).compute(60.0)
                .general_bp(1_800).extra(&[Q::Programmer, Q::Technician], 500).extra(&[Q::AiEngineer, Q::Programmer], 300))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Machine]).scale(2, "C033").scale(6, "C035"),
        fac("parts_works", "Parts and repair works", "Industry", "Spares, lubricants and filters matched to the machines that need them.")
            .req("T066").cost(&[(Metal, 8.0), (Components, 3.0), (Tools, 4.0)]).work(90.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2_000).general(3_000)
            .recipe(rec("spares", "Maintenance inputs").inp(&[(Components, 3.0), (Tools, 0.5)]).out(&[(Spares, 12.0)]).shaft(4.0))
            .labor(L::Industry).tags(&[Tag::Machine]),
        fac("wire_works", "Copper refinery and wire works", "Industry", "Refined copper drawn into conductor of known quality.")
            .req("T054").cost(&[(Metal, 8.0), (Tools, 4.0), (Materials, 8.0)]).work(90.0)
            .skilled(&[Q::Electrician, Q::Smith, Q::Artisan], 2_000).general(4_000)
            .recipe(rec("electrolytic", "Electrolytic refining and drawing").req("T103").inp(&[(Copper, 11.0), (Chemicals, 0.5)]).out(&[(Conductors, 10.0)]).elec(10.0))
            .recipe(rec("drawn", "Fire-refined drawn wire").inp(&[(Copper, 12.0), (Materials, 2.0)]).out(&[(Conductors, 6.0)]).shaft(4.0))
            .upkeep(&[(Tools, 0.5)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Metal]),
        fac("chem_plant", "Chemical works", "Industry", "Controlled processes producing reagents, acids, alkalis and nutrients.")
            .req("T064").cost(&[(Metal, 15.0), (Components, 4.0), (Materials, 10.0)]).work(140.0)
            .skilled(&[Q::Technician, Q::Scholar, Q::Researcher], 2_000).general(6_000)
            .recipe(rec("chemicals", "Industrial chemicals").inp(&[(Coal, 6.0), (Materials, 4.0)]).out(&[(Chemicals, 10.0)]).shaft(6.0))
            .recipe(rec("chemicals_wood", "Wood and mineral chemistry").inp(&[(Timber, 10.0), (Materials, 4.0)]).out(&[(Chemicals, 5.0)]).shaft(4.0))
            .upkeep(&[(Tools, 0.8)]).labor(L::Industry).tags(&[Tag::Chem]).scale(3, "C033"),
        fac("insulation_works", "Insulation and seal works", "Industry", "Ceramic, rubber and polymer parts with known thermal and electrical limits.")
            .req("T031 | T064").cost(&[(Metal, 6.0), (Materials, 10.0), (Tools, 3.0)]).work(80.0)
            .skilled(&[Q::Technician, Q::Artisan], 2_000).general(4_000)
            // eight parts of polymer carry three of mineral filler: ten tonnes out of eleven in
            .recipe(rec("polymer", "Polymer insulation").req("T093").inp(&[(Chemicals, 8.0), (Materials, 3.0)]).out(&[(Insulation, 10.0)]).shaft(4.0))
            .recipe(rec("ceramic", "Ceramic and natural insulation").inp(&[(Materials, 12.0)]).out(&[(Insulation, 4.0)]))
            .upkeep(&[(Tools, 0.4)]).labor(L::Industry).tags(&[Tag::Chem, Tag::Craft]),
        fac("refinery", "Refinery", "Industry", "Fractionation with composition checks: fuel of known quality plus chemical feedstock.")
            .req("T090").cost(&[(Metal, 25.0), (Components, 8.0), (Materials, 10.0)]).work(200.0)
            .skilled(&[Q::Technician, Q::Mechanic], 2_000).general(6_000)
            // Oil and Engine: cracking turns more of the barrel into fuel
            .recipe(rec("cracking", "Cracking and high-octane refining").req("T278 & TRAD:engine").inp(&[(Crude, 20.0)]).out(&[(Fuel, 13.0), (Chemicals, 5.0)]).shaft(6.0))
            .recipe(rec("refine", "Fractionation").inp(&[(Crude, 20.0)]).out(&[(Fuel, 11.0), (Chemicals, 7.0)]).shaft(4.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Chem]),
        fac("synfuel", "Synthetic fuel plant", "Industry", "Fuel from coal and electricity when wells are out of reach.")
            .req("T096").cost(&[(Metal, 40.0), (Components, 20.0), (Conductors, 6.0)]).work(400.0)
            .skilled(&[Q::Technician], 4_000).general(6_000)
            .recipe(rec("synfuel", "Synthetic hydrocarbons").inp(&[(Coal, 10.0), (Chemicals, 2.0)]).out(&[(Fuel, 12.0)]).elec(60.0))
            .upkeep(&[(Spares, 0.8)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Chem]),
        // ruleset 3.0 (design chapter 36, section 3.3): food from electricity, chemicals
        // and the carbon of the air (a declared atmospheric-input recipe), not limited by land
        fac("food_synthesis", "Food synthesis works", "Industry", "Food made from electricity, chemicals and the carbon of the air: not limited by land, only by power and inputs. Two hundred thousand rations a month per level.")
            .req("T132 & T135").cost(&[(Metal, 30.0), (Components, 15.0), (Conductors, 6.0), (Instruments, 4.0)]).work(400.0)
            .skilled(&[Q::Technician], 2_000).general(2_000)
            .recipe(rec("food_synthesis", "Atmospheric food synthesis").inp(&[(Chemicals, 4.0)]).out(&[(Food, 200.0)]).elec(400.0))
            .upkeep(&[(Spares, 0.5)]).labor(L::Industry).tags(&[Tag::Chem, Tag::Bio]),
        fac("purifier", "High-purity materials works", "Industry", "Electrochemical purification into substrates that ordinary glass or metal cannot replace.")
            .req("T103").cost(&[(Metal, 20.0), (Components, 10.0), (Conductors, 6.0), (Instruments, 4.0)]).work(300.0)
            .skilled(&[Q::Technician], 3_000).general(3_000)
            .recipe(rec("substrate", "Semiconductor materials from quartz").inp(&[(Quartz, 4.0), (Chemicals, 1.0)]).out(&[(Substrate, 2.0)]).elec(30.0))
            // the substitute without quartz: metallurgical silicon refined twice
            .recipe(rec("metallurgical", "Twice-refined metallurgical silicon").inp(&[(Materials, 8.0), (Chemicals, 3.0)]).out(&[(Substrate, 2.0)]).elec(90.0))
            .upkeep(&[(Spares, 0.5)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Chem]),
        fac("fab", "Electronics cells", "Industry", "Clean manufacturing cells for electronic devices.")
            .req("T104 | T106").cost(&[(Metal, 10.0), (Components, 20.0), (Conductors, 6.0), (Instruments, 5.0)]).work(400.0)
            .skilled(&[Q::Technician, Q::Electrician], 4_000).general(4_000)
            .recipe(rec("integrated", "Integrated devices").req("T106").inp(&[(Substrate, 0.4), (Conductors, 0.6), (Chemicals, 0.5), (Precious, 0.005)]).out(&[(Electronics, 20.0)]).elec(40.0))
            .recipe(rec("vacuum", "Vacuum devices").req("T104").inp(&[(Conductors, 1.0), (Insulation, 0.5), (Components, 0.5)]).out(&[(Electronics, 4.0)]).elec(15.0))
            .upkeep(&[(Spares, 0.8)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Compute]),
        fac("computer_works", "Computer works", "Industry", "Assembly and acceptance testing of computing hardware.")
            .req("T111").cost(&[(Metal, 10.0), (Components, 10.0), (Electronics, 10.0)]).work(250.0)
            .skilled(&[Q::Technician, Q::Programmer, Q::Electrician], 3_000).general(3_000)
            .recipe(rec("hardware", "Hardware assembly").inp(&[(Electronics, 16.0), (Components, 1.2), (Conductors, 0.4), (Insulation, 0.2)]).out(&[(Hardware, 4.0)]).elec(8.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Compute]),
        fac("datacenter", "Computing centre", "Industry", "Installed hardware delivering compute as a monthly service. Compute cannot be stored.")
            .req("T111").cost(&[(Hardware, 10.0), (Components, 4.0), (Conductors, 2.0)]).work(200.0)
            .skilled(&[Q::Programmer, Q::Technician], 4_000)
            .recipe(rec("cluster", "Accelerator clusters").req("T117").gives_compute(300.0).elec(60.0))
            .recipe(rec("mainframes", "Programmable computers").gives_compute(100.0).elec(30.0))
            .upkeep(&[(Spares, 0.5), (Hardware, 0.1)]).labor(L::Industry).tags(&[Tag::Compute]).scale(2, "C047"),
        fac("press", "Scriptorium and press", "Industry", "Durable record media, teaching texts and, later, inexpensive print.")
            .req("T025").cost(&[(Materials, 6.0), (Tools, 1.0)]).work(20.0)
            .skilled(&[Q::Scribe, Q::Literate], 2_000).general(2_000)
            .recipe(rec("print", "Scaled printing").req("T048").inp(&[(Materials, 4.0)]).out(&[(Media, 24.0)]))
            .recipe(rec("copying", "Teaching-text reproduction").req("T030").inp(&[(Materials, 2.0)]).out(&[(Media, 8.0)]))
            .recipe(rec("writing", "Written records").inp(&[(Materials, 1.0)]).out(&[(Media, 3.0)]))
            .labor(L::Industry).tags(&[Tag::Record, Tag::Teach]),
        fac("instrument_shop", "Instrument makers", "Industry", "Balances, gauges, optics and clocks: the equipment that makes measurement repeatable.")
            .req("T040").cost(&[(Materials, 8.0), (Tools, 4.0)]).work(50.0)
            .skilled(&[Q::Artisan, Q::Technician], 3_000)
            // five thousand sets weigh 2 kt: the metal and tooling of the plainer
            // instruments plus half a kilotonne of glass and fittings
            .recipe(rec("precision", "Precision instruments").req("T044").inp(&[(Metal, 1.5), (Tools, 1.0), (Materials, 0.5)]).out(&[(Instruments, 5.0)]))
            .recipe(rec("basic_metal", "Measuring instruments").inp(&[(Metal, 1.5), (Tools, 1.0)]).out(&[(Instruments, 3.0)]))
            .recipe(rec("basic_copper", "Copper measuring instruments").inp(&[(Copper, 1.0), (Tools, 1.0)]).out(&[(Instruments, 2.0)]))
            .labor(L::Industry).tags(&[Tag::Measure, Tag::Craft]),
        fac("pharma", "Pharmaceutical and biological works", "Industry", "Medicines and, with controlled organisms, a wider range of biological products.")
            .req("T070 | T132").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 4.0)]).work(200.0)
            .skilled(&[Q::Physician, Q::Technician], 2_000).general(4_000)
            .recipe(rec("bio", "Controlled biological manufacture").req("T132").inp(&[(Food, 10.0), (Chemicals, 1.0)]).out(&[(Medicine, 30.0)]).elec(20.0))
            .recipe(rec("pharma", "Pharmaceutical manufacture").inp(&[(Chemicals, 4.0), (Food, 4.0)]).out(&[(Medicine, 10.0)]))
            .upkeep(&[(Spares, 0.3)]).labor(L::Industry).tags(&[Tag::Bio, Tag::Health, Tag::Chem]),
        // ---- ruleset 3.0 chains (design chapter 36, section 5.4) ----------
        fac("weaving", "Weaving workshops", "Industry", "Hand looms turning fibre into cloth: the first industry of every people.")
            .req("T004").cost(&[(Materials, 3.0), (Timber, 1.0)]).work(14.0).skilled(&[Q::Artisan], 1_000).general(6_000)
            .recipe(rec("hand_looms", "Hand looms").inp(&[(Fibres, 1.1)]).out(&[(Textiles, 100.0)]))
            .upkeep(&[(Tools, 0.1)]).labor(L::Industry).tags(&[Tag::Craft]),
        fac("textile_mill", "Textile mills", "Industry", "Powered spinning and weaving: the same cloth from a fifth of the hands.")
            .req("T062").cost(&[(Metal, 8.0), (Components, 2.0), (Materials, 8.0)]).work(90.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 500).general(1_200)
            .recipe(rec("synthetic", "Synthetic fibre").req("T093").inp(&[(Chemicals, 1.2)]).out(&[(Textiles, 100.0)]).elec(30.0)
                .general_bp(8_400).extra(&[Q::Technician, Q::Mechanic], 500))
            .recipe(rec("mill", "Powered looms").inp(&[(Fibres, 1.1)]).out(&[(Textiles, 100.0)]).shaft(20.0))
            .upkeep(&[(Spares, 0.1)]).labor(L::Industry).tags(&[Tag::Machine, Tag::Craft]).scale(3, "C033"),
        fac("powder_mill", "Powder works", "Industry", "Saltpetre, charcoal and sulphur ground and corned into gunpowder, and the shot to go with it.")
            .req("T036").cost(&[(Materials, 6.0), (Timber, 2.0), (Tools, 2.0)]).work(30.0).skilled(&[Q::Artisan, Q::Smith], 1_000).general(3_000)
            .recipe(rec("powder", "Gunpowder and shot").inp(&[(Saltpetre, 0.6), (Timber, 0.2)]).out(&[(Munitions, 15.0)]))
            .upkeep(&[(Tools, 0.2)]).labor(L::Industry).tags(&[Tag::War, Tag::Chem]),
        fac("arsenal", "Arsenal", "Industry", "Chemical propellants and machined cartridges and shells at industrial scale.")
            .req("T064").cost(&[(Metal, 10.0), (Components, 3.0), (Materials, 8.0)]).work(100.0)
            .skilled(&[Q::Technician, Q::Mechanic], 1_000).general(2_000)
            .recipe(rec("cartridges", "Propellant and ammunition").inp(&[(Chemicals, 0.5), (Metal, 0.3)]).out(&[(Munitions, 15.0)]).shaft(10.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::War, Tag::Chem]),
        fac("nitrate_works", "Nitrate fertilizer works", "Industry", "Saltpetre refined into field nitrate: the first manufactured fertilizer.")
            .req("T095").cost(&[(Metal, 6.0), (Components, 1.0), (Materials, 6.0)]).work(60.0)
            .skilled(&[Q::Technician, Q::Mechanic], 500).general(2_000)
            .recipe(rec("nitrate", "Nitrate refining").inp(&[(Saltpetre, 6.0)]).out(&[(Fertilizer, 5.0)]).shaft(10.0))
            .upkeep(&[(Spares, 0.1)]).labor(L::Industry).tags(&[Tag::Chem, Tag::Farm]),
        fac("ammonia_plant", "Ammonia synthesis plant", "Industry", "Nitrogen taken from the air and bound with hydrogen from gas (or from coal): fertilizer without saltpetre.")
            .req("T095 & T064").cost(&[(Metal, 20.0), (Components, 8.0), (Materials, 10.0)]).work(200.0)
            .skilled(&[Q::Technician], 500).general(1_000)
            // a modern synthesis train is large (design chapter 36's 1.2 kt a level-month
            // would need a fertilizer works for every three levels of intensive fields):
            // ten times the design's table, the same ratios
            .recipe(rec("ammonia", "Ammonia from gas").inp(&[(Gas, 5.0)]).out(&[(Fertilizer, 12.0)]).elec(60.0))
            .recipe(rec("ammonia_coal", "Ammonia from coal").inp(&[(Coal, 10.0)]).out(&[(Fertilizer, 12.0)]).elec(150.0))
            .upkeep(&[(Spares, 0.3)]).labor(L::Industry).tags(&[Tag::Chem, Tag::Farm]),
        fac("aluminium_smelter", "Aluminium smelter", "Industry", "Electrolysis of alumina: light metal for aircraft, launchers and lines, at about fifteen megawatt-hours a tonne.")
            .req("T103").cost(&[(Metal, 20.0), (Components, 6.0), (Conductors, 8.0), (Materials, 10.0)]).work(250.0)
            .skilled(&[Q::Electrician, Q::Technician], 500).general(1_500)
            .recipe(rec("aluminium", "Electrolytic reduction").inp(&[(Bauxite, 4.0), (Chemicals, 0.4)]).out(&[(Aluminium, 1.0)]).elec(150.0))
            .upkeep(&[(Spares, 0.3)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Metal]),
        fac("magnet_works", "Magnet works", "Industry", "Rare-earth permanent magnets and superconducting coils for generators, motors, fusion and accelerators.")
            .req("T103").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 2.0), (Materials, 6.0)]).work(200.0)
            .skilled(&[Q::Technician], 1_000).general(1_500)
            .recipe(rec("magnets", "Rare-earth magnets").inp(&[(RareEarths, 3.0), (Metal, 1.0), (Chemicals, 0.5)]).out(&[(Magnets, 1.0)]).elec(40.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Chem]),
        fac("battery_works", "Battery works", "Industry", "Electrochemical cells and packs: storage, electric transport and autonomous forces.")
            .req("T105").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 2.0), (Materials, 6.0)]).work(200.0)
            .skilled(&[Q::Technician], 1_000).general(2_000)
            .recipe(rec("lithium_cells", "Lithium cells").inp(&[(Lithium, 0.1), (CobaltNickel, 0.1), (Metal, 0.2), (Chemicals, 0.1)]).out(&[(Batteries, 10.0)]).elec(20.0))
            // without lithium or cobalt: sodium cells from salt, half the output
            .recipe(rec("sodium_cells", "Sodium cells").inp(&[(Salt, 0.3), (Metal, 0.2), (Chemicals, 0.1)]).out(&[(Batteries, 5.0)]).elec(20.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Chem]),
        fac("fuel_plant", "Nuclear fuel plant", "Industry", "Enrichment and fabrication of reactor fuel under safeguards; later, fusion fuel from lithium.")
            .req("T147 & C045").cost(&[(Metal, 40.0), (Components, 20.0), (Instruments, 10.0), (Electronics, 6.0)]).work(800.0)
            .skilled(&[Q::Scientist, Q::Technician], 1_500).general(2_000)
            .recipe(rec("enrichment", "Enrichment and fabrication").inp(&[(UraniumOre, 4.0), (Chemicals, 0.5)]).out(&[(NuclearFuel, 40.0)]).elec(300.0))
            .recipe(rec("fusion_fuel", "Fusion fuel from lithium").req("T149").inp(&[(Lithium, 0.3)]).out(&[(NuclearFuel, 100.0)]).elec(200.0)
                .general_bp(5_000))
            .upkeep(&[(Spares, 0.5)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Chem]),
        fac("consumer_works", "Consumer goods works", "Industry", "Furniture, wares and, later, appliances for households.")
            .req("T062").cost(&[(Metal, 8.0), (Components, 3.0), (Materials, 8.0)]).work(90.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 1_000).general(4_000)
            .recipe(rec("appliances", "Electrical appliances").req("T101").inp(&[(Metal, 0.6), (Insulation, 0.3), (Textiles, 0.2), (Electronics, 0.02)]).out(&[(ConsumerGoods, 8.0)]).elec(30.0))
            .recipe(rec("household", "Household goods").inp(&[(Metal, 0.6), (Insulation, 0.3), (Textiles, 0.2)]).out(&[(ConsumerGoods, 7.0)]).shaft(20.0))
            .recipe(rec("lights_out", "Lights-out assembly").req("T319 & TRAD:synthetic").inp(&[(Metal, 0.6), (Insulation, 0.3), (Textiles, 0.2), (Electronics, 0.02)]).out(&[(ConsumerGoods, 8.0)]).elec(90.0).compute(40.0)
                .general_bp(3_000).extra(&[Q::AiEngineer, Q::Programmer], 200))
            .upkeep(&[(Spares, 0.1)]).labor(L::Industry).tags(&[Tag::Machine, Tag::Trade]),
        fac("fine_wares", "Fine-wares workshops", "Industry", "Jewellery, glazed and painted wares and fine cloth: luxuries for home and for export.")
            .req("T008 | T031").cost(&[(Materials, 4.0), (Tools, 1.0)]).work(20.0).skilled(&[Q::Artisan], 1_500).general(3_000)
            .recipe(rec("fine_wares", "Fine craft").inp(&[(Precious, 0.02), (Fibres, 0.1), (Materials, 0.3)]).out(&[(FineWares, 20.0)]))
            .upkeep(&[(Tools, 0.1)]).labor(L::Industry).tags(&[Tag::Craft, Tag::Trade]),
        // ---- power ------------------------------------------------------
        fac("waterwheel", "Water and wind mills", "Power", "Shaft power from a real fall of water or a steady wind. Each level delivers 20.")
            .req("T029").site(Site::Hydro).cost(&[(Materials, 10.0), (Tools, 2.0)]).work(40.0).general(1_000)
            .recipe(rec("mill", "Mill wheels").gives_shaft(20.0))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Water, Tag::Machine]).power(),
        fac("steam", "Steam machinery station", "Power", "Boilers and engines turning coal into shaft work.")
            .req("T080").cost(&[(Metal, 20.0), (Tools, 5.0), (Materials, 10.0)]).work(200.0)
            .skilled(&[Q::Mechanic, Q::Smith, Q::Artisan], 2_000).general(2_000)
            .recipe(rec("turbine", "Steam turbines").req("T083").inp(&[(Coal, 8.0)]).gives_shaft(80.0))
            .recipe(rec("compound", "High-pressure compound engines").req("T081").inp(&[(Coal, 10.0)]).gives_shaft(70.0))
            .recipe(rec("engine", "Practical steam engines").inp(&[(Coal, 12.0)]).gives_shaft(60.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Steam, Tag::Machine]).power(),
        fac("diesel", "Diesel machinery station", "Power", "Engines burning refined fuel: compact power wherever fuel can be delivered.")
            .req("T091").cost(&[(Metal, 12.0), (Components, 3.0)]).work(180.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2_000).general(1_000)
            .recipe(rec("heavy", "Heavy diesel").req("T092").inp(&[(Fuel, 6.0)]).gives_shaft(90.0))
            .recipe(rec("engine", "Internal combustion").inp(&[(Fuel, 6.0)]).gives_shaft(60.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Machine]).power(),
        fac("generator", "Generator hall", "Power", "Converts up to 60 of local shaft power per level into electricity at nine tenths.")
            .req("T100").cost(&[(Components, 5.0), (Conductors, 5.0), (Insulation, 1.0)]).work(100.0)
            .skilled(&[Q::Electrician, Q::Mechanic], 1_000)
            .provides(Cap::GenCap, 60.0).upkeep(&[(Tools, 0.5)]).labor(L::Industry).tags(&[Tag::Electric]),
        fac("hydro", "Hydroelectric works", "Power", "Dams, wheels and generators on a surveyed site. No fuel; the river sets the limit.")
            .req("T100").site(Site::Hydro).cost(&[(Metal, 20.0), (Conductors, 2.0), (Components, 3.0), (Insulation, 0.5), (Materials, 20.0)]).work(500.0)
            .skilled(&[Q::Electrician, Q::Mechanic], 2_000).general(2_000)
            // permanent-magnet generators lose less (design chapter 36, 5.4); without
            // magnets the plain machines are the substitute, with no gain
            .recipe(rec("magnet_hydro", "Permanent-magnet generators").req("T101").inp(&[(Magnets, 0.1)]).gives_elec(99.0))
            .recipe(rec("hydro", "Hydroelectric generation").gives_elec(90.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Water]).power(),
        fac("grid", "Grid and substations", "Power", "Joins this region to the national grid so electricity can be shared, with losses.")
            .req("T102").cost(&[(Metal, 5.0), (Conductors, 10.0), (Insulation, 3.0)]).work(150.0)
            .skilled(&[Q::Electrician], 1_000).provides(Cap::GridLink, 1.0)
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Electric]).max(1),
        // Slice E: the jump programme draws about 21,200 units a month (2.9 GW
        // continuous: two lines 8,000, three nodes 3,000, the testbed 8,000, the
        // high-energy laboratory 1,000, launch complex, station and yard 1,200).
        // A level of these plants is a station of several units: eleven fission
        // levels, four fusion levels or seven receivers carry the programme, each
        // with its fuel, upkeep and qualified crew - a generating base, not a building.
        fac("fission", "Fission plant", "Power", "Safeguarded reactors: 2,000 units of steady electricity a level from three thousand lots of nuclear fuel a month.")
            .req("T147 & C045").cost(&[(Metal, 160.0), (Components, 80.0), (Electronics, 40.0), (Conductors, 40.0), (Insulation, 20.0)]).work(4000.0)
            .skilled(&[Q::Scientist], 2_000).skilled(&[Q::Technician], 6_000).skilled(&[Q::Electrician], 4_000).general(4_000)
            .recipe(rec("fission", "Fission generation").inp(&[(NuclearFuel, 3.0)]).gives_elec(2000.0))
            .upkeep(&[(Spares, 4.0), (Electronics, 0.6)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Electric]).power(),
        fac("fusion", "Fusion plant", "Power", "Maintainable net-power fusion: 6,000 units of electricity a level. Enormous output, enormous upkeep.")
            .req("T149 & C045").cost(&[(Metal, 400.0), (Components, 240.0), (Electronics, 160.0), (Conductors, 120.0), (Insulation, 60.0), (Hardware, 12.0), (Magnets, 20.0)]).work(10000.0)
            .skilled(&[Q::Scientist], 6_000).skilled(&[Q::Technician], 10_000).skilled(&[Q::Electrician], 6_000).general(4_000)
            .recipe(rec("fusion", "Fusion generation").inp(&[(NuclearFuel, 5.0), (Helium, 0.05)]).gives_elec(6000.0))
            // high-temperature superconductors cooled by liquid nitrogen: no helium, more of the output spent on cooling
            .recipe(rec("fusion_hts", "Fusion with nitrogen-cooled superconductors").inp(&[(NuclearFuel, 5.0)]).gives_elec(5400.0))
            .upkeep(&[(Spares, 10.0), (Electronics, 2.0)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Electric]).power(),
        fac("orbital_power", "Orbital power receiver", "Power", "Ground station for power collected in orbit: 3,000 units of electricity a level. Needs an orbital construction yard.")
            .req("T150 & F:orbital_yard").cost(&[(Metal, 120.0), (Components, 80.0), (Electronics, 80.0), (Conductors, 80.0)]).work(4000.0)
            .skilled(&[Q::Electrician], 4_000).skilled(&[Q::Orbital], 4_000)
            .recipe(rec("beam", "Orbital collection").gives_elec(3000.0))
            .upkeep(&[(Spares, 5.0), (Electronics, 2.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Electric]).power(),
        // ---- transport and civic ----------------------------------------
        fac("roads", "Roads and waystations", "Transport", "Maintained roads, bridges and staged carriage linking this region to the rest.")
            .req("T027").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(80.0).general(2_000)
            // draught horses for the carts until motor vehicles (T094) take over
            .provides(Cap::Transport, 1.0).upkeep(&[(Tools, 0.4), (Horses, 0.02)]).labor(L::Services).tags(&[Tag::Build, Tag::Trade]).max(1),
        fac("port", "Harbour", "Transport", "Moorings, slips and stores. Opens sea links and deep-water fishing.")
            .req("T013").site(Site::Coast).cost(&[(Materials, 8.0), (Timber, 8.0), (Tools, 2.0)]).work(60.0).general(4_000)
            .provides(Cap::Port, 1.0).provides(Cap::Transport, 1.0).upkeep(&[(Tools, 0.4)]).labor(L::Services).tags(&[Tag::Sea, Tag::Trade]).max(1),
        fac("rail", "Railway", "Transport", "Heavy freight on fixed track.")
            .req("T068").cost(&[(Metal, 40.0), (Components, 8.0), (Materials, 20.0)]).work(400.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2_000).general(4_000)
            .provides(Cap::Transport, 2.0).upkeep(&[(Tools, 1.0), (Coal, 1.0)]).labor(L::Services).tags(&[Tag::Machine, Tag::Trade]).max(1),
        fac("depot", "Motor depot", "Transport", "Vehicles, fuel and repair crews for mechanized freight.")
            .req("T094").cost(&[(Metal, 10.0), (Components, 15.0)]).work(200.0)
            .skilled(&[Q::Mechanic], 3_000).general(4_000)
            .provides(Cap::Transport, 3.0).upkeep(&[(Fuel, 2.0), (Spares, 0.8)]).labor(L::Services).tags(&[Tag::Fuel, Tag::Trade]).max(1),
        fac("waterworks", "Wells and waterworks", "Civic", "Lifting and distribution. Each level supplies 1.2 million residents.")
            .req("T021").cost(&[(Materials, 10.0), (Tools, 2.0)]).work(50.0).general(2_000)
            .people(Cap::Water, 1_200_000).upkeep(&[(Tools, 0.2)]).labor(L::Services).tags(&[Tag::Water]),
        fac("sewers", "Drains and sewers", "Civic", "Drinking water kept apart from waste. Each level serves 3 million residents.")
            .req("T033 & C019").cost(&[(Materials, 20.0), (Tools, 3.0)]).work(120.0).general(3_000)
            .people(Cap::Water, 3_000_000).upkeep(&[(Tools, 0.3)]).labor(L::Services).tags(&[Tag::Water, Tag::Health]),
        fac("water_treatment", "Water treatment works", "Civic", "Treated supply and sanitation for a dense city. Each level serves 12 million residents.")
            .req("T069").cost(&[(Metal, 10.0), (Components, 4.0), (Chemicals, 5.0), (Materials, 20.0)]).work(300.0)
            .skilled(&[Q::Technician, Q::Mechanic], 1_000).general(4_000)
            .people(Cap::Water, 12_000_000).upkeep(&[(Chemicals, 0.5)]).labor(L::Services).tags(&[Tag::Water, Tag::Health, Tag::Chem]),
        fac("clinic", "Healers' lodge", "Civic", "Trauma care and medicinal practice for 800,000 residents per level.")
            .req("T032").cost(&[(Materials, 6.0)]).work(20.0).skilled(&[Q::Physician, Q::Lorekeeper], 2_000)
            .people(Cap::Health, 800_000).labor(L::Services).tags(&[Tag::Health]),
        fac("hospital", "Hospital", "Civic", "Clinical records, trained physicians and, where supplied, medicines. 4 million residents per level.")
            .req("T046").cost(&[(Materials, 20.0), (Metal, 4.0), (Instruments, 2.0)]).work(200.0)
            .skilled(&[Q::Physician], 4_000).general(6_000)
            .people(Cap::Health, 4_000_000).upkeep(&[(Medicine, 1.0)]).labor(L::Services).tags(&[Tag::Health, Tag::Bio]),
        fac("admin", "Administrative offices", "Civic", "Budget records and appointed staff. Each level administers three more regions.")
            .req("C026").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(80.0)
            .skilled(&[Q::Scribe], 4_000).general(2_000)
            .provides(Cap::Admin, 3.0).upkeep(&[(Media, 0.5)]).labor(L::Services).tags(&[Tag::Record]),
        fac("barracks", "Barracks and drill yard", "Civic", "Rolls, stores and space to train 200,000 soldiers per level at once.")
            .req("C016").cost(&[(Materials, 12.0), (Tools, 3.0)]).work(50.0).general(2_000)
            .people(Cap::Barracks, 200_000).labor(L::Services).tags(&[Tag::War]),
        fac("holy_site", "Sacred precinct", "Civic", "A continuing centre of gathering, teaching and relief for a local movement.")
            .req("REL").cost(&[(Materials, 25.0), (Tools, 3.0)]).work(120.0).general(4_000)
            .provides(Cap::Sacred, 1.0).labor(L::Services).tags(&[Tag::Teach]).max(1),
        // ---- education --------------------------------------------------
        fac("lodge", "Teaching lodge", "Education", "Demonstration, apprenticeship and small classes. Sixteen thousand places per level.")
            .req("C005").cost(&[(Materials, 5.0)]).work(15.0).people(Cap::SeatsLodge, 16_000)
            .labor(L::Knowledge).tags(&[Tag::Teach]),
        fac("school", "School", "Education", "A lasting site with curricula and texts. Forty thousand places per level.")
            .req("C023 & T025").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(60.0).people(Cap::SeatsSchool, 40_000)
            .upkeep(&[(Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Teach]),
        fac("college", "College", "Education", "Specialist teaching supported by patronage. Thirty thousand places per level.")
            .req("C027").cost(&[(Materials, 30.0), (Tools, 4.0), (Instruments, 2.0)]).work(150.0).people(Cap::SeatsCollege, 30_000)
            .upkeep(&[(Media, 0.8), (Instruments, 0.15)]).labor(L::Knowledge).tags(&[Tag::Teach, Tag::Science]),
        fac("tech_institute", "Technical institute", "Education", "Training shops with real machines and gauges. Thirty-two thousand places per level.")
            .req("T065 & C025").cost(&[(Metal, 10.0), (Components, 5.0), (Tools, 6.0), (Materials, 15.0)]).work(200.0)
            .people(Cap::SeatsInstitute, 32_000).upkeep(&[(Tools, 0.6), (Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Teach, Tag::Machine]),
        // ---- research ---------------------------------------------------
        fac("makers_circle", "Makers' circle", "Research", "Practitioners given time to compare methods and try improvements.")
            .cost(&[(Materials, 3.0)]).work(10.0).skilled(&craft_any, 6_000)
            .recipe(rec("inquiry", "Craft inquiry").research(RC::Craft, 6.0))
            .upkeep(&[(Tools, 0.3)]).labor(L::Knowledge).tags(&[Tag::Craft]),
        fac("archive", "Archive and house of study", "Research", "Kept records and people paid to read, compare and compute.")
            .req("T025 & C013").cost(&[(Materials, 12.0), (Media, 4.0)]).work(50.0)
            .skilled(&[Q::Scholar, Q::Scribe, Q::Researcher], 6_000)
            .recipe(rec("study", "Scholarly study").research(RC::Scholarly, 6.0))
            .upkeep(&[(Media, 0.6)]).labor(L::Knowledge).tags(&[Tag::Record, Tag::Measure]),
        fac("laboratory", "Laboratory", "Research", "Instruments, controlled comparisons and repeated trials.")
            .req("T045 & (C027 | C028)").cost(&[(Materials, 20.0), (Instruments, 6.0), (Tools, 3.0)]).work(120.0)
            .skilled(&[Q::Researcher, Q::Scholar, Q::Scientist], 8_000)
            .recipe(rec("experiment", "Experimental science").research(RC::Scientific, 8.0))
            .upkeep(&[(Instruments, 0.4), (Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Measure, Tag::Science]),
        fac("institute", "Research institute", "Research", "Organized programmes joining scientists with workshops and engineers.")
            .req("SCI").cost(&[(Metal, 20.0), (Tools, 10.0), (Instruments, 12.0), (Materials, 30.0)]).work(400.0)
            .skilled(&[Q::Scientist, Q::Researcher], 14_000).skilled(&[Q::Technician, Q::Mechanic, Q::Artisan], 6_000)
            .recipe(rec("programme", "Industrial research").research(RC::Industrial, 20.0))
            .upkeep(&[(Instruments, 1.0), (Media, 1.0)]).labor(L::Knowledge).tags(&[Tag::Science, Tag::Machine]).scale(3, "C044"),
        fac("advanced_lab", "Advanced research centre", "Research", "Computation-supported research with precision instruments.")
            .req("T100 & T055 & SCI").cost(&[(Metal, 30.0), (Components, 15.0), (Conductors, 10.0), (Instruments, 20.0)]).work(900.0)
            .skilled(&[Q::Scientist, Q::Researcher], 24_000).skilled(&[Q::Programmer, Q::Technician], 8_000).skilled(&[Q::Technician, Q::Electrician, Q::Mechanic], 8_000)
            .recipe(rec("computational", "Computation-supported research").req("T111").research(RC::Advanced, 40.0).elec(40.0).compute(30.0))
            .recipe(rec("instrumented", "Instrumented research").research(RC::Advanced, 26.0).elec(40.0))
            .upkeep(&[(Instruments, 2.0), (Spares, 1.0)]).labor(L::Knowledge).tags(&[Tag::Science, Tag::Compute]),
        fac("auto_lab", "Automated experiment hall", "Research", "Validated models run real experiment stations under supervision.")
            .req("T118 & C049").cost(&[(Hardware, 10.0), (Electronics, 40.0), (Components, 20.0), (Instruments, 20.0)]).work(800.0)
            .skilled(&[Q::Scientist], 4_000).skilled(&[Q::AiEngineer, Q::Programmer], 4_000)
            .recipe(rec("automated", "Automated experiments").research(RC::Advanced, 40.0).elec(60.0).compute(200.0))
            .upkeep(&[(Instruments, 2.0), (Electronics, 1.0), (Spares, 1.0)]).labor(L::Knowledge).tags(&[Tag::Compute, Tag::Science]),
        // ---- the space and jump base (design chapter 35, slice E) -----------
        // Crews, operating inputs and electric draw follow the slice E table: they
        // are larger against the rest of the economy than a plain x1000 of ruleset
        // 1.0. Bills, work and upkeep were raised with the crews. One staffed
        // research post still gives one researcher-month, so the frontier output
        // of a works is at most its research staff.
        // The design table asks 3,000 units of electricity. The first laboratory must
        // run before fission is understood (fission, fusion and the plasma work are
        // investigated there), on hydroelectric works and generator halls of about 54
        // units a level; at 3,000 the all-native campaigns lost a third of the seats
        // that completed the graph (docs/calibration/slice-e-*.txt). 1,000 units is ten
        // times ruleset 1.0's draw and half a level of fission.
        fac("high_energy", "High-energy laboratory", "Research", "Accelerators, plasma devices and the sixty thousand people who can run them. Draws 1,000 units of electricity a month.")
            .req("T146 & C045").cost(&[(Metal, 150.0), (Components, 80.0), (Electronics, 80.0), (Conductors, 80.0), (Instruments, 50.0), (Magnets, 20.0)]).work(4000.0)
            .skilled(&[Q::Scientist], 40_000).skilled(&[Q::Technician], 12_000).skilled(&[Q::Electrician], 8_000)
            .recipe(rec("frontier", "Frontier experiments").research(RC::Frontier, 60.0).inp(&[(Helium, 0.05)]).elec(1000.0).compute(50.0))
            .recipe(rec("frontier_hts", "Frontier experiments, nitrogen-cooled magnets").research(RC::Frontier, 60.0).elec(1500.0).compute(50.0))
            .upkeep(&[(Instruments, 6.0), (Electronics, 4.0), (Spares, 4.0)]).labor(L::Knowledge).tags(&[Tag::HighEnergy, Tag::Science]),
        // ---- space and jump engineering ----------------------------------
        fac("launch_complex", "Launch complex", "Space", "Pads, tracking and propellant handling worked by sixty thousand people. Keeps a launch cadence only while supplied.")
            .req("T140 & T141 & C045").cost(&[(Metal, 160.0), (Components, 120.0), (Electronics, 60.0), (Conductors, 30.0)]).work(4000.0)
            .skilled(&[Q::Technician], 16_000).skilled(&[Q::Scientist], 6_000).skilled(&[Q::Mechanic], 16_000).general(22_000)
            .recipe(rec("cadence", "Launch cadence").inp(&[(Fuel, 30.0), (Components, 6.0), (Electronics, 3.0), (Aluminium, 2.0), (CobaltNickel, 0.1), (Batteries, 5.0)]).elec(400.0))
            // without aluminium and superalloys: heavier steel vehicles and more propellant
            .recipe(rec("cadence_steel", "Launch cadence with steel vehicles").inp(&[(Fuel, 36.0), (Components, 6.0), (Electronics, 3.0), (Metal, 6.5), (Batteries, 5.0)]).elec(400.0))
            .provides(Cap::Launch, 1.0).upkeep(&[(Spares, 3.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Fuel]).max(1),
        fac("orbital_station", "Orbital station", "Space", "A crewed, resupplied station. Requires a working launch complex in the same region.")
            .req("T142 & T144").site(Site::With("launch_complex"))
            .cost(&[(Metal, 80.0), (Components, 80.0), (Electronics, 60.0), (Insulation, 30.0), (Fuel, 120.0)]).work(3500.0)
            .skilled(&[Q::Orbital], 16_000).skilled(&[Q::Scientist], 6_000)
            .recipe(rec("orbit_science", "Orbital research").research(RC::Frontier, 10.0).inp(&[(Fuel, 12.0), (Food, 20.0), (Medicine, 1.0)]).elec(200.0))
            .provides(Cap::OrbitalStation, 1.0).upkeep(&[(Spares, 3.0), (Electronics, 1.5)]).labor(L::Industry).tags(&[Tag::Space]).max(1),
        fac("orbital_yard", "Orbital construction yard", "Space", "Scaled construction and manufacture in orbit. Requires an orbital station in the same region.")
            .req("T145 & C058").site(Site::With("orbital_station"))
            .cost(&[(Metal, 270.0), (Components, 270.0), (Electronics, 150.0), (Hardware, 18.0), (Fuel, 360.0)]).work(9000.0)
            .skilled(&[Q::Orbital], 30_000).skilled(&[Q::Mechanic], 16_000).skilled(&[Q::Technician], 16_000).general(10_000)
            .recipe(rec("yard_ops", "Orbital operations").inp(&[(Fuel, 30.0), (Components, 10.0), (Electronics, 4.0), (Aluminium, 3.0)]).elec(600.0))
            .recipe(rec("yard_ops_steel", "Orbital operations with steel structures").inp(&[(Fuel, 36.0), (Components, 10.0), (Electronics, 4.0), (Metal, 9.0)]).elec(600.0))
            .provides(Cap::OrbitalYard, 1.0).upkeep(&[(Spares, 8.0), (Electronics, 4.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Machine]).max(1),
        fac("interferometer", "Orbital interferometer array", "Space", "Large-baseline optical instruments assembled in orbit.")
            .req("T151 & F:orbital_yard").cost(&[(Components, 60.0), (Electronics, 60.0), (Instruments, 40.0), (Hardware, 6.0), (Fuel, 60.0)]).work(2000.0)
            .skilled(&[Q::Scientist], 10_000).skilled(&[Q::Orbital], 6_000)
            .recipe(rec("baseline", "Baseline observations").research(RC::Frontier, 30.0).compute(60.0).elec(20.0))
            .upkeep(&[(Spares, 1.0), (Electronics, 1.0)]).labor(L::Knowledge).tags(&[Tag::Space, Tag::Science]).max(1),
        fac("jump_testbed", "Jump testbed", "Jump engineering", "The first installation able to reproduce the anomaly under load. Needs an orbital yard and vast power.")
            .req("T163 & C045 & C056 & F:orbital_yard & F:high_energy")
            .cost(&[(Metal, 250.0), (Components, 250.0), (Electronics, 200.0), (Conductors, 200.0), (Hardware, 30.0), (Instruments, 80.0), (Magnets, 40.0)]).work(8000.0)
            .skilled(&[Q::Scientist], 30_000).skilled(&[Q::FtlEngineer, Q::Technician], 12_000).skilled(&[Q::Orbital], 10_000)
            .recipe(rec("jump_trials", "Jump-interface experiments").research(RC::Frontier, 60.0).inp(&[(Helium, 0.2)]).elec(8000.0).compute(100.0))
            .recipe(rec("jump_trials_hts", "Jump-interface experiments, nitrogen-cooled").research(RC::Frontier, 60.0).elec(9600.0).compute(100.0))
            .upkeep(&[(Spares, 6.0), (Electronics, 5.0), (Instruments, 3.0)]).labor(L::Knowledge).tags(&[Tag::HighEnergy, Tag::Space]).max(1),
        fac("jump_yard", "Jump assembly line", "Jump engineering", "An independently operable line of seventy-six thousand people that completes one standard jump assembly in twenty-four months of full work.")
            .req("T166 & C056")
            .cost(&[(Metal, 300.0), (Components, 300.0), (Electronics, 150.0), (Hardware, 30.0), (Conductors, 100.0)]).work(9000.0)
            .skilled(&[Q::FtlEngineer], 16_000).skilled(&[Q::Technician], 16_000).skilled(&[Q::Mechanic], 16_000).skilled(&[Q::Electrician], 8_000).general(20_000)
            .recipe(rec("assembly", "Jump assembly manufacture")
                .inp(&[(Components, 60.0), (Electronics, 45.0), (Hardware, 3.0), (Conductors, 18.0), (Insulation, 9.0), (Metal, 45.0), (Substrate, 3.0), (Lattice, 30.0), (Magnets, 6.0), (Helium, 0.1)])
                .elec(4000.0).assembly(1.0 / 24.0))
            .recipe(rec("assembly_hts", "Jump assembly manufacture, nitrogen-cooled")
                .inp(&[(Components, 60.0), (Electronics, 45.0), (Hardware, 3.0), (Conductors, 18.0), (Insulation, 9.0), (Metal, 45.0), (Substrate, 3.0), (Lattice, 30.0), (Magnets, 6.0)])
                .elec(4800.0).assembly(1.0 / 24.0))
            .provides(Cap::FtlYard, 1.0).upkeep(&[(Spares, 8.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::HighEnergy, Tag::Machine]).max(1),
        fac("jump_base", "Jump deployment node", "Jump engineering", "Transport, maintenance and recovery capability at one of the three test nodes.")
            .req("T167 & C057").site(Site::TestNode)
            .cost(&[(Metal, 110.0), (Components, 80.0), (Electronics, 55.0), (Conductors, 30.0)]).work(3500.0)
            .skilled(&[Q::FtlEngineer], 6_000).skilled(&[Q::Orbital], 8_000).skilled(&[Q::Technician], 8_000).general(10_000)
            .recipe(rec("node_ops", "Node operations").inp(&[(Fuel, 12.0), (Electronics, 3.0), (Lattice, 2.0), (Helium, 0.05)]).elec(1000.0))
            .recipe(rec("node_ops_hts", "Node operations, nitrogen-cooled").inp(&[(Fuel, 12.0), (Electronics, 3.0), (Lattice, 2.0)]).elec(1200.0))
            .provides(Cap::FtlBase, 1.0).upkeep(&[(Spares, 4.0)]).labor(L::Industry).tags(&[Tag::Space]).max(1),
        // the one declared fictional material (design chapter 36, section 5.2): crystal
        // conditioned in the anomaly's field, only at the three test nodes
        fac("lattice_works", "Lattice conditioning works", "Jump engineering", "Conditions high-purity crystal in the anomaly's field into interface lattice. Only at a test node, one works each.")
            .req("T164 | T165").site(Site::TestNode)
            .cost(&[(Metal, 60.0), (Components, 40.0), (Electronics, 40.0), (Magnets, 10.0), (Instruments, 20.0)]).work(3000.0)
            .skilled(&[Q::Scientist, Q::FtlEngineer], 6_000).general(4_000)
            .recipe(rec("lattice", "Lattice conditioning").inp(&[(Substrate, 0.5), (Magnets, 0.5), (Helium, 0.05)]).out(&[(Lattice, 20.0)]).elec(2000.0))
            .recipe(rec("lattice_hts", "Lattice conditioning, nitrogen-cooled").inp(&[(Substrate, 0.5), (Magnets, 0.5)]).out(&[(Lattice, 20.0)]).elec(2400.0))
            .upkeep(&[(Spares, 2.0)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Space]).max(1),
        // ---- tradition works (design chapter 37, section 4.1; ruleset 3.0 slice 13) ----
        // Buildable only while the tradition is held; knowledge itself is never locked.
        fac("steam_hammer", "Steam hammer works", "Industry", "Coal-fired forges and steam hammers cutting components to gauge: the machine shop of the Coal and Steam tradition. Mastery saves up to 15% of its general posts.")
            .req("T270 & TRAD:steam").cost(&[(Metal, 16.0), (Tools, 6.0), (Materials, 10.0)]).work(140.0)
            .skilled(&[Q::Mechanic, Q::Smith, Q::Artisan], 4_000).general(6_000)
            .recipe(rec("forging", "Steam forging").inp(&[(Metal, 12.5), (Tools, 0.8), (Coal, 1.5)]).out(&[(Components, 10.0)]).shaft(40.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Machine, Tag::Steam, Tag::Metal]),
        fac("motor_works", "Motor works", "Industry", "Engines and vehicles built on moving lines: components from fewer hands, burning fuel on the test beds. Oil and Engine only.")
            .req("T280 & TRAD:engine").cost(&[(Metal, 14.0), (Components, 4.0), (Tools, 4.0), (Materials, 8.0)]).work(150.0)
            .skilled(&[Q::Mechanic, Q::Technician], 2_000).general(2_500)
            .recipe(rec("motors", "Motor and vehicle assembly").inp(&[(Metal, 10.0), (Fuel, 0.6), (Tools, 0.4)]).out(&[(Components, 8.0)]).shaft(20.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::Machine, Tag::Fuel]),
        fac("tramways", "Trams and metros", "Transport", "Electric street railways and underground lines: the city reaches farther, and its works and offices find their people (city factor up to +5% with mastery). Current and Wire only.")
            .req("T286 & TRAD:wire").cost(&[(Metal, 20.0), (Conductors, 8.0), (Components, 4.0), (Materials, 20.0)]).work(300.0)
            .skilled(&[Q::Electrician, Q::Technician], 1_000).general(2_000)
            .recipe(rec("traction", "Electric traction").elec(30.0))
            .upkeep(&[(Spares, 0.3)]).labor(L::Services).tags(&[Tag::Electric, Tag::Build, Tag::Trade]).max(10),
        fac("compact_reactor", "Compact reactor", "Power", "A factory-built reactor: 400 units of electricity a level for six tenths of a fission plant's bill per unit. Atom only; the reactor-incident hazard applies.")
            .req("T295 & C045 & TRAD:atom").cost(&[(Metal, 19.2), (Components, 9.6), (Electronics, 4.8), (Conductors, 4.8), (Insulation, 2.4)]).work(480.0)
            .skilled(&[Q::Scientist], 400).skilled(&[Q::Technician], 1_200).skilled(&[Q::Electrician], 800).general(800)
            .recipe(rec("compact", "Compact fission").inp(&[(NuclearFuel, 0.6)]).gives_elec(400.0))
            .upkeep(&[(Spares, 0.8), (Electronics, 0.12)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Electric]).power(),
        fac("isotope_works", "Isotope works", "Industry", "Irradiated targets and hot cells: medicines and tracer instruments from a little reactor fuel. Atom only.")
            .req("T294 & TRAD:atom").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 4.0), (Materials, 10.0)]).work(250.0)
            .skilled(&[Q::Scientist, Q::Physician], 1_000).skilled(&[Q::Technician], 1_000).general(1_000)
            .recipe(rec("isotopes", "Isotopes for medicine and measurement").inp(&[(NuclearFuel, 0.05), (Chemicals, 0.5), (Metal, 0.5)]).out(&[(Medicine, 6.0), (Instruments, 1.0)]).elec(20.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Health, Tag::Measure]),
        fac("noc", "Network operations centre", "Industry", "Watch floors over the national networks: computing centres deliver up to 5% more with mastery, and network incidents are half as likely. Network only.")
            .req("T302 & TRAD:network").cost(&[(Hardware, 6.0), (Electronics, 10.0), (Components, 4.0), (Conductors, 2.0)]).work(300.0)
            .skilled(&[Q::Programmer, Q::Technician], 2_000)
            .recipe(rec("operations", "Network operations").elec(30.0).compute(20.0))
            .upkeep(&[(Spares, 0.3), (Hardware, 0.05)]).labor(L::Industry).tags(&[Tag::Compute]).max(4),
        fac("implant_clinic", "Implant clinic", "Civic", "Neural interfaces and cybernetic prosthetics fitted and maintained: qualified posts in the region need up to 10% fewer people with mastery. Network only.")
            .req("T303 & TRAD:network").cost(&[(Electronics, 6.0), (Instruments, 6.0), (Components, 4.0), (Materials, 10.0)]).work(250.0)
            .skilled(&[Q::Physician], 1_000).skilled(&[Q::Technician, Q::Electrician], 1_000)
            .recipe(rec("implants", "Implant fitting").inp(&[(Medicine, 2.0), (Electronics, 0.5)]).elec(10.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Services).tags(&[Tag::Health, Tag::Compute]).max(5),
        fac("biofoundry", "Biofoundry", "Industry", "Engineered organisms in steel vats: chemicals from food and fibre, or fuel from food. Living Systems only; slow to validate, and a contamination hazard.")
            .req("T310 & TRAD:living").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 4.0), (Materials, 10.0)]).work(220.0)
            .skilled(&[Q::Technician, Q::Physician], 1_500).general(3_000)
            .recipe(rec("biochem", "Biochemicals from food and fibre").inp(&[(Food, 40.0), (Fibres, 2.0)]).out(&[(Chemicals, 3.5)]).elec(10.0))
            .recipe(rec("biofuel", "Biofuel from food").inp(&[(Food, 60.0)]).out(&[(Fuel, 2.5)]).elec(10.0))
            .upkeep(&[(Spares, 0.2)]).labor(L::Industry).tags(&[Tag::Bio, Tag::Chem]),
        fac("machine_governance", "Machine governance centre", "Civic", "Validated models administer what offices once did: each level administers six more regions. Synthetic Minds only.")
            .req("T320 & TRAD:synthetic").cost(&[(Hardware, 10.0), (Electronics, 20.0), (Components, 6.0)]).work(400.0)
            .skilled(&[Q::AiEngineer, Q::Programmer], 2_000)
            .recipe(rec("governance", "Machine administration").elec(60.0).compute(100.0))
            .provides(Cap::Admin, 6.0).upkeep(&[(Spares, 0.3), (Hardware, 0.1)]).labor(L::Services).tags(&[Tag::Compute, Tag::Record]),
    ];
    v.into_iter()
        .map(|f| {
            let mut def = f.0;
            let (crew, power, months) = build_terms(def.key);
            let (line, stage, era) = line_meta(def.key);
            def.line = line;
            def.stage = stage;
            def.era = era;
            def.crew = crew;
            def.build_power = power;
            def.build_months = months;
            def
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Building lines (design chapter 37, sections 8.2 and 8.4)
// ---------------------------------------------------------------------------

/// Line, stage and era of every facility kind. Inert until the building lifecycle
/// (slice 7) except that the era gates productivity technologies (slice 6). Eras:
/// 0 Ancient, 1 Classical, 2 Medieval, 3 Early Modern, 4 Industrial, 5 Modern,
/// 6 Information, 7 Space, 8 AI, 9 Interstellar.
pub fn line_meta(key: &str) -> (&'static str, u8, u8) {
    match key {
        "fields" => ("fields", 1, 0),
        "pasture" => ("pastures", 1, 0),
        "fishery" => ("fishing", 1, 0),
        "granary" => ("storage", 1, 0),
        "irrigation" => ("irrigation", 1, 0),
        "camp" => ("forestry", 1, 0),
        "quarry" => ("building_materials", 1, 0),
        "kiln" => ("building_materials", 2, 0),
        "salt_works" => ("salt_works", 1, 0),
        "salt_pans" => ("salt_pans", 1, 0),
        "fibre_farm" => ("fibre_plantations", 1, 0),
        "spice_farm" => ("spice_plantations", 1, 0),
        "horse_farm" => ("horse_breeding", 1, 0),
        "mine_copper" | "mine_coal" | "mine_tin" | "mine_precious" => ("mines", 1, 0),
        "mine_iron" => ("mines", 1, 1),
        "nitre_works" | "mine_rare_earths" => ("mines", 1, 3),
        "mine_cobalt_nickel" => ("mines", 1, 4),
        "mine_bauxite" | "mine_quartz" | "brine_works" => ("mines", 1, 5),
        "mine_uranium" => ("mines", 1, 7),
        "oilwell" | "gas_well" => ("wells", 1, 5),
        "workshop" => ("toolmaking", 1, 0),
        "copper_smelter" => ("copper", 1, 0),
        "bloomery" => ("iron_steel", 1, 1),
        "steelworks" => ("iron_steel", 2, 4),
        "machine_shop" => ("machine_shops", 1, 4),
        "parts_works" => ("parts", 1, 4),
        "wire_works" => ("wire", 1, 4),
        "chem_plant" => ("chemicals", 1, 4),
        "insulation_works" => ("insulation", 1, 2),
        "refinery" => ("fuel", 1, 5),
        "synfuel" => ("synthetic_fuel", 1, 6),
        "food_synthesis" => ("urban_food", 4, 8),
        "purifier" => ("semiconductor_materials", 1, 5),
        "fab" => ("electronics", 1, 5),
        "computer_works" => ("computer_works", 1, 6),
        "datacenter" => ("computing", 1, 6),
        "press" => ("records", 1, 1),
        "instrument_shop" => ("instruments", 1, 3),
        "pharma" => ("medicine", 1, 5),
        "weaving" => ("textiles", 1, 0),
        "textile_mill" => ("textiles", 2, 4),
        "powder_mill" => ("arms_works", 2, 3),
        "arsenal" => ("arms_works", 3, 4),
        "nitrate_works" => ("fertilizer", 1, 5),
        "ammonia_plant" => ("fertilizer", 2, 5),
        "aluminium_smelter" => ("aluminium", 1, 5),
        "magnet_works" => ("magnets", 1, 5),
        "battery_works" => ("batteries", 1, 5),
        "fuel_plant" => ("nuclear_fuel", 1, 7),
        "consumer_works" => ("consumer_goods", 1, 4),
        "fine_wares" => ("fine_wares", 1, 0),
        "waterwheel" => ("mills_hydro", 1, 1),
        "hydro" => ("mills_hydro", 2, 5),
        "steam" => ("steam_power", 1, 4),
        "diesel" => ("diesel_power", 1, 5),
        "generator" => ("conversion", 1, 5),
        "grid" => ("grid", 1, 5),
        "fission" => ("nuclear", 1, 7),
        "fusion" => ("fusion", 1, 8),
        "orbital_power" => ("orbital_power", 1, 7),
        "roads" => ("roads", 1, 1),
        "port" => ("harbour", 1, 1),
        "rail" => ("railway", 1, 4),
        "depot" => ("motor_transport", 1, 5),
        "waterworks" => ("water", 1, 1),
        "sewers" => ("sanitation", 1, 2),
        "water_treatment" => ("sanitation", 2, 4),
        "clinic" => ("health", 1, 0),
        "hospital" => ("health", 2, 3),
        "admin" => ("administration", 1, 1),
        "barracks" => ("military", 1, 1),
        "holy_site" => ("religion", 1, 0),
        "lodge" => ("schools", 1, 0),
        "school" => ("schools", 2, 1),
        "college" => ("colleges", 1, 2),
        "tech_institute" => ("technical_education", 1, 4),
        "makers_circle" => ("research", 1, 0),
        "archive" => ("research", 2, 1),
        "laboratory" => ("research", 3, 3),
        "institute" => ("research", 4, 4),
        "advanced_lab" => ("research", 5, 5),
        "auto_lab" => ("research", 6, 8),
        "high_energy" => ("high_energy", 1, 7),
        "launch_complex" => ("launch", 2, 6),
        "orbital_station" => ("orbital", 1, 7),
        "orbital_yard" => ("orbital", 2, 7),
        "interferometer" => ("interferometer", 1, 7),
        "jump_testbed" => ("jump", 1, 9),
        "jump_yard" => ("jump", 2, 9),
        "jump_base" => ("jump", 3, 9),
        "lattice_works" => ("lattice", 1, 9),
        // tradition works: lines of their own, so that no generic stage upgrades into them
        "steam_hammer" => ("tradition_steam", 1, 4),
        "motor_works" => ("tradition_engine", 1, 5),
        "tramways" => ("tradition_wire", 1, 5),
        "compact_reactor" => ("tradition_atom", 1, 7),
        "isotope_works" => ("tradition_atom", 2, 7),
        "noc" => ("tradition_network", 1, 6),
        "implant_clinic" => ("tradition_network", 2, 7),
        "biofoundry" => ("tradition_living", 1, 6),
        "machine_governance" => ("tradition_synthetic", 1, 8),
        _ => panic!("no building line for {key}"),
    }
}

/// Kind of an edge of the building tree (design chapter 37, section 8.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpgradeKind {
    Upgrade,
    Retrofit,
    Variant,
    Alternative,
}

/// An edge of the building tree, between facility indices.
#[derive(Clone, Debug)]
pub struct UpgradeEdge {
    pub from: usize,
    pub to: usize,
    pub kind: UpgradeKind,
}

/// The tree's edges: each stage of a line upgrades to the next where both are a
/// single kind, plus the declared alternatives.
fn upgrade_edges(facs: &[FacDef], ix: &HashMap<String, usize>) -> Vec<UpgradeEdge> {
    let mut out = Vec::new();
    let mut lines: Vec<&str> = facs.iter().map(|f| f.line).collect();
    lines.sort();
    lines.dedup();
    for line in lines {
        let mut stages: Vec<u8> = facs.iter().filter(|f| f.line == line).map(|f| f.stage).collect();
        stages.sort();
        stages.dedup();
        for w in stages.windows(2) {
            let a: Vec<usize> = (0..facs.len()).filter(|i| facs[*i].line == line && facs[*i].stage == w[0]).collect();
            let b: Vec<usize> = (0..facs.len()).filter(|i| facs[*i].line == line && facs[*i].stage == w[1]).collect();
            if a.len() == 1 && b.len() == 1 {
                out.push(UpgradeEdge { from: a[0], to: b[0], kind: UpgradeKind::Upgrade });
            }
        }
    }
    for (from, to) in [("refinery", "synfuel")] {
        out.push(UpgradeEdge { from: ix[from], to: ix[to], kind: UpgradeKind::Alternative });
    }
    out
}

/// Era of a technology by its identifier (design chapter 37, section 8.3).
pub fn tech_era(id: &str) -> u8 {
    let n: u32 = id[1..].parse().unwrap_or(0);
    match n {
        1..=16 => 0,
        20..=29 => 1,
        30..=35 => 2,
        36..=49 => 3,
        57 | 58 | 86 | 87 | 90..=95 | 100..=105 | 110 | 160 => 5,
        50..=56 | 60..=71 | 80..=85 => 4,
        120 | 122 | 125 | 135..=137 | 161 | 173 | 177 | 180 | 181 => 8,
        96 | 97 | 106..=119 | 121 | 123 | 124 | 130..=134 | 140 | 141 => 6,
        142..=159 | 170..=182 => 7,
        162..=167 => 9,
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CourseJson {
    id: String,
    name: String,
    prerequisites: String,
    output: String,
    class_size: u16,
    months: u16,
}

#[derive(Clone, Debug)]
pub struct Course {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub req_src: &'static str,
    pub req: Req,
    pub entrants: Vec<Option<Qual>>,
    pub teachers: Vec<Qual>,
    pub output: Qual,
    pub months: u16,
    /// Learners per instructor.
    pub class_size: u16,
    pub venue: Cap,
    /// Goods used each month per thousand enrolled learners, base units.
    pub materials: Vec<(Good, i64)>,
}

struct CourseMeta {
    req: &'static str,
    entrants: &'static [Option<Qual>],
    teachers: &'static [Qual],
    output: Qual,
    venue: Cap,
    materials: &'static [(Good, f64)],
}

fn course_meta(id: &str) -> CourseMeta {
    use Good::*;
    use Qual::*;
    let (req, entrants, teachers, output, venue, materials): (
        &'static str,
        &'static [Option<Qual>],
        &'static [Qual],
        Qual,
        Cap,
        &'static [(Good, f64)],
    ) = match id {
        "E001" => ("T003", &[None], &[Lorekeeper], Lorekeeper, Cap::SeatsLodge, &[]),
        "E002" => ("", &[None], &[Artisan], Artisan, Cap::SeatsLodge, &[(Materials, 0.1), (Tools, 0.02)]),
        "E003" => ("T005", &[None], &[Agronomist, Lorekeeper], Agronomist, Cap::SeatsLodge, &[]),
        "E004" => ("T009", &[None], &[Tallier, Lorekeeper, Artisan], Tallier, Cap::SeatsLodge, &[]),
        "E005" => ("T025", &[None, Some(Tallier)], &[Scribe, Teacher, Literate], Literate, Cap::SeatsLodge, &[(Media, 0.05)]),
        "E006" => ("T026", &[Some(Literate), Some(Tallier)], &[Scribe], Scribe, Cap::SeatsLodge, &[(Media, 0.05)]),
        "E007" => ("T015 | T023", &[Some(Artisan), Some(Tallier), None], &[Smith], Smith, Cap::SeatsLodge, &[(Materials, 0.2)]),
        "E008" => ("T012", &[None, Some(Artisan)], &[Builder], Builder, Cap::SeatsLodge, &[(Materials, 0.2)]),
        "E009" => ("T013 & T016", &[Some(Tallier), Some(Literate), Some(Scribe)], &[Navigator], Navigator, Cap::SeatsLodge, &[]),
        "E010" => ("C023", &[Some(Scribe), Some(Literate), Some(Scholar)], &[Teacher, Scribe], Teacher, Cap::SeatsSchool, &[(Media, 0.05)]),
        "E011" => ("T030", &[Some(Literate)], &[Scribe, Teacher], Scribe, Cap::SeatsSchool, &[(Media, 0.08)]),
        "E012" => ("T030 | T048", &[None], &[Teacher], Literate, Cap::SeatsSchool, &[(Media, 0.03)]),
        "E013" => ("T040 | T045", &[Some(Scribe)], &[Scholar, Teacher], Scholar, Cap::SeatsSchool, &[(Media, 0.05), (Instruments, 0.01)]),
        "E014" => ("T049", &[Some(Scholar)], &[Researcher, Scholar], Researcher, Cap::SeatsCollege, &[(Media, 0.08), (Instruments, 0.02)]),
        "E015" => ("T061 | T065", &[Some(Artisan), Some(Smith), Some(Literate)], &[Mechanic], Mechanic, Cap::SeatsInstitute, &[(Tools, 0.05)]),
        "E016" => ("T044", &[Some(Scholar), Some(Artisan), Some(Literate)], &[Technician, Researcher], Technician, Cap::SeatsInstitute, &[(Instruments, 0.02)]),
        "E017" => ("T100", &[Some(Mechanic), Some(Technician)], &[Electrician], Electrician, Cap::SeatsInstitute, &[(Conductors, 0.01), (Tools, 0.03)]),
        "E018" => ("T110 & T111", &[Some(Literate), Some(Scribe), Some(Scholar)], &[Programmer], Programmer, Cap::SeatsInstitute, &[(Media, 0.05)]),
        "E019" => ("T049", &[Some(Researcher), Some(Technician)], &[Scientist, Researcher], Scientist, Cap::SeatsCollege, &[(Media, 0.1), (Instruments, 0.03)]),
        "E020" => ("T046", &[Some(Scholar), Some(Researcher), Some(Literate)], &[Physician], Physician, Cap::SeatsCollege, &[(Media, 0.05), (Instruments, 0.01)]),
        "E021" => ("T115 & T116 & F:datacenter", &[None], &[Teacher], Literate, Cap::SeatsSchool, &[(Media, 0.02)]),
        "E022" => ("T115 & T116", &[Some(Programmer)], &[AiEngineer, Scientist], AiEngineer, Cap::SeatsInstitute, &[(Media, 0.05)]),
        "E023" => ("T144", &[Some(Mechanic), Some(Technician), Some(Electrician)], &[Orbital], Orbital, Cap::SeatsInstitute, &[(Fuel, 0.05), (Spares, 0.02)]),
        "E024" => ("T164 | T165", &[Some(Technician), Some(Electrician), Some(Orbital)], &[FtlEngineer, Scientist], FtlEngineer, Cap::SeatsInstitute, &[(Electronics, 0.05), (Instruments, 0.03)]),
        _ => panic!("no course meta for {id}"),
    };
    CourseMeta { req, entrants, teachers, output, venue, materials }
}

// ---------------------------------------------------------------------------
// Military tiers
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct UnitTierDef {
    pub tier: u8,
    /// Equipment generation of design chapter 37, section 2.1 (G0-G7): the six
    /// tiers of this ruleset are written as generations 0, 1, 2, 4, 5 and 6, ready for
    /// the military slice to insert G3 and G7.
    pub generation: u8,
    pub name: &'static str,
    pub roles: [&'static str; 3],
    pub req_src: &'static str,
    pub req: Req,
    /// Goods to equip a thousand soldiers, base units.
    pub equipment: Vec<(Good, i64)>,
    /// Equipment issued in place of `equipment` when the stores cannot cover it
    /// (bronze for iron), per thousand soldiers.
    pub alternative: Vec<(Good, i64)>,
    /// What a thousand soldiers of the maneuver role need beside the equipment (mounts).
    pub maneuver_extra: Vec<(Good, i64)>,
    /// Goods a thousand soldiers use each month, base units. Food is listed for
    /// the catalog and eaten through the common food account, one ration each.
    /// Munitions are used five times as fast in a month of battle.
    pub upkeep: Vec<(Good, i64)>,
    pub training_months: u16,
}

fn unit_tiers() -> Vec<UnitTierDef> {
    use Good::*;
    let q = |v: &[(Good, f64)]| -> Vec<(Good, i64)> { v.iter().map(|(g, a)| (*g, m(*a))).collect() };
    #[allow(clippy::too_many_arguments)]
    let mk = |tier: u8,
              generation: u8,
              name: &'static str,
              roles: [&'static str; 3],
              req_src: &'static str,
              equipment: Vec<(Good, i64)>,
              alternative: Vec<(Good, i64)>,
              maneuver_extra: Vec<(Good, i64)>,
              upkeep: Vec<(Good, i64)>,
              training_months: u16| UnitTierDef { tier, generation, name, roles, req_src, req: Req::True, equipment, alternative, maneuver_extra, upkeep, training_months };
    // per soldier in the design's table (design chapter 37, table 2.1), which is
    // per thousand soldiers in display units here
    vec![
        mk(0, 0, "Subsistence warbands", ["Melee bands", "Light hunters", "Spear lines"], "", q(&[(Tools, 0.3)]), vec![], vec![], q(&[(Food, 1.0)]), 2),
        mk(1, 1, "Bronze and iron levies", ["Heavy infantry", "Cavalry", "Pike formations"], "(T022 | T023) & C016",
           q(&[(Metal, 0.4), (Tools, 0.3)]), q(&[(Copper, 0.35), (Tin, 0.05), (Tools, 0.3)]), q(&[(Horses, 0.3)]), q(&[(Food, 1.0), (Tools, 0.01)]), 4),
        mk(2, 2, "Powder and drill", ["Assault infantry", "Rapid columns", "Field artillery"], "T037 & C016",
           q(&[(Metal, 0.8), (Materials, 0.5), (Tools, 0.3), (Munitions, 1.0)]), vec![], q(&[(Horses, 0.3)]), q(&[(Food, 1.0), (Tools, 0.02), (Materials, 0.02), (Munitions, 0.02)]), 6),
        mk(3, 4, "Mechanized formations", ["Armoured assault groups", "Motorized raiders", "Anti-armour positions"], "(T094 | T068) & T066 & C037",
           q(&[(Components, 0.8), (Metal, 1.0), (Fuel, 0.3), (Munitions, 2.0)]), vec![], vec![], q(&[(Food, 1.0), (Fuel, 0.05), (Spares, 0.02), (Munitions, 0.04)]), 9),
        mk(4, 5, "Networked forces", ["Combined-arms forces", "Mobile strike groups", "Air-defence networks"], "T112 & T107 & T038 & C037",
           q(&[(Electronics, 2.0), (Components, 1.5), (Fuel, 0.5), (Aluminium, 0.1), (Munitions, 2.0)]), vec![], vec![], q(&[(Food, 1.0), (Fuel, 0.1), (Spares, 0.05), (Electronics, 0.02), (Munitions, 0.04)]), 12),
        mk(5, 6, "Autonomous systems", ["Unmanned breakthrough groups", "Distributed swarms", "Area-denial systems"], "T114 & T123 & T142 & C037",
           q(&[(Hardware, 0.2), (Electronics, 4.0), (Components, 2.0), (Batteries, 2.0), (Munitions, 2.0)]), vec![], vec![], q(&[(Food, 1.0), (Fuel, 0.1), (Spares, 0.08), (Electronics, 0.05), (Batteries, 0.05), (Munitions, 0.04)]), 12),
    ]
}

/// Same-tier counter matrix in basis points: `[own role][enemy role]`.
pub const COUNTER: [[i64; 3]; 3] = [[10000, 8000, 12500], [12500, 10000, 8000], [8000, 12500, 10000]];

pub fn role_index(r: Role) -> usize {
    r.index()
}

/// 2.5^tier in thousandths.
pub const TIER_POWER: [i64; 6] = [1000, 2500, 6250, 15625, 39063, 97656];

// ---------------------------------------------------------------------------
// Religion content (fictional; original vocabulary)
// ---------------------------------------------------------------------------

pub struct Belief {
    pub key: &'static str,
    pub slot: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
}

pub const BELIEFS: &[Belief] = &[
    Belief { key: "grain_oath", slot: "Founding obligation", name: "The Grain Oath", desc: "The precinct keeps a tithe store: extra food storage and slower spoilage where followers live." },
    Belief { key: "teaching_order", slot: "Founding obligation", name: "The Teaching Order", desc: "The precinct hosts sixteen thousand teaching places." },
    Belief { key: "healers_order", slot: "Founding obligation", name: "The Menders' Order", desc: "The precinct cares for eight hundred thousand residents." },
    Belief { key: "shared_days", slot: "Follower practice", name: "Shared Labour Days", desc: "Followers answer calls for common work more readily." },
    Belief { key: "remembrance", slot: "Follower practice", name: "Rites of Remembrance", desc: "Communities of followers are steadier in hard years." },
    Belief { key: "watchfulness", slot: "Follower practice", name: "The Long Watch", desc: "Followers accept defence duty more readily." },
    // ruleset 3.0 doctrines (design chapter 36, sections 3.2 and 4.2)
    Belief { key: "fruitful_households", slot: "Follower practice", name: "Fruitful Households", desc: "Followers marry young and prize many children: customary fertility is higher where they live." },
    Belief { key: "day_of_rest", slot: "Follower practice", name: "Day of Rest", desc: "Followers keep a day free of work each week: households are a little larger and steadier, work a little slower." },
    Belief { key: "sanctified_labour", slot: "Follower practice", name: "Sanctified Labour", desc: "Work at the furnace and the seam is worship: works and mines need fewer hands where followers live." },
    Belief { key: "stewardship", slot: "Founding obligation", name: "Stewardship of the Land", desc: "The land is held in trust: fields yield a little more and need fewer hands where followers live." },
    Belief { key: "open_courts", slot: "Worship facility", name: "Open Courts", desc: "Precincts double as meeting grounds; disputes settle sooner." },
    Belief { key: "copy_houses", slot: "Worship facility", name: "Copy Houses", desc: "Precincts copy texts: a small monthly supply of record media." },
    Belief { key: "sky_terraces", slot: "Worship facility", name: "Sky Terraces", desc: "Precincts keep observations; questions of measurement surface sooner." },
    Belief { key: "wayfarers", slot: "Propagation", name: "Wayfarer Teachers", desc: "The faith spreads faster to neighbouring regions." },
    Belief { key: "hearth_rites", slot: "Propagation", name: "Hearth Rites", desc: "The faith spreads faster within settled communities." },
    Belief { key: "caravan_rites", slot: "Propagation", name: "Caravan Rites", desc: "The faith travels along trade and treaty contacts." },
];

pub const BELIEF_SLOTS: [&str; 4] = ["Founding obligation", "Follower practice", "Worship facility", "Propagation"];
pub const RELIGION_SLOTS: u8 = 3;

// ---------------------------------------------------------------------------
// Content bundle
// ---------------------------------------------------------------------------

pub struct Content {
    pub techs: Vec<Tech>,
    pub tech_ix: HashMap<String, usize>,
    pub practices: Vec<Practice>,
    pub prac_ix: HashMap<String, usize>,
    pub facilities: Vec<FacDef>,
    pub fac_ix: HashMap<String, usize>,
    pub courses: Vec<Course>,
    pub course_ix: HashMap<String, usize>,
    pub unit_tiers: Vec<UnitTierDef>,
    /// For each technology: names of things it is known to enable.
    pub tech_enables: Vec<Vec<String>>,
    pub prac_enables: Vec<Vec<String>>,
    /// For each entry of `tech_enables` and of `prac_enables`: the technologies and
    /// practices a seat must have met before the entry is shown to it. A production
    /// method is named together with its facility, so it is shown only to a seat
    /// that has discovered everything the facility and the method rest on.
    pub tech_enables_gate: Vec<Vec<(Vec<usize>, Vec<usize>)>>,
    pub prac_enables_gate: Vec<Vec<(Vec<usize>, Vec<usize>)>>,
    pub graph_hash: u64,
    /// Edges of the building tree (design chapter 37, section 8.2).
    pub upgrades: Vec<UpgradeEdge>,
    pub families: Vec<Family>,
    pub exclusive_groups: Vec<ExclusiveGroup>,
}

impl Content {
    pub fn t(&self, id: &str) -> usize {
        *self.tech_ix.get(id).unwrap_or_else(|| panic!("unknown tech {id}"))
    }
    pub fn p(&self, id: &str) -> usize {
        *self.prac_ix.get(id).unwrap_or_else(|| panic!("unknown practice {id}"))
    }
    pub fn f(&self, key: &str) -> usize {
        *self.fac_ix.get(key).unwrap_or_else(|| panic!("unknown facility {key}"))
    }
    /// Parse a requirement expression against the loaded graph.
    pub fn parse(&self, s: &str) -> Req {
        parse_req(s, &self.tech_ix, &self.prac_ix, &self.fac_ix)
    }
}

fn load() -> Content {
    let tj: Vec<TechJson> = serde_json::from_str(include_str!("../../../content/technologies.json")).expect("technologies.json");
    let pj: Vec<PracJson> = serde_json::from_str(include_str!("../../../content/practices.json")).expect("practices.json");
    let cj: Vec<CourseJson> = serde_json::from_str(include_str!("../../../content/courses.json")).expect("courses.json");

    let tech_ix: HashMap<String, usize> = tj.iter().enumerate().map(|(i, t)| (t.id.clone(), i)).collect();
    let prac_ix: HashMap<String, usize> = pj.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let mut facs = facilities();
    let fac_ix: HashMap<String, usize> = facs.iter().enumerate().map(|(i, f)| (f.key.to_string(), i)).collect();
    assert_eq!(fac_ix.len(), facs.len(), "duplicate facility key");
    let pr = |s: &str| parse_req(s, &tech_ix, &prac_ix, &fac_ix);

    let mut graph_src = String::new();
    // tiers first: a node the tables do not know sits one above its deepest prerequisite
    let mut tiers: Vec<Option<u8>> = tj.iter().map(|t| tech_tier_known(&t.id)).collect();
    for _ in 0..tj.len() {
        for i in 0..tj.len() {
            if tiers[i].is_none() {
                let deps: Vec<&str> = tj[i].prereq.split(|ch: char| !(ch.is_ascii_alphanumeric())).filter(|x| x.starts_with('T')).collect();
                if deps.iter().all(|d| tech_ix.get(*d).map(|k| tiers[*k].is_some()).unwrap_or(true)) {
                    let top = deps.iter().filter_map(|d| tech_ix.get(*d).and_then(|k| tiers[*k])).max();
                    tiers[i] = Some(top.map(|t| (t + 1).min(9)).unwrap_or(0));
                }
            }
        }
    }
    let pace = pacing();
    let fam = families_json();
    let family_of = |id: &str| fam.families.iter().position(|f| f.members.iter().any(|m| m == id));
    let crit_t: std::collections::HashSet<&str> = fam.critical_technologies.iter().map(|s| s.as_str()).collect();
    let crit_p: std::collections::HashSet<&str> = fam.critical_practices.iter().map(|s| s.as_str()).collect();
    let techs: Vec<Tech> = tj
        .iter()
        .enumerate()
        .map(|(ti, t)| {
            let tier = tiers[ti].unwrap_or(0);
            let tp = pace.tiers[tier as usize];
            let node = pace.nodes.get(&t.id);
            let era_hint = node.and_then(|n| n.era.as_ref()).and_then(|e| pace.eras.get(e)).map(|e| e.hint);
            let work_bp = node.and_then(|n| n.work_bp).unwrap_or(10_000);
            let hint_bp = node.and_then(|n| n.hint_bp).unwrap_or(10_000);
            let kind = match t.kind.as_deref() {
                None | Some("core") => TechKind::Core,
                Some("side") => TechKind::Side,
                Some("alt") => TechKind::Alt,
                Some("dead") => TechKind::Dead,
                Some("sealed") => TechKind::Sealed,
                Some("entry") => TechKind::Entry,
                Some("branch") => TechKind::Branch,
                Some(k) => panic!("technologies.json: {} has an unknown kind {k}", t.id),
            };
            graph_src.push_str(&format!("{}:{};", t.id, t.prereq));
            Tech {
                id: t.id.clone(),
                name: t.name.clone(),
                label: t.label.clone(),
                group: t.group.clone(),
                group_title: t.group_title.clone(),
                prereq: pr(&t.prereq),
                requirements: t.requirements.clone(),
                capability: t.capability.clone(),
                tier,
                tags: tech_tags(&t.id),
                class: class_for_tier(tier),
                work: tp.work_k * 1000 * work_bp / 10_000,
                min_months: node.and_then(|n| n.min_months).unwrap_or(tp.min_months).max(tp.min_months),
                needs_facility: tech_needs_facility(&t.id),
                hint: era_hint.unwrap_or(tp.hint) * hint_bp / 10_000,
                era: node.and_then(|n| n.band).unwrap_or_else(|| tech_era(&t.id)),
                kind,
                family: family_of(&t.id),
                fragile: t.fragile,
                tradition: t.evidence.as_deref().and_then(|e| e.strip_prefix("tradition:")).map(|x| x.to_string()),
                critical: crit_t.contains(t.id.as_str()),
            }
        })
        .collect();

    let groups: Vec<String> = {
        let mut g: Vec<String> = Vec::new();
        for p in &pj {
            if !g.contains(&p.group) {
                g.push(p.group.clone());
            }
        }
        g
    };
    let practices: Vec<Practice> = pj
        .iter()
        .map(|p| {
            graph_src.push_str(&format!("{}:{};", p.id, p.prereq));
            let gi = groups.iter().position(|g| *g == p.group).unwrap() as u8;
            // the catalogue-group costs of the original practices: still what the
            // victory-critical ones cost (design chapter 39, section 2.3)
            let (gwork, gmedia, gevidence) = match gi {
                0 => (10, 0.0, 1200),
                1 => (36, 3.0, 3200),
                2 => (110, 12.0, 7000),
                _ => (260, 30.0, 12000),
            };
            let critical = crit_p.contains(p.id.as_str());
            let era = p.era.unwrap_or(0).min(8);
            let (eevidence, ework, emedia, emonths, eload) = PRACTICE_ERA_COSTS[era as usize];
            let by_era = p.era.is_some() && !critical;
            let (work, media, evidence) = if by_era { (ework, emedia, eevidence) } else { (gwork.min(260), gmedia, gevidence.min(12_000)) };
            let min_months = if by_era { emonths } else { 3 };
            Practice {
                id: p.id.clone(),
                name: p.name.clone(),
                group: p.group.clone(),
                group_ix: gi,
                prereq: pr(&p.prereq),
                hard: pr(p.hard.as_deref().unwrap_or_else(|| practice_hard(&p.id))),
                requirements: p.requirements.clone(),
                behavior: p.behavior.clone(),
                work: work * 1000,
                cost: if media > 0.0 { vec![(Good::Media, m(media))] } else { vec![] },
                evidence_needed: evidence,
                affinity: practice_affinity(&p.id),
                effect: practice_effect(&p.id),
                era,
                min_months,
                load: if p.era.is_some() { eload } else { 0 },
                exclusive: fam.exclusive_groups.iter().position(|g| g.members.iter().any(|m| m == &p.id)).or_else(|| p.exclusive.as_ref().and_then(|x| fam.exclusive_groups.iter().position(|g| &g.id == x))),
                tension: Vec::new(),
                tradition: p.tradition.clone(),
                critical,
            }
        })
        .collect();

    let mut practices = practices;
    for (i, p) in pj.iter().enumerate() {
        practices[i].tension = p.tension.iter().map(|x| *prac_ix.get(x).unwrap_or_else(|| panic!("practices.json: {} is in tension with unknown {x}", p.id))).collect();
    }
    for f in facs.iter_mut() {
        f.req = pr(f.req_src);
        for r in f.recipes.iter_mut() {
            r.req = pr(r.req_src);
            let mut ts = Vec::new();
            r.req.techs(&mut ts);
            r.era = ts.iter().map(|t| techs[*t].era).max().unwrap_or(0);
        }
        for s in f.scale.iter_mut() {
            s.1 = pr(s.2);
        }
    }

    let courses: Vec<Course> = cj
        .iter()
        .map(|c| {
            let meta = course_meta(&c.id);
            Course {
                id: c.id.clone(),
                name: c.name.clone(),
                desc: format!("{} Output: {}", c.prerequisites, c.output),
                req_src: meta.req,
                req: pr(meta.req),
                entrants: meta.entrants.to_vec(),
                teachers: meta.teachers.to_vec(),
                output: meta.output,
                months: c.months,
                class_size: c.class_size,
                venue: meta.venue,
                materials: meta.materials.iter().map(|(g, a)| (*g, m(*a))).collect(),
            }
        })
        .collect();
    let course_ix: HashMap<String, usize> = courses.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();

    let mut tiers = unit_tiers();
    for t in tiers.iter_mut() {
        t.req = pr(t.req_src);
    }

    let mut tech_enables: Vec<Vec<String>> = vec![Vec::new(); techs.len()];
    let mut prac_enables: Vec<Vec<String>> = vec![Vec::new(); practices.len()];
    let mut tech_enables_gate: Vec<Vec<(Vec<usize>, Vec<usize>)>> = vec![Vec::new(); techs.len()];
    let mut prac_enables_gate: Vec<Vec<(Vec<usize>, Vec<usize>)>> = vec![Vec::new(); practices.len()];
    // `gate`: what else the label names, which a seat must have met to be shown it
    let mut note = |req: &Req, label: String, gate: &[&Req]| {
        let (mut gt, mut gp) = (Vec::new(), Vec::new());
        for g in gate {
            g.techs(&mut gt);
            g.pracs(&mut gp);
        }
        let mut ts = Vec::new();
        req.techs(&mut ts);
        for t in ts {
            if !tech_enables[t].contains(&label) {
                tech_enables[t].push(label.clone());
                tech_enables_gate[t].push((gt.clone(), gp.clone()));
            }
        }
        let mut ps = Vec::new();
        req.pracs(&mut ps);
        for p in ps {
            if !prac_enables[p].contains(&label) {
                prac_enables[p].push(label.clone());
                prac_enables_gate[p].push((gt.clone(), gp.clone()));
            }
        }
    };
    for f in &facs {
        note(&f.req, f.name.to_string(), &[]);
        for r in &f.recipes {
            // a method is named with its facility: both must be within the seat's knowledge
            note(&r.req, format!("{} ({})", r.name, f.name), &[&f.req, &r.req]);
        }
        for s in &f.scale {
            note(&s.1, format!("Larger {}", f.name.to_lowercase()), &[]);
        }
    }
    for c in &courses {
        note(&c.req, format!("Course: {}", c.name), &[]);
    }
    for t in &tiers {
        note(&t.req, format!("Formations: {}", t.name), &[]);
    }
    for (i, p) in practices.iter().enumerate() {
        if !p.effect.is_empty() {
            prac_enables[i].insert(0, p.effect.to_string());
            prac_enables_gate[i].insert(0, (Vec::new(), Vec::new()));
        }
    }

    let upgrades = upgrade_edges(&facs, &fac_ix);
    let tid = |id: &String| *tech_ix.get(id).unwrap_or_else(|| panic!("families.json: unknown technology {id}"));
    let pid = |id: &String| *prac_ix.get(id).unwrap_or_else(|| panic!("families.json: unknown practice {id}"));
    let families: Vec<Family> = fam.families.iter().map(|f| Family { id: f.id.clone(), name: f.name.clone(), kind: f.kind.clone(), members: f.members.iter().map(tid).collect(), refuted_by: f.refuted_by.iter().map(tid).collect() }).collect();
    for f in &fam.families {
        for m in &f.critical_members {
            assert!(f.members.contains(m), "families.json: critical member {m} outside its family");
        }
    }
    let exclusive_groups: Vec<ExclusiveGroup> = fam.exclusive_groups.iter().map(|g| ExclusiveGroup { id: g.id.clone(), name: g.name.clone(), members: g.members.iter().map(pid).collect() }).collect();
    Content {
        families,
        exclusive_groups,
        upgrades,
        graph_hash: crate::util::fnv(graph_src.as_bytes()),
        techs,
        tech_ix,
        practices,
        prac_ix,
        facilities: facs,
        fac_ix,
        courses,
        course_ix,
        unit_tiers: tiers,
        tech_enables,
        prac_enables,
        tech_enables_gate,
        prac_enables_gate,
    }
}

static CONTENT: OnceLock<Content> = OnceLock::new();

pub fn content() -> &'static Content {
    CONTENT.get_or_init(load)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_counts_and_graph_are_valid() {
        let c = content();
        assert_eq!(c.techs.len(), 300);
        assert_eq!(c.practices.len(), 174);
        assert_eq!(c.courses.len(), 24);
        // Knowledge prerequisites are acyclic: every node is reachable by repeatedly
        // understanding nodes whose prerequisites are satisfied.
        struct K<'a>(&'a [bool]);
        impl ReqCtx for K<'_> {
            fn tech(&self, i: usize) -> bool { self.0[i] }
            fn prac(&self, i: usize) -> bool { self.0[i] }
            fn fac(&self, _: usize) -> bool { true }
            fn pop(&self) -> u64 { u64::MAX }
            fn regions(&self) -> u32 { u32::MAX }
            fn qual(&self, _: Qual) -> u32 { u32::MAX }
            fn contact(&self) -> bool { true }
            fn religion(&self) -> bool { true }
            fn sci_method(&self) -> bool { true }
        }
        let mut known = vec![false; c.techs.len()];
        loop {
            let mut changed = false;
            for (i, t) in c.techs.iter().enumerate() {
                if !known[i] && t.prereq.eval(&K(&known)) {
                    known[i] = true;
                    changed = true;
                }
            }
            if !changed { break; }
        }
        assert!(known.iter().all(|k| *k), "unreachable technology");
        let mut known = vec![false; c.practices.len()];
        loop {
            let mut changed = false;
            for (i, p) in c.practices.iter().enumerate() {
                if !known[i] && p.prereq.eval(&K(&known)) {
                    known[i] = true;
                    changed = true;
                }
            }
            if !changed { break; }
        }
        assert!(known.iter().all(|k| *k), "unreachable practice");
    }
}
