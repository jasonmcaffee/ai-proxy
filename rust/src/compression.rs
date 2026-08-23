use crate::{error::AppError, state::AppState};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Instant;

const CHARS_PER_TOKEN: usize = 4;

/// Client-configurable context compression settings accepted by the TypeScript proxy.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionOptions {
    pub enabled: Option<bool>,
    pub max_context_size: Option<u64>,
    pub compress_at_tokens: Option<u64>,
    pub target_tokens: Option<u64>,
    pub strategy: Option<String>,
    pub keep_recent_messages: Option<usize>,
    pub keep_recent_tokens: Option<u64>,
    pub preserve_system_prompt: Option<bool>,
    pub preserve_first_user_message: Option<bool>,
    pub only_keep_latest_image: Option<bool>,
    pub image_dedupe_scope: Option<String>,
    pub context_limit: Option<u64>,
    pub truncate_tool_results: Option<ToolResultOptions>,
    pub summarize: Option<SummarizeOptions>,
}

/// Tool-result clipping controls nested under compression options.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultOptions {
    pub enabled: Option<bool>,
    pub max_tool_result_tokens: Option<usize>,
    pub keep_recent_tool_results: Option<usize>,
}

/// Summary-model controls nested under compression options.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeOptions {
    pub summary_model: Option<String>,
    pub summary_max_tokens: Option<u64>,
}

/// Context usage metadata returned in headers, JSON, or proxy SSE events.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionMeta {
    pub raw_input_tokens: u64,
    pub input_tokens: u64,
    pub context_limit: u64,
    pub used_pct: f64,
    pub compress_at_tokens: Option<u64>,
    pub tokens_until_compression: u64,
    pub until_compression_pct: f64,
    pub compressed: bool,
    pub strategy: Option<String>,
    pub dropped_messages: usize,
    pub summarized_messages: usize,
    pub truncated_tool_results: usize,
}

/// Result of one optional context-compression pass.
pub struct CompressionResult {
    pub messages: Vec<Value>,
    pub meta: Option<CompressionMeta>,
    pub progress: Vec<Value>,
}

/// Change counts recorded while reducing one conversation history.
struct CompressionChanges {
    compressed: bool,
    dropped: usize,
    summarized: usize,
    truncated: usize,
}

/// Applies image de-duplication, tool clipping, summary, and eviction in compatibility order.
pub async fn compress_messages(state: &AppState, messages: Vec<Value>, options: Option<CompressionOptions>) -> CompressionResult {
    let Some(options) = options.filter(|options| options.enabled == Some(true)) else {
        return CompressionResult { messages, meta: None, progress: Vec::new() };
    };
    let mut history = messages;
    let raw_input_tokens = count_or_estimate(state, &history).await;
    let cleared_images = if options.only_keep_latest_image != Some(false) {
        dedupe_images(&mut history, options.image_dedupe_scope.as_deref().unwrap_or("all"))
    } else {
        0
    };
    let mut progress = Vec::new();
    let truncated_tool_results = truncate_tool_results(&mut history, options.truncate_tool_results.as_ref(), &mut progress);
    let trigger = resolve_trigger(state, &options).await;
    let strategy = options.strategy.clone().unwrap_or_else(|| "sliding-window".to_owned());
    let mut dropped_messages = 0;
    let mut summarized_messages = 0;
    let mut input_tokens = count_or_estimate(state, &history).await;
    if trigger.is_some_and(|value| input_tokens > value) {
        let trigger_value = trigger.unwrap_or_default();
        progress.push(progress_value("analyzing", format!("Compressing conversation ({input_tokens} tokens over {trigger_value})...")));
        if strategy == "summarize" {
            summarized_messages = summarize_older_turns(state, &mut history, &options, &mut progress).await;
        }
        let target = resolve_target(&options, trigger_value);
        if count_or_estimate(state, &history).await > target {
            progress.push(progress_value("evicting", "Dropping oldest messages..."));
            dropped_messages = evict_to_target(&mut history, target, &options);
        }
        input_tokens = count_or_estimate(state, &history).await;
    }
    progress.push(progress_value("done", "Ready"));
    let compressed = cleared_images + truncated_tool_results + dropped_messages + summarized_messages > 0;
    let changes = CompressionChanges {
        compressed,
        dropped: dropped_messages,
        summarized: summarized_messages,
        truncated: truncated_tool_results,
    };
    let meta = build_meta(state, &options, raw_input_tokens, input_tokens, trigger, &strategy, changes).await;
    CompressionResult {
        messages: history,
        meta: Some(meta),
        progress,
    }
}

