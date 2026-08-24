use crate::{error::AppError, sse::encode_data, state::AppState};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{FromRequest, Multipart, Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::StreamExt;
use reqwest::{
    Response as UpstreamResponse,
    multipart::{Form, Part},
};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, convert::Infallible};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use url::Url;

/// In-memory multipart upload plus routing fields from an audio transcription request.
struct TranscriptionUpload {
    bytes: Bytes,
    filename: String,
    mime_type: String,
    fields: Map<String, Value>,
}

/// Proxies multipart transcription to default, diarized, or legacy upstreams.
pub async fn transcribe(State(state): State<AppState>, request: Request) -> Result<Response, AppError> {
    let multipart = Multipart::from_request(request, &state).await.map_err(|_| {
        AppError::upstream(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "error": { "message": "Cannot read properties of undefined (reading 'buffer')", "type": "transcription_error" } }),
        )
    })?;
    let upload = read_transcription_upload(multipart).await?;
    let legacy = field_bool(&upload.fields, "legacy");
    let diarization = field_bool(&upload.fields, "diarization");
    let response = if legacy {
        send_legacy_transcription(&state, &upload).await
    } else {
        send_default_transcription(&state, &upload, diarization).await
    };
    match response {
        Ok(value) => Ok((StatusCode::OK, Json(value)).into_response()),
        Err(error) => Err(AppError::new(StatusCode::INTERNAL_SERVER_ERROR, "transcription_error", error.message)),
    }
}

/// Returns the voice inventory from the default TTS service.
pub async fn list_voices(State(state): State<AppState>) -> Result<Response, AppError> {
    proxy_json_get(&state, "tts", append_path(&state.config.text_to_speech_base_url, "v1/audio/voices")?, "tts_error").await
}

/// Returns the selectable speech-engine inventory from the default TTS service.
pub async fn list_engines(State(state): State<AppState>) -> Result<Response, AppError> {
    proxy_json_get(&state, "tts", append_path(&state.config.text_to_speech_base_url, "v1/audio/engines")?, "tts_error").await
}

/// Generates one binary speech response using default or legacy routing.
pub async fn speak(State(state): State<AppState>, Json(body): Json<Value>) -> Result<Response, AppError> {
    validate_speech_request(&body)?;
    let input = required_input(&body)?;
    let legacy = body.get("legacy").and_then(Value::as_bool).unwrap_or(false);
    let (url, payload, response_content_type) = if legacy {
        let format = body.get("response_format").and_then(Value::as_str).unwrap_or("mp3");
        (append_path(&state.config.speaches_base_url, "audio/speech")?, legacy_speech_payload(input, &body), content_type_for(format))
    } else {
        (append_path(&state.config.text_to_speech_base_url, "v1/audio/speech")?, default_speech_payload(input, &body, "wav"), "audio/wav")
    };
    let response = state.client.post(url).json(&payload).send().await.map_err(|error| AppError::transport("tts_error", error))?;
    if !response.status().is_success() {
        return Err(tts_upstream_error(response).await);
    }
    // The declared `response_format` owns the Content-Type, exactly as the NestJS controller did.
    // Trusting the upstream header instead mislabels the body whenever the engine reports a generic
    // or simply wrong type, and callers key their decoder off this header.
    let bytes = response.bytes().await.map_err(|error| AppError::transport("tts_error", error))?;
    Ok(binary_response(StatusCode::OK, response_content_type, bytes))
}

/// Streams sentence-labeled base64 audio chunks as SSE.
pub async fn speak_stream(State(state): State<AppState>, Json(body): Json<Value>) -> Result<Response, AppError> {
    validate_speech_request(&body)?;
    let input = required_input(&body)?.to_owned();
    let legacy = body.get("legacy").and_then(Value::as_bool).unwrap_or(false);
    let sentences = split_sentences(&input, 50);
    let (sender, receiver) = mpsc::channel::<Result<Bytes, Infallible>>(16);
    tokio::spawn(async move {
        if legacy {
            stream_legacy_speech(state, body, sentences, sender).await;
        } else {
            stream_default_speech(state, body, sentences, sender).await;
        }
    });
    Ok(Response::builder()
        .status(StatusCode::CREATED)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache, no-transform")
        .header(header::CONNECTION, "keep-alive")
        .body(Body::from_stream(ReceiverStream::new(receiver)))
        .expect("valid speech SSE response"))
}

