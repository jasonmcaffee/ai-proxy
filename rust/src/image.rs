use crate::{error::AppError, state::AppState, workflow::build_workflow};
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::Client;
use serde_json::{Value, json};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use url::Url;

/// Generates one image through the legacy ComfyUI workflow and OpenAI response shape.
pub async fn generate_image(State(state): State<AppState>, Json(body): Json<Value>) -> Result<Response, AppError> {
    validate_image_request(&body)?;
    let result = generate_image_inner(&state, &body).await;
    match result {
        Ok(value) => Ok((StatusCode::OK, Json(value)).into_response()),
        Err(error) => Err(AppError::new(StatusCode::INTERNAL_SERVER_ERROR, "image_error", error.message)),
    }
}

/// Applies the legacy DTO type checks without starting a ComfyUI workflow.
fn validate_image_request(body: &Value) -> Result<(), AppError> {
    let mut messages = Vec::new();
    if !body.get("prompt").is_some_and(Value::is_string) {
        messages.push("prompt must be a string");
    }
    for field in ["negativePrompt", "model", "size", "response_format", "quality", "style"] {
        if body.get(field).is_some_and(|value| !value.is_null() && !value.is_string()) {
            messages.push(match field {
                "negativePrompt" => "negativePrompt must be a string",
                "response_format" => "response_format must be a string",
                "quality" => "quality must be a string",
                "style" => "style must be a string",
                "model" => "model must be a string",
                _ => "size must be a string",
            });
        }
    }
    if body.get("n").is_some_and(|value| !value.is_null() && !value.is_number()) {
        messages.insert(
            messages.iter().position(|message| message.starts_with("size")).unwrap_or(messages.len()),
            "n must be a number conforming to the specified constraints",
        );
    }
    if messages.is_empty() {
        return Ok(());
    }
    Err(AppError::validation(messages))
}

/// Runs submit, bounded polling, image fetch, and cancellation-guard lifecycle.
async fn generate_image_inner(state: &AppState, body: &Value) -> Result<Value, AppError> {
    let prompt = body
        .get("prompt")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::new(StatusCode::BAD_REQUEST, "validation_error", "prompt must be a string"))?;
    let workflow = build_workflow(prompt, body.get("negativePrompt").and_then(Value::as_str), body.get("size").and_then(Value::as_str)).map_err(|error| AppError::transport("image_error", error))?;
    let prompt_id = submit_workflow(state, workflow).await?;
    let mut cancel_guard = ComfyCancelGuard::new(state.image_client.clone(), state.config.comfyui_base_url.clone(), prompt_id.clone());
    let entry = poll_until_complete(state, &prompt_id).await?;
    let bytes = fetch_first_image(state, &entry).await?;
    cancel_guard.disarm();
    let created = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    Ok(json!({ "created": created, "data": [{ "b64_json": STANDARD.encode(bytes), "revised_prompt": prompt }] }))
}

/// Submits one ComfyUI graph and returns its prompt id.
async fn submit_workflow(state: &AppState, workflow: Value) -> Result<String, AppError> {
    let url = append_path(&state.config.comfyui_base_url, "prompt")?;
    let response = state.image_client.post(url).json(&json!({ "prompt": workflow })).send().await.map_err(|error| AppError::transport("image_error", error))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::new(StatusCode::BAD_GATEWAY, "image_error", format!("ComfyUI submit failed: {status} - {text}")));
    }
    let body: Value = response.json().await.map_err(|error| AppError::transport("image_error", error))?;
    body.get("prompt_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| AppError::new(StatusCode::BAD_GATEWAY, "image_error", "ComfyUI response omitted prompt_id"))
}

/// Polls ComfyUI history on the legacy two-second cadence until output or timeout.
async fn poll_until_complete(state: &AppState, prompt_id: &str) -> Result<Value, AppError> {
    let deadline = Instant::now() + state.config.image_timeout;
    let history_url = append_path(&state.config.comfyui_base_url, &format!("history/{prompt_id}"))?;
    while Instant::now() < deadline {
        tokio::time::sleep(state.config.image_poll_interval).await;
        state.metrics.event("comfy_poll");
        let Ok(response) = state.image_client.get(history_url.clone()).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(history) = response.json::<Value>().await else {
            continue;
        };
        let Some(entry) = history.get(prompt_id) else {
            continue;
        };
        if entry_has_image(entry) {
            return Ok(entry.clone());
        }
    }
    Err(AppError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "image_error",
        format!("ComfyUI job {prompt_id} timed out after {}s", state.config.image_timeout.as_secs()),
    ))
}

/// Returns true when any history output node owns at least one image.
fn entry_has_image(entry: &Value) -> bool {
    entry
        .get("outputs")
        .and_then(Value::as_object)
        .is_some_and(|outputs| outputs.values().any(|node| node.get("images").and_then(Value::as_array).is_some_and(|images| !images.is_empty())))
}

/// Fetches the first declared output image from ComfyUI.
async fn fetch_first_image(state: &AppState, entry: &Value) -> Result<bytes::Bytes, AppError> {
    let outputs = entry.get("outputs").and_then(Value::as_object).ok_or_else(|| AppError::new(StatusCode::BAD_GATEWAY, "image_error", "No output images found"))?;
    for node in outputs.values() {
        let Some(image) = node.get("images").and_then(Value::as_array).and_then(|images| images.first()) else {
            continue;
        };
        let mut url = append_path(&state.config.comfyui_base_url, "view")?;
        url.query_pairs_mut()
            .append_pair("filename", image.get("filename").and_then(Value::as_str).unwrap_or_default())
            .append_pair("subfolder", image.get("subfolder").and_then(Value::as_str).unwrap_or_default())
            .append_pair("type", image.get("type").and_then(Value::as_str).unwrap_or("output"));
        let response = state.image_client.get(url).send().await.map_err(|error| AppError::transport("image_error", error))?;
        if !response.status().is_success() {
            return Err(AppError::new(StatusCode::BAD_GATEWAY, "image_error", format!("ComfyUI image fetch failed: {}", response.status())));
        }
        return response.bytes().await.map_err(|error| AppError::transport("image_error", error));
    }
    Err(AppError::new(StatusCode::BAD_GATEWAY, "image_error", "No output images found"))
}

/// Joins one ComfyUI path without allowing a missing trailing slash to replace the base path.
fn append_path(base: &Url, path: &str) -> Result<Url, AppError> {
    let mut url = base.clone();
    url.set_path(&format!("{}/{}", url.path().trim_end_matches('/'), path.trim_start_matches('/')));
    Ok(url)
}

/// Drop guard that cancels a submitted ComfyUI job if its request future disappears.
struct ComfyCancelGuard {
    client: Client,
    base_url: Url,
    prompt_id: String,
    armed: bool,
}

impl ComfyCancelGuard {
    /// Arms cancellation for one submitted prompt.
    fn new(client: Client, base_url: Url, prompt_id: String) -> Self {
        Self { client, base_url, prompt_id, armed: true }
    }

    /// Disables cancellation after the output image has been fetched successfully.
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for ComfyCancelGuard {
    /// Spawns best-effort queue deletion and interruption when work remains in flight.
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let client = self.client.clone();
        let base_url = self.base_url.clone();
        let prompt_id = self.prompt_id.clone();
        tokio::spawn(async move {
            let queue = append_path(&base_url, "queue").ok();
            let interrupt = append_path(&base_url, "interrupt").ok();
            if let Some(url) = queue {
                let _ = client.post(url).json(&json!({ "delete": [prompt_id] })).send().await;
            }
            if let Some(url) = interrupt {
                let _ = client.post(url).send().await;
            }
        });
    }
}
