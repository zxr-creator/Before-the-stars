# Source this file to use the repo-local toolchain:  source scripts/env.sh
_bts_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
export RUSTUP_HOME="$_bts_root/.toolchain/rustup"
export CARGO_HOME="$_bts_root/.toolchain/cargo"
export PLAYWRIGHT_BROWSERS_PATH="$_bts_root/.toolchain/ms-playwright"
export npm_config_cache="$_bts_root/.toolchain/npm-cache"
export PATH="$_bts_root/.toolchain/cargo/bin:$_bts_root/.toolchain/node/bin:$PATH"
unset _bts_root
