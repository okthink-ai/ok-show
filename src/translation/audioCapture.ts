export interface AudioCapture {
  readonly inputSampleRate: number;
  start(): Promise<void>;
  stop(flush?: boolean): Promise<void>;
}

interface PrepareAudioCaptureOptions {
  outputSampleRate: 16000 | 24000;
  chunkDurationMs: 100 | 200;
  onChunk: (chunk: Uint8Array) => void;
  onDeviceEnded: () => void;
  signal: AbortSignal;
}

export class StreamingPcm16Encoder {
  private readonly step: number;
  private readonly chunkSamples: number;
  private input: number[] = [];
  private position = 0;
  private output: number[] = [];
  private inputCount = 0;
  private outputCount = 0;

  constructor(inputSampleRate: number, outputSampleRate: number, chunkDurationMs: number) {
    if (inputSampleRate <= 0 || outputSampleRate <= 0) throw new Error('Audio sample rates must be positive.');
    this.step = inputSampleRate / outputSampleRate;
    this.chunkSamples = Math.round(outputSampleRate * chunkDurationMs / 1000);
  }

  push(channels: Float32Array[]): Uint8Array[] {
    if (!channels.length) return [];
    const length = Math.min(...channels.map((channel) => channel.length));
    this.inputCount += length;
    for (let index = 0; index < length; index += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] ?? 0;
      this.input.push(Math.max(-1, Math.min(1, sample / channels.length)));
    }
    return this.convert(false);
  }

  flush(): Uint8Array[] {
    return this.convert(true);
  }

  private convert(final: boolean): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    const finalOutputCount = final ? Math.round(this.inputCount / this.step) : Number.POSITIVE_INFINITY;
    while (this.position + 1 < this.input.length || (final && this.position < this.input.length)) {
      if (this.outputCount >= finalOutputCount) break;
      const leftIndex = Math.floor(this.position);
      const rightIndex = Math.min(leftIndex + 1, this.input.length - 1);
      const fraction = this.position - leftIndex;
      const sample = (this.input[leftIndex] ?? 0) * (1 - fraction) + (this.input[rightIndex] ?? 0) * fraction;
      this.output.push(sample);
      this.outputCount += 1;
      this.position += this.step;
      if (this.output.length === this.chunkSamples) chunks.push(this.encode(this.output.splice(0)));
    }
    const discard = Math.min(Math.floor(this.position), Math.max(0, this.input.length - (final ? 0 : 1)));
    if (discard > 0) {
      this.input.splice(0, discard);
      this.position -= discard;
    }
    if (final) {
      this.input = [];
      this.position = 0;
      if (this.output.length) chunks.push(this.encode(this.output.splice(0)));
    }
    return chunks;
  }

  private encode(samples: number[]): Uint8Array {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    samples.forEach((sample, index) => {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(index * 2, clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff), true);
    });
    return bytes;
  }
}

/** Delivers chunks at capture cadence and bounds catch-up audio to one second. */
export class RealtimeChunkPacer {
  private readonly queue: Uint8Array[] = [];
  private readonly chunkDurationMs: number;
  private readonly maximumQueuedChunks: number;
  private readonly send: (chunk: Uint8Array) => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextSendAt = 0;
  private drainWaiters: Array<() => void> = [];

  constructor(
    chunkDurationMs: number,
    maximumQueuedChunks: number,
    send: (chunk: Uint8Array) => void,
  ) {
    this.chunkDurationMs = chunkDurationMs;
    this.maximumQueuedChunks = maximumQueuedChunks;
    this.send = send;
  }

  enqueue(chunk: Uint8Array): boolean {
    if (this.queue.length >= this.maximumQueuedChunks) return false;
    this.queue.push(chunk);
    this.schedule();
    return true;
  }

  drain(): Promise<void> {
    if (!this.queue.length && !this.timer) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queue.length = 0;
    this.resolveDrain();
  }

  private schedule(): void {
    if (this.timer || !this.queue.length) return;
    const delay = Math.max(0, this.nextSendAt - Date.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const chunk = this.queue.shift();
      if (chunk) this.send(chunk);
      // Never emit catch-up chunks back-to-back after the event loop stalls.
      this.nextSendAt = Math.max(this.nextSendAt + this.chunkDurationMs, Date.now() + this.chunkDurationMs);
      if (this.queue.length) this.schedule(); else this.resolveDrain();
    }, delay);
  }

  private resolveDrain(): void {
    for (const resolve of this.drainWaiters.splice(0)) resolve();
  }
}

function microphoneSupported(): boolean {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') return false;
  if (window.isSecureContext) return true;
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export async function prepareAudioCapture({ outputSampleRate, chunkDurationMs, onChunk, onDeviceEnded, signal }: PrepareAudioCaptureOptions): Promise<AudioCapture> {
  if (!microphoneSupported()) {
    throw new Error('Microphone capture needs HTTPS on remote devices (localhost is allowed for development).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  if (signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException('Capture cancelled', 'AbortError');
  }
  const context = new AudioContext();
  await context.suspend();
  const encoder = new StreamingPcm16Encoder(context.sampleRate, outputSampleRate, chunkDurationMs);
  let stopped = false;
  try {
    await context.audioWorklet.addModule(new URL('./audio-capture-worklet.js', import.meta.url));
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, 'ok-show-audio-capture');
    const silent = context.createGain();
    silent.gain.value = 0;
    worklet.port.onmessage = (event: MessageEvent<{ channels?: Float32Array[] }>) => {
      if (stopped || !Array.isArray(event.data.channels)) return;
      for (const chunk of encoder.push(event.data.channels)) onChunk(chunk);
    };
    source.connect(worklet).connect(silent).connect(context.destination);
    const ended = () => { if (!stopped) onDeviceEnded(); };
    stream.getTracks().forEach((track) => track.addEventListener('ended', ended, { once: true }));
    const stop = async (flush = true) => {
      if (stopped) return;
      stopped = true;
      if (flush) for (const chunk of encoder.flush()) onChunk(chunk);
      stream.getTracks().forEach((track) => {
        track.removeEventListener('ended', ended);
        track.stop();
      });
      source.disconnect();
      worklet.disconnect();
      silent.disconnect();
      worklet.port.close();
      await context.close().catch(() => undefined);
    };
    signal.addEventListener('abort', () => { void stop(false); }, { once: true });
    return {
      inputSampleRate: context.sampleRate,
      start: async () => { if (!stopped) await context.resume(); },
      stop,
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
    throw error;
  }
}

/** Debug-only deterministic source for browser integration tests. */
export async function prepareDeterministicAudioCapture({ outputSampleRate, chunkDurationMs, onChunk, signal }: PrepareAudioCaptureOptions): Promise<AudioCapture> {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const fullChunk = new Uint8Array(outputSampleRate * 2 * chunkDurationMs / 1000);
  const stop = async (flush = true) => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (flush) onChunk(fullChunk.slice(0, Math.max(2, fullChunk.length / 4)));
  };
  signal.addEventListener('abort', () => { void stop(false); }, { once: true });
  return {
    inputSampleRate: outputSampleRate,
    start: async () => {
      if (stopped || timer) return;
      onChunk(fullChunk);
      timer = setInterval(() => onChunk(fullChunk), chunkDurationMs);
    },
    stop,
  };
}
