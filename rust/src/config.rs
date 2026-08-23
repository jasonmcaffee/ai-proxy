use anyhow::{Context, Result, bail};
use std::{env, net::IpAddr, time::Duration};
use url::Url;

/// Immutable process configuration assembled from environment variables at startup.
#[derive(Clone, Debug)]
pub struct Config {
    pub bind: IpAddr,
    pub port: u16,
    pub llama_base_url: Url,
    pub llama_api_key: String,
    pub comfyui_base_url: Url,
    pub speaches_base_url: Url,
    pub transcribe_audio_base_url: Url,
    pub text_to_speech_base_url: Url,
    pub transcribe_audio_ws_url: Url,
    pub inbound_api_key: Option<String>,
    pub request_timeout: Duration,
    pub image_timeout: Duration,
    pub image_poll_interval: Duration,
    pub retry_max_attempts: usize,
    pub retry_base_delay: Duration,
    pub max_json_bytes: usize,
    pub max_multipart_bytes: usize,
    pub log_format: String,
}

impl Config {
    /// Reads, parses, and validates every supported environment setting.
    pub fn from_env() -> Result<Self> {
        let bind = env_string("AI_PROXY_BIND", "127.0.0.1").parse().context("AI_PROXY_BIND must be an IP address")?;
        let port = env_number("PORT", 4141_u16)?;
        let llama_base_url = env_url("LLAMA_BASE_URL", "http://localhost:8080")?;
        let comfyui_base_url = env_url("COMFYUI_BASE_URL", "http://localhost:8083")?;
        let speaches_base_url = env_url("SPEACHES_BASE_URL", "http://127.0.0.1:8000/v1")?;
        let transcribe_audio_base_url = env_url("TRANSCRIBE_AUDIO_BASE_URL", "http://localhost:4140")?;
        let text_to_speech_base_url = env_url("TEXT_TO_SPEECH_BASE_URL", "http://localhost:4150")?;
        let transcribe_audio_ws_url = env_url("TRANSCRIBE_AUDIO_WS_URL", transcribe_audio_base_url.as_str())?;
        let retry_max_attempts = env_number("AI_PROXY_RETRY_MAX_ATTEMPTS", 8_usize)?;
        if retry_max_attempts == 0 {
            bail!("AI_PROXY_RETRY_MAX_ATTEMPTS must be positive");
        }
        Ok(Self {
            bind,
            port,
            llama_base_url,
            llama_api_key: env_string("LLAMA_API_KEY", "not-needed"),
            comfyui_base_url,
            speaches_base_url,
            transcribe_audio_base_url,
            text_to_speech_base_url,
            transcribe_audio_ws_url,
            inbound_api_key: env::var("AI_PROXY_API_KEY").ok().filter(|value| !value.trim().is_empty()),
            request_timeout: Duration::from_secs(env_number("AI_PROXY_REQUEST_TIMEOUT_SECS", 600_u64)?),
            image_timeout: Duration::from_secs(env_number("AI_PROXY_IMAGE_TIMEOUT_SECS", 3600_u64)?),
            image_poll_interval: Duration::from_millis(env_number("AI_PROXY_IMAGE_POLL_INTERVAL_MS", 2000_u64)?),
            retry_max_attempts,
            retry_base_delay: Duration::from_millis(env_number("AI_PROXY_RETRY_BASE_DELAY_MS", 2000_u64)?),
            max_json_bytes: env_number("AI_PROXY_MAX_JSON_BYTES", 524_288_000_usize)?,
            max_multipart_bytes: env_number("AI_PROXY_MAX_MULTIPART_BYTES", 524_288_000_usize)?,
            log_format: env_string("AI_PROXY_LOG_FORMAT", "compact"),
        })
    }

    /// Returns the socket address used by the HTTP listener.
    pub fn socket_addr(&self) -> std::net::SocketAddr {
        std::net::SocketAddr::new(self.bind, self.port)
    }
}

/// Reads a string environment variable or returns its fallback.
fn env_string(name: &str, fallback: &str) -> String {
    env::var(name).unwrap_or_else(|_| fallback.to_owned())
}

/// Reads and parses one numeric environment variable.
fn env_number<T>(name: &str, fallback: T) -> Result<T>
where
    T: std::str::FromStr + Copy,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    env::var(name).map_or(Ok(fallback), |value| value.parse().with_context(|| format!("{name} must be numeric")))
}

/// Reads and validates an absolute upstream URL.
fn env_url(name: &str, fallback: &str) -> Result<Url> {
    Url::parse(&env_string(name, fallback)).with_context(|| format!("{name} must be an absolute URL"))
}
