//! Development aid: where each good is made and used in the content tables.
//! `cargo run --release -p bts-engine --example goods_usage`
use bts_engine::content::content;
use bts_protocol::*;

fn main() {
    let c = content();
    for g in Good::ALL.iter().copied() {
        let mut made = Vec::new();
        let mut used = Vec::new();
        let mut cost = 0;
        let mut upkeep = 0;
        for f in &c.facilities {
            if f.cost.iter().any(|(x, _)| *x == g) {
                cost += 1;
            }
            if f.upkeep.iter().any(|(x, _)| *x == g) {
                upkeep += 1;
            }
            for r in &f.recipes {
                if r.outputs.iter().any(|(x, _)| *x == g) {
                    made.push(format!("{}:{}", f.key, r.key));
                }
                if r.inputs.iter().any(|(x, _)| *x == g) {
                    used.push(format!("{}:{}", f.key, r.key));
                }
            }
        }
        let courses = c.courses.iter().filter(|k| k.materials.iter().any(|(x, _)| *x == g)).count();
        println!("{:?}\tmade {}\tused {}\tcost {}\tupkeep {}\tcourses {}\n    made: {}\n    used: {}", g, made.len(), used.len(), cost, upkeep, courses, made.join(" "), used.iter().take(14).cloned().collect::<Vec<_>>().join(" "));
    }
}
