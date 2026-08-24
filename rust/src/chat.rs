use crate::{
    compression::{CompressionMeta, CompressionOptions, compress_messages},
    error::{AppError, parse_upstream_error},
    sse::{FrameSender, ProgressSink, SseDecoder, ToolCallBuffer, encode_data, proxy_event},
    state::AppState,
};
use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::Response as UpstreamResponse;
use serde_json::{Map, Value, json};
use std::{convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// Handles OpenAI-compatible JSON and SSE chat completions with proxy extensions.
pub async fn chat_completion(State(state): State<AppState>, Json(mut body): Json<Value>) -> Result<Response, AppError> {
    validate_chat_request(&body)?;
    let object = body.as_object_mut().ok_or_else(|| AppError::new(StatusCode::BAD_REQUEST, "validation_error", "Request body must be an object"))?;
    let messages = take_messages(object)?;
    let compression = take_compression_options(object)?;
    let await_tools = object.remove("awaitToolCallCompletion").and_then(|value| value.as_bool()).unwrap_or(false);
    let disable_thinking = object.remove("disableThinking").and_then(|value| value.as_bool()).unwrap_or(false);
    let stream = object.get("stream").and_then(Value::as_bool).unwrap_or(false);
    merge_request_defaults(object, disable_thinking);
    if stream {
        return stream_completion(state, body, messages, compression, await_tools).await;
    }
    non_stream_completion(state, body, messages, compression).await
}

/// Reproduces the legacy top-level chat DTO checks before mutating the open payload.
fn validate_chat_request(body: &Value) -> Result<(), AppError> {
    let mut messages = Vec::new();
    if !body.get("messages").is_some_and(Value::is_array) {
        messages.push("messages must be an array");
    }
    validate_optional_type(body, "model", Value::is_string, "model must be a string", &mut messages);
    validate_optional_type(body, "temperature", Value::is_number, "temperature must be a number conforming to the specified constraints", &mut messages);
    validate_optional_type(body, "stream", Value::is_boolean, "stream must be a boolean value", &mut messages);
    validate_optional_type(body, "tools", Value::is_array, "tools must be an array", &mut messages);
    validate_optional_type(body, "max_tokens", Value::is_number, "max_tokens must be a number conforming to the specified constraints", &mut messages);
    validate_optional_type(body, "compressionOptions", Value::is_object, "nested property compressionOptions must be either object or array", &mut messages);
    validate_optional_type(body, "awaitToolCallCompletion", Value::is_boolean, "awaitToolCallCompletion must be a boolean value", &mut messages);
    validate_optional_type(body, "disableThinking", Value::is_boolean, "disableThinking must be a boolean value", &mut messages);
    if messages.is_empty() { Ok(()) } else { Err(AppError::validation(messages)) }
}

/// Adds one validation message when a present, non-null field fails its predicate.
fn validate_optional_type(body: &Value, field: &str, predicate: fn(&Value) -> bool, message: &'static str, messages: &mut Vec<&'static str>) {
    if body.get(field).is_some_and(|value| !value.is_null() && !predicate(value)) {
        messages.push(message);
    }
}

/// Runs compression and retry handling for a non-streaming completion.
async fn non_stream_completion(state: AppState, mut body: Value, messages: Vec<Value>, compression: Option<CompressionOptions>) -> Result<Response, AppError> {
    let result = compress_messages(&state, messages, compression, &ProgressSink::new(None)).await;
    body["messages"] = Value::Array(result.messages);
    body["stream"] = Value::Bool(false);
    let mut completion = invoke_with_retry(&state, body).await?;
    let mut response = (StatusCode::OK, Json(completion.clone())).into_response();
    if let Some(meta) = result.meta {
        completion["x_ai_proxy"] = json!({ "contextUsage": meta });
        response = (StatusCode::OK, Json(completion)).into_response();
        set_context_headers(response.headers_mut(), &meta);
    }
    Ok(response)
}

/// Selects the compatibility stream path based on whether compression emits early events.
async fn stream_completion(state: AppState, mut body: Value, messages: Vec<Value>, compression: Option<CompressionOptions>, await_tools: bool) -> Result<Response, AppError> {
    body["stream"] = Value::Bool(true);
    if compression.as_ref().is_some_and(|options| options.enabled == Some(true)) {
        let (sender, receiver) = mpsc::channel(64);
        tokio::spawn(async move {
            // The sink writes each phase into this same channel as it happens, so the client sees
            // "Summarizing 12 earlier messages..." while the summary model is still working rather
            // than receiving every phase at once after compression has already finished.
            let result = compress_messages(&state, messages, compression, &ProgressSink::new(Some(&sender))).await;
            if let Some(meta) = result.meta
                && !send_bytes(&sender, proxy_event("context_usage", json!(meta))).await
            {
                return;
            }
            body["messages"] = Value::Array(result.messages);
            run_stream_task(state, body, await_tools, sender).await;
        });
        return Ok(sse_response(receiver));
    }
    body["messages"] = Value::Array(messages);
    let upstream = open_stream(&state, &body).await?;
    let (sender, receiver) = mpsc::channel(64);
    tokio::spawn(async move {
        process_stream_with_recovery(state, body, await_tools, upstream, sender).await;
    });
    Ok(sse_response(receiver))
}

/// Opens and processes an upstream stream for the early-header compression path.
async fn run_stream_task(state: AppState, body: Value, await_tools: bool, sender: FrameSender) {
    match open_stream(&state, &body).await {
        Ok(upstream) => process_stream_with_recovery(state, body, await_tools, upstream, sender).await,
        Err(error) => end_with_error(&sender, &error.message).await,
    }
}

/// Streams one response, optionally starts a reasoning-recovery request, and emits one DONE marker.
async fn process_stream_with_recovery(state: AppState, body: Value, await_tools: bool, upstream: UpstreamResponse, sender: FrameSender) {
    match relay_stream(upstream, await_tools, &sender).await {
        // `only_reasoning` alone is not enough to justify a second generation: a client that hits Stop
        // while the model is still thinking produces exactly the same signal, and recovering there
        // submits a fresh prompt to the GPU for a reader that has already gone.
        Ok(outcome) if outcome.only_reasoning() && !outcome.downstream_closed => {
            state.metrics.event("stream_reasoning_recovery");
            let mut recovery_body = body;
            append_recovery_message(&mut recovery_body, &outcome.reasoning);
            if let Ok(recovery) = open_stream(&state, &recovery_body).await {
                let _ = relay_stream(recovery, await_tools, &sender).await;
            }
            let _ = send_bytes(&sender, encode_data("[DONE]")).await;
        }
        Ok(outcome) if outcome.downstream_closed => {
            state.metrics.event("client_disconnected");
        }
        Ok(_) => {
            let _ = send_bytes(&sender, encode_data("[DONE]")).await;
        }
        Err(error) => end_with_error(&sender, &error.to_string()).await,
    }
}

/// Relays one upstream SSE response while collecting reasoning and tool-call state.
async fn relay_stream(upstream: UpstreamResponse, await_tools: bool, sender: &FrameSender) -> anyhow::Result<StreamOutcome> {
    let mut stream = upstream.bytes_stream();
    let mut decoder = SseDecoder::default();
    let mut outcome = StreamOutcome::default();
    let mut tools = ToolCallBuffer::default();
    while let Some(chunk) = stream.next().await {
        for payload in decoder.push(&chunk?) {
            if !relay_payload(&payload, await_tools, &mut outcome, &mut tools, sender).await {
                outcome.downstream_closed = true;
                return Ok(outcome);
            }
        }
    }
    if let Some(payload) = decoder.finish()
        && !relay_payload(&payload, await_tools, &mut outcome, &mut tools, sender).await
    {
        outcome.downstream_closed = true;
    }
    Ok(outcome)
}

/// Processes one SSE data payload and decides whether it should be forwarded.
async fn relay_payload(payload: &str, await_tools: bool, outcome: &mut StreamOutcome, tools: &mut ToolCallBuffer, sender: &FrameSender) -> bool {
    if payload == "[DONE]" {
        return true;
    }
    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return send_bytes(sender, encode_data(payload)).await;
    };
    if let Some(text) = value.pointer("/choices/0/delta/reasoning_content").and_then(Value::as_str) {
        outcome.reasoning.push_str(text);
    }
    if let Some(text) = value.pointer("/choices/0/delta/content").and_then(Value::as_str) {
        outcome.content.push_str(text);
    }
    let has_tools = tools.absorb(&value);
    outcome.has_tools |= has_tools;
    let finish = value.pointer("/choices/0/finish_reason").and_then(Value::as_str);
    if await_tools && finish == Some("tool_calls") {
        return send_bytes(sender, encode_data(&tools.consolidated(&value).to_string())).await;
    }
    if await_tools && has_tools {
        return true;
    }
    send_bytes(sender, encode_data(payload)).await
}