/// Resolves and clamps the compression trigger to 95 percent of detected model context.
async fn resolve_trigger(state: &AppState, options: &CompressionOptions) -> Option<u64> {
    let requested = options.compress_at_tokens.or(options.max_context_size)?;
    get_context_length(state).await.map_or(Some(requested), |limit| Some(requested.min(limit.saturating_mul(95) / 100)))
}

/// Resolves the target context size after compression.
fn resolve_target(options: &CompressionOptions, trigger: u64) -> u64 {
    options.target_tokens.or(options.max_context_size).unwrap_or(trigger.saturating_mul(3) / 4)
}

/// Builds rounded client-facing context usage metadata.
async fn build_meta(state: &AppState, options: &CompressionOptions, raw: u64, input: u64, trigger: Option<u64>, strategy: &str, changes: CompressionChanges) -> CompressionMeta {
    let context_limit = match options.context_limit {
        Some(value) => value,
        None => get_context_length(state).await.or(trigger).unwrap_or_default(),
    };
    let used_pct = percentage(input, context_limit);
    let tokens_until_compression = trigger.map_or(0, |value| value.saturating_sub(input));
    let until_compression_pct = trigger.map_or(0.0, |value| percentage(input, value).min(100.0));
    CompressionMeta {
        raw_input_tokens: raw,
        input_tokens: input,
        context_limit,
        used_pct,
        compress_at_tokens: trigger,
        tokens_until_compression,
        until_compression_pct,
        compressed: changes.compressed,
        strategy: Some(strategy.to_owned()),
        dropped_messages: changes.dropped,
        summarized_messages: changes.summarized,
        truncated_tool_results: changes.truncated,
    }
}

/// Returns one decimal percentage while avoiding division by zero.
fn percentage(numerator: u64, denominator: u64) -> f64 {
    if denominator == 0 { 0.0 } else { ((numerator as f64 / denominator as f64) * 1000.0).round() / 10.0 }
}

/// Counts context through llama.cpp and falls back to the compatibility character estimate.
async fn count_or_estimate(state: &AppState, messages: &[Value]) -> u64 {
    match count_tokens(state, messages).await {
        Ok(tokens) => tokens,
        Err(error) => {
            tracing::debug!(%error, "count_tokens failed; using estimate");
            estimate_history_tokens(messages)
        }
    }
}

/// Calls llama.cpp's Anthropic-compatible token-count endpoint with its role workaround.
async fn count_tokens(state: &AppState, messages: &[Value]) -> Result<u64, AppError> {
    let mut adjusted = messages.to_vec();
    let last_role = adjusted.last().and_then(|message| message.get("role")).and_then(Value::as_str);
    if adjusted.is_empty() || last_role == Some("assistant") {
        adjusted.push(json!({ "role": "user", "content": " " }));
    }
    let url = state.config.llama_base_url.join("v1/messages/count_tokens").map_err(|error| AppError::transport("proxy_error", error))?;
    let started = Instant::now();
    let response = state
        .client
        .post(url)
        .json(&json!({ "model": "local-model", "system": "", "messages": adjusted }))
        .send()
        .await
        .map_err(|error| AppError::transport("proxy_error", error))?;
    state.metrics.observe_upstream("llama_count", response.status().as_str(), started.elapsed().as_secs_f64());
    if !response.status().is_success() {
        return Err(AppError::new(StatusCode::BAD_GATEWAY, "proxy_error", format!("count_tokens failed: {}", response.status())));
    }
    let body: Value = response.json().await.map_err(|error| AppError::transport("proxy_error", error))?;
    body.get("input_tokens")
        .and_then(Value::as_u64)
        .ok_or_else(|| AppError::new(StatusCode::BAD_GATEWAY, "proxy_error", "count_tokens response omitted input_tokens"))
}

