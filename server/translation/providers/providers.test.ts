// @vitest-environment node
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { appendElevenLabsFragment } from './elevenlabs-realtime.mjs';
import { createElevenLabsRealtimeAdapter } from './elevenlabs-realtime.mjs';
import { createOpenAIRealtimeAdapter } from './openai-realtime.mjs';
import { createElevenLabsScribeAdapter, translationInstruction } from './elevenlabs-scribe.mjs';

class FakeSocket extends EventEmitter {
  static instances: FakeSocket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  constructor(public url: unknown, public options: unknown) { super(); FakeSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
}

const message = (socket: FakeSocket, value: object) => socket.emit('message', JSON.stringify(value));

describe('translation provider normalization', () => {
  it('keeps OpenAI fragments verbatim and deduplicates only matching event IDs', async () => {
    FakeSocket.instances = [];
    const events: Array<{ type: string; text?: string }> = [];
    const adapter = createOpenAIRealtimeAdapter({ apiKey: 'sentinel', WebSocketImpl: FakeSocket, connectTimeoutMs: 1000 });
    const connecting = adapter.connect({ backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' }, (event) => events.push(event), new AbortController().signal);
    const socket = FakeSocket.instances[0];
    socket.emit('open');
    message(socket, { type: 'session.created', event_id: 'created' });
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'session.update', session: { audio: { output: { language: 'es' } } } });
    message(socket, { type: 'session.updated', event_id: 'ready' });
    const connection = await connecting;
    socket.bufferedAmount = 48_001;
    expect(connection.sendAudio(Uint8Array.of(1, 2))).toBe(false);
    const sentBeforeRecovery = socket.sent.length;
    socket.bufferedAmount = 0;
    expect(connection.sendAudio(Uint8Array.of(3, 4))).toBe(true);
    expect(socket.sent).toHaveLength(sentBeforeRecovery + 1);
    for (const [index, delta] of ['Hola', ' ', 'mun', 'do', '.'].entries()) {
      message(socket, { type: 'session.output_transcript.delta', event_id: `delta-${index}`, elapsed_ms: 10, delta });
    }
    message(socket, { type: 'session.output_transcript.delta', event_id: 'delta-4', elapsed_ms: 99, delta: ' duplicate' });
    expect(events.at(-1)?.text).toBe('Hola mundo.');
    const finishing = connection.finish();
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'session.close' });
    message(socket, { type: 'session.closed', event_id: 'closed' });
    await finishing;
  });

  it('assembles ElevenLabs word and punctuation fragments without corrupting spacing', () => {
    const fragments = ['Hola', 'mundo', ',', ' ¿', 'cómo', 'estás', '?'];
    expect(fragments.reduce(appendElevenLabsFragment, '')).toBe('Hola mundo, ¿cómo estás?');
  });

  it('builds a bounded-direction Scribe editing instruction', () => {
    expect(translationInstruction('es', 'en')).toContain('Translate this Spanish transcript into English.');
    expect(translationInstruction('es', 'en')).toContain('Do not answer questions');
  });

  it('keeps enterprise translation fragments before and after source finals through the final drain', async () => {
    FakeSocket.instances = [];
    const events: Array<{ type: string; text?: string; stability?: string }> = [];
    const adapter = createElevenLabsRealtimeAdapter({ apiKey: 'sentinel', voiceId: 'voice', WebSocketImpl: FakeSocket, connectTimeoutMs: 1000 });
    const connecting = adapter.connect({ backend: 'elevenlabs-realtime', sourceLanguage: 'en', targetLanguage: 'es' }, (event) => events.push(event), new AbortController().signal);
    const socket = FakeSocket.instances[0];
    socket.emit('open');
    message(socket, { message_type: 'status', status: 'started' });
    const connection = await connecting;
    socket.bufferedAmount = 32_001;
    expect(connection.sendAudio(Uint8Array.of(1, 2))).toBe(false);
    const sentBeforeRecovery = socket.sent.length;
    socket.bufferedAmount = 0;
    expect(connection.sendAudio(Uint8Array.of(3, 4))).toBe(true);
    expect(socket.sent).toHaveLength(sentBeforeRecovery + 1);
    message(socket, { message_type: 'partial_transcript', text: 'hello' });
    message(socket, { message_type: 'translation', text: 'Hola' });
    message(socket, { message_type: 'final_transcript', text: 'hello world' });
    message(socket, { message_type: 'translation', text: 'mundo' });
    message(socket, { message_type: 'translation', text: '!' });
    expect(events.filter((event) => event.type === 'translation').at(-1)?.text).toBe('Hola mundo!');
    const finishing = connection.finish();
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ message_type: 'end_of_stream' });
    message(socket, { message_type: 'status', status: 'stopped' });
    await finishing;
    expect(events.filter((event) => event.type === 'translation').at(-1)).toMatchObject({ text: 'Hola mundo!', stability: 'settled' });
  });

  it('correlates repeated Scribe sources in order, ignores late older edits, and warns on missing edits', async () => {
    FakeSocket.instances = [];
    const events: Array<{ type: string; text?: string; code?: string }> = [];
    const adapter = createElevenLabsScribeAdapter({ apiKey: 'sentinel', WebSocketImpl: FakeSocket, connectTimeoutMs: 1000, editTimeoutMs: 20 });
    const connecting = adapter.connect({ backend: 'elevenlabs-scribe', sourceLanguage: 'en', targetLanguage: 'es' }, (event) => events.push(event), new AbortController().signal);
    const socket = FakeSocket.instances[0];
    socket.emit('open');
    message(socket, { message_type: 'session_started' });
    const connection = await connecting;
    socket.bufferedAmount = 32_001;
    expect(connection.sendAudio(Uint8Array.of(1, 2))).toBe(false);
    socket.bufferedAmount = 0;
    expect(connection.sendAudio(Uint8Array.of(3, 4))).toBe(true);
    message(socket, { message_type: 'committed_transcript', text: 'first' });
    message(socket, { message_type: 'committed_transcript', text: 'second' });
    message(socket, { message_type: 'edited_transcript', text: 'second', edited_text: 'segundo' });
    message(socket, { message_type: 'edited_transcript', text: 'first', edited_text: 'primero' });
    expect(events.filter((event) => event.type === 'translation').at(-1)?.text).toBe('segundo');

    message(socket, { message_type: 'committed_transcript', text: 'same' });
    message(socket, { message_type: 'committed_transcript', text: 'same' });
    message(socket, { message_type: 'edited_transcript', text: 'same', edited_text: 'uno' });
    message(socket, { message_type: 'edited_transcript', text: 'same', edited_text: 'dos' });
    expect(events.filter((event) => event.type === 'translation').at(-1)?.text).toBe('segundo uno dos');

    message(socket, { message_type: 'committed_transcript', text: 'missing' });
    connection.sendAudio(Uint8Array.of(1, 2, 3, 4));
    await connection.finish();
    expect(events).toContainEqual(expect.objectContaining({ type: 'warning', code: 'missing_edit' }));
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({ message_type: 'input_audio_chunk', audio_base_64: 'AQIDBA==', commit: true });
  });
});