/// Opens a streaming llama.cpp request and preserves errors that occur before SSE starts.
async fn open_stream(state: &AppState, body: &Value) -> Result<UpstreamResponse, AppError> {
    let url = state.config.llama_base_url.join("v1/chat/completions").map_err(|error| AppError::transport("proxy_error", error))?;
    let response = state
        .client
        .post(url)
        .bearer_auth(&state.config.llama_api_key)
        .json(body)
        .send()
        .await
        .map_err(|error| AppError::transport("proxy_error", error))?;
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    Err(parse_upstream_error(status, &text))
}

/// Executes the existing eight-attempt non-stream retry and reasoning recovery policy.
async fn invoke_with_retry(state: &AppState, mut body: Value) -> Result<Value, AppError> {
    let mut last_error = AppError::new(StatusCode::INTERNAL_SERVER_ERROR, "proxy_error", "Empty LLM response");
    for attempt in 0..state.config.retry_max_attempts {
        match send_non_stream(state, &body).await {
            Ok(completion) if is_meaningful_completion(&completion) => return Ok(completion),
            Ok(completion) if reasoning_only(&completion).is_some() => {
                state.metrics.event("reasoning_recovery");
                append_recovery_message(&mut body, reasoning_only(&completion).unwrap_or_default());
                continue;
            }
            Ok(_) => last_error = AppError::new(StatusCode::INTERNAL_SERVER_ERROR, "proxy_error", "Empty LLM message"),
            Err(error) => last_error = error,
        }
        if attempt + 1 < state.config.retry_max_attempts {
            state.metrics.event("retry");
            tokio::time::sleep(retry_delay(state.config.retry_base_delay, attempt)).await;
        }
    }
    Err(last_error)
}

