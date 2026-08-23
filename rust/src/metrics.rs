use anyhow::Result;
use prometheus::{Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry, TextEncoder};
use std::time::Instant;

/// Bounded-label Prometheus instruments shared by handlers and middleware.
#[derive(Clone)]
pub struct Metrics {
    registry: Registry,
    requests: IntCounterVec,
    request_duration: HistogramVec,
    upstream_requests: IntCounterVec,
    upstream_duration: HistogramVec,
    events: IntCounterVec,
    in_flight: IntGauge,
    started: Instant,
}

impl Metrics {
    /// Creates and registers the complete metric set.
    pub fn new() -> Result<Self> {
        let registry = Registry::new();
        let requests = IntCounterVec::new(Opts::new("ai_proxy_requests_total", "Completed HTTP requests"), &["route", "status"])?;
        let request_duration = HistogramVec::new(HistogramOpts::new("ai_proxy_request_duration_seconds", "HTTP request duration"), &["route"])?;
        let upstream_requests = IntCounterVec::new(Opts::new("ai_proxy_upstream_requests_total", "Upstream requests"), &["upstream", "status"])?;
        let upstream_duration = HistogramVec::new(HistogramOpts::new("ai_proxy_upstream_duration_seconds", "Upstream request duration"), &["upstream"])?;
        let events = IntCounterVec::new(Opts::new("ai_proxy_events_total", "Retries, recoveries, compression, and cancellation events"), &["kind"])?;
        let in_flight = IntGauge::new("ai_proxy_in_flight_requests", "Current HTTP requests")?;
        registry.register(Box::new(requests.clone()))?;
        registry.register(Box::new(request_duration.clone()))?;
        registry.register(Box::new(upstream_requests.clone()))?;
        registry.register(Box::new(upstream_duration.clone()))?;
        registry.register(Box::new(events.clone()))?;
        registry.register(Box::new(in_flight.clone()))?;
        Ok(Self {
            registry,
            requests,
            request_duration,
            upstream_requests,
            upstream_duration,
            events,
            in_flight,
            started: Instant::now(),
        })
    }

    /// Records one completed request using bounded route and status labels.
    pub fn observe_request(&self, route: &str, status: u16, elapsed_seconds: f64) {
        self.requests.with_label_values(&[route, &status.to_string()]).inc();
        self.request_duration.with_label_values(&[route]).observe(elapsed_seconds);
    }

    /// Records one completed upstream operation.
    pub fn observe_upstream(&self, upstream: &str, status: &str, elapsed_seconds: f64) {
        self.upstream_requests.with_label_values(&[upstream, status]).inc();
        self.upstream_duration.with_label_values(&[upstream]).observe(elapsed_seconds);
    }

    /// Increments a bounded operational event counter.
    pub fn event(&self, kind: &str) {
        self.events.with_label_values(&[kind]).inc();
    }

    /// Updates the active HTTP request gauge.
    pub fn change_in_flight(&self, delta: i64) {
        self.in_flight.add(delta);
    }

    /// Encodes all registered metrics in Prometheus text format.
    pub fn encode(&self) -> Result<String> {
        let mut output = Vec::new();
        TextEncoder::new().encode(&self.registry.gather(), &mut output)?;
        Ok(String::from_utf8(output)?)
    }

    /// Returns process uptime in seconds for health and version responses.
    pub fn uptime_seconds(&self) -> u64 {
        self.started.elapsed().as_secs()
    }
}
