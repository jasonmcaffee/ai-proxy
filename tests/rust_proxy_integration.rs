use ai_proxy_rs::{AppState, Config, build_app};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{Path, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::future::join_all;
use reqwest::{
    Client, Url,
    multipart::{Form, Part},
};
use serde_json::{Value, json};
use std::{
    net::{IpAddr, Ipv4Addr},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{sync::Mutex, task::JoinHandle};

/// Mutable observations and scripted behavior exposed by deterministic upstream doubles.
#[derive(Clone, Default)]
struct MockState {
    chat_mode: Arc<AtomicUsize>,
    chat_calls: Arc<AtomicUsize>,
    last_chat_body: Arc<Mutex<Value>>,
    last_workflow: Arc<Mutex<Value>>,
    last_transcription_fields: Arc<Mutex<Vec<(String, String)>>>,
    history_pending: Arc<AtomicBool>,
    queue_cancellations: Arc<AtomicUsize>,
    interruptions: Arc<AtomicUsize>,
}

/// Owns local upstream and proxy listeners and aborts them after each test.
struct Harness {
    proxy_url: String,
    state: MockState,
    proxy_task: JoinHandle<()>,
    upstream_task: JoinHandle<()>,
}

impl Drop for Harness {
    /// Stops only the two listener tasks created by this test harness.
    fn drop(&mut self) {
        self.proxy_task.abort();
        self.upstream_task.abort();
    }
}

/// Starts deterministic upstream routes and the Rust proxy on ephemeral loopback ports.
async fn start_harness(api_key: Option<&str>, body_limit: usize) -> Harness {
    start_harness_with_limits(api_key, body_limit, body_limit).await
}

/// Starts a harness with independently configurable JSON and multipart limits.
async fn start_harness_with_limits(api_key: Option<&str>, json_limit: usize, multipart_limit: usize) -> Harness {
    let state = MockState::default();
    let upstream_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_url = format!("http://{}", upstream_listener.local_addr().unwrap());
    let upstream_app = mock_router(state.clone());
    let upstream_task = tokio::spawn(async move {
        axum::serve(upstream_listener, upstream_app).await.unwrap();
    });
    let config = test_config(&upstream_url, api_key, json_limit, multipart_limit);
    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_url = format!("http://{}", proxy_listener.local_addr().unwrap());
    let proxy_app = build_app(AppState::new(config).unwrap());
    let proxy_task = tokio::spawn(async move {
        axum::serve(proxy_listener, proxy_app).await.unwrap();
    });
    Harness { proxy_url, state, proxy_task, upstream_task }
}

/// Constructs test configuration with every upstream pointing at the same local double.
fn test_config(upstream: &str, api_key: Option<&str>, json_limit: usize, multipart_limit: usize) -> Config {
    let root = Url::parse(upstream).unwrap();
    let speaches = Url::parse(&format!("{upstream}/v1")).unwrap();
    Config {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        llama_base_url: root.clone(),
        llama_api_key: "test-key".to_owned(),
        comfyui_base_url: root.clone(),
        speaches_base_url: speaches,
        transcribe_audio_base_url: root.clone(),
        text_to_speech_base_url: root.clone(),
        transcribe_audio_ws_url: root,
        inbound_api_key: api_key.map(str::to_owned),
        request_timeout: Duration::from_secs(5),
        image_timeout: Duration::from_secs(2),
        image_poll_interval: Duration::from_millis(1),
        retry_max_attempts: 3,
        retry_base_delay: Duration::from_millis(1),
        max_json_bytes: json_limit,
        max_multipart_bytes: multipart_limit,
        log_format: "compact".to_owned(),
    }
}

/// Creates the deterministic llama, audio, and ComfyUI upstream surface.
fn mock_router(state: MockState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(mock_chat))
        .route("/v1/messages/count_tokens", post(|| async { Json(json!({ "input_tokens": 120 })) }))
        .route("/props", get(|| async { Json(json!({ "default_generation_settings": { "n_ctx": 2000 } })) }))
        .route("/v1/audio/voices", get(|| async { Json(json!({ "voices": [{ "id": "dave", "language": "en", "gender": "male" }] })) }))
        .route(
            "/v1/audio/engines",
            get(|| async { Json(json!({ "engines": [{ "id": "indextts", "label": "IndexTTS", "available": true }], "defaultEngine": "indextts" })) }),
        )
        .route("/v1/audio/speech", post(mock_speech))
        .route("/v1/audio/transcriptions", post(mock_transcription))
        .route("/prompt", post(mock_prompt))
        .route("/history/{id}", get(mock_history))
        .route("/view", get(|| async { ([(header::CONTENT_TYPE, "image/png")], Bytes::from_static(b"\x89PNG\r\n\x1a\nmock")) }))
        .route("/queue", post(mock_queue_cancel))
        .route("/interrupt", post(mock_interrupt))
        .with_state(state)
}

/// Returns scripted JSON, error, reasoning-recovery, or SSE chat responses.
async fn mock_chat(State(state): State<MockState>, Json(body): Json<Value>) -> Response {
    *state.last_chat_body.lock().await = body.clone();
    let call = state.chat_calls.fetch_add(1, Ordering::SeqCst);
    match state.chat_mode.load(Ordering::SeqCst) {
        1 => (StatusCode::BAD_REQUEST, Json(json!({ "error": { "message": "bad request", "type": "invalid_request_error" } }))).into_response(),
        2 if call == 0 => Json(json!({ "choices": [{ "message": { "role": "assistant", "content": "", "reasoning_content": "I should answer" } }] })).into_response(),
        3 => sse_response([
            json!({"id":"s","choices":[{"index":0,"delta":{"content":"hel"},"finish_reason":null}]}),
            json!({"id":"s","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}]}),
        ]),
        4 => tool_sse_response(),
        _ => Json(json!({ "id": "mock", "object": "chat.completion", "choices": [{ "index": 0, "message": { "role": "assistant", "content": "OK" }, "finish_reason": "stop" }] })).into_response(),
    }
}

/// Serializes fixed chunks as an OpenAI SSE response.
fn sse_response<const N: usize>(chunks: [Value; N]) -> Response {
    let mut text = chunks.into_iter().map(|chunk| format!("data: {chunk}\n\n")).collect::<String>();
    text.push_str("data: [DONE]\n\n");
    Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, "text/event-stream").body(Body::from(text)).unwrap()
}

/// Returns fragmented tool-call chunks used to verify consolidation.
fn tool_sse_response() -> Response {
    sse_response([
        json!({"id":"t","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"calc","arguments":"{\"x\":"}}]},"finish_reason":null}]}),
        json!({"id":"t","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"2}"}}]},"finish_reason":"tool_calls"}]}),
    ])
}

