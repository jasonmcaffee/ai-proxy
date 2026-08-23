use ai_proxy_rs::{AppState, Config, run};
use anyhow::Result;
use tracing_subscriber::EnvFilter;

/// Initializes configuration, structured logging, shared state, and the HTTP server.
#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env()?;
    init_tracing(&config.log_format);
    let state = AppState::new(config)?;
    run(state).await
}

/// Installs compact or JSON tracing without exposing request payloads.
fn init_tracing(format: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("ai_proxy_rs=info,tower_http=info"));
    if format.eq_ignore_ascii_case("json") {
        tracing_subscriber::fmt().with_env_filter(filter).json().init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).compact().init();
    }
}
