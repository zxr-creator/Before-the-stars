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
    // Give the Windows executable its icon. This needs the platform resource compiler, so it
    // runs only when building on Windows itself; a cross-built .exe keeps the default icon.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") && cfg!(windows) {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("../../packaging/windows/icon.ico");
        res.set("ProductName", "Before the Stars");
        res.set("FileDescription", "Before the Stars");
        let _ = res.compile();
    }
}
