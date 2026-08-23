# CLAUDE.md

## Service architecture

AI Proxy is a native Rust service built with Axum and Tokio. Production listens on loopback port 4141 and is managed through Service Manager. Use port 4143 for temporary shadow validation.

The TypeScript client under `client/` is a downstream consumer library, not a server implementation. The obsolete NestJS server has been removed. The checked-in OpenAPI document used by the Rust server lives at `rust/openapi-spec.json`.

## Verification

```powershell
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo build --release
```

Inspect `/healthz`, `/readyz`, `/metrics`, `/version`, and `/openapi.json` after a rollout or restart. Do not kill the production listener directly or run an unmanaged production instance.
