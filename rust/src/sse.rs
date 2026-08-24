use bytes::{Bytes, BytesMut};
use serde_json::{Map, Value, json};
use std::{collections::BTreeMap, convert::Infallible};
use tokio::sync::mpsc;

/// Channel every handler writes SSE frames into; dropping the receiver is how a departed client
/// is detected, so a failed send always means "the downstream body is gone".
pub type FrameSender = mpsc::Sender<Result<Bytes, Infallible>>;

/// Destination for compression progress frames. When a client stream is attached each phase is
/// written the moment it happens, so a slow summarisation reports itself while it runs instead of
/// arriving as one batch after it has already finished.
pub struct ProgressSink<'a> {
    sender: Option<&'a FrameSender>,
}

impl<'a> ProgressSink<'a> {
    /// Creates a sink that streams to the given client, or a silent sink when there is none.
    pub fn new(sender: Option<&'a FrameSender>) -> Self {
        Self { sender }
    }

    /// Emits one phase/message progress frame, ignoring a client that has already gone away.
    pub async fn push(&self, phase: &str, message: impl Into<String>) {
        let Some(sender) = self.sender else {
            return;
        };
        let frame = proxy_event("compression_progress", json!({ "phase": phase, "message": message.into() }));
        let _ = sender.send(Ok(frame)).await;
    }
}

/// Incremental SSE decoder that tolerates arbitrary transport chunk boundaries.
#[derive(Default)]
pub struct SseDecoder {
    pending: BytesMut,
}

impl SseDecoder {
    /// Appends bytes and returns every complete SSE data payload now available.
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut payloads = Vec::new();
        while let Some(index) = find_frame_boundary(&self.pending) {
            let frame = self.pending.split_to(index.0);
            self.pending.advance(index.1);
            if let Some(payload) = decode_frame(&frame) {
                payloads.push(payload);
            }
        }
        payloads
    }

    /// Decodes a final unterminated frame after the upstream body closes.
    pub fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        let frame = self.pending.split();
        decode_frame(&frame)
    }
}

/// Mutable accumulation for fragmented OpenAI tool-call deltas.
#[derive(Default)]
pub struct ToolCallBuffer {
    calls: BTreeMap<u64, BufferedToolCall>,
}

#[derive(Default)]
struct BufferedToolCall {
    id: Option<String>,
    call_type: Option<String>,
    name: Option<String>,
    arguments: String,
}

impl ToolCallBuffer {
    /// Absorbs tool-call fragments from one OpenAI stream chunk.
    pub fn absorb(&mut self, chunk: &Value) -> bool {
        let Some(calls) = chunk.pointer("/choices/0/delta/tool_calls").and_then(Value::as_array) else {
            return false;
        };
        for call in calls {
            let index = call.get("index").and_then(Value::as_u64).unwrap_or_default();
            let target = self.calls.entry(index).or_default();
            if let Some(value) = call.get("id").and_then(Value::as_str) {
                target.id = Some(value.to_owned());
            }
            if let Some(value) = call.get("type").and_then(Value::as_str) {
                target.call_type = Some(value.to_owned());
            }
            if let Some(value) = call.pointer("/function/name").and_then(Value::as_str) {
                target.name = Some(value.to_owned());
            }
            if let Some(value) = call.pointer("/function/arguments").and_then(Value::as_str) {
                target.arguments.push_str(value);
            }
        }
        true
    }

    /// Replaces a finish chunk's delta with fully assembled, index-ordered tool calls.
    pub fn consolidated(&self, template: &Value) -> Value {
        let calls = self
            .calls
            .iter()
            .map(|(index, call)| {
                json!({
                    "index": index,
                    "id": call.id.clone().unwrap_or_else(|| format!("call_{index}")),
                    "type": call.call_type.clone().unwrap_or_else(|| "function".to_owned()),
                    "function": { "name": call.name.clone().unwrap_or_default(), "arguments": call.arguments },
                })
            })
            .collect::<Vec<_>>();
        let mut result = template.clone();
        result["choices"] = json!([{ "index": 0, "delta": { "tool_calls": calls }, "finish_reason": "tool_calls" }]);
        result
    }
}

