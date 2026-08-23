use anyhow::{Result, bail};
use clap::Parser;
use reqwest::{Client, Method};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Compares stable compatibility probes between baseline and candidate listeners.
#[derive(Parser)]
struct Arguments {
    #[arg(long, default_value = "http://127.0.0.1:4141")]
    baseline: String,
    #[arg(long, default_value = "http://127.0.0.1:4143")]
    candidate: String,
}

/// Stable response properties used for semantic and binary comparisons.
#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    status: u16,
    content_type: String,
    body_sha256: String,
    normalized_json: Option<Value>,
}

/// One request comparison printed as rollout evidence.
#[derive(Serialize)]
struct Comparison {
    name: &'static str,
    matches: bool,
    baseline: Snapshot,
    candidate: Snapshot,
}

/// Sends safe compatibility probes to both listeners and fails on any mismatch.
#[tokio::main]
async fn main() -> Result<()> {
    let args = Arguments::parse();
    let client = Client::builder().no_proxy().build()?;
    let probes = [
        ("models", Method::GET, "/v1/models", None),
        ("video_stub", Method::POST, "/v1/videos/generations", Some("{}")),
        ("not_found", Method::GET, "/not-real", None),
        ("chat_validation", Method::POST, "/v1/chat/completions", Some("{}")),
        ("image_validation", Method::POST, "/v1/images/generations", Some("{}")),
        ("speech_validation", Method::POST, "/v1/audio/speech", Some("{}")),
    ];
    let mut comparisons = Vec::new();
    for (name, method, path, body) in probes {
        let baseline = snapshot(&client, &args.baseline, method.clone(), path, body).await?;
        let candidate = snapshot(&client, &args.candidate, method, path, body).await?;
        comparisons.push(Comparison {
            name,
            matches: baseline == candidate,
            baseline,
            candidate,
        });
    }
    println!("{}", serde_json::to_string_pretty(&comparisons)?);
    if comparisons.iter().any(|comparison| !comparison.matches) {
        bail!("compatibility mismatch");
    }
    Ok(())
}

/// Fetches and normalizes one comparable response.
async fn snapshot(client: &Client, base: &str, method: Method, path: &str, body: Option<&str>) -> Result<Snapshot> {
    let mut request = client.request(method, format!("{base}{path}"));
    if let Some(body) = body {
        request = request.header("content-type", "application/json").body(body.to_owned());
    }
    let response = request.send().await?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .to_owned();
    let bytes = response.bytes().await?;
    let normalized_json = serde_json::from_slice::<Value>(&bytes).ok().map(normalize_json);
    let canonical = normalized_json.as_ref().map(Value::to_string).unwrap_or_else(|| String::from_utf8_lossy(&bytes).into_owned());
    Ok(Snapshot {
        status,
        content_type,
        body_sha256: format!("{:x}", Sha256::digest(canonical.as_bytes())),
        normalized_json,
    })
}

/// Removes volatile timestamps while retaining all semantic response fields.
fn normalize_json(mut value: Value) -> Value {
    if let Some(data) = value.get_mut("data").and_then(Value::as_array_mut) {
        for item in data {
            if let Some(object) = item.as_object_mut() {
                object.remove("created");
            }
        }
    }
    value
}