/// Returns binary or concatenated RIFF speech based on the requested response format.
async fn mock_speech(Json(body): Json<Value>) -> Response {
    let bytes = if body.get("response_format").and_then(Value::as_str) == Some("stream") {
        [riff(b"first"), riff(b"second")].concat()
    } else {
        riff(b"speech")
    };
    Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, "audio/wav").body(Body::from(bytes)).unwrap()
}

/// Captures multipart transcription fields and returns the requested response shape.
async fn mock_transcription(State(state): State<MockState>, mut multipart: axum::extract::Multipart) -> Json<Value> {
    let mut fields = Vec::new();
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or_default().to_owned();
        if name == "file" {
            fields.push((name, format!("{} bytes", field.bytes().await.unwrap().len())));
        } else {
            fields.push((name, field.text().await.unwrap()));
        }
    }
    let verbose = fields.iter().any(|(name, value)| name == "response_format" && value == "verbose_json");
    *state.last_transcription_fields.lock().await = fields;
    if verbose {
        Json(json!({ "task":"transcribe", "language":"en", "duration":1.0, "text":"hello", "segments":[{"id":0,"start":0,"end":1,"text":"hello","speaker":"SPEAKER_00"}], "speakers":["SPEAKER_00"] }))
    } else {
        Json(json!({ "text": "hello" }))
    }
}