/// Reproduces the ordered legacy speech DTO checks before selecting an upstream.
fn validate_speech_request(body: &Value) -> Result<(), AppError> {
    let mut messages = Vec::new();
    let input = body.get("input");
    if !input.is_some_and(Value::is_string) {
        messages.push("input must be a string");
    }
    if input.is_none_or(|value| value.is_null() || value.as_str() == Some("")) {
        messages.push("input should not be empty");
    }
    validate_optional_field(body, "model", Value::is_string, "model must be a string", &mut messages);
    validate_optional_field(body, "voice", Value::is_string, "voice must be a string", &mut messages);
    validate_optional_field(body, "response_format", Value::is_string, "response_format must be a string", &mut messages);
    validate_optional_field(body, "speed", Value::is_number, "speed must be a number conforming to the specified constraints", &mut messages);
    validate_exaggeration(body.get("exaggeration"), &mut messages);
    validate_optional_field(body, "legacy", Value::is_boolean, "legacy must be a boolean value", &mut messages);
    validate_optional_field(body, "engine", Value::is_string, "engine must be a string", &mut messages);
    if messages.is_empty() { Ok(()) } else { Err(AppError::validation(messages)) }
}

/// Adds one ordered speech validation failure for a present, non-null field.
fn validate_optional_field(body: &Value, field: &str, predicate: fn(&Value) -> bool, message: &'static str, messages: &mut Vec<&'static str>) {
    if body.get(field).is_some_and(|value| !value.is_null() && !predicate(value)) {
        messages.push(message);
    }
}

/// Applies the legacy numeric type and range checks for speech exaggeration.
fn validate_exaggeration(value: Option<&Value>, messages: &mut Vec<&'static str>) {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return;
    };
    let numeric = value.as_f64();
    if numeric.is_none_or(|number| number > 1.0) {
        messages.push("exaggeration must not be greater than 1");
    }
    if numeric.is_none_or(|number| number < 0.0) {
        messages.push("exaggeration must not be less than 0");
    }
    if numeric.is_none() {
        messages.push("exaggeration must be a number conforming to the specified constraints");
    }
}

/// Reads all multipart fields with an explicit file requirement and no disk scratch.
async fn read_transcription_upload(mut multipart: Multipart) -> Result<TranscriptionUpload, AppError> {
    let mut bytes = None;
    let mut filename = "audio.bin".to_owned();
    let mut mime_type = "application/octet-stream".to_owned();
    let mut fields = Map::new();
    while let Some(field) = multipart.next_field().await.map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))? {
        let name = field.name().unwrap_or_default().to_owned();
        if name == "file" {
            filename = field.file_name().unwrap_or("audio.bin").to_owned();
            mime_type = field.content_type().unwrap_or("application/octet-stream").to_owned();
            bytes = Some(field.bytes().await.map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))?);
        } else {
            let value = field.text().await.map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))?;
            fields.insert(name, Value::String(value));
        }
    }
    Ok(TranscriptionUpload {
        bytes: bytes.ok_or_else(|| AppError::new(StatusCode::BAD_REQUEST, "validation_error", "file is required"))?,
        filename,
        mime_type,
        fields,
    })
}

/// Forwards default or diarized transcription to transcribe-audio.
async fn send_default_transcription(state: &AppState, upload: &TranscriptionUpload, diarization: bool) -> Result<Value, AppError> {
    let response_format = if diarization { "verbose_json" } else { "json" };
    let mut form = base_transcription_form(upload, response_format)?;
    for name in ["language", "min_speakers", "max_speakers"] {
        if let Some(value) = upload.fields.get(name).and_then(Value::as_str) {
            form = form.text(name.to_owned(), value.to_owned());
        }
    }
    let url = append_path(&state.config.transcribe_audio_base_url, "v1/audio/transcriptions")?;
    parse_json_response(state.client.post(url).multipart(form).send().await.map_err(|error| AppError::transport("transcription_error", error))?, "transcription_error").await
}

