use crate::state::AppState;
use futures_util::FutureExt;
use rust_socketio::{
    Event, Payload, TransportType,
    asynchronous::{Client, ClientBuilder},
};
use serde_json::{Value, json};
use socketioxide::{
    SocketIo,
    extract::{Data, SocketRef},
    layer::SocketIoLayer,
};
use std::{collections::VecDeque, sync::Arc};
use tokio::sync::Mutex;

const UPSTREAM_EVENTS: [&str; 5] = ["session.created", "transcription.committed", "transcription.speaker_remapped", "session.done", "error"];
const CLIENT_EVENTS: [&str; 4] = ["session.update", "input_audio_buffer.append", "input_audio_buffer.commit", "session.end"];
const MAX_PENDING_EVENTS: usize = 256;

/// One client event retained while its dedicated upstream socket connects.
struct PendingEvent {
    name: &'static str,
    payload: Value,
}

/// Connection state shared by early client handlers and the upstream lifecycle.
#[derive(Default)]
struct RelayState {
    upstream: Option<Client>,
    ready: bool,
    pending: VecDeque<PendingEvent>,
}

/// Builds the custom-path Socket.IO layer and installs the default namespace relay.
pub fn build_realtime_layer(state: AppState) -> SocketIoLayer {
    let (layer, io) = SocketIo::builder().req_path("/v1/audio/transcriptions/realtime").max_payload(state.config.max_json_bytes as u64).build_layer();
    io.ns("/", move |socket: SocketRef| {
        let state = state.clone();
        async move {
            connect_session(socket, state).await;
        }
    });
    layer
}

/// Opens one dedicated upstream client and attaches both event directions.
async fn connect_session(socket: SocketRef, state: AppState) {
    let relay = Arc::new(Mutex::new(RelayState::default()));
    attach_client_events(&socket, relay.clone(), &state);
    attach_disconnect(&socket, relay.clone());
    let builder = upstream_builder(&socket, &state, relay.clone());
    match builder.connect().await {
        Ok(upstream) => {
            let mut relay = relay.lock().await;
            if relay.upstream.is_none() {
                relay.upstream = Some(upstream);
            }
        }
        Err(error) => {
            state.metrics.event("realtime_connect_error");
            let _ = socket.emit("error", &json!({ "code": "upstream_unavailable", "message": error.to_string() }));
            let _ = socket.disconnect();
        }
    }
}

/// Makes the upstream available and forwards events received during connection setup.
async fn activate_upstream(relay: Arc<Mutex<RelayState>>, upstream: Client, state: &AppState) {
    let pending = {
        let mut relay = relay.lock().await;
        relay.upstream = Some(upstream.clone());
        relay.ready = true;
        relay.pending.drain(..).collect::<Vec<_>>()
    };
    for event in pending {
        if upstream.emit(event.name, event.payload).await.is_err() {
            state.metrics.event("realtime_emit_error");
        }
    }
}

/// Disconnects the dedicated upstream when its downstream peer closes.
fn attach_disconnect(socket: &SocketRef, relay: Arc<Mutex<RelayState>>) {
    socket.on_disconnect(move |_socket: SocketRef| {
        let relay = relay.clone();
        async move {
            if let Some(upstream) = relay.lock().await.upstream.clone() {
                let _ = upstream.disconnect().await;
            }
        }
    });
}

/// Configures upstream callbacks that emit the same event and payload downstream.
fn upstream_builder(socket: &SocketRef, state: &AppState, relay: Arc<Mutex<RelayState>>) -> ClientBuilder {
    let mut builder = ClientBuilder::new(state.config.transcribe_audio_ws_url.to_string())
        .namespace("/v1/realtime/transcriptions")
        .transport_type(TransportType::Websocket)
        .reconnect(false);
    for event in UPSTREAM_EVENTS {
        let downstream = socket.clone();
        let metrics = state.metrics.clone();
        builder = builder.on(event, move |payload: Payload, _client: Client| {
            let downstream = downstream.clone();
            let metrics = metrics.clone();
            async move {
                metrics.event("realtime_upstream_event");
                let value = payload_value(payload);
                let _ = downstream.emit(event, &value);
            }
            .boxed()
        });
    }
    let connected_state = state.clone();
    builder.on(Event::Connect, move |_payload: Payload, upstream: Client| {
        let relay = relay.clone();
        let connected_state = connected_state.clone();
        async move {
            connected_state.metrics.event("realtime_connected");
            activate_upstream(relay, upstream, &connected_state).await;
        }
        .boxed()
    })
}

/// Registers every downstream event to emit it unchanged to the upstream namespace.
fn attach_client_events(socket: &SocketRef, relay: Arc<Mutex<RelayState>>, state: &AppState) {
    for event in CLIENT_EVENTS {
        let relay = relay.clone();
        let metrics = state.metrics.clone();
        socket.on(event, move |Data::<Value>(payload)| {
            let relay = relay.clone();
            let metrics = metrics.clone();
            async move {
                metrics.event("realtime_client_event");
                let upstream = {
                    let mut relay = relay.lock().await;
                    if relay.ready
                        && let Some(upstream) = &relay.upstream
                    {
                        Some(upstream.clone())
                    } else {
                        if relay.pending.len() == MAX_PENDING_EVENTS {
                            relay.pending.pop_front();
                            metrics.event("realtime_queue_overflow");
                        }
                        relay.pending.push_back(PendingEvent { name: event, payload: payload.clone() });
                        None
                    }
                };
                if let Some(upstream) = upstream
                    && upstream.emit(event, payload).await.is_err()
                {
                    metrics.event("realtime_emit_error");
                }
            }
        });
    }
}

/// Projects rust_socketio payload variants into JSON accepted by Socketioxide.
fn payload_value(payload: Payload) -> Value {
    match payload {
        Payload::Text(mut values) if values.len() == 1 => values.remove(0),
        Payload::Text(values) => Value::Array(values),
        Payload::Binary(bytes) => json!({ "binary": bytes.to_vec() }),
        #[allow(deprecated)]
        Payload::String(value) => serde_json::from_str(&value).unwrap_or(Value::String(value)),
    }
}