/// Captures the submitted workflow and returns a stable ComfyUI prompt id.
async fn mock_prompt(State(state): State<MockState>, Json(body): Json<Value>) -> Json<Value> {
    *state.last_workflow.lock().await = body;
    Json(json!({ "prompt_id": "prompt-1", "number": 1 }))
}

/// Returns one completed ComfyUI history entry for the requested prompt.
async fn mock_history(State(state): State<MockState>, Path(id): Path<String>) -> Json<Value> {
    if state.history_pending.load(Ordering::SeqCst) {
        return Json(json!({}));
    }
    Json(json!({ id: { "outputs": { "99": { "images": [{ "filename": "out.png", "subfolder": "", "type": "output" }] } } } }))
}

/// Records one best-effort ComfyUI queue cancellation.
async fn mock_queue_cancel(State(state): State<MockState>) -> Json<Value> {
    state.queue_cancellations.fetch_add(1, Ordering::SeqCst);
    Json(json!({}))
}

/// Records one best-effort ComfyUI execution interruption.
async fn mock_interrupt(State(state): State<MockState>) -> Json<Value> {
    state.interruptions.fetch_add(1, Ordering::SeqCst);
    Json(json!({}))
}

/// Builds a minimal complete RIFF byte sequence.
fn riff(payload: &[u8]) -> Vec<u8> {
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    bytes
}

/// Returns a no-proxy client used for local functional checks.
fn client() -> Client {
    Client::builder().no_proxy().timeout(Duration::from_secs(5)).build().unwrap()
}

/// Verifies static routes, diagnostics, video compatibility, and metrics.
#[tokio::test]
async fn static_routes_and_observability_work() {
    let harness = start_harness(None, 1024 * 1024).await;
    let client = client();
    let models: Value = client.get(format!("{}/v1/models", harness.proxy_url)).send().await.unwrap().json().await.unwrap();
    assert_eq!(models["object"], "list");
    assert_eq!(models["data"][0]["id"], "local-model");
    assert_eq!(client.get(format!("{}/healthz", harness.proxy_url)).send().await.unwrap().status(), StatusCode::OK);
    assert_eq!(client.get(format!("{}/readyz", harness.proxy_url)).send().await.unwrap().status(), StatusCode::OK);
    assert_eq!(client.post(format!("{}/v1/videos/generations", harness.proxy_url)).json(&json!({})).send().await.unwrap().status(), StatusCode::NOT_IMPLEMENTED);
    let metrics = client.get(format!("{}/metrics", harness.proxy_url)).send().await.unwrap().text().await.unwrap();
    assert!(metrics.contains("ai_proxy_requests_total"));
    assert!(metrics.contains("route=\"models\""));
}

/// Verifies unknown fields, default model, and disable-thinking merge survive forwarding.
#[tokio::test]
async fn non_stream_chat_preserves_open_payload() {
    let harness = start_harness(None, 1024 * 1024).await;
    let response = client()
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({
            "messages":[{"role":"user","content":"hello"}], "disableThinking":true,
            "chat_template_kwargs":{"reasoning_effort":"xhigh"}, "unknown_extension":{"kept":true}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.json::<Value>().await.unwrap().pointer("/choices/0/message/content").and_then(Value::as_str), Some("OK"));
    let forwarded = harness.state.last_chat_body.lock().await.clone();
    assert_eq!(forwarded["model"], "local-model");
    assert_eq!(forwarded["chat_template_kwargs"]["reasoning_effort"], "xhigh");
    assert_eq!(forwarded["chat_template_kwargs"]["enable_thinking"], false);
    assert_eq!(forwarded["unknown_extension"]["kept"], true);
}

/// Verifies reasoning-only non-stream responses append recovery context and retry.
#[tokio::test]
async fn non_stream_reasoning_recovery_retries() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.chat_mode.store(2, Ordering::SeqCst);
    let response = client()
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({"messages":[{"role":"user","content":"hello"}]}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(harness.state.chat_calls.load(Ordering::SeqCst), 2);
    let forwarded = harness.state.last_chat_body.lock().await.clone();
    assert!(forwarded.pointer("/messages/1/content").and_then(Value::as_str).unwrap().contains("I should answer"));
}

/// Verifies final upstream status and JSON survive exhausted retries.
#[tokio::test]
async fn non_stream_upstream_error_is_preserved() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.chat_mode.store(1, Ordering::SeqCst);
    let response = client().post(format!("{}/v1/chat/completions", harness.proxy_url)).json(&json!({"messages":[]})).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(response.json::<Value>().await.unwrap().pointer("/error/type").and_then(Value::as_str), Some("invalid_request_error"));
    assert_eq!(harness.state.chat_calls.load(Ordering::SeqCst), 3);
}