/// Sends one non-streaming request and parses either completion or upstream error JSON.
async fn send_non_stream(state: &AppState, body: &Value) -> Result<Value, AppError> {
    let url = state.config.llama_base_url.join("v1/chat/completions").map_err(|error| AppError::transport("proxy_error", error))?;
    let response = state
        .client
        .post(url)
        .bearer_auth(&state.config.llama_api_key)
        .json(body)
        .send()
        .await
        .map_err(|error| AppError::transport("proxy_error", error))?;
    let status = response.status();
    let text = response.text().await.map_err(|error| AppError::transport("proxy_error", error))?;
    if !status.is_success() {
        return Err(parse_upstream_error(status, &text));
    }
    serde_json::from_str(&text).map_err(|error| AppError::transport("proxy_error", error))
}

/// Removes and validates the required messages array from a request object.
fn take_messages(object: &mut Map<String, Value>) -> Result<Vec<Value>, AppError> {
    object
        .remove("messages")
        .and_then(|value| value.as_array().cloned())
        .ok_or_else(|| AppError::new(StatusCode::BAD_REQUEST, "validation_error", "messages must be an array"))
}

/// Removes and deserializes optional compression settings.
fn take_compression_options(object: &mut Map<String, Value>) -> Result<Option<CompressionOptions>, AppError> {
    object
        .remove("compressionOptions")
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))
}

/// Inserts the default model and merges disable-thinking into caller template arguments.
fn merge_request_defaults(object: &mut Map<String, Value>, disable_thinking: bool) {
    object.entry("model").or_insert_with(|| Value::String("local-model".to_owned()));
    if !disable_thinking {
        return;
    }
    let kwargs = object.entry("chat_template_kwargs").or_insert_with(|| Value::Object(Map::new()));
    if !kwargs.is_object() {
        *kwargs = Value::Object(Map::new());
    }
    kwargs.as_object_mut().expect("object set above").insert("enable_thinking".to_owned(), Value::Bool(false));
}

/// Returns true when a completion contains content, tools, or an acceptable response field.
fn is_meaningful_completion(completion: &Value) -> bool {
    let message = completion.pointer("/choices/0/message");
    let content = message.and_then(|value| value.get("content")).and_then(Value::as_str).is_some_and(|value| !value.trim().is_empty());
    let tools = message.and_then(|value| value.get("tool_calls")).and_then(Value::as_array).is_some_and(|value| !value.is_empty());
    content || tools
}

/// Extracts reasoning content only when no user-visible content or tool call exists.
fn reasoning_only(completion: &Value) -> Option<&str> {
    if is_meaningful_completion(completion) {
        return None;
    }
    completion.pointer("/choices/0/message/reasoning_content").and_then(Value::as_str).filter(|value| !value.trim().is_empty())
}

/// Appends the exact compatibility recovery prompt to a request's message history.
fn append_recovery_message(body: &mut Value, reasoning: &str) {
    let text = format!("You reasoned but did not respond with content or a tool call. Here is your reasoning: {reasoning}. Please continue.");
    if let Some(messages) = body.get_mut("messages").and_then(Value::as_array_mut) {
        messages.push(json!({ "role": "user", "content": text }));
    }
}