/// Forwards legacy transcription to Speaches with compatibility defaults.
async fn send_legacy_transcription(state: &AppState, upload: &TranscriptionUpload) -> Result<Value, AppError> {
    let file = Part::bytes(upload.bytes.to_vec())
        .file_name(upload.filename.clone())
        .mime_str(&upload.mime_type)
        .map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))?;
    let form = Form::new()
        .part("file", file)
        .text("model", field_string(&upload.fields, "model").unwrap_or("Systran/faster-whisper-small").to_owned())
        .text("language", field_string(&upload.fields, "language").unwrap_or("en").to_owned());
    let url = append_path(&state.config.speaches_base_url, "audio/transcriptions")?;
    parse_json_response(state.client.post(url).multipart(form).send().await.map_err(|error| AppError::transport("transcription_error", error))?, "transcription_error").await
}

/// Creates the common transcribe-audio multipart fields.
fn base_transcription_form(upload: &TranscriptionUpload, response_format: &str) -> Result<Form, AppError> {
    let file = Part::bytes(upload.bytes.to_vec())
        .file_name(upload.filename.clone())
        .mime_str(&upload.mime_type)
        .map_err(|error| AppError::new(StatusCode::BAD_REQUEST, "validation_error", error.to_string()))?;
    Ok(Form::new().part("file", file).text("model", "whisper-1").text("response_format", response_format.to_owned()))
}

/// Proxies one JSON GET while preserving upstream status and payload.
async fn proxy_json_get(state: &AppState, _upstream: &str, url: Url, error_type: &'static str) -> Result<Response, AppError> {
    let response = state.client.get(url).send().await.map_err(|error| AppError::transport(error_type, error))?;
    let status = response.status();
    let text = response.text().await.map_err(|error| AppError::transport(error_type, error))?;
    if !status.is_success() {
        // Keep the upstream status and its body in the message the way the NestJS service did;
        // collapsing it to a generic string throws away the only diagnostic the caller receives.
        return Err(AppError::new(status, error_type, format!("transcribe-audio TTS {status}: {text}")));
    }
    let value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "error": { "message": text, "type": error_type } }));
    Ok((status, Json(value)).into_response())
}

/// Parses a JSON upstream response or maps its error status.
async fn parse_json_response(response: UpstreamResponse, error_type: &'static str) -> Result<Value, AppError> {
    let status = response.status();
    let text = response.text().await.map_err(|error| AppError::transport(error_type, error))?;
    if !status.is_success() {
        return Err(AppError::new(status, error_type, text));
    }
    serde_json::from_str(&text).map_err(|error| AppError::transport(error_type, error))
}

/// Streams legacy Speaches by issuing one synthesis call per sentence.
async fn stream_legacy_speech(state: AppState, body: Value, sentences: Vec<String>, sender: mpsc::Sender<Result<Bytes, Infallible>>) {
    let Ok(url) = append_path(&state.config.speaches_base_url, "audio/speech") else {
        return;
    };
    for sentence in sentences {
        let payload = legacy_speech_payload(&sentence, &body);
        // A failure part-way through must reach the client as an error frame. Ending with a bare
        // [DONE] would present a truncated reading as a complete one.
        let Ok(response) = state.client.post(url.clone()).json(&payload).send().await else {
            send_tts_stream_error(&sender, "speaches unavailable".to_owned()).await;
            return;
        };
        if !response.status().is_success() {
            send_tts_stream_error(&sender, format!("speaches {}", response.status())).await;
            return;
        }
        let Ok(audio) = response.bytes().await else {
            send_tts_stream_error(&sender, "speaches stream failed".to_owned()).await;
            return;
        };
        if !send_audio_frame(&sender, audio, &sentence).await {
            state.metrics.event("cancellation");
            return;
        }
    }
    let _ = sender.send(Ok(encode_data("[DONE]"))).await;
}

/// Streams concatenated WAV files from transcribe-audio and labels them by sentence.
async fn stream_default_speech(state: AppState, body: Value, sentences: Vec<String>, sender: mpsc::Sender<Result<Bytes, Infallible>>) {
    let Ok(url) = append_path(&state.config.text_to_speech_base_url, "v1/audio/speech") else {
        return;
    };
    let input = body.get("input").and_then(Value::as_str).unwrap_or_default();
    let payload = default_speech_payload(input, &body, "stream");
    let Ok(response) = state.client.post(url).json(&payload).send().await else {
        send_tts_stream_error(&sender, "TTS unavailable".to_owned()).await;
        return;
    };
    if !response.status().is_success() {
        send_tts_stream_error(&sender, format!("transcribe-audio TTS {}", response.status())).await;
        return;
    }
    let mut decoder = RiffDecoder::default();
    let mut index = 0;
    let mut stream = response.bytes_stream();
    while let Some(Ok(chunk)) = stream.next().await {
        for audio in decoder.push(&chunk) {
            let sentence = sentences.get(index).map(String::as_str).unwrap_or_default();
            if !send_audio_frame(&sender, audio, sentence).await {
                state.metrics.event("cancellation");
                return;
            }
            index += 1;
        }
    }
    let _ = sender.send(Ok(encode_data("[DONE]"))).await;
}

