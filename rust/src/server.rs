use crate::{audio, chat, image, realtime::build_realtime_layer, state::AppState};
use anyhow::Result;
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use serde_json::{Value, json};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};

const OPENAPI_SPEC: &str = include_str!("../openapi-spec.json");

/// The method list the legacy NestJS `enableCors` call advertised on every preflight.
const LEGACY_CORS_METHODS: &str = "GET,HEAD,PUT,PATCH,POST,DELETE";

/// Builds the complete HTTP and Socket.IO application with security and telemetry middleware.
pub fn build_app(state: AppState) -> Router {
    let socket_layer = build_realtime_layer(state.clone());
    let json_limit = state.config.max_json_bytes;
    let multipart_limit = state.config.max_multipart_bytes;
    Router::new()
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(chat::chat_completion).layer(DefaultBodyLimit::max(json_limit)))
        .route("/v1/images/generations", post(image::generate_image).layer(DefaultBodyLimit::max(json_limit)))
        .route("/v1/audio/transcriptions", post(audio::transcribe).layer(DefaultBodyLimit::max(multipart_limit)))
        .route("/v1/audio/voices", get(audio::list_voices))
        .route("/v1/audio/engines", get(audio::list_engines))
        .route("/v1/audio/speech", post(audio::speak).layer(DefaultBodyLimit::max(json_limit)))
        .route("/v1/audio/speech/stream", post(audio::speak_stream).layer(DefaultBodyLimit::max(json_limit)))
        .route("/v1/videos/generations", post(video_stub).layer(DefaultBodyLimit::max(json_limit)))
        .route("/healthz", get(health))
        .route("/readyz", get(readiness))
        .route("/metrics", get(metrics))
        .route("/version", get(version))
        .route("/openapi.json", get(openapi))
        .route("/api-json", get(openapi))
        .route("/api", get(api_docs))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(middleware::from_fn_with_state(state.clone(), observe_request))
        .layer(middleware::from_fn_with_state(state.clone(), authorize))
        .layer(socket_layer)
        .layer(middleware::from_fn(legacy_cors))
        .with_state(state)
}

/// Reproduces the legacy `enableCors` behaviour exactly: a wildcard origin with credentials on every
/// response, and a `204` preflight that advertises the explicit method list and mirrors the requested
/// headers. Wrapping the Socket.IO layer as well keeps the realtime handshake answerable cross-origin,
/// which the NestJS gateway got from its own `cors: { origin: '*' }` option.
async fn legacy_cors(request: Request, next: Next) -> Response {
    if request.method() == Method::OPTIONS {
        return legacy_preflight(request.headers());
    }
    let mut response = next.run(request).await;
    apply_common_cors(response.headers_mut());
    response
}

/// Builds the empty `204` preflight response the Express CORS middleware used to return.
fn legacy_preflight(headers: &HeaderMap) -> Response {
    let mut response = Response::builder().status(StatusCode::NO_CONTENT).body(Body::empty()).expect("valid preflight response");
    let target = response.headers_mut();
    apply_common_cors(target);
    target.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static(LEGACY_CORS_METHODS));
    if let Some(requested) = headers.get(header::ACCESS_CONTROL_REQUEST_HEADERS) {
        target.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, requested.clone());
    }
    target.insert(header::VARY, HeaderValue::from_static("Access-Control-Request-Headers"));
    response
}

/// Applies the origin and credential headers every legacy response carried.
fn apply_common_cors(headers: &mut HeaderMap) {
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    headers.insert(header::ACCESS_CONTROL_ALLOW_CREDENTIALS, HeaderValue::from_static("true"));
}

/// Binds the configured listener and serves until Ctrl-C with graceful connection draining.
pub async fn run(state: AppState) -> Result<()> {
    let address = state.config.socket_addr();
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "AI Proxy Rust listening");
    axum::serve(listener, build_app(state)).with_graceful_shutdown(shutdown_signal()).await?;
    Ok(())
}

/// Returns the static OpenAI-compatible local model inventory.
async fn models() -> Json<Value> {
    let created = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    Json(json!({ "object": "list", "data": [{ "id": "local-model", "object": "model", "created": created, "owned_by": "llama.cpp" }] }))
}

/// Returns process liveness without depending on an upstream service.
async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "status": "ok", "uptimeSeconds": state.metrics.uptime_seconds() }))
}

/// Probes the essential llama.cpp upstream with the configured bounded client.
async fn readiness(State(state): State<AppState>) -> Response {
    let url = state.config.llama_base_url.join("props");
    let ready = match url {
        Ok(url) => state.client.get(url).send().await.is_ok_and(|response| response.status().is_success()),
        Err(_) => false,
    };
    let status = if ready { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (status, Json(json!({ "status": if ready { "ready" } else { "not_ready" }, "components": { "llama": ready } }))).into_response()
}

/// Exposes bounded-label Prometheus metrics as UTF-8 text.
async fn metrics(State(state): State<AppState>) -> Response {
    match state.metrics.encode() {
        Ok(output) => ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], output).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

/// Returns build and uptime information for rollout verification.
async fn version(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "name": "ai-proxy-rs", "version": env!("CARGO_PKG_VERSION"), "uptimeSeconds": state.metrics.uptime_seconds() }))
}

