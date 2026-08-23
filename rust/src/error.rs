use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

/// HTTP-safe application error with a stable status and OpenAI-style JSON body.
#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub error_type: &'static str,
    pub message: String,
    pub upstream_body: Option<Value>,
}

impl AppError {
    /// Creates a proxy-owned error response.
    pub fn new(status: StatusCode, error_type: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            error_type,
            message: message.into(),
            upstream_body: None,
        }
    }

    /// Preserves a structured upstream error body with its HTTP status.
    pub fn upstream(status: StatusCode, body: Value) -> Self {
        Self {
            status,
            error_type: "proxy_error",
            message: "Upstream request failed".to_owned(),
            upstream_body: Some(body),
        }
    }

    /// Creates the ordered validation envelope emitted by the legacy NestJS pipeline.
    pub fn validation(messages: Vec<&'static str>) -> Self {
        Self::upstream(StatusCode::BAD_REQUEST, json!({ "message": messages, "error": "Bad Request", "statusCode": 400 }))
    }

    /// Converts an arbitrary transport failure to a bad-gateway proxy error.
    pub fn transport(error_type: &'static str, error: impl std::fmt::Display) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, error_type, error.to_string())
    }
}

impl IntoResponse for AppError {
    /// Serializes the application error without leaking internal types or backtraces.
    fn into_response(self) -> Response {
        if let Some(body) = self.upstream_body {
            return (self.status, Json(body)).into_response();
        }
        let body = json!({ "error": { "message": self.message, "type": self.error_type } });
        (self.status, Json(body)).into_response()
    }
}

impl std::fmt::Display for AppError {
    /// Formats the public-safe error message for logs and diagnostics.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.status, self.message)
    }
}

impl std::error::Error for AppError {}

/// Parses an upstream body as JSON and falls back to an OpenAI-style text error.
pub fn parse_upstream_error(status: StatusCode, text: &str) -> AppError {
    let body = serde_json::from_str(text).unwrap_or_else(|_| json!({ "error": { "message": text, "type": "proxy_error" } }));
    AppError::upstream(status, body)
}