/// Sends one base64 audio and sentence event to an SSE client.
async fn send_audio_frame(sender: &mpsc::Sender<Result<Bytes, Infallible>>, audio: Bytes, sentence: &str) -> bool {
    let payload = json!({ "audio": STANDARD.encode(audio), "sentence": sentence });
    sender.send(Ok(encode_data(&payload.to_string()))).await.is_ok()
}

/// Emits one TTS error frame and closes the SSE protocol cleanly.
async fn send_tts_stream_error(sender: &mpsc::Sender<Result<Bytes, Infallible>>, message: String) {
    let payload = json!({ "error": { "message": message, "type": "tts_error" } });
    let _ = sender.send(Ok(encode_data(&payload.to_string()))).await;
}

/// Builds the default transcribe-audio speech payload.
fn default_speech_payload(input: &str, body: &Value, response_format: &str) -> Value {
    let mut payload =
        json!({ "model": "tts-1", "input": input, "voice": body.get("voice").and_then(Value::as_str).unwrap_or("dave"), "response_format": response_format, "exaggeration": body.get("exaggeration").and_then(Value::as_f64).unwrap_or(0.5) });
    if let Some(engine) = body.get("engine").and_then(Value::as_str) {
        payload["engine"] = Value::String(engine.to_owned());
    }
    payload
}

/// Builds the legacy Speaches speech payload with OpenAI-compatible defaults.
fn legacy_speech_payload(input: &str, body: &Value) -> Value {
    json!({ "model": body.get("model").and_then(Value::as_str).unwrap_or("hexgrad/Kokoro-82M"), "voice": body.get("voice").and_then(Value::as_str).unwrap_or("af_sky"), "input": input, "response_format": body.get("response_format").and_then(Value::as_str).unwrap_or("mp3"), "speed": body.get("speed").and_then(Value::as_f64).unwrap_or(1.0) })
}

/// Maps an upstream TTS error response to the public error contract.
async fn tts_upstream_error(response: UpstreamResponse) -> AppError {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    AppError::new(status, "tts_error", format!("transcribe-audio TTS {status}: {text}"))
}

/// Requires non-empty speech input and returns it by reference.
fn required_input(body: &Value) -> Result<&str, AppError> {
    body.get("input")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::new(StatusCode::BAD_REQUEST, "validation_error", "input should not be empty"))
}

/// Returns the wire MIME type associated with an OpenAI audio format.
fn content_type_for(format: &str) -> &'static str {
    match format {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        "aac" => "audio/aac",
        "pcm" => "audio/pcm",
        _ => "application/octet-stream",
    }
}

/// Constructs a binary response with a caller-selected content type.
fn binary_response(status: StatusCode, content_type: &str, bytes: Bytes) -> Response {
    Response::builder().status(status).header(header::CONTENT_TYPE, content_type).body(Body::from(bytes)).expect("valid binary response")
}

/// Safely appends path segments to an upstream URL regardless of its trailing slash.
fn append_path(base: &Url, path: &str) -> Result<Url, AppError> {
    let mut url = base.clone();
    let base_path = url.path().trim_end_matches('/');
    let combined = format!("{base_path}/{}", path.trim_start_matches('/'));
    url.set_path(&combined);
    Ok(url)
}

/// Reads a boolean multipart field with HTML-form string semantics.
fn field_bool(fields: &Map<String, Value>, name: &str) -> bool {
    fields.get(name).and_then(Value::as_str).is_some_and(|value| value.eq_ignore_ascii_case("true"))
}

/// Reads a string multipart field.
fn field_string<'a>(fields: &'a Map<String, Value>, name: &str) -> Option<&'a str> {
    fields.get(name).and_then(Value::as_str)
}