/// Serves the existing generated OpenAPI document without modifying its source.
async fn openapi() -> Response {
    ([(header::CONTENT_TYPE, "application/json")], OPENAPI_SPEC).into_response()
}

/// Serves the interactive Swagger UI the NestJS `SwaggerModule.setup('api', …)` mount used to provide,
/// reading the embedded specification. The assets come from a CDN because the proxy no longer ships a
/// `node_modules` tree; the page degrades to a plain link to `/openapi.json` when they cannot load.
async fn api_docs() -> Html<&'static str> {
    Html(SWAGGER_UI_PAGE)
}

const SWAGGER_UI_PAGE: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Proxy API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
<style>body{margin:0}#fallback{font-family:system-ui,sans-serif;padding:2rem}</style>
</head>
<body>
<div id="fallback"><h1>AI Proxy API</h1><p>Swagger UI could not load its assets. The specification is still available at <a href="/openapi.json">/openapi.json</a>.</p></div>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
<script>
  if (window.SwaggerUIBundle) {
    document.getElementById('fallback').remove();
    window.SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true, presets: [SwaggerUIBundle.presets.apis] });
  }
</script>
</body>
</html>"#;

/// Preserves the existing not-implemented response for video generation.
async fn video_stub() -> Response {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "message": "Video generation is not implemented in this proxy", "error": "Not Implemented", "statusCode": 501 })),
    )
        .into_response()
}

/// Returns a stable 404 JSON response for unknown paths.
async fn not_found(method: Method, uri: Uri) -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "message": format!("Cannot {} {}", method, uri.path()), "error": "Not Found", "statusCode": 404 }))).into_response()
}

/// Enforces an optional bearer key while leaving health checks available to Service Manager.
async fn authorize(State(state): State<AppState>, headers: HeaderMap, request: Request, next: Next) -> Response {
    let Some(expected) = &state.config.inbound_api_key else {
        return next.run(request).await;
    };
    if request.uri().path() == "/healthz" {
        return next.run(request).await;
    }
    let supplied = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()).and_then(|value| value.strip_prefix("Bearer ")).unwrap_or_default();
    if constant_time_equal(expected.as_bytes(), supplied.as_bytes()) {
        return next.run(request).await;
    }
    (StatusCode::UNAUTHORIZED, Json(json!({ "error": { "message": "Unauthorized", "type": "authentication_error" } }))).into_response()
}

/// Records bounded route, status, elapsed time, and in-flight state without payloads.
async fn observe_request(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let route = normalized_route(request.uri().path());
    let started = Instant::now();
    state.metrics.change_in_flight(1);
    let response = next.run(request).await;
    state.metrics.change_in_flight(-1);
    state.metrics.observe_request(route, response.status().as_u16(), started.elapsed().as_secs_f64());
    response
}

/// Maps concrete request paths into a fixed metric-label vocabulary.
fn normalized_route(path: &str) -> &'static str {
    match path {
        "/v1/models" => "models",
        "/v1/chat/completions" => "chat",
        "/v1/images/generations" => "images",
        "/v1/audio/transcriptions" => "transcriptions",
        "/v1/audio/voices" => "voices",
        "/v1/audio/engines" => "engines",
        "/v1/audio/speech" => "speech",
        "/v1/audio/speech/stream" => "speech_stream",
        "/v1/videos/generations" => "videos",
        "/healthz" => "health",
        "/readyz" => "readiness",
        "/metrics" => "metrics",
        "/version" => "version",
        "/api" => "api",
        "/openapi.json" | "/api-json" => "openapi",
        _ if path.starts_with("/v1/audio/transcriptions/realtime") => "transcriptions_realtime",
        _ => "not_found",
    }
}

/// Compares equal-length secret bytes without content-dependent early exit.
fn constant_time_equal(expected: &[u8], supplied: &[u8]) -> bool {
    expected.len() == supplied.len() && bool::from(expected.ct_eq(supplied))
}

/// Waits for the process interrupt used by Service Manager stop and restart actions.
async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies secret comparison accepts only exact equal-length bytes.
    #[test]
    fn constant_time_key_comparison() {
        assert!(constant_time_equal(b"secret", b"secret"));
        assert!(!constant_time_equal(b"secret", b"secrex"));
        assert!(!constant_time_equal(b"secret", b"short"));
    }

    /// Verifies metric labels remain bounded for dynamic and unknown paths.
    #[test]
    fn route_labels_are_bounded() {
        assert_eq!(normalized_route("/v1/chat/completions"), "chat");
        assert_eq!(normalized_route("/v1/audio/transcriptions/realtime/anything"), "transcriptions_realtime");
        assert_eq!(normalized_route("/random/123"), "not_found");
    }
}
