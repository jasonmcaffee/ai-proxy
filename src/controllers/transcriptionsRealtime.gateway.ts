import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { TRANSCRIBE_AUDIO_WS_URL } from '../services/transcribeAudio.config';

const UPSTREAM_EVENTS = ['session.created', 'transcription.committed', 'transcription.speaker_remapped', 'session.done', 'error'];
const CLIENT_EVENTS = ['session.update', 'input_audio_buffer.append', 'input_audio_buffer.commit', 'session.end'];

/**
 * Connects the upstream socket.io client to transcribe-audio's realtime namespace and forwards all events bidirectionally.
 * transcribe-audio uses namespace '/v1/realtime/transcriptions' (not a path), so we append it to the base URL.
 * @param client - the proxy-side socket for this session
 */
function openUpstreamConnection(client: Socket): ClientSocket {
  const upstream = ioClient(`${TRANSCRIBE_AUDIO_WS_URL}/v1/realtime/transcriptions`, {
    transports: ['websocket'],
  });

  upstream.on('connect_error', (err) => {
    console.error(`[TranscriptionsRealtimeGateway] upstream connect error: ${err.message}`);
    client.emit('error', { code: 'upstream_unavailable', message: err.message });
    client.disconnect();
  });

  UPSTREAM_EVENTS.forEach((ev) => upstream.on(ev, (payload?: unknown) => client.emit(ev, payload)));
  CLIENT_EVENTS.forEach((ev) => client.on(ev, (payload?: unknown) => upstream.emit(ev, payload)));

  return upstream;
}

/**
 * WebSocket gateway that proxies socket.io connections to the transcribe-audio realtime service.
 * Each client connection opens a dedicated upstream socket. Events flow bidirectionally without transformation.
 */
@WebSocketGateway({ path: '/v1/audio/transcriptions/realtime', cors: { origin: '*' } })
export class TranscriptionsRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private upstreams = new WeakMap<Socket, ClientSocket>();

  /**
   * Opens an upstream socket.io connection to transcribe-audio for each newly connected client.
   * @param client - the incoming socket.io client socket
   */
  handleConnection(client: Socket): void {
    console.log(`[TranscriptionsRealtimeGateway] client connected: ${client.id}`);
    const upstream = openUpstreamConnection(client);
    this.upstreams.set(client, upstream);
  }

  /**
   * Tears down the upstream connection when the client disconnects.
   * @param client - the disconnected socket.io client socket
   */
  handleDisconnect(client: Socket): void {
    console.log(`[TranscriptionsRealtimeGateway] client disconnected: ${client.id}`);
    const upstream = this.upstreams.get(client);
    upstream?.disconnect();
    this.upstreams.delete(client);
  }
}