/// Incrementally extracts complete concatenated RIFF files from arbitrary HTTP chunks.
#[derive(Default)]
pub struct RiffDecoder {
    pending: Vec<u8>,
}

impl RiffDecoder {
    /// Appends bytes and returns every complete WAV buffer now available.
    pub fn push(&mut self, chunk: &[u8]) -> Vec<Bytes> {
        self.pending.extend_from_slice(chunk);
        let mut output = Vec::new();
        loop {
            if self.pending.len() < 8 {
                break;
            }
            if &self.pending[..4] != b"RIFF" {
                let next = self.pending.windows(4).position(|window| window == b"RIFF");
                match next {
                    Some(index) => {
                        self.pending.drain(..index);
                    }
                    None => {
                        self.pending.clear();
                        break;
                    }
                }
                continue;
            }
            let size = u32::from_le_bytes(self.pending[4..8].try_into().expect("four size bytes")) as usize + 8;
            if self.pending.len() < size {
                break;
            }
            output.push(Bytes::from(self.pending.drain(..size).collect::<Vec<_>>()));
        }
        output
    }
}

/// Splits text into sentences using the exact rules ported from the NestJS `splitSentences`
/// utility. The boundary decision is deliberately conservative: a full stop only ends a sentence
/// when the next word starts with a capital and the preceding token is not an abbreviation,
/// decimal, initialism, or URL. These boundaries decide the sentence labels on the streaming TTS
/// channel and, on the legacy path, the actual per-sentence synthesis calls.
pub fn split_sentences(text: &str, max_words: usize) -> Vec<String> {
    if text.trim().is_empty() {
        return Vec::new();
    }
    let abbreviations = abbreviation_set();
    let chars = text.chars().collect::<Vec<_>>();
    let mut sentences = Vec::new();
    let mut current = String::new();
    let mut index = 0;
    while index < chars.len() {
        let character = chars[index];
        current.push(character);
        if matches!(character, '.' | '!' | '?') && ends_sentence(character, &current, &chars, index, &abbreviations) {
            sentences.push(current.trim().to_owned());
            current.clear();
            index += 1;
            while index < chars.len() && chars[index].is_whitespace() {
                index += 1;
            }
            continue;
        }
        index += 1;
    }
    if !current.trim().is_empty() {
        sentences.push(current.trim().to_owned());
    }
    split_long_sentences(sentences, max_words)
}

/// Decides whether the terminator just consumed closes a sentence, mirroring the legacy ladder.
fn ends_sentence(character: char, current: &str, chars: &[char], index: usize, abbreviations: &HashSet<&'static str>) -> bool {
    let previous = index.checked_sub(1).map(|position| chars[position]);
    let next = chars.get(index + 1).copied();
    let first_after = next_visible_char(chars, index + 1);
    if character == '.' && (previous == Some('.') || next == Some('.')) {
        // Inside an ellipsis only the final dot can close a sentence, and only when a new
        // capitalised sentence follows it.
        let closes_ellipsis = previous == Some('.') && next.is_some_and(char::is_whitespace) && first_after.is_some_and(|value| value.is_ascii_uppercase());
        if !closes_ellipsis {
            return false;
        }
    }
    if next.is_some_and(|value| !value.is_whitespace()) {
        return false;
    }
    if character == '!' || character == '?' {
        return true;
    }
    let Some(first_after) = first_after else {
        return true;
    };
    let before_punct = current[..current.len() - character.len_utf8()].trim();
    let classification = classify_last_token(before_punct, abbreviations);
    if classification.single_letter || classification.decimal_or_url {
        return false;
    }
    if !classification.abbreviation && first_after.is_ascii_uppercase() {
        return true;
    }
    classification.all_caps && !classification.dotted_initialism && first_after.is_ascii_uppercase()
}

/// What the token immediately before a full stop looks like, which is what decides the boundary.
struct TokenClass {
    abbreviation: bool,
    single_letter: bool,
    decimal_or_url: bool,
    all_caps: bool,
    dotted_initialism: bool,
}