/// Reads and caches the model context length from llama.cpp `/props`.
pub async fn get_context_length(state: &AppState) -> Option<u64> {
    if let Some(value) = *state.context_length.read().await {
        return Some(value);
    }
    let url = state.config.llama_base_url.join("props").ok()?;
    let response = state.client.get(url).send().await.ok()?;
    let body: Value = response.json().await.ok()?;
    let value = body.pointer("/default_generation_settings/n_ctx").and_then(Value::as_u64).or_else(|| body.get("n_ctx").and_then(Value::as_u64))?;
    if value > 0 {
        *state.context_length.write().await = Some(value);
        Some(value)
    } else {
        None
    }
}

/// Clears older image-bearing messages while honoring the tool-only scope.
fn dedupe_images(history: &mut [Value], scope: &str) -> usize {
    let indices = history
        .iter()
        .enumerate()
        .filter(|(_, message)| scope != "tool-only" || role(message) == Some("tool"))
        .filter(|(_, message)| message_has_image(message))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if indices.len() < 2 {
        return 0;
    }
    for index in indices.iter().take(indices.len() - 1) {
        let tool_call_id = history[*index].get("tool_call_id").cloned();
        history[*index]["content"] = Value::String(String::new());
        if let Some(object) = history[*index].as_object_mut() {
            object.remove("llmToolContent");
            if let Some(id) = tool_call_id {
                object.insert("tool_call_id".to_owned(), id);
            }
        }
    }
    indices.len() - 1
}

/// Returns true when a message content array contains an OpenAI image part.
fn message_has_image(message: &Value) -> bool {
    message
        .get("content")
        .and_then(Value::as_array)
        .is_some_and(|parts| parts.iter().any(|part| part.get("type").and_then(Value::as_str) == Some("image_url") && part.get("image_url").is_some()))
}

/// Middle-clips older tool results and reports how many changed.
fn truncate_tool_results(history: &mut [Value], options: Option<&ToolResultOptions>, progress: &mut Vec<Value>) -> usize {
    let Some(options) = options.filter(|options| options.enabled == Some(true)) else {
        return 0;
    };
    progress.push(progress_value("truncating", "Trimming older tool results..."));
    let keep_recent = options.keep_recent_tool_results.unwrap_or(3);
    let max_chars = options.max_tool_result_tokens.unwrap_or(512).saturating_mul(CHARS_PER_TOKEN);
    let tool_indices = history.iter().enumerate().filter(|(_, message)| role(message) == Some("tool")).map(|(index, _)| index).collect::<Vec<_>>();
    let truncate_count = tool_indices.len().saturating_sub(keep_recent);
    let mut changed = 0;
    for index in tool_indices.into_iter().take(truncate_count) {
        let Some(text) = history[index].get("content").and_then(Value::as_str) else {
            continue;
        };
        if text.len() <= max_chars {
            continue;
        }
        let half = max_chars / 2;
        let clipped = format!("{}\n...[truncated {} chars]...\n{}", safe_prefix(text, half), text.len() - max_chars, safe_suffix(text, half));
        history[index]["content"] = Value::String(clipped);
        changed += 1;
    }
    changed
}

/// Replaces eligible older turns with one factual summary message.
async fn summarize_older_turns(state: &AppState, history: &mut Vec<Value>, options: &CompressionOptions, progress: &mut Vec<Value>) -> usize {
    let head_keep = head_keep_count(history, options);
    let keep_recent = keep_recent_count(history, options, 10);
    let recency_start = head_keep.max(history.len().saturating_sub(keep_recent));
    if recency_start <= head_keep {
        return 0;
    }
    let older = history[head_keep..recency_start].to_vec();
    progress.push(progress_value("summarizing", format!("Summarizing {} earlier messages...", older.len())));
    match generate_summary(state, &older, options).await {
        Ok(summary) => {
            history.splice(head_keep..recency_start, [json!({ "role": "system", "content": format!("[Conversation summary of earlier turns]\n{summary}") })]);
            older.len()
        }
        Err(error) => {
            tracing::warn!(%error, "summary failed; falling back to eviction");
            progress.push(progress_value("evicting", "Summary failed; trimming instead..."));
            0
        }
    }
}

