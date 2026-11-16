class OkShowAudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) this.port.postMessage({ channels: channels.map((channel) => channel.slice()) });
    return true;
  }
}

registerProcessor('ok-show-audio-capture', OkShowAudioCaptureProcessor);
