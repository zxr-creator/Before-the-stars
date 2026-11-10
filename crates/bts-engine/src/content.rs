//! Fixed, versioned content: the complete technology and practice graphs, course
//! templates, facilities, recipes and military tiers.
//!
//! The graphs (IDs, names, AND/OR prerequisites) are extracted from the design
//! atlases into `content/*.json` and are identical in every match. Gameplay
//! numbers in this module are provisional calibration parameters.

use bts_protocol::{Deposit, Good, LaborCategory, Qual, ResearchClass, Role};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const CONTENT_VERSION: &str = "bts-content/1.0.0";
pub const RULESET_VERSION: &str = "bts-rules/1.0.0";
pub const GENERATOR_VERSION: &str = "bts-worldgen/1.0.0";

// ---------------------------------------------------------------------------
// Requirement expressions
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub enum Req {
    True,
    Tech(usize),
    Prac(usize),
    Fac(usize),
    Pop(u32),
    Regions(u32),
    QualAtLeast(Qual, u32),
    Contact,
    Religion,
    SciMethod,
    All(Vec<Req>),
    Any(Vec<Req>),
}

/// Facts a requirement can be evaluated against.
pub trait ReqCtx {
    fn tech(&self, i: usize) -> bool;
    fn prac(&self, i: usize) -> bool;
    fn fac(&self, i: usize) -> bool;
    fn pop(&self) -> u32;
    fn regions(&self) -> u32;
    fn qual(&self, q: Qual) -> u32;
    fn contact(&self) -> bool;
    fn religion(&self) -> bool;
    fn sci_method(&self) -> bool;
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
    /// Research work in milli researcher-months before scenario pace scaling.
    pub work: i64,
    pub min_months: u32,
    /// Investigation needs this kind of installation to be operating.
    pub needs_facility: Option<&'static str>,
}

fn tech_needs_facility(id: &str) -> Option<&'static str> {
    match id {
        "T147" | "T148" | "T149" | "T161" | "T162" | "T163" => Some("high_energy"),
        "T144" | "T145" | "T152" => Some("launch_complex"),
        "T150" | "T151" | "T153" => Some("orbital_station"),
        "T164" | "T165" | "T166" | "T167" => Some("jump_testbed"),
        _ => None,
    }
}

const TIER_WORK: [i64; 10] = [18, 50, 120, 230, 400, 620, 950, 1450, 2200, 3400];
const TIER_MIN_MONTHS: [u32; 10] = [4, 6, 9, 12, 15, 18, 20, 24, 30, 36];

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

fn tech_tier(id: &str) -> u8 {
    let n: u32 = id[1..].parse().unwrap();
    match n {
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
        _ => panic!("no tier for {id}"),
    }
}

fn tech_tags(id: &str) -> Vec<Tag> {
    use Tag::*;
    let n: u32 = id[1..].parse().unwrap();
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
        _ => panic!("no tags for {id}"),
    };
    t.to_vec()
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
}

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
}