/// Verifies streaming status, incremental content semantics, and one DONE marker.
#[tokio::test]
async fn streaming_chat_relays_sse() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.chat_mode.store(3, Ordering::SeqCst);
    let response = client().post(format!("{}/v1/chat/completions", harness.proxy_url)).json(&json!({"messages":[],"stream":true})).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let text = response.text().await.unwrap();
    assert!(text.contains("\"content\":\"hel\""));
    assert!(text.contains("\"content\":\"lo\""));
    assert_eq!(text.matches("[DONE]").count(), 1);
}

/// Verifies fragmented tool calls become one complete chunk when requested.
#[tokio::test]
async fn streaming_tool_calls_are_consolidated() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.chat_mode.store(4, Ordering::SeqCst);
    let text = client()
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({"messages":[],"stream":true,"awaitToolCallCompletion":true}))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert_eq!(text.matches("tool_calls").count(), 2);
    assert!(text.contains("{\\\"x\\\":2}"));
    assert_eq!(text.matches("call_x").count(), 1);
}

/// Verifies compression metadata appears in headers and the non-stream body.
#[tokio::test]
async fn compression_metadata_is_attached() {
    let harness = start_harness(None, 1024 * 1024).await;
    let response = client()
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({
            "messages":[{"role":"user","content":"hello"}],
            "compressionOptions":{"enabled":true,"compressAtTokens":1000,"contextLimit":2000}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.headers().get("x-ai-proxy-context-tokens").unwrap(), "120");
    let body: Value = response.json().await.unwrap();
    assert_eq!(body.pointer("/x_ai_proxy/contextUsage/contextLimit").and_then(Value::as_u64), Some(2000));
    assert_eq!(body.pointer("/x_ai_proxy/contextUsage/compressed").and_then(Value::as_bool), Some(false));
}

/// Verifies default TTS inventory, binary synthesis, and sentence SSE framing.
#[tokio::test]
async fn tts_routes_preserve_binary_and_stream_contracts() {
    let harness = start_harness(None, 1024 * 1024).await;
    let client = client();
    let voices: Value = client.get(format!("{}/v1/audio/voices", harness.proxy_url)).send().await.unwrap().json().await.unwrap();
    assert_eq!(voices["voices"][0]["id"], "dave");
    let speech = client.post(format!("{}/v1/audio/speech", harness.proxy_url)).json(&json!({"input":"Hello."})).send().await.unwrap();
    assert_eq!(speech.status(), StatusCode::OK);
    assert!(speech.bytes().await.unwrap().starts_with(b"RIFF"));
    let stream = client.post(format!("{}/v1/audio/speech/stream", harness.proxy_url)).json(&json!({"input":"First. Second."})).send().await.unwrap();
    assert_eq!(stream.status(), StatusCode::CREATED);
    let text = stream.text().await.unwrap();
    assert_eq!(text.matches("\"audio\"").count(), 2);
    assert!(text.contains("First."));
    assert!(text.contains("Second."));
}

/// Verifies default, diarized, and legacy multipart routing without disk scratch.
#[tokio::test]
async fn transcription_routes_multipart_fields() {
    let harness = start_harness(None, 1024 * 1024).await;
    let client = client();
    let form = Form::new()
        .part("file", Part::bytes(b"audio".to_vec()).file_name("clip.wav").mime_str("audio/wav").unwrap())
        .text("diarization", "true")
        .text("min_speakers", "2");
    let verbose: Value = client.post(format!("{}/v1/audio/transcriptions", harness.proxy_url)).multipart(form).send().await.unwrap().json().await.unwrap();
    assert_eq!(verbose["speakers"][0], "SPEAKER_00");
    let fields = harness.state.last_transcription_fields.lock().await.clone();
    assert!(fields.contains(&("response_format".to_owned(), "verbose_json".to_owned())));
    assert!(fields.contains(&("min_speakers".to_owned(), "2".to_owned())));
    let legacy = Form::new().part("file", Part::bytes(b"audio".to_vec()).file_name("clip.wav")).text("legacy", "true");
    let response: Value = client.post(format!("{}/v1/audio/transcriptions", harness.proxy_url)).multipart(legacy).send().await.unwrap().json().await.unwrap();
    assert_eq!(response["text"], "hello");
}

/// Verifies ComfyUI workflow mutation, polling, image fetch, and OpenAI response shape.
#[tokio::test]
async fn image_generation_orchestration_is_compatible() {
    let harness = start_harness(None, 1024 * 1024).await;
    let response: Value = client()
        .post(format!("{}/v1/images/generations", harness.proxy_url))
        .json(&json!({"prompt":"sunrise","negativePrompt":"rain","size":"640x480"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(response["data"][0]["revised_prompt"], "sunrise");
    assert!(response["data"][0]["b64_json"].as_str().unwrap().starts_with("iVBOR"));
    let submitted = harness.state.last_workflow.lock().await.clone();
    assert_eq!(submitted.pointer("/prompt/45/inputs/text").and_then(Value::as_str), Some("sunrise"));
    assert_eq!(submitted.pointer("/prompt/516/inputs/int").and_then(Value::as_u64), Some(640));
}

/// Verifies image DTO failures preserve NestJS status and message ordering without submitting work.
#[tokio::test]
async fn image_validation_matches_legacy_contract() {
    let harness = start_harness(None, 1024 * 1024).await;
    let response = client()
        .post(format!("{}/v1/images/generations", harness.proxy_url))
        .json(&json!({ "prompt": "x", "negativePrompt": 5, "n": "bad", "size": 123, "response_format": 7, "quality": false, "style": [] }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["statusCode"], 400);
    assert_eq!(body["message"][0], "negativePrompt must be a string");
    assert_eq!(body["message"][1], "n must be a number conforming to the specified constraints");
    assert!(harness.state.last_workflow.lock().await.is_null());
}

/// Verifies legacy validation and fallback envelopes on existing public routes.
#[tokio::test]
async fn legacy_validation_and_not_found_envelopes_match() {
    let harness = start_harness(None, 1024 * 1024).await;
    let client = client();
    let chat = client.post(format!("{}/v1/chat/completions", harness.proxy_url)).json(&json!({})).send().await.unwrap();
    assert_eq!(chat.status(), StatusCode::BAD_REQUEST);
    assert_eq!(chat.json::<Value>().await.unwrap()["message"][0], "messages must be an array");
    let speech = client.post(format!("{}/v1/audio/speech", harness.proxy_url)).json(&json!({})).send().await.unwrap();
    let speech_body: Value = speech.json().await.unwrap();
    assert_eq!(speech_body["message"], json!(["input must be a string", "input should not be empty"]));
    let transcription = client.post(format!("{}/v1/audio/transcriptions", harness.proxy_url)).json(&json!({})).send().await.unwrap();
    assert_eq!(transcription.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(transcription.json::<Value>().await.unwrap()["error"]["type"], "transcription_error");
    let missing = client.get(format!("{}/not-real", harness.proxy_url)).send().await.unwrap();
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert_eq!(missing.json::<Value>().await.unwrap()["message"], "Cannot GET /not-real");
}

/// Verifies optional bearer authentication and unauthenticated health checks.
#[tokio::test]
async fn optional_api_key_is_enforced() {
    let harness = start_harness(Some("secret"), 1024 * 1024).await;
    let client = client();
    assert_eq!(client.get(format!("{}/healthz", harness.proxy_url)).send().await.unwrap().status(), StatusCode::OK);
    assert_eq!(client.get(format!("{}/v1/models", harness.proxy_url)).send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    assert_eq!(client.get(format!("{}/v1/models", harness.proxy_url)).bearer_auth("secret").send().await.unwrap().status(), StatusCode::OK);
}

/// Verifies static routing remains correct under representative concurrency.
#[tokio::test]
async fn concurrent_static_requests_all_succeed() {
    let harness = start_harness(None, 1024 * 1024).await;
    let client = client();
    let futures = (0..200).map(|_| client.get(format!("{}/v1/models", harness.proxy_url)).send()).collect::<Vec<_>>();
    let responses = join_all(futures).await;
    assert!(responses.into_iter().all(|response| response.is_ok_and(|response| response.status() == StatusCode::OK)));
}

/// Verifies browser preflight support and independent JSON versus multipart body ceilings.
#[tokio::test]
async fn cors_and_route_specific_body_limits_are_enforced() {
    let harness = start_harness_with_limits(None, 128, 2048).await;
    let client = client();
    let preflight = client
        .request(Method::OPTIONS, format!("{}/v1/chat/completions", harness.proxy_url))
        .header(header::ORIGIN, "https://example.test")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
        .send()
        .await
        .unwrap();
    assert_eq!(preflight.status(), StatusCode::OK);
    assert_eq!(preflight.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(), "*");
    assert_eq!(preflight.headers().get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS).unwrap(), "true");

    let oversized = client
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({ "messages": [{ "role": "user", "content": "x".repeat(256) }] }))
        .send()
        .await
        .unwrap();
    assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);

    let form = Form::new().part("file", Part::bytes(vec![1; 512]).file_name("clip.wav"));
    let multipart = client.post(format!("{}/v1/audio/transcriptions", harness.proxy_url)).multipart(form).send().await.unwrap();
    assert_eq!(multipart.status(), StatusCode::OK);
}

/// Verifies compression progress and usage events precede completion chunks on SSE responses.
#[tokio::test]
async fn streaming_compression_events_preserve_order() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.chat_mode.store(3, Ordering::SeqCst);
    let text = client()
        .post(format!("{}/v1/chat/completions", harness.proxy_url))
        .json(&json!({
            "messages": [{ "role": "user", "content": "hello" }],
            "stream": true,
            "compressionOptions": { "enabled": true, "compressAtTokens": 1000, "contextLimit": 2000 }
        }))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    let progress = text.find("compression_progress").unwrap();
    let usage = text.find("context_usage").unwrap();
    let content = text.find("\"content\":\"hel\"").unwrap();
    assert!(progress < usage && usage < content);
    assert_eq!(text.matches("[DONE]").count(), 1);
}

/// Verifies abandoning an in-flight image request cancels its ComfyUI queue and execution.
#[tokio::test]
async fn image_client_disconnect_cancels_comfyui_work() {
    let harness = start_harness(None, 1024 * 1024).await;
    harness.state.history_pending.store(true, Ordering::SeqCst);
    let request_url = format!("{}/v1/images/generations", harness.proxy_url);
    let request = tokio::spawn(async move { client().post(request_url).json(&json!({ "prompt": "cancel me" })).send().await });
    for _ in 0..100 {
        if !harness.state.last_workflow.lock().await.is_null() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    request.abort();
    for _ in 0..100 {
        if harness.state.queue_cancellations.load(Ordering::SeqCst) > 0 && harness.state.interruptions.load(Ordering::SeqCst) > 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert_eq!(harness.state.queue_cancellations.load(Ordering::SeqCst), 1);
    assert_eq!(harness.state.interruptions.load(Ordering::SeqCst), 1);
}
