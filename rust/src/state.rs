use crate::{config::Config, metrics::Metrics};
use anyhow::Result;
use reqwest::Client;
use std::{sync::Arc, time::Duration};
use tokio::sync::RwLock;

/// Shared immutable clients plus small bounded caches used by request handlers.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub client: Client,
    pub image_client: Client,
    pub metrics: Metrics,
    pub context_length: Arc<RwLock<Option<u64>>>,
}

impl AppState {
    /// Builds pooled clients with separate ordinary and long-image deadlines.
    pub fn new(config: Config) -> Result<Self> {
        let client = build_client(config.request_timeout)?;
        let image_client = build_client(config.image_timeout)?;
        Ok(Self {
            config: Arc::new(config),
            client,
            image_client,
            metrics: Metrics::new()?,
            context_length: Arc::new(RwLock::new(None)),
        })
    }
}

/// Creates a pooled HTTP client with a total request timeout and no ambient system proxy.
fn build_client(timeout: Duration) -> Result<Client> {
    Ok(Client::builder().timeout(timeout).no_proxy().pool_idle_timeout(Duration::from_secs(90)).build()?)
}
