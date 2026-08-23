use anyhow::{Context, Result, bail};
use clap::Parser;
use futures_util::StreamExt;
use reqwest::{Client, Method};
use serde::Serialize;
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Instant,
};
use tokio::sync::Mutex;

/// Repeatable pooled HTTP and SSE workload used for old-versus-new measurements.
#[derive(Parser, Clone)]
struct Arguments {
    #[arg(long)]
    url: String,
    #[arg(long, default_value_t = 5000)]
    requests: usize,
    #[arg(long, default_value_t = 25)]
    concurrency: usize,
    #[arg(long, default_value = "GET")]
    method: String,
    #[arg(long)]
    body: Option<String>,
    #[arg(long)]
    sse: bool,
}

/// Machine-readable distribution and throughput from one bounded run.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Benchmark {
    url: String,
    requests: usize,
    concurrency: usize,
    successful: usize,
    elapsed_ms: u128,
    requests_per_second: f64,
    p50_ms: u128,
    p95_ms: u128,
    p99_ms: u128,
    max_ms: u128,
    first_byte_p50_ms: Option<u128>,
    first_byte_p95_ms: Option<u128>,
}

/// Parses CLI settings, runs concurrent workers, and prints JSON evidence.
#[tokio::main]
async fn main() -> Result<()> {
    let args = Arguments::parse();
    if args.requests == 0 || args.concurrency == 0 {
        bail!("requests and concurrency must be positive");
    }
    let method = Method::from_bytes(args.method.as_bytes()).context("invalid method")?;
    let client = Arc::new(Client::builder().no_proxy().build()?);
    let next = Arc::new(AtomicUsize::new(0));
    let successful = Arc::new(AtomicUsize::new(0));
    let latencies = Arc::new(Mutex::new(Vec::with_capacity(args.requests)));
    let first_bytes = Arc::new(Mutex::new(Vec::with_capacity(args.requests)));
    let started = Instant::now();
    let mut workers = Vec::new();
    for _ in 0..args.concurrency.min(args.requests) {
        workers.push(tokio::spawn(worker(args.clone(), method.clone(), client.clone(), next.clone(), successful.clone(), latencies.clone(), first_bytes.clone())));
    }
    for worker in workers {
        worker.await??;
    }
    print_result(args, successful.load(Ordering::Relaxed), started.elapsed().as_millis(), latencies.lock().await.clone(), first_bytes.lock().await.clone())
}

/// Repeats requests until the shared sequence reaches the configured total.
async fn worker(args: Arguments, method: Method, client: Arc<Client>, next: Arc<AtomicUsize>, successful: Arc<AtomicUsize>, latencies: Arc<Mutex<Vec<u128>>>, first_bytes: Arc<Mutex<Vec<u128>>>) -> Result<()> {
    loop {
        if next.fetch_add(1, Ordering::Relaxed) >= args.requests {
            return Ok(());
        }
        let started = Instant::now();
        let mut request = client.request(method.clone(), &args.url);
        if let Some(body) = &args.body {
            request = request.header("content-type", "application/json").body(body.clone());
        }
        let response = request.send().await?;
        let status = response.status();
        let mut stream = response.bytes_stream();
        let mut first = None;
        while let Some(chunk) = stream.next().await {
            chunk?;
            first.get_or_insert_with(|| started.elapsed().as_millis());
        }
        if status.is_success() {
            successful.fetch_add(1, Ordering::Relaxed);
        }
        latencies.lock().await.push(started.elapsed().as_millis());
        if let Some(value) = first {
            first_bytes.lock().await.push(value);
        }
    }
}

/// Sorts measurements, computes percentiles, and prints the final JSON document.
fn print_result(args: Arguments, successful: usize, elapsed_ms: u128, mut latencies: Vec<u128>, mut first_bytes: Vec<u128>) -> Result<()> {
    latencies.sort_unstable();
    first_bytes.sort_unstable();
    let result = Benchmark {
        url: args.url,
        requests: args.requests,
        concurrency: args.concurrency,
        successful,
        elapsed_ms,
        requests_per_second: args.requests as f64 / (elapsed_ms as f64 / 1000.0),
        p50_ms: percentile(&latencies, 0.50),
        p95_ms: percentile(&latencies, 0.95),
        p99_ms: percentile(&latencies, 0.99),
        max_ms: latencies.last().copied().unwrap_or_default(),
        first_byte_p50_ms: args.sse.then(|| percentile(&first_bytes, 0.50)),
        first_byte_p95_ms: args.sse.then(|| percentile(&first_bytes, 0.95)),
    };
    println!("{}", serde_json::to_string_pretty(&result)?);
    if successful != args.requests {
        bail!("{} requests failed", args.requests - successful);
    }
    Ok(())
}

/// Selects one rounded index from a sorted latency sample.
fn percentile(values: &[u128], percentile: f64) -> u128 {
    if values.is_empty() {
        return 0;
    }
    values[((values.len() - 1) as f64 * percentile).round() as usize]
}
