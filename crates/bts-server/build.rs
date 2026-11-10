// The web client is embedded into the binary so a release is one self-contained file.
// When the client has not been built yet, embed an empty directory instead of failing.
fn main() {
    let dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/dist");
    if !dist.exists() {
        let _ = std::fs::create_dir_all(&dist);
    }
    println!("cargo:rerun-if-changed=../../apps/web/dist");
    println!("cargo:rerun-if-changed=../../apps/web/dist/index.html");
    println!("cargo:rerun-if-changed=../../apps/web/dist/assets");
}