fn practice_hard(id: &str) -> &'static str {
    match id {
        "C004" => "T007",
        "C006" => "T010",
        "C007" => "F:fields | F:pasture",
        "C008" => "T011 & F:fields",
        "C009" => "POP>=400",
        "C010" => "F:granary",
        "C011" => "POP>=300",
        "C012" => "CONTACT",
        "C013" => "T025",
        "C014" => "REL & F:holy_site",
        "C015" => "POP>=500",
        "C016" => "POP>=400",
        "C017" => "T025 & F:fields",
        "C018" => "F:workshop & Q:artisan>=12",
        "C019" => "POP>=1500 & (T021 | T033)",
        "C020" => "T025 & Q:scribe>=4",
        "C021" => "CONTACT & T026",
        "C022" => "T026",
        "C023" => "T025 & F:lodge & Q:scribe>=4",
        "C024" => "CONTACT & T030",
        "C025" => "F:school",
        "C026" => "T026 & Q:scribe>=10 & POP>=1500",
        "C027" => "F:school & Q:scholar>=4",
        "C028" => "T030 & F:archive",
        "C029" => "T045 & T040 & T049",
        "C030" => "F:workshop & REG>=2",
        "C031" => "CONTACT",
        "C032" => "F:school & Q:teacher>=10 & (T030 | T048)",
        "C033" => "T061 | T060",
        "C034" => "POP>=3000",
        "C035" => "T066",
        "C036" => "F:admin",
        "C037" => "F:barracks & Q:scribe>=10",
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
    Deposit(Deposit),
    TestNode,
    /// Requires another facility in the same region.
    With(&'static str),
}

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
pub struct Recipe {
    pub key: &'static str,
    pub name: &'static str,
    pub req_src: &'static str,
    pub req: Req,
    pub inputs: Vec<(Good, i64)>,
    pub outputs: Vec<(Good, i64)>,
    pub shaft: i64,
    pub elec: i64,
    pub compute: i64,
    pub out_shaft: i64,
    pub out_elec: i64,
    pub out_compute: i64,
    pub research: Option<(ResearchClass, i64)>,
    /// Extraction recipes deplete this deposit one-for-one with output.
    pub depletes: Option<Deposit>,
    /// Progress toward one jump assembly per month at full rate (milli).
    pub assembly: i64,
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
    pub cost: Vec<(Good, i64)>,
    pub work: i64,
    pub skilled: Vec<(Vec<Qual>, u16)>,
    pub general: u16,
    pub recipes: Vec<Recipe>,
    pub upkeep: Vec<(Good, i64)>,
    pub provides: Vec<(Cap, i64)>,
    pub labor: Option<LaborCategory>,
    pub tags: Vec<Tag>,
    pub max_level: u16,
    /// Level caps lifted by established practices: `(cap_without, practice)`.
    pub scale: Vec<(u16, Req, &'static str)>,
    pub food: bool,
    pub power_source: bool,
}

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
        assembly: 0,
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
    fn assembly(mut self, v: f64) -> Self {
        self.0.assembly = m(v);
        self
    }
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
    fn skilled(mut self, quals: &[Qual], n: u16) -> Self {
        self.0.skilled.push((quals.to_vec(), n));
        self
    }
    fn general(mut self, n: u16) -> Self {
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
        self.0.provides.push((c, m(v)));
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
}

fn facilities() -> Vec<FacDef> {
    use Good::*;
    use LaborCategory as L;
    use Qual as Q;
    use ResearchClass as RC;
    let craft_any = [Q::Artisan, Q::Lorekeeper, Q::Smith, Q::Builder, Q::Agronomist, Q::Navigator, Q::Tallier];
    let v = vec![
        // ---- food -------------------------------------------------------
        fac("fields", "Fields", "Food", "Cleared and tended plots. Ten cultivators work each level; yield depends on seed, traction, water and inputs actually supplied, and falls by three tenths when no tools are in store.")
            .req("T005").site(Site::Arable).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(24.0).general(10)
            .tags(&[Tag::Farm]).scale(4, "C007").scale(14, "C017").food(),
        fac("pasture", "Pastures", "Food", "Managed herds on rough grazing. Animals also provide traction once the methods are known.")
            .req("T006").site(Site::Pasture).cost(&[(Materials, 2.0)]).work(16.0).general(5)
            .tags(&[Tag::Farm, Tag::Forage]).scale(4, "C007").food(),
        fac("fishery", "Fishing grounds", "Food", "Nets, weirs and boats working a stretch of coast or river.")
            .req("T004").site(Site::Fishery).cost(&[(Materials, 2.0), (Tools, 1.0)]).work(12.0).general(8)
            .tags(&[Tag::Forage, Tag::Sea]).food(),
        fac("granary", "Granaries", "Food", "Dry stores with custodians. Each level keeps 2,500 units of food and slows spoilage.")
            .req("T007").cost(&[(Materials, 6.0)]).work(20.0).general(1).provides(Cap::Storage, 2500.0)
            .labor(L::Services).tags(&[Tag::Farm, Tag::Record]),
        fac("irrigation", "Irrigation works", "Food", "Channels and gates. Each level waters five levels of fields.")
            .req("T011").site(Site::River).cost(&[(Materials, 8.0), (Tools, 1.0)]).work(40.0).general(1)
            .provides(Cap::Irrigation, 5.0).labor(L::Services).tags(&[Tag::Water, Tag::Farm]).scale(1, "C008"),
        // ---- extraction -------------------------------------------------
        fac("camp", "Timber and quarry camps", "Extraction", "Felling, quarrying and clay digging for building material.")
            .site(Site::Forest).cost(&[(Tools, 1.0)]).work(8.0).general(8)
            .recipe(rec("materials", "Timber, stone and clay").out(&[(Materials, 16.0)]))
            .upkeep(&[(Tools, 0.25)]).labor(L::Extraction).tags(&[Tag::Craft, Tag::Build]),
        fac("mine_copper", "Copper mines", "Extraction", "Workings on a surveyed copper orebody. Output is deducted from the deposit.")
            .req("T014").site(Site::Deposit(Deposit::CopperOre)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(CopperOre, 36.0)]).depletes(Deposit::CopperOre))
            .recipe(rec("shallow", "Shallow workings").out(&[(CopperOre, 18.0)]).depletes(Deposit::CopperOre))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine]),
        fac("mine_iron", "Iron mines", "Extraction", "Workings on a surveyed iron orebody. Output is deducted from the deposit.")
            .req("T014").site(Site::Deposit(Deposit::IronOre)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(IronOre, 36.0)]).depletes(Deposit::IronOre))
            .recipe(rec("shallow", "Shallow workings").out(&[(IronOre, 18.0)]).depletes(Deposit::IronOre))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine]),
        fac("mine_coal", "Coal pits", "Extraction", "Coal workings. Output is deducted from the seam.")
            .req("T014").site(Site::Deposit(Deposit::Coal)).cost(&[(Materials, 6.0), (Tools, 3.0)]).work(40.0).general(12)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(10.0).out(&[(Coal, 36.0)]).depletes(Deposit::Coal))
            .recipe(rec("shallow", "Shallow workings").out(&[(Coal, 18.0)]).depletes(Deposit::Coal))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Steam]),
        fac("mine_minerals", "Rare-mineral workings", "Extraction", "Small, selective workings for the minerals that analysis has shown to matter.")
            .req("T043").site(Site::Deposit(Deposit::Minerals)).cost(&[(Materials, 8.0), (Tools, 4.0)]).work(60.0).general(10)
            .recipe(rec("deep", "Drained deep workings").req("T063").shaft(8.0).out(&[(Minerals, 12.0)]).depletes(Deposit::Minerals))
            .recipe(rec("shallow", "Selective workings").out(&[(Minerals, 6.0)]).depletes(Deposit::Minerals))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Chem]),
        fac("oilwell", "Oil wells", "Extraction", "Drilled wells and gathering lines on a known field.")
            .req("T090").site(Site::Deposit(Deposit::Crude)).cost(&[(Metal, 6.0), (Components, 2.0), (Tools, 2.0)]).work(60.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 1).general(6)
            .recipe(rec("crude", "Crude extraction").shaft(6.0).out(&[(Crude, 30.0)]).depletes(Deposit::Crude))
            .upkeep(&[(Tools, 0.5)]).labor(L::Extraction).tags(&[Tag::Mine, Tag::Fuel]),
        // ---- craft and industry ----------------------------------------
        fac("workshop", "Craft workshops", "Industry", "Toolmakers. Better metal gives more and better tools from the same hands.")
            .cost(&[(Materials, 4.0)]).work(14.0).skilled(&[Q::Artisan], 2).general(4)
            .recipe(rec("iron_tools", "Iron tools").req("T023").inp(&[(Metal, 1.5), (Materials, 2.0)]).out(&[(Tools, 12.0)]))
            .recipe(rec("copper_tools", "Copper and bronze tools").req("T015").inp(&[(Copper, 1.5), (Materials, 2.0)]).out(&[(Tools, 9.0)]))
            .recipe(rec("stone_tools", "Stone, bone and wood tools").inp(&[(Materials, 4.0)]).out(&[(Tools, 5.0)]))
            .labor(L::Industry).tags(&[Tag::Craft]).scale(3, "C018").scale(10, "C022"),
        fac("kiln", "Kilns", "Industry", "Fired brick, tile and vessels: building material without a forest.")
            .req("T008").cost(&[(Materials, 5.0)]).work(16.0).skilled(&[Q::Artisan], 1).general(5)
            .recipe(rec("brick", "Fired building material").out(&[(Materials, 15.0)]))
            .upkeep(&[(Tools, 0.2)]).labor(L::Industry).tags(&[Tag::Craft, Tag::Build]),
        fac("copper_smelter", "Copper furnaces", "Industry", "Charcoal furnaces reducing copper ore.")
            .req("T015").cost(&[(Materials, 8.0), (Tools, 2.0)]).work(30.0).skilled(&[Q::Smith, Q::Artisan], 2).general(4)
            .recipe(rec("copper", "Copper smelting").inp(&[(CopperOre, 8.0), (Materials, 4.0)]).out(&[(Copper, 4.0)]))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Metal]),
        fac("bloomery", "Iron bloomeries", "Industry", "Small furnaces and forges turning ore into workable iron.")
            .req("T023").cost(&[(Materials, 8.0), (Tools, 2.0)]).work(30.0).skilled(&[Q::Smith, Q::Artisan], 2).general(4)
            .recipe(rec("iron", "Bloomery iron").inp(&[(IronOre, 8.0), (Materials, 6.0)]).out(&[(Metal, 4.0)]))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Metal]),
        fac("steelworks", "Steelworks", "Industry", "Coke furnaces and controlled steelmaking at scale.")
            .req("T060").cost(&[(Metal, 20.0), (Materials, 20.0), (Tools, 5.0)]).work(160.0)
            .skilled(&[Q::Smith, Q::Mechanic], 4).general(12)
            .recipe(rec("steel", "Coke steel").inp(&[(IronOre, 40.0), (Coal, 20.0)]).out(&[(Metal, 30.0)]).shaft(10.0))
            .upkeep(&[(Tools, 1.5)]).labor(L::Industry).tags(&[Tag::Metal, Tag::Machine]).scale(2, "C033").scale(6, "C035"),
        fac("machine_shop", "Machine shops", "Industry", "Standardized machine tools cutting components to gauge. Needs shaft power.")
            .req("T061").cost(&[(Metal, 12.0), (Tools, 6.0), (Materials, 8.0)]).work(120.0)
            .skilled(&[Q::Mechanic, Q::Artisan, Q::Smith], 4).general(6)
            .recipe(rec("components", "Precision machining").inp(&[(Metal, 12.5), (Tools, 1.0)]).out(&[(Components, 10.0)]).shaft(30.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Machine]).scale(2, "C033").scale(6, "C035"),
        fac("parts_works", "Parts and repair works", "Industry", "Spares, lubricants and filters matched to the machines that need them.")
            .req("T066").cost(&[(Metal, 8.0), (Components, 3.0), (Tools, 4.0)]).work(90.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2).general(3)
            .recipe(rec("spares", "Maintenance inputs").inp(&[(Components, 3.0), (Tools, 0.5)]).out(&[(Spares, 12.0)]).shaft(4.0))
            .labor(L::Industry).tags(&[Tag::Machine]),
        fac("wire_works", "Copper refinery and wire works", "Industry", "Refined copper drawn into conductor of known quality.")
            .req("T054").cost(&[(Metal, 8.0), (Tools, 4.0), (Materials, 8.0)]).work(90.0)
            .skilled(&[Q::Electrician, Q::Smith, Q::Artisan], 2).general(4)
            .recipe(rec("electrolytic", "Electrolytic refining and drawing").req("T103").inp(&[(Copper, 11.0), (Chemicals, 0.5)]).out(&[(Conductors, 10.0)]).elec(10.0))
            .recipe(rec("drawn", "Fire-refined drawn wire").inp(&[(Copper, 12.0), (Materials, 2.0)]).out(&[(Conductors, 6.0)]).shaft(4.0))
            .upkeep(&[(Tools, 0.5)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Metal]),
        fac("chem_plant", "Chemical works", "Industry", "Controlled processes producing reagents, acids, alkalis and nutrients.")
            .req("T064").cost(&[(Metal, 15.0), (Components, 4.0), (Materials, 10.0)]).work(140.0)
            .skilled(&[Q::Technician, Q::Scholar, Q::Researcher], 2).general(6)
            .recipe(rec("chemicals", "Industrial chemicals").inp(&[(Coal, 6.0), (Materials, 4.0)]).out(&[(Chemicals, 10.0)]).shaft(6.0))
            .recipe(rec("chemicals_wood", "Wood and mineral chemistry").inp(&[(Materials, 14.0)]).out(&[(Chemicals, 5.0)]).shaft(4.0))
            .upkeep(&[(Tools, 0.8)]).labor(L::Industry).tags(&[Tag::Chem]).scale(3, "C033"),
        fac("insulation_works", "Insulation and seal works", "Industry", "Ceramic, rubber and polymer parts with known thermal and electrical limits.")
            .req("T031 | T064").cost(&[(Metal, 6.0), (Materials, 10.0), (Tools, 3.0)]).work(80.0)
            .skilled(&[Q::Technician, Q::Artisan], 2).general(4)
            .recipe(rec("polymer", "Polymer insulation").req("T093").inp(&[(Chemicals, 8.0)]).out(&[(Insulation, 10.0)]).shaft(4.0))
            .recipe(rec("ceramic", "Ceramic and natural insulation").inp(&[(Materials, 12.0)]).out(&[(Insulation, 4.0)]))
            .upkeep(&[(Tools, 0.4)]).labor(L::Industry).tags(&[Tag::Chem, Tag::Craft]),
        fac("refinery", "Refinery", "Industry", "Fractionation with composition checks: fuel of known quality plus chemical feedstock.")
            .req("T090").cost(&[(Metal, 25.0), (Components, 8.0), (Materials, 10.0)]).work(200.0)
            .skilled(&[Q::Technician, Q::Mechanic], 2).general(6)
            .recipe(rec("refine", "Fractionation").inp(&[(Crude, 20.0)]).out(&[(Fuel, 11.0), (Chemicals, 7.0)]).shaft(4.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Chem]),
        fac("synfuel", "Synthetic fuel plant", "Industry", "Fuel from coal and electricity when wells are out of reach.")
            .req("T096").cost(&[(Metal, 40.0), (Components, 20.0), (Conductors, 6.0)]).work(400.0)
            .skilled(&[Q::Technician], 4).general(6)
            .recipe(rec("synfuel", "Synthetic hydrocarbons").inp(&[(Coal, 10.0), (Chemicals, 2.0)]).out(&[(Fuel, 12.0)]).elec(60.0))
            .upkeep(&[(Spares, 0.8)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Chem]),
        fac("purifier", "High-purity materials works", "Industry", "Electrochemical purification into substrates that ordinary glass or metal cannot replace.")
            .req("T103").cost(&[(Metal, 20.0), (Components, 10.0), (Conductors, 6.0), (Instruments, 4.0)]).work(300.0)
            .skilled(&[Q::Technician], 3).general(3)
            .recipe(rec("substrate", "High-purity substrate").inp(&[(Minerals, 4.0), (Chemicals, 2.0)]).out(&[(Substrate, 2.0)]).elec(30.0))
            .upkeep(&[(Spares, 0.5)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Chem]),
        fac("fab", "Electronics cells", "Industry", "Clean manufacturing cells for electronic devices.")
            .req("T104 | T106").cost(&[(Metal, 10.0), (Components, 20.0), (Conductors, 6.0), (Instruments, 5.0)]).work(400.0)
            .skilled(&[Q::Technician, Q::Electrician], 4).general(4)
            .recipe(rec("integrated", "Integrated devices").req("T106").inp(&[(Substrate, 0.4), (Conductors, 0.6), (Chemicals, 0.5)]).out(&[(Electronics, 20.0)]).elec(40.0))
            .recipe(rec("vacuum", "Vacuum devices").req("T104").inp(&[(Conductors, 1.0), (Insulation, 0.5), (Components, 0.5)]).out(&[(Electronics, 4.0)]).elec(15.0))
            .upkeep(&[(Spares, 0.8)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Compute]),
        fac("computer_works", "Computer works", "Industry", "Assembly and acceptance testing of computing hardware.")
            .req("T111").cost(&[(Metal, 10.0), (Components, 10.0), (Electronics, 10.0)]).work(250.0)
            .skilled(&[Q::Technician, Q::Programmer, Q::Electrician], 3).general(3)
            .recipe(rec("hardware", "Hardware assembly").inp(&[(Electronics, 16.0), (Components, 1.2), (Conductors, 0.4), (Insulation, 0.2)]).out(&[(Hardware, 4.0)]).elec(8.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Compute]),
        fac("datacenter", "Computing centre", "Industry", "Installed hardware delivering compute as a monthly service. Compute cannot be stored.")
            .req("T111").cost(&[(Hardware, 10.0), (Components, 4.0), (Conductors, 2.0)]).work(200.0)
            .skilled(&[Q::Programmer, Q::Technician], 4)
            .recipe(rec("cluster", "Accelerator clusters").req("T117").gives_compute(300.0).elec(60.0))
            .recipe(rec("mainframes", "Programmable computers").gives_compute(100.0).elec(30.0))
            .upkeep(&[(Spares, 0.5), (Hardware, 0.1)]).labor(L::Industry).tags(&[Tag::Compute]).scale(2, "C047"),
        fac("press", "Scriptorium and press", "Industry", "Durable record media, teaching texts and, later, inexpensive print.")
            .req("T025").cost(&[(Materials, 6.0), (Tools, 1.0)]).work(20.0)
            .skilled(&[Q::Scribe, Q::Literate], 2).general(2)
            .recipe(rec("print", "Scaled printing").req("T048").inp(&[(Materials, 4.0)]).out(&[(Media, 24.0)]))
            .recipe(rec("copying", "Teaching-text reproduction").req("T030").inp(&[(Materials, 2.0)]).out(&[(Media, 8.0)]))
            .recipe(rec("writing", "Written records").inp(&[(Materials, 1.0)]).out(&[(Media, 3.0)]))
            .labor(L::Industry).tags(&[Tag::Record, Tag::Teach]),
        fac("instrument_shop", "Instrument makers", "Industry", "Balances, gauges, optics and clocks: the equipment that makes measurement repeatable.")
            .req("T040").cost(&[(Materials, 8.0), (Tools, 4.0)]).work(50.0)
            .skilled(&[Q::Artisan, Q::Technician], 3)
            .recipe(rec("precision", "Precision instruments").req("T044").inp(&[(Metal, 1.5), (Tools, 1.0)]).out(&[(Instruments, 5.0)]))
            .recipe(rec("basic_metal", "Measuring instruments").inp(&[(Metal, 1.5), (Tools, 1.0)]).out(&[(Instruments, 3.0)]))
            .recipe(rec("basic_copper", "Copper measuring instruments").inp(&[(Copper, 1.0), (Tools, 1.0)]).out(&[(Instruments, 2.0)]))
            .labor(L::Industry).tags(&[Tag::Measure, Tag::Craft]),
        fac("pharma", "Pharmaceutical and biological works", "Industry", "Medicines and, with controlled organisms, a wider range of biological products.")
            .req("T070 | T132").cost(&[(Metal, 10.0), (Components, 6.0), (Instruments, 4.0)]).work(200.0)
            .skilled(&[Q::Physician, Q::Technician], 2).general(4)
            .recipe(rec("bio", "Controlled biological manufacture").req("T132").inp(&[(Food, 10.0), (Chemicals, 1.0)]).out(&[(Medicine, 30.0)]).elec(20.0))
            .recipe(rec("pharma", "Pharmaceutical manufacture").inp(&[(Chemicals, 4.0), (Food, 4.0)]).out(&[(Medicine, 10.0)]))
            .upkeep(&[(Spares, 0.3)]).labor(L::Industry).tags(&[Tag::Bio, Tag::Health, Tag::Chem]),
        // ---- power ------------------------------------------------------
        fac("waterwheel", "Water and wind mills", "Power", "Shaft power from a real fall of water or a steady wind. Each level delivers 20.")
            .req("T029").site(Site::Hydro).cost(&[(Materials, 10.0), (Tools, 2.0)]).work(40.0).general(1)
            .recipe(rec("mill", "Mill wheels").gives_shaft(20.0))
            .upkeep(&[(Tools, 0.3)]).labor(L::Industry).tags(&[Tag::Water, Tag::Machine]).power(),
        fac("steam", "Steam machinery station", "Power", "Boilers and engines turning coal into shaft work.")
            .req("T080").cost(&[(Metal, 20.0), (Tools, 5.0), (Materials, 10.0)]).work(200.0)
            .skilled(&[Q::Mechanic, Q::Smith, Q::Artisan], 2).general(2)
            .recipe(rec("turbine", "Steam turbines").req("T083").inp(&[(Coal, 8.0)]).gives_shaft(80.0))
            .recipe(rec("compound", "High-pressure compound engines").req("T081").inp(&[(Coal, 10.0)]).gives_shaft(70.0))
            .recipe(rec("engine", "Practical steam engines").inp(&[(Coal, 12.0)]).gives_shaft(60.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Steam, Tag::Machine]).power(),
        fac("diesel", "Diesel machinery station", "Power", "Engines burning refined fuel: compact power wherever fuel can be delivered.")
            .req("T091").cost(&[(Metal, 12.0), (Components, 3.0)]).work(180.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2).general(1)
            .recipe(rec("heavy", "Heavy diesel").req("T092").inp(&[(Fuel, 6.0)]).gives_shaft(90.0))
            .recipe(rec("engine", "Internal combustion").inp(&[(Fuel, 6.0)]).gives_shaft(60.0))
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Fuel, Tag::Machine]).power(),
        fac("generator", "Generator hall", "Power", "Converts up to 60 of local shaft power per level into electricity at nine tenths.")
            .req("T100").cost(&[(Components, 5.0), (Conductors, 5.0), (Insulation, 1.0)]).work(100.0)
            .skilled(&[Q::Electrician, Q::Mechanic], 1)
            .provides(Cap::GenCap, 60.0).upkeep(&[(Tools, 0.5)]).labor(L::Industry).tags(&[Tag::Electric]),
        fac("hydro", "Hydroelectric works", "Power", "Dams, wheels and generators on a surveyed site. No fuel; the river sets the limit.")
            .req("T100").site(Site::Hydro).cost(&[(Metal, 20.0), (Conductors, 2.0), (Components, 3.0), (Insulation, 0.5), (Materials, 20.0)]).work(500.0)
            .skilled(&[Q::Electrician, Q::Mechanic], 2).general(2)
            .recipe(rec("hydro", "Hydroelectric generation").gives_elec(90.0))
            .upkeep(&[(Tools, 1.0)]).labor(L::Industry).tags(&[Tag::Electric, Tag::Water]).power(),
        fac("grid", "Grid and substations", "Power", "Joins this region to the national grid so electricity can be shared, with losses.")
            .req("T102").cost(&[(Metal, 5.0), (Conductors, 10.0), (Insulation, 3.0)]).work(150.0)
            .skilled(&[Q::Electrician], 1).provides(Cap::GridLink, 1.0)
            .upkeep(&[(Spares, 0.4)]).labor(L::Industry).tags(&[Tag::Electric]).max(1),
        fac("fission", "Fission plant", "Power", "Safeguarded reactors: steady electricity from small quantities of rare minerals.")
            .req("T147 & C045").cost(&[(Metal, 80.0), (Components, 40.0), (Electronics, 20.0), (Conductors, 20.0), (Insulation, 10.0)]).work(2000.0)
            .skilled(&[Q::Scientist], 2).skilled(&[Q::Technician], 6).skilled(&[Q::Electrician], 4).general(4)
            .recipe(rec("fission", "Fission generation").inp(&[(Minerals, 1.0)]).gives_elec(600.0))
            .upkeep(&[(Spares, 2.0), (Electronics, 0.3)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Electric]).power(),
        fac("fusion", "Fusion plant", "Power", "Maintainable net-power fusion. Enormous output, enormous upkeep.")
            .req("T149 & C045").cost(&[(Metal, 200.0), (Components, 120.0), (Electronics, 80.0), (Conductors, 60.0), (Insulation, 30.0), (Hardware, 6.0)]).work(6000.0)
            .skilled(&[Q::Scientist], 6).skilled(&[Q::Technician], 10).skilled(&[Q::Electrician], 6).general(4)
            .recipe(rec("fusion", "Fusion generation").inp(&[(Chemicals, 1.0)]).gives_elec(2500.0))
            .upkeep(&[(Spares, 5.0), (Electronics, 1.0)]).labor(L::Industry).tags(&[Tag::HighEnergy, Tag::Electric]).power(),
        fac("orbital_power", "Orbital power receiver", "Power", "Ground station for power collected in orbit. Needs an orbital construction yard.")
            .req("T150 & F:orbital_yard").cost(&[(Metal, 60.0), (Components, 40.0), (Electronics, 40.0), (Conductors, 40.0)]).work(2500.0)
            .skilled(&[Q::Electrician], 4).skilled(&[Q::Orbital], 4)
            .recipe(rec("beam", "Orbital collection").gives_elec(1500.0))
            .upkeep(&[(Spares, 3.0), (Electronics, 1.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Electric]).power(),
        // ---- transport and civic ----------------------------------------
        fac("roads", "Roads and waystations", "Transport", "Maintained roads, bridges and staged carriage linking this region to the rest.")
            .req("T027").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(80.0).general(2)
            .provides(Cap::Transport, 1.0).upkeep(&[(Tools, 0.4)]).labor(L::Services).tags(&[Tag::Build, Tag::Trade]).max(1),
        fac("port", "Harbour", "Transport", "Moorings, slips and stores. Opens sea links and deep-water fishing.")
            .req("T013").site(Site::Coast).cost(&[(Materials, 15.0), (Tools, 2.0)]).work(60.0).general(4)
            .provides(Cap::Port, 1.0).provides(Cap::Transport, 1.0).upkeep(&[(Tools, 0.4)]).labor(L::Services).tags(&[Tag::Sea, Tag::Trade]).max(1),
        fac("rail", "Railway", "Transport", "Heavy freight on fixed track.")
            .req("T068").cost(&[(Metal, 40.0), (Components, 8.0), (Materials, 20.0)]).work(400.0)
            .skilled(&[Q::Mechanic, Q::Artisan], 2).general(4)
            .provides(Cap::Transport, 2.0).upkeep(&[(Tools, 1.0), (Coal, 1.0)]).labor(L::Services).tags(&[Tag::Machine, Tag::Trade]).max(1),
        fac("depot", "Motor depot", "Transport", "Vehicles, fuel and repair crews for mechanized freight.")
            .req("T094").cost(&[(Metal, 10.0), (Components, 15.0)]).work(200.0)
            .skilled(&[Q::Mechanic], 3).general(4)
            .provides(Cap::Transport, 3.0).upkeep(&[(Fuel, 2.0), (Spares, 0.8)]).labor(L::Services).tags(&[Tag::Fuel, Tag::Trade]).max(1),
        fac("waterworks", "Wells and waterworks", "Civic", "Lifting and distribution. Each level supplies 1,200 residents.")
            .req("T021").cost(&[(Materials, 10.0), (Tools, 2.0)]).work(50.0).general(2)
            .provides(Cap::Water, 1200.0).upkeep(&[(Tools, 0.2)]).labor(L::Services).tags(&[Tag::Water]),
        fac("sewers", "Drains and sewers", "Civic", "Drinking water kept apart from waste. Each level serves 3,000 residents.")
            .req("T033 & C019").cost(&[(Materials, 20.0), (Tools, 3.0)]).work(120.0).general(3)
            .provides(Cap::Water, 3000.0).upkeep(&[(Tools, 0.3)]).labor(L::Services).tags(&[Tag::Water, Tag::Health]),
        fac("water_treatment", "Water treatment works", "Civic", "Treated supply and sanitation for a dense city. Each level serves 12,000 residents.")
            .req("T069").cost(&[(Metal, 10.0), (Components, 4.0), (Chemicals, 5.0), (Materials, 20.0)]).work(300.0)
            .skilled(&[Q::Technician, Q::Mechanic], 1).general(4)
            .provides(Cap::Water, 12000.0).upkeep(&[(Chemicals, 0.5)]).labor(L::Services).tags(&[Tag::Water, Tag::Health, Tag::Chem]),
        fac("clinic", "Healers' lodge", "Civic", "Trauma care and medicinal practice for 800 residents per level.")
            .req("T032").cost(&[(Materials, 6.0)]).work(20.0).skilled(&[Q::Physician, Q::Lorekeeper], 2)
            .provides(Cap::Health, 800.0).labor(L::Services).tags(&[Tag::Health]),
        fac("hospital", "Hospital", "Civic", "Clinical records, trained physicians and, where supplied, medicines. 4,000 residents per level.")
            .req("T046").cost(&[(Materials, 20.0), (Metal, 4.0), (Instruments, 2.0)]).work(200.0)
            .skilled(&[Q::Physician], 4).general(6)
            .provides(Cap::Health, 4000.0).upkeep(&[(Medicine, 1.0)]).labor(L::Services).tags(&[Tag::Health, Tag::Bio]),
        fac("admin", "Administrative offices", "Civic", "Budget records and appointed staff. Each level administers three more regions.")
            .req("C026").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(80.0)
            .skilled(&[Q::Scribe], 4).general(2)
            .provides(Cap::Admin, 3.0).upkeep(&[(Media, 0.5)]).labor(L::Services).tags(&[Tag::Record]),
        fac("barracks", "Barracks and drill yard", "Civic", "Rolls, stores and space to train 200 soldiers per level at once.")
            .req("C016").cost(&[(Materials, 12.0), (Tools, 3.0)]).work(50.0).general(2)
            .provides(Cap::Barracks, 200.0).labor(L::Services).tags(&[Tag::War]),
        fac("holy_site", "Sacred precinct", "Civic", "A continuing centre of gathering, teaching and relief for a local movement.")
            .req("REL").cost(&[(Materials, 25.0), (Tools, 3.0)]).work(120.0).general(4)
            .provides(Cap::Sacred, 1.0).labor(L::Services).tags(&[Tag::Teach]).max(1),
        // ---- education --------------------------------------------------
        fac("lodge", "Teaching lodge", "Education", "Demonstration, apprenticeship and small classes. Sixteen places per level.")
            .req("C005").cost(&[(Materials, 5.0)]).work(15.0).provides(Cap::SeatsLodge, 16.0)
            .labor(L::Knowledge).tags(&[Tag::Teach]),
        fac("school", "School", "Education", "A lasting site with curricula and texts. Forty places per level.")
            .req("C023 & T025").cost(&[(Materials, 15.0), (Tools, 2.0)]).work(60.0).provides(Cap::SeatsSchool, 40.0)
            .upkeep(&[(Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Teach]),
        fac("college", "College", "Education", "Specialist teaching supported by patronage. Thirty places per level.")
            .req("C027").cost(&[(Materials, 30.0), (Tools, 4.0), (Instruments, 2.0)]).work(150.0).provides(Cap::SeatsCollege, 30.0)
            .upkeep(&[(Media, 0.8), (Instruments, 0.15)]).labor(L::Knowledge).tags(&[Tag::Teach, Tag::Science]),
        fac("tech_institute", "Technical institute", "Education", "Training shops with real machines and gauges. Thirty-two places per level.")
            .req("T065 & C025").cost(&[(Metal, 10.0), (Components, 5.0), (Tools, 6.0), (Materials, 15.0)]).work(200.0)
            .provides(Cap::SeatsInstitute, 32.0).upkeep(&[(Tools, 0.6), (Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Teach, Tag::Machine]),
        // ---- research ---------------------------------------------------
        fac("makers_circle", "Makers' circle", "Research", "Practitioners given time to compare methods and try improvements.")
            .cost(&[(Materials, 3.0)]).work(10.0).skilled(&craft_any, 6)
            .recipe(rec("inquiry", "Craft inquiry").research(RC::Craft, 6.0))
            .upkeep(&[(Tools, 0.3)]).labor(L::Knowledge).tags(&[Tag::Craft]),
        fac("archive", "Archive and house of study", "Research", "Kept records and people paid to read, compare and compute.")
            .req("T025 & C013").cost(&[(Materials, 12.0), (Media, 4.0)]).work(50.0)
            .skilled(&[Q::Scholar, Q::Scribe, Q::Researcher], 6)
            .recipe(rec("study", "Scholarly study").research(RC::Scholarly, 6.0))
            .upkeep(&[(Media, 0.6)]).labor(L::Knowledge).tags(&[Tag::Record, Tag::Measure]),
        fac("laboratory", "Laboratory", "Research", "Instruments, controlled comparisons and repeated trials.")
            .req("T045 & (C027 | C028)").cost(&[(Materials, 20.0), (Instruments, 6.0), (Tools, 3.0)]).work(120.0)
            .skilled(&[Q::Researcher, Q::Scholar, Q::Scientist], 8)
            .recipe(rec("experiment", "Experimental science").research(RC::Scientific, 8.0))
            .upkeep(&[(Instruments, 0.4), (Media, 0.4)]).labor(L::Knowledge).tags(&[Tag::Measure, Tag::Science]),
        fac("institute", "Research institute", "Research", "Organized programmes joining scientists with workshops and engineers.")
            .req("SCI").cost(&[(Metal, 20.0), (Tools, 10.0), (Instruments, 12.0), (Materials, 30.0)]).work(400.0)
            .skilled(&[Q::Scientist, Q::Researcher], 14).skilled(&[Q::Technician, Q::Mechanic, Q::Artisan], 6)
            .recipe(rec("programme", "Industrial research").research(RC::Industrial, 20.0))
            .upkeep(&[(Instruments, 1.0), (Media, 1.0)]).labor(L::Knowledge).tags(&[Tag::Science, Tag::Machine]).scale(3, "C044"),
        fac("advanced_lab", "Advanced research centre", "Research", "Computation-supported research with precision instruments.")
            .req("T100 & T055 & SCI").cost(&[(Metal, 30.0), (Components, 15.0), (Conductors, 10.0), (Instruments, 20.0)]).work(900.0)
            .skilled(&[Q::Scientist, Q::Researcher], 24).skilled(&[Q::Programmer, Q::Technician], 8).skilled(&[Q::Technician, Q::Electrician, Q::Mechanic], 8)
            .recipe(rec("computational", "Computation-supported research").req("T111").research(RC::Advanced, 40.0).elec(40.0).compute(30.0))
            .recipe(rec("instrumented", "Instrumented research").research(RC::Advanced, 26.0).elec(40.0))
            .upkeep(&[(Instruments, 2.0), (Spares, 1.0)]).labor(L::Knowledge).tags(&[Tag::Science, Tag::Compute]),
        fac("auto_lab", "Automated experiment hall", "Research", "Validated models run real experiment stations under supervision.")
            .req("T118 & C049").cost(&[(Hardware, 10.0), (Electronics, 40.0), (Components, 20.0), (Instruments, 20.0)]).work(800.0)
            .skilled(&[Q::Scientist], 4).skilled(&[Q::AiEngineer, Q::Programmer], 4)
            .recipe(rec("automated", "Automated experiments").research(RC::Advanced, 40.0).elec(60.0).compute(200.0))
            .upkeep(&[(Instruments, 2.0), (Electronics, 1.0), (Spares, 1.0)]).labor(L::Knowledge).tags(&[Tag::Compute, Tag::Science]),
        fac("high_energy", "High-energy laboratory", "Research", "Accelerators, plasma devices and the people who can run them.")
            .req("T146 & C045").cost(&[(Metal, 100.0), (Components, 50.0), (Electronics, 60.0), (Conductors, 40.0), (Instruments, 40.0)]).work(3000.0)
            .skilled(&[Q::Scientist], 40).skilled(&[Q::Technician], 12).skilled(&[Q::Electrician], 8)
            .recipe(rec("frontier", "Frontier experiments").research(RC::Frontier, 60.0).elec(300.0).compute(50.0))
            .upkeep(&[(Instruments, 4.0), (Electronics, 2.0), (Spares, 2.0)]).labor(L::Knowledge).tags(&[Tag::HighEnergy, Tag::Science]),
        // ---- space and jump engineering ----------------------------------
        fac("launch_complex", "Launch complex", "Space", "Pads, tracking and propellant handling. Keeps a launch cadence only while supplied.")
            .req("T140 & T141 & C045").cost(&[(Metal, 80.0), (Components, 60.0), (Electronics, 30.0), (Conductors, 10.0)]).work(2000.0)
            .skilled(&[Q::Technician], 8).skilled(&[Q::Scientist], 4).skilled(&[Q::Mechanic], 8).general(10)
            .recipe(rec("cadence", "Launch cadence").inp(&[(Fuel, 8.0), (Components, 2.0), (Electronics, 1.0)]).elec(40.0))
            .provides(Cap::Launch, 1.0).upkeep(&[(Spares, 1.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Fuel]).max(1),
        fac("orbital_station", "Orbital station", "Space", "A crewed, resupplied station. Requires a working launch complex in the same region.")
            .req("T142 & T144").site(Site::With("launch_complex"))
            .cost(&[(Metal, 60.0), (Components, 60.0), (Electronics, 40.0), (Insulation, 20.0), (Fuel, 80.0)]).work(2500.0)
            .skilled(&[Q::Orbital], 12).skilled(&[Q::Scientist], 4)
            .recipe(rec("orbit_science", "Orbital research").research(RC::Frontier, 10.0).inp(&[(Fuel, 4.0), (Food, 4.0), (Medicine, 0.5)]).elec(20.0))
            .provides(Cap::OrbitalStation, 1.0).upkeep(&[(Spares, 2.0), (Electronics, 1.0)]).labor(L::Industry).tags(&[Tag::Space]).max(1),
        fac("orbital_yard", "Orbital construction yard", "Space", "Scaled construction and manufacture in orbit. Requires an orbital station in the same region.")
            .req("T145 & C058").site(Site::With("orbital_station"))
            .cost(&[(Metal, 150.0), (Components, 150.0), (Electronics, 80.0), (Hardware, 10.0), (Fuel, 200.0)]).work(5000.0)
            .skilled(&[Q::Orbital], 20).skilled(&[Q::Mechanic], 10).skilled(&[Q::Technician], 10)
            .recipe(rec("yard_ops", "Orbital operations").inp(&[(Fuel, 8.0), (Components, 2.0)]).elec(60.0))
            .provides(Cap::OrbitalYard, 1.0).upkeep(&[(Spares, 4.0), (Electronics, 2.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::Machine]).max(1),
        fac("interferometer", "Orbital interferometer array", "Space", "Large-baseline optical instruments assembled in orbit.")
            .req("T151 & F:orbital_yard").cost(&[(Components, 60.0), (Electronics, 60.0), (Instruments, 40.0), (Hardware, 6.0), (Fuel, 60.0)]).work(2000.0)
            .skilled(&[Q::Scientist], 10).skilled(&[Q::Orbital], 6)
            .recipe(rec("baseline", "Baseline observations").research(RC::Frontier, 30.0).compute(60.0).elec(20.0))
            .upkeep(&[(Spares, 1.0), (Electronics, 1.0)]).labor(L::Knowledge).tags(&[Tag::Space, Tag::Science]).max(1),
        fac("jump_testbed", "Jump testbed", "Jump engineering", "The first installation able to reproduce the anomaly under load. Needs an orbital yard and vast power.")
            .req("T163 & C045 & C056 & F:orbital_yard & F:high_energy")
            .cost(&[(Metal, 200.0), (Components, 200.0), (Electronics, 150.0), (Conductors, 100.0), (Hardware, 20.0), (Instruments, 60.0)]).work(6000.0)
            .skilled(&[Q::Scientist], 30).skilled(&[Q::FtlEngineer, Q::Technician], 10).skilled(&[Q::Orbital], 10)
            .recipe(rec("jump_trials", "Jump-interface experiments").research(RC::Frontier, 60.0).elec(800.0).compute(100.0))
            .upkeep(&[(Spares, 4.0), (Electronics, 3.0), (Instruments, 2.0)]).labor(L::Knowledge).tags(&[Tag::HighEnergy, Tag::Space]).max(1),
        fac("jump_yard", "Jump assembly line", "Jump engineering", "An independently operable line that completes one standard jump assembly in twenty-four months of full work.")
            .req("T166 & C056")
            .cost(&[(Metal, 200.0), (Components, 200.0), (Electronics, 100.0), (Hardware, 20.0), (Conductors, 60.0)]).work(6000.0)
            .skilled(&[Q::FtlEngineer], 12).skilled(&[Q::Technician], 12).skilled(&[Q::Mechanic], 12).skilled(&[Q::Electrician], 6).general(10)
            .recipe(rec("assembly", "Jump assembly manufacture")
                .inp(&[(Components, 20.0), (Electronics, 15.0), (Hardware, 1.0), (Conductors, 6.0), (Insulation, 3.0), (Metal, 15.0), (Substrate, 1.0)])
                .elec(400.0).assembly(1.0 / 24.0))
            .provides(Cap::FtlYard, 1.0).upkeep(&[(Spares, 4.0)]).labor(L::Industry).tags(&[Tag::Space, Tag::HighEnergy, Tag::Machine]).max(1),
        fac("jump_base", "Jump deployment node", "Jump engineering", "Transport, maintenance and recovery capability at one of the three test nodes.")
            .req("T167 & C057").site(Site::TestNode)
            .cost(&[(Metal, 80.0), (Components, 60.0), (Electronics, 40.0), (Conductors, 20.0)]).work(2500.0)
            .skilled(&[Q::FtlEngineer], 4).skilled(&[Q::Orbital], 6).skilled(&[Q::Technician], 6).general(8)
            .recipe(rec("node_ops", "Node operations").inp(&[(Fuel, 4.0), (Electronics, 1.0)]).elec(100.0))
            .provides(Cap::FtlBase, 1.0).upkeep(&[(Spares, 3.0)]).labor(L::Industry).tags(&[Tag::Space]).max(1),
    ];
    v.into_iter().map(|f| f.0).collect()
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
    pub class_size: u16,
    pub venue: Cap,
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
    pub name: &'static str,
    pub roles: [&'static str; 3],
    pub req_src: &'static str,
    pub req: Req,
    pub equipment: Vec<(Good, i64)>,
    pub upkeep: Vec<(Good, i64)>,
    pub training_months: u16,
}

fn unit_tiers() -> Vec<UnitTierDef> {
    use Good::*;
    let mk = |tier: u8,
              name: &'static str,
              roles: [&'static str; 3],
              req_src: &'static str,
              equipment: &[(Good, f64)],
              upkeep: &[(Good, f64)],
              training_months: u16| UnitTierDef {
        tier,
        name,
        roles,
        req_src,
        req: Req::True,
        equipment: equipment.iter().map(|(g, a)| (*g, m(*a))).collect(),
        upkeep: upkeep.iter().map(|(g, a)| (*g, m(*a))).collect(),
        training_months,
    };
    vec![
        mk(0, "Subsistence warbands", ["Melee bands", "Light hunters", "Spear lines"], "", &[(Tools, 0.3)], &[(Food, 1.0)], 2),
        mk(1, "Urban-craft levies", ["Heavy infantry", "Cavalry", "Pike formations"], "(T022 | T023) & C016",
           &[(Metal, 0.4), (Tools, 0.3)], &[(Food, 1.0), (Tools, 0.01)], 4),
        mk(2, "Powder and drill", ["Assault infantry", "Rapid columns", "Field artillery"], "T037 & C016",
           &[(Metal, 0.8), (Materials, 0.5), (Tools, 0.3)], &[(Food, 1.0), (Tools, 0.02), (Materials, 0.02)], 6),
        mk(3, "Industrial formations", ["Armoured assault groups", "Motorized raiders", "Anti-armour positions"], "(T094 | T068) & T066 & C037",
           &[(Components, 0.8), (Metal, 1.0), (Fuel, 0.3)], &[(Food, 1.0), (Fuel, 0.05), (Spares, 0.02)], 9),
        mk(4, "Networked forces", ["Combined-arms forces", "Mobile strike groups", "Air-defence networks"], "T112 & T107 & T038 & C037",
           &[(Electronics, 2.0), (Components, 1.5), (Fuel, 0.5)], &[(Food, 1.0), (Fuel, 0.1), (Spares, 0.05), (Electronics, 0.02)], 12),
        mk(5, "Autonomous systems", ["Unmanned breakthrough groups", "Distributed swarms", "Area-denial systems"], "T114 & T123 & T142 & C037",
           &[(Hardware, 0.2), (Electronics, 4.0), (Components, 2.0)], &[(Food, 1.0), (Fuel, 0.1), (Spares, 0.08), (Electronics, 0.05)], 12),
    ]
}

/// Same-tier counter matrix in basis points: `[own role][enemy role]`.
pub const COUNTER: [[i64; 3]; 3] = [[10000, 8000, 12500], [12500, 10000, 8000], [8000, 12500, 10000]];

pub fn role_index(r: Role) -> usize {
    r.index()
}

/// 2.5^tier in milli.
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
    Belief { key: "teaching_order", slot: "Founding obligation", name: "The Teaching Order", desc: "The precinct hosts sixteen teaching places." },
    Belief { key: "healers_order", slot: "Founding obligation", name: "The Menders' Order", desc: "The precinct cares for eight hundred residents." },
    Belief { key: "shared_days", slot: "Follower practice", name: "Shared Labour Days", desc: "Followers answer calls for common work more readily." },
    Belief { key: "remembrance", slot: "Follower practice", name: "Rites of Remembrance", desc: "Communities of followers are steadier in hard years." },
    Belief { key: "watchfulness", slot: "Follower practice", name: "The Long Watch", desc: "Followers accept defence duty more readily." },
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
    pub graph_hash: u64,
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
    let techs: Vec<Tech> = tj
        .iter()
        .map(|t| {
            let tier = tech_tier(&t.id);
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
                work: TIER_WORK[tier as usize] * 1000,
                min_months: TIER_MIN_MONTHS[tier as usize],
                needs_facility: tech_needs_facility(&t.id),
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
            let (work, media, evidence) = match gi {
                0 => (10, 0.0, 1200),
                1 => (36, 3.0, 3200),
                2 => (110, 12.0, 7000),
                _ => (260, 30.0, 12000),
            };
            Practice {
                id: p.id.clone(),
                name: p.name.clone(),
                group: p.group.clone(),
                group_ix: gi,
                prereq: pr(&p.prereq),
                hard: pr(practice_hard(&p.id)),
                requirements: p.requirements.clone(),
                behavior: p.behavior.clone(),
                work: work * 1000,
                cost: if media > 0.0 { vec![(Good::Media, m(media))] } else { vec![] },
                evidence_needed: evidence,
                affinity: practice_affinity(&p.id),
                effect: practice_effect(&p.id),
            }
        })
        .collect();

    for f in facs.iter_mut() {
        f.req = pr(f.req_src);
        for r in f.recipes.iter_mut() {
            r.req = pr(r.req_src);
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
    let mut note = |req: &Req, label: String| {
        let mut ts = Vec::new();
        req.techs(&mut ts);
        for t in ts {
            if !tech_enables[t].contains(&label) {
                tech_enables[t].push(label.clone());
            }
        }
        let mut ps = Vec::new();
        req.pracs(&mut ps);
        for p in ps {
            if !prac_enables[p].contains(&label) {
                prac_enables[p].push(label.clone());
            }
        }
    };
    for f in &facs {
        note(&f.req, f.name.to_string());
        for r in &f.recipes {
            note(&r.req, format!("{} ({})", r.name, f.name));
        }
        for s in &f.scale {
            note(&s.1, format!("Larger {}", f.name.to_lowercase()));
        }
    }
    for c in &courses {
        note(&c.req, format!("Course: {}", c.name));
    }
    for t in &tiers {
        note(&t.req, format!("Formations: {}", t.name));
    }
    for (i, p) in practices.iter().enumerate() {
        if !p.effect.is_empty() {
            prac_enables[i].insert(0, p.effect.to_string());
        }
    }

    Content {
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
        assert_eq!(c.techs.len(), 138);
        assert_eq!(c.practices.len(), 64);
        assert_eq!(c.courses.len(), 24);
        // Knowledge prerequisites are acyclic: every node is reachable by repeatedly
        // understanding nodes whose prerequisites are satisfied.
        struct K<'a>(&'a [bool]);
        impl ReqCtx for K<'_> {
            fn tech(&self, i: usize) -> bool { self.0[i] }
            fn prac(&self, i: usize) -> bool { self.0[i] }
            fn fac(&self, _: usize) -> bool { true }
            fn pop(&self) -> u32 { u32::MAX }
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