/// Computes capped exponential retry delay with a 30-second maximum.
fn retry_delay(base: Duration, attempt: usize) -> Duration {
    base.saturating_mul(2_u32.saturating_pow(attempt as u32)).min(Duration::from_secs(30))
}

/// Constructs the legacy 201 SSE response with anti-buffering headers.
fn sse_response(receiver: mpsc::Receiver<Result<Bytes, Infallible>>) -> Response {
    Response::builder()
        .status(StatusCode::CREATED)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .body(Body::from_stream(ReceiverStream::new(receiver)))
        .expect("valid SSE response")
}

/// Sets the exact non-stream context-usage response headers.
fn set_context_headers(headers: &mut axum::http::HeaderMap, meta: &CompressionMeta) {
    insert_header(headers, "x-ai-proxy-context-tokens", meta.input_tokens.to_string());
    insert_header(headers, "x-ai-proxy-context-limit", meta.context_limit.to_string());
    insert_header(headers, "x-ai-proxy-context-used-pct", meta.used_pct.to_string());
    if let Some(trigger) = meta.compress_at_tokens {
        insert_header(headers, "x-ai-proxy-compress-at", trigger.to_string());
    }
    insert_header(headers, "x-ai-proxy-compressed", meta.compressed.to_string());
    if let Some(strategy) = &meta.strategy {
        insert_header(headers, "x-ai-proxy-strategy", strategy.clone());
    }
}

/// Inserts one validated static response header.
fn insert_header(headers: &mut axum::http::HeaderMap, name: &'static str, value: String) {
    if let Ok(value) = HeaderValue::from_str(&value) {
        headers.insert(HeaderName::from_static(name), value);
    }
}

/// Sends a frame and reports whether the downstream body still exists.
async fn send_bytes(sender: &FrameSender, bytes: Bytes) -> bool {
    sender.send(Ok(bytes)).await.is_ok()
}

/// Ends an established SSE response with a machine-readable error and DONE marker.
async fn end_with_error(sender: &FrameSender, message: &str) {
    let error = json!({ "error": { "message": message, "type": "proxy_error" } });
    let _ = send_bytes(sender, encode_data(&error.to_string())).await;
    let _ = send_bytes(sender, encode_data("[DONE]")).await;
}

/// Accumulated signal used to decide whether one recovery stream is required.
#[derive(Default)]
struct StreamOutcome {
    reasoning: String,
    content: String,
    has_tools: bool,
    downstream_closed: bool,
}

impl StreamOutcome {
    /// Returns true when the stream contained reasoning but no content or tool calls.
    fn only_reasoning(&self) -> bool {
        self.content.trim().is_empty() && !self.reasoning.trim().is_empty() && !self.has_tools
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies disable-thinking merges instead of replacing caller template controls.
    #[test]
    fn merges_disable_thinking() {
        let mut object = Map::from_iter([("chat_template_kwargs".to_owned(), json!({"reasoning_effort":"xhigh"}))]);
        merge_request_defaults(&mut object, true);
        assert_eq!(object["chat_template_kwargs"]["reasoning_effort"], "xhigh");
        assert_eq!(object["chat_template_kwargs"]["enable_thinking"], false);
        assert_eq!(object["model"], "local-model");
    }

    /// Verifies content and tool calls are accepted while reasoning-only triggers recovery.
    #[test]
    fn classifies_completion_shapes() {
        assert!(is_meaningful_completion(&json!({"choices":[{"message":{"content":"ok"}}]})));
        assert!(is_meaningful_completion(&json!({"choices":[{"message":{"tool_calls":[{}]}}]})));
        let reasoning = json!({"choices":[{"message":{"content":"","reasoning_content":"thinking"}}]});
        assert_eq!(reasoning_only(&reasoning), Some("thinking"));
    }

    /// Verifies the recovery prompt is appended without changing prior messages.
    #[test]
    fn appends_recovery_message() {
        let mut body = json!({"messages":[{"role":"user","content":"hi"}]});
        append_recovery_message(&mut body, "because");
        assert_eq!(body["messages"].as_array().unwrap().len(), 2);
        assert!(body.pointer("/messages/1/content").and_then(Value::as_str).unwrap().contains("because"));
    }

    /// Verifies exponential delay caps at thirty seconds.
    #[test]
    fn retry_delay_caps() {
        assert_eq!(retry_delay(Duration::from_secs(2), 0), Duration::from_secs(2));
        assert_eq!(retry_delay(Duration::from_secs(2), 10), Duration::from_secs(30));
    }
}