/// Classifies the final token of a candidate sentence against every legacy abbreviation rule.
fn classify_last_token(before_punct: &str, abbreviations: &HashSet<&'static str>) -> TokenClass {
    let words = before_punct.split_whitespace().collect::<Vec<_>>();
    let last_few = words[words.len().saturating_sub(3)..].join(" ");
    let last_word = words.last().copied().unwrap_or_default();
    let last_word_clean = retain(&last_word.to_ascii_lowercase(), true);
    let last_word_no_period = last_word.strip_suffix('.').unwrap_or(last_word);
    let last_word_lower = last_word_no_period.to_ascii_lowercase();

    let decimal_or_url = contains_decimal(&last_few) || contains_url(&last_few);
    let known = abbreviations.contains(last_word_lower.as_str()) || abbreviations.contains(last_word_lower.replace('.', "").as_str());
    let single_letter = is_single_letter_abbreviation(last_word);
    let all_caps = is_all_caps_abbreviation(&retain(last_word_no_period, false));
    let dotted_initialism = is_dotted_initialism(&retain(last_word, true));
    let academic = is_academic_abbreviation(&last_word_clean);
    TokenClass {
        abbreviation: known || single_letter || decimal_or_url || all_caps || dotted_initialism || academic,
        single_letter,
        decimal_or_url,
        all_caps,
        dotted_initialism,
    }
}

/// Returns the first non-whitespace character at or after the given position.
fn next_visible_char(chars: &[char], from: usize) -> Option<char> {
    chars.get(from..)?.iter().copied().find(|character| !character.is_whitespace())
}

/// Keeps only the characters JavaScript's `\w` class matches, optionally preserving dots.
fn retain(text: &str, keep_dots: bool) -> String {
    text.chars().filter(|character| character.is_ascii_alphanumeric() || *character == '_' || (keep_dots && *character == '.')).collect()
}

/// Reports whether the text holds a decimal number, which never ends a sentence.
fn contains_decimal(text: &str) -> bool {
    let chars = text.chars().collect::<Vec<_>>();
    chars.windows(3).any(|window| window[0].is_ascii_digit() && window[1] == '.' && window[2].is_ascii_digit())
}

/// Reports whether the text holds a URL or bare domain, which never ends a sentence.
fn contains_url(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["www.", "http://", "https://", ".com", ".org", ".net", ".edu", ".gov", ".io"].iter().any(|marker| lower.contains(marker))
}

/// Reports a single initial such as `J.`, which is always mid-sentence.
fn is_single_letter_abbreviation(word: &str) -> bool {
    let mut characters = word.chars();
    matches!((characters.next(), characters.next(), characters.next()), (Some(letter), Some('.'), None) if letter.is_ascii_alphabetic())
}

/// Reports an undotted all-capitals abbreviation of two to five letters, such as `NATO`.
fn is_all_caps_abbreviation(word: &str) -> bool {
    (2..=5).contains(&word.chars().count()) && word.chars().all(|character| character.is_ascii_uppercase())
}

/// Reports a dotted initialism such as `U.S.` or `A.B`.
fn is_dotted_initialism(word: &str) -> bool {
    let trimmed = word.strip_suffix('.').unwrap_or(word);
    let parts = trimmed.split('.').collect::<Vec<_>>();
    parts.len() >= 2 && parts.iter().all(|part| part.chars().count() == 1 && part.chars().all(|character| character.is_ascii_uppercase()))
}

/// Reports an academic qualification such as `Ph.D.` or `M.S`.
fn is_academic_abbreviation(clean_lowercase_word: &str) -> bool {
    let trimmed = clean_lowercase_word.strip_suffix('.').unwrap_or(clean_lowercase_word);
    ["ph.d", "m.d", "b.a", "m.a", "b.s", "m.s", "phd", "md", "ba", "ma", "bs", "ms"].contains(&trimmed)
}

/// Enforces the legacy maximum word count after sentence boundary detection.
fn split_long_sentences(sentences: Vec<String>, max_words: usize) -> Vec<String> {
    let mut output = Vec::new();
    for sentence in sentences {
        let words = sentence.split_whitespace().collect::<Vec<_>>();
        if words.len() < max_words {
            output.push(sentence);
            continue;
        }
        for chunk in words.chunks(max_words.max(1)) {
            output.push(chunk.join(" "));
        }
    }
    output.into_iter().filter(|sentence| !sentence.is_empty()).collect()
}

