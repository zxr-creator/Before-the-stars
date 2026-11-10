//! Fixed-point helpers and addressed deterministic randomness.
//!
//! Authoritative arithmetic is integer only. Head counts are real people. Goods,
//! work and services are stored in base units (a ration, tonne or lot; a
//! worker-month; 0.1 MWh) and quoted in display units of 1,000 base units, which
//! older identifiers call "milli". Ratios use basis points (10000 = 1.0).
//! Random draws are a pure function of the match secret and a logical address
//! (stream, entity, month, index), so thread order, retries or renamed
//! projects can never obtain a different draw.

/// Base units per display unit, and the scale of fixed-point thousandths.
pub const MILLI: i64 = 1000;
pub const BP: i64 = 10_000;

#[inline]
pub fn mul_bp(value: i64, bp: i64) -> i64 {
    ((value as i128 * bp as i128) / BP as i128) as i64
}

#[inline]
pub fn ratio_bp(num: i64, den: i64) -> i64 {
    if den <= 0 {
        return BP;
    }
    (((num.max(0) as i128) * BP as i128) / den as i128).min(BP as i128) as i64
}

#[inline]
pub fn muldiv(a: i64, b: i64, c: i64) -> i64 {
    if c == 0 {
        return 0;
    }
    ((a as i128 * b as i128) / c as i128) as i64
}

pub fn isqrt(v: i64) -> i64 {
    if v <= 0 {
        return 0;
    }
    let mut x = (v as f64).sqrt() as i64;
    while x * x > v {
        x -= 1;
    }
    while (x + 1) * (x + 1) <= v {
        x += 1;
    }
    x
}

#[inline]
fn mix(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Addressed draw: hash of the secret and a logical address.
pub fn draw(secret: u64, address: &[u64]) -> u64 {
    let mut h = mix(secret ^ 0xB75_57A6_5EED);
    for (i, part) in address.iter().enumerate() {
        h = mix(h ^ mix(part.wrapping_add(i as u64).wrapping_mul(0xD6E8_FEB8_6659_FD93)));
    }
    h
}

/// Uniform integer in `0..n` from an addressed draw.
pub fn draw_range(secret: u64, address: &[u64], n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    draw(secret, address) % n
}

/// Round `value_milli / 1000` to an integer count, carrying the remainder in `rem`
/// so that splitting or merging a source never rounds the same expectation twice.
pub fn carry_round(value_milli: i64, rem: &mut i64) -> u32 {
    let total = value_milli + *rem;
    let whole = total.div_euclid(MILLI);
    *rem = total.rem_euclid(MILLI);
    whole.max(0) as u32
}

/// A head count or quantity with thousands separators, for texts shown to people.
pub fn group(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3 + 1);
    if n < 0 {
        out.push('-');
    }
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

pub fn stream(name: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in name.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01B3);
    }
    h
}

/// Stable 64-bit FNV-1a hash used for state hashes and opaque handles.
pub fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01B3);
    }
    h
}

/// The date of the month about to be simulated after `month` completed months:
/// (year, month of the year 1-12). Ruleset 2.0 has no calendar: years count from 1.
pub fn date(_cfg: &crate::state::MatchConfig, month: u32) -> (i32, u8) {
    ((month / 12 + 1) as i32, (month % 12 + 1) as u8)
}

/// Whether the month about to be simulated opens a decade (January of a year
/// divisible by ten; the start of the match counts).
pub fn decade_start(cfg: &crate::state::MatchConfig, month: u32) -> bool {
    let (y, m) = date(cfg, month);
    month == 0 || (m == 1 && y % 10 == 0)
}