/// Requests a compact fact-preserving summary from the configured local model.
async fn generate_summary(state: &AppState, older: &[Value], options: &CompressionOptions) -> Result<String, AppError> {
    let transcript = older
        .iter()
        .map(|message| {
            format!(
                "{}: {}",
                role(message).unwrap_or(""),
                message.get("content").and_then(Value::as_str).map(str::to_owned).unwrap_or_else(|| message.get("content").unwrap_or(&Value::Null).to_string())
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let summary = options.summarize.as_ref();
    let body = json!({
        "model": summary.and_then(|value| value.summary_model.as_deref()).unwrap_or("local-model"), "stream": false, "temperature": 0.3,
        "max_tokens": summary.and_then(|value| value.summary_max_tokens).unwrap_or(1024),
        "messages": [
            { "role": "system", "content": "You compress conversation history into notes for an assistant that must continue the conversation. Produce a compact summary that PRESERVES VERBATIM every specific fact the user stated - names, codenames, numbers, amounts, dates, places, IDs, file paths, requirements, decisions, and constraints. Prefer a Known facts list, then a brief discussion summary and open questions. Do not answer; only summarize." },
            { "role": "user", "content": format!("Summarize this earlier conversation, preserving all concrete facts and values verbatim:\n\n{transcript}") }
        ]
    });
    let url = state.config.llama_base_url.join("v1/chat/completions").map_err(|error| AppError::transport("proxy_error", error))?;
    let response = state
        .client
        .post(url)
        .bearer_auth(&state.config.llama_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| AppError::transport("proxy_error", error))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|error| AppError::transport("proxy_error", error))?;
    if !status.is_success() {
        return Err(AppError::upstream(status, value));
    }
    Ok(value.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or_default().to_owned())
}

/// Evicts oldest eligible groups until the local safe estimate reaches target.
fn evict_to_target(history: &mut Vec<Value>, target: u64, options: &CompressionOptions) -> usize {
    let mut tokens = estimate_history_tokens(history);
    let mut dropped = 0;
    while tokens > target {
        let head_keep = head_keep_count(history, options);
        let recency_start = head_keep.max(history.len().saturating_sub(keep_recent_count(history, options, 2)));
        let Some(index) = (head_keep..recency_start).find(|index| role(&history[*index]) != Some("tool")) else {
            break;
        };
        let mut count = 1;
        if role(&history[index]) == Some("assistant") && history[index].get("tool_calls").and_then(Value::as_array).is_some_and(|calls| !calls.is_empty()) {
            while index + count < recency_start && role(&history[index + count]) == Some("tool") {
                count += 1;
            }
        }
        let removed = history.drain(index..index + count).collect::<Vec<_>>();
        tokens = tokens.saturating_sub(removed.iter().map(estimate_message_tokens).sum());
        dropped += removed.len();
    }
    dropped
}

/// Computes the protected leading prefix of system messages and first user message.
fn head_keep_count(history: &[Value], options: &CompressionOptions) -> usize {
    let systems = if options.preserve_system_prompt != Some(false) {
        history.iter().take_while(|message| role(message) == Some("system")).count()
    } else {
        0
    };
    if options.preserve_first_user_message != Some(false) && history.get(systems).and_then(role) == Some("user") {
        systems + 1
    } else {
        systems
    }
}

/// Resolves the trailing verbatim window by tokens or message count.
fn keep_recent_count(history: &[Value], options: &CompressionOptions, fallback: usize) -> usize {
    let Some(token_budget) = options.keep_recent_tokens else {
        return options.keep_recent_messages.unwrap_or(fallback);
    };
    let mut tokens = 0;
    let mut count = 0;
    for message in history.iter().rev() {
        tokens += estimate_message_tokens(message);
        if tokens > token_budget {
            break;
        }
        count += 1;
    }
    count.max(1)
}

/// Estimates total context tokens with the legacy character heuristic.
fn estimate_history_tokens(history: &[Value]) -> u64 {
    history.iter().map(estimate_message_tokens).sum()
}

/// Estimates one message using serialized content and fixed role overhead.
fn estimate_message_tokens(message: &Value) -> u64 {
    let content = message.get("content").map(|value| value.as_str().map(str::to_owned).unwrap_or_else(|| value.to_string())).unwrap_or_default();
    content.len().div_ceil(CHARS_PER_TOKEN) as u64 + 4
}

/// Reads a message's role string.
fn role(message: &Value) -> Option<&str> {
    message.get("role").and_then(Value::as_str)
}

/// Builds one human-readable compression progress payload.
fn progress_value(phase: &str, message: impl Into<String>) -> Value {
    json!({ "phase": phase, "message": message.into() })
}

/// Returns a UTF-8-safe prefix of at most the requested bytes.
fn safe_prefix(text: &str, bytes: usize) -> &str {
    let mut end = bytes.min(text.len());
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Returns a UTF-8-safe suffix of at most the requested bytes.
fn safe_suffix(text: &str, bytes: usize) -> &str {
    let mut start = text.len().saturating_sub(bytes);
    while !text.is_char_boundary(start) {
        start += 1;
    }
    &text[start..]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Creates enabled defaults for focused pure compression-helper tests.
    fn options() -> CompressionOptions {
        CompressionOptions { enabled: Some(true), ..Default::default() }
    }

    /// Verifies percentage rounding matches the client contract.
    #[test]
    fn percentage_rounds_to_one_decimal() {
        assert_eq!(percentage(333, 1000), 33.3);
        assert_eq!(percentage(1, 0), 0.0);
    }

    /// Verifies image de-duplication clears older payloads and preserves the newest.
    #[test]
    fn dedupes_older_images() {
        let mut history = vec![
            json!({"role":"user","content":[{"type":"image_url","image_url":{"url":"a"}}]}),
            json!({"role":"user","content":[{"type":"image_url","image_url":{"url":"b"}}]}),
        ];
        assert_eq!(dedupe_images(&mut history, "all"), 1);
        assert_eq!(history[0]["content"], "");
        assert!(message_has_image(&history[1]));
    }

    /// Verifies tool-only scope leaves user asset images intact.
    #[test]
    fn tool_only_dedupe_preserves_user_images() {
        let mut history = vec![
            json!({"role":"user","content":[{"type":"image_url","image_url":"a"}]}),
            json!({"role":"tool","content":[{"type":"image_url","image_url":"b"}]}),
            json!({"role":"tool","content":[{"type":"image_url","image_url":"c"}]}),
        ];
        assert_eq!(dedupe_images(&mut history, "tool-only"), 1);
        assert!(message_has_image(&history[0]));
        assert_eq!(history[1]["content"], "");
    }

    /// Verifies older tool results are middle-clipped while the newest stays verbatim.
    #[test]
    fn truncates_only_older_tool_results() {
        let mut history = vec![json!({"role":"tool","content":"abcdefghijklmnop"}), json!({"role":"tool","content":"recent"})];
        let config = ToolResultOptions {
            enabled: Some(true),
            max_tool_result_tokens: Some(2),
            keep_recent_tool_results: Some(1),
        };
        assert_eq!(truncate_tool_results(&mut history, Some(&config), &mut Vec::new()), 1);
        assert!(history[0]["content"].as_str().unwrap().contains("truncated"));
        assert_eq!(history[1]["content"], "recent");
    }

    /// Verifies eviction protects system, first user, recency, and assistant-tool groups.
    #[test]
    fn eviction_preserves_required_structure() {
        let mut config = options();
        config.keep_recent_messages = Some(1);
        let long = "x".repeat(100);
        let mut history = vec![
            json!({"role":"system","content":"system"}),
            json!({"role":"user","content":"goal"}),
            json!({"role":"assistant","content":long,"tool_calls":[{"id":"a"}]}),
            json!({"role":"tool","content":"result"}),
            json!({"role":"user","content":"latest"}),
        ];
        assert_eq!(evict_to_target(&mut history, 15, &config), 2);
        assert_eq!(history.iter().map(|message| role(message).unwrap()).collect::<Vec<_>>(), vec!["system", "user", "user"]);
    }

    /// Verifies UTF-8 clipping never slices inside a multi-byte codepoint.
    #[test]
    fn clipping_is_utf8_safe() {
        let text = "ab😀cd";
        assert_eq!(safe_prefix(text, 4), "ab");
        assert_eq!(safe_suffix(text, 4), "cd");
    }
}
