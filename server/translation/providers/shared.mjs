import { WebSocket } from 'ws';
import { keepRecentText, sanitizedProviderError } from '../../translation-protocol.mjs';

export function createSocketReadyPromise(socket, { timeoutMs, signal, configure, isReady, onMessage }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      socket.off('message', message);
      socket.off('error', error);
      socket.off('close', close);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      cleanup();
      callback(value);
    };
    const abort = () => {
      socket.close();
      finish(reject, new Error('Translation startup was cancelled.'));
    };
    const timeout = setTimeout(() => {
      socket.close();
      finish(reject, new Error('Translation provider timed out while connecting.'));
    }, timeoutMs);
    timeout.unref?.();
    signal?.addEventListener('abort', abort, { once: true });
    const message = (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      onMessage?.(message);
      if (isReady(message)) finish(resolve, message);
    };
    const error = (reason) => finish(reject, reason);
    const close = () => finish(reject, new Error('Translation provider closed before it was ready.'));
    socket.on('open', () => {
      try { configure?.(); } catch (reason) { finish(reject, reason); }
    });
    socket.on('message', message);
    socket.once('error', error);
    socket.once('close', close);
  });
}

export function sendJson(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) throw new Error('Translation provider is not connected.');
  socket.send(JSON.stringify(message));
}

export function boundedEventIds(limit = 512) {
  const ids = new Set();
  return (id) => {
    if (typeof id !== 'string' || id === '') return false;
    if (ids.has(id)) return true;
    ids.add(id);
    if (ids.size > limit) ids.delete(ids.values().next().value);
    return false;
  };
}

export function providerFailure(emit, error) {
  emit({ type: 'error', ...sanitizedProviderError(error) });
}

export { keepRecentText };