/// Wraps one data payload in the canonical SSE representation.
pub fn encode_data(payload: &str) -> Bytes {
    Bytes::from(format!("data: {payload}\n\n"))
}

/// Creates one proxy metadata frame understood by AI Service and ignored by ordinary OpenAI clients.
pub fn proxy_event(event_type: &str, data: Value) -> Bytes {
    encode_data(&json!({ "object": "ai_proxy.event", "type": event_type, "data": data }).to_string())
}

/// Returns concatenated text from all `data:` lines in one complete SSE frame.
fn decode_frame(frame: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(frame).replace("\r\n", "\n");
    let data = text.lines().filter_map(|line| line.strip_prefix("data:")).map(str::trim_start).collect::<Vec<_>>();
    (!data.is_empty()).then(|| data.join("\n"))
}

/// Locates either LF-LF or CRLF-CRLF and reports frame length plus delimiter length.
fn find_frame_boundary(bytes: &[u8]) -> Option<(usize, usize)> {
    for index in 0..bytes.len().saturating_sub(1) {
        if bytes[index..].starts_with(b"\n\n") {
            return Some((index, 2));
        }
        if bytes[index..].starts_with(b"\r\n\r\n") {
            return Some((index, 4));
        }
    }
    None
}

/// Adds the buffer-advance method without exposing bytes::Buf to callers.
trait AdvanceBytes {
    fn advance(&mut self, count: usize);
}

impl AdvanceBytes for BytesMut {
    /// Discards bytes already consumed as a frame delimiter.
    fn advance(&mut self, count: usize) {
        let _ = self.split_to(count);
    }
}

/// Reads one string from a JSON object without repeating map plumbing.
pub fn object_string(object: &Map<String, Value>, key: &str) -> Option<String> {
    object.get(key).and_then(Value::as_str).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies frames survive arbitrary chunk boundaries and mixed line endings.
    #[test]
    fn decoder_handles_partial_and_crlf_frames() {
        let mut decoder = SseDecoder::default();
        assert!(decoder.push(b"data: {\"a\":").is_empty());
        assert_eq!(decoder.push(b"1}\r\n\r\ndata: two\n\n"), vec!["{\"a\":1}", "two"]);
    }

    /// Verifies multiple data lines join per the SSE specification.
    #[test]
    fn decoder_joins_multiple_data_lines() {
        let mut decoder = SseDecoder::default();
        assert_eq!(decoder.push(b": comment\ndata: first\ndata: second\n\n"), vec!["first\nsecond"]);
    }

    /// Verifies an unterminated final frame is not lost at EOF.
    #[test]
    fn decoder_finishes_final_frame() {
        let mut decoder = SseDecoder::default();
        decoder.push(b"data: final");
        assert_eq!(decoder.finish().as_deref(), Some("final"));
    }

    /// Verifies fragmented tool calls consolidate in stable index order.
    #[test]
    fn tool_buffer_consolidates_fragments() {
        let mut buffer = ToolCallBuffer::default();
        buffer.absorb(&json!({"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"beta","arguments":"{\"b\":"}},{"index":0,"id":"a","type":"function","function":{"name":"alpha","arguments":"{\"a\":"}}]}}]}));
        buffer.absorb(&json!({"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}},{"index":1,"function":{"arguments":"2}"}}]},"finish_reason":"tool_calls"}]}));
        let value = buffer.consolidated(&json!({"id":"x","choices":[]}));
        assert_eq!(value.pointer("/choices/0/delta/tool_calls/0/function/arguments").and_then(Value::as_str), Some("{\"a\":1}"));
        assert_eq!(value.pointer("/choices/0/delta/tool_calls/1/function/arguments").and_then(Value::as_str), Some("{\"b\":2}"));
    }
}