/// The complete abbreviation dictionary the NestJS splitter used; a shortened list moves boundaries.
fn abbreviation_set() -> HashSet<&'static str> {
    [
        "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "viz", "i.e", "e.g", "ie", "eg", "am", "pm", "a.m", "p.m", "ad", "bc", "b.c", "a.d", "no", "nos", "vol", "pp", "ed", "eds", "rev", "approx", "est", "min", "max", "inc",
        "ltd", "corp", "co", "llc", "st", "ave", "blvd", "rd", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "u.s", "u.k", "u.n", "e.u", "usa", "nato",
        "fbi", "cia", "irs", "fda", "epa", "ph.d", "m.d", "b.a", "m.a", "b.s", "m.s", "phd", "md", "ba", "ma", "bs", "ms",
    ]
    .into_iter()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a minimal RIFF byte sequence with a valid declared size.
    fn riff(payload: &[u8]) -> Vec<u8> {
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(payload);
        bytes
    }

    /// Verifies RIFF files split correctly across arbitrary HTTP chunks.
    #[test]
    fn riff_decoder_handles_boundaries() {
        let first = riff(b"abcd");
        let second = riff(b"efghij");
        let mut decoder = RiffDecoder::default();
        assert!(decoder.push(&first[..5]).is_empty());
        let mut rest = first[5..].to_vec();
        rest.extend_from_slice(&second);
        let decoded = decoder.push(&rest);
        assert_eq!(decoded.len(), 2);
        assert_eq!(&decoded[0][8..], b"abcd");
        assert_eq!(&decoded[1][8..], b"efghij");
    }

    /// Verifies leading transport garbage is skipped before the next RIFF header.
    #[test]
    fn riff_decoder_recovers_leading_garbage() {
        let mut bytes = b"junk".to_vec();
        bytes.extend_from_slice(&riff(b"audio"));
        assert_eq!(RiffDecoder::default().push(&bytes).len(), 1);
    }

    /// Verifies empty text has no synthesis work.
    #[test]
    fn sentence_splitter_rejects_empty_text() {
        assert!(split_sentences("   ", 50).is_empty());
    }

    /// Locks the sentence boundaries to the output of the NestJS `splitSentences` utility, captured
    /// by running the legacy implementation over this exact corpus. These boundaries decide the
    /// sentence labels on the streaming TTS channel and the per-sentence calls on the legacy path,
    /// so a "close enough" splitter silently desynchronises both.
    #[test]
    fn sentence_splitter_matches_the_legacy_corpus() {
        let corpus: [(&str, &[&str]); 17] = [
            ("First one. Second one here. third lowercase start.", &["First one.", "Second one here. third lowercase start."]),
            ("Dr. Jones paid 3.14 dollars. Then she left!", &["Dr. Jones paid 3.14 dollars. Then she left!"]),
            ("He met J. Smith Today.", &["He met J.", "Smith Today."]),
            ("Filed with the U.S. Government today.", &["Filed with the U.S. Government today."]),
            ("Visit example.com Tomorrow.", &["Visit example.com Tomorrow."]),
            ("She holds a Ph.D. Now she teaches.", &["She holds a Ph.D. Now she teaches."]),
            ("Wait... and then more.", &["Wait... and then more."]),
            ("Wait... Then it ended.", &["Wait...", "Then it ended."]),
            ("Hello world.", &["Hello world."]),
            ("What now? Nothing! Really.", &["What now?", "Nothing!", "Really."]),
            ("The NATO Summit begins. Delegates arrive.", &["The NATO Summit begins.", "Delegates arrive."]),
            ("Go to https://example.org/a Now.", &["Go to https://example.org/a Now."]),
            ("Call me at 5 p.m. Tomorrow works too.", &["Call me at 5 p.m. Tomorrow works too."]),
            ("Item no. 5 Was chosen.", &["Item no. 5 Was chosen."]),
            ("\"Stop that.\" She turned away.", &["\"Stop that.\" She turned away."]),
            ("Mixed case. sentence continues here. And now A new one.", &["Mixed case. sentence continues here.", "And now A new one."]),
            ("one two three four five six.", &["one two three four five six."]),
        ];
        for (input, expected) in corpus {
            assert_eq!(split_sentences(input, 50), expected.iter().map(|value| (*value).to_owned()).collect::<Vec<_>>(), "input: {input}");
        }
    }

    /// Verifies long sentences are bounded by the configured word count.
    #[test]
    fn sentence_splitter_caps_words() {
        assert_eq!(split_sentences("one two three four five six.", 3), vec!["one two three", "four five six."]);
    }
}
