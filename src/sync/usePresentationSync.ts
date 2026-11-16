import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppDispatch } from '../store/store';
import { goToSlide, selectPresentation } from '../store/presentationSlice';
import { presentations } from '../project/presentations';
import { setTheme } from '../store/uiSlice';
import { isThemeId, type ThemeId } from '../themes';
import { parseServerSyncMessage } from './protocol';
import type { NotesRequestMessage, SyncRole } from './protocol';
import type { SparklePromptMap } from '../types/speakerNotes.types';

export type SyncStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export interface PresentationSyncResult {
  status: SyncStatus;
  error: string;
  notes: Record<string, string[]>;
  /** True once the server has sent notes for this presentation, even if empty. */
  notesLoaded: boolean;
  sparklePrompts: SparklePromptMap;
}

interface UsePresentationSyncOptions {
  dispatch: AppDispatch;
  presentationId: string;
  slideIndex: number;
  totalSlides: number;
  role?: SyncRole;
  theme: ThemeId;
  enabled?: boolean;
  applyRemoteState?: boolean;
  /**
   * Whether this client may drive the session. Defaults to true for the
   * presentation role. The standalone presenter view opts in so the speaker can
   * advance the deck from their own screen; the in-app review sidebar does not,
   * because the main application is already publishing the same navigation.
   */
  canNavigate?: boolean;
}

const MIN_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 4000;
/**
 * How long to wait for the server to answer a navigation before sending the
 * next one anyway. The server ignores navigations it considers invalid, and a
 * navigation that never gets an answer must not block the remote for the rest
 * of the talk.
 */
export const NAVIGATION_RESPONSE_TIMEOUT_MS = 4000;
let memoryControlToken = '';
let memoryClientId = '';

export function getSyncServerUrl(
  location: Location = window.location,
  configured: string | undefined = import.meta.env.VITE_SYNC_SERVER_URL,
): string {
  if (configured) return configured;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/speaker-sync`;
}

export function getSyncSession(location: Location = window.location): string {
  return new URLSearchParams(location.search).get('session')?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
}

export function isPresentationSyncRequested(
  location: Location = window.location,
  configuredUrl: string | undefined = import.meta.env.VITE_SYNC_SERVER_URL,
): boolean {
  return new URLSearchParams(location.search).has('session') || Boolean(configuredUrl);
}

function getControlToken(location: Location = window.location): string {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('token');
  if (fromUrl) {
    memoryControlToken = fromUrl;
    try { sessionStorage.setItem('speaker-sync-token', fromUrl); } catch { /* Storage is optional. */ }
    params.delete('token');
    const query = params.toString();
    window.history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    return fromUrl;
  }
  // The token arrives only through a link (`npm run dev` prints them). It is
  // never compiled into the bundle, because anyone who can load the page could
  // then drive the deck.
  try { return sessionStorage.getItem('speaker-sync-token') || memoryControlToken; } catch { return memoryControlToken; }
}

/**
 * URL for the remote presenter view of a session. The control token travels with
 * it because the presenter is usually on a different device, and the token is
 * held in this tab's session storage where that device cannot reach it. The
 * notes view strips the token from its own address bar once it has read it.
 */
export function getPresenterViewUrl(sessionId: string = getSyncSession()): string {
  const params = new URLSearchParams({ session: sessionId });
  const token = getControlToken();
  if (token) params.set('token', token);
  return `/notes?${params.toString()}`;
}

interface NavigationPosition {
  presentationId: string;
  slideIndex: number;
  totalSlides: number;
  theme: string;
}

function navigationKey({ presentationId, slideIndex, totalSlides, theme }: NavigationPosition): string {
  return `${presentationId}:${slideIndex}:${totalSlides}:${theme}`;
}

/** The navigation this client sent and the server has not answered yet. */
interface PendingNavigation {
  key: string;
  baseRevision: number;
}

function getClientId(): string {
  let stored: string | null = null;
  try { stored = sessionStorage.getItem('speaker-sync-client-id'); } catch { /* Storage is optional. */ }
  if (stored) return stored;
  if (!memoryClientId) memoryClientId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  try { sessionStorage.setItem('speaker-sync-client-id', memoryClientId); } catch { /* Storage is optional. */ }
  return memoryClientId;
}

export function usePresentationSync({ dispatch, presentationId, slideIndex, totalSlides, theme, role = 'presentation', enabled = true, applyRemoteState = true, canNavigate = role === 'presentation' }: UsePresentationSyncOptions): PresentationSyncResult {
  const [status, setStatus] = useState<SyncStatus>(enabled ? 'connecting' : 'disconnected');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [sparklePrompts, setSparklePrompts] = useState<SparklePromptMap>({});
  const notesPresentationRef = useRef('');
  const socketRef = useRef<WebSocket | null>(null);
  const stateRef = useRef({ presentationId, slideIndex, totalSlides, theme });
  const activePresentationRef = useRef(presentationId);
  const lastRemoteRef = useRef<string>('');
  const lastNotesRequestRef = useRef<string>('');
  const revisionRef = useRef(0);
  const sessionRef = useRef(getSyncSession());
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearPendingNavigation = useCallback(() => {
    pendingNavigationRef.current = null;
    clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = undefined;
  }, []);

  /**
   * Publish this client's latest position. Only one navigation is in flight at a
   * time: the server answers each one with exactly one state message to this
   * socket (the broadcast echo if accepted, the current state if stale). Local
   * moves made while one is in flight are coalesced and sent, on top of the
   * answered revision, once the answer arrives.
   */
  const sendNavigation = useCallback(function send(socket: WebSocket) {
    const position = stateRef.current;
    // The server silently ignores out-of-range positions; never wait on one.
    if (position.totalSlides <= 0 || position.slideIndex < 0 || position.slideIndex >= position.totalSlides) return;
    const key = navigationKey(position);
    const baseRevision = revisionRef.current;
    clearTimeout(pendingTimerRef.current);
    pendingNavigationRef.current = { key, baseRevision };
    pendingTimerRef.current = setTimeout(() => {
      if (pendingNavigationRef.current?.key !== key) return;
      pendingNavigationRef.current = null;
      pendingTimerRef.current = undefined;
      if (socketRef.current === socket && socket.readyState === WebSocket.OPEN && navigationKey(stateRef.current) !== key) send(socket);
    }, NAVIGATION_RESPONSE_TIMEOUT_MS);
    socket.send(JSON.stringify({ type: 'navigate', ...position, baseRevision }));
  }, []);

  const requestNotes = useCallback((socket: WebSocket, requestedPresentationId: string) => {
    // Notes are deck content, not navigation state. Re-fetch on deck change or reconnect.
    const key = requestedPresentationId;
    if (lastNotesRequestRef.current === key) return;
    lastNotesRequestRef.current = key;
    const request: NotesRequestMessage = {
      type: 'request-notes',
      presentationId: requestedPresentationId,
      baseRevision: revisionRef.current,
    };
    socket.send(JSON.stringify(request));
  }, []);

  useEffect(() => {
    stateRef.current = { presentationId, slideIndex, totalSlides, theme };
    activePresentationRef.current = presentationId;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (role === 'notes') requestNotes(socket, presentationId);
    if (!canNavigate) return;
    const key = navigationKey({ presentationId, slideIndex, totalSlides, theme });
    if (lastRemoteRef.current === key) return;
    lastRemoteRef.current = '';
    // A navigation is already in flight; the latest position goes out when the
    // server answers it (see onmessage).
    if (pendingNavigationRef.current) return;
    sendNavigation(socket);
  }, [canNavigate, presentationId, requestNotes, role, sendNavigation, slideIndex, totalSlides, theme]);

  useEffect(() => {
    if (!enabled) {
      notesPresentationRef.current = '';
      setStatus('disconnected');
      setError('');
      return;
    }
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = MIN_RECONNECT_MS;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      setError('');
      const socket = new WebSocket(getSyncServerUrl());
      socketRef.current = socket;
      lastNotesRequestRef.current = '';
      clearPendingNavigation();
      // Revisions are compared only within one connection. The server may have
      // restarted or expired the session, so start from its join reply.
      revisionRef.current = 0;

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'join', sessionId: sessionRef.current, role, token: getControlToken(), clientId: getClientId(), state: stateRef.current,
        }));
      };
      socket.onmessage = (event) => {
        const message = parseServerSyncMessage(String(event.data));
        if (!message) return;
        if (message.sessionId !== sessionRef.current) return;
        if (message.type === 'notes') {
          revisionRef.current = message.revision;
          if (message.presentationId === activePresentationRef.current) {
            notesPresentationRef.current = message.presentationId;
            setNotes(message.notes);
            setSparklePrompts(message.sparkle);
          }
          return;
        }
        const remote = message.state;
        const pending = pendingNavigationRef.current;
        if (pending) {
          // Revisions only grow, and an answer to the pending navigation always
          // carries a newer revision than the one it was based on. Anything else
          // answers a navigation this client already superseded.
          if (remote.revision <= pending.baseRevision) return;
          clearPendingNavigation();
          revisionRef.current = remote.revision;
          if (navigationKey(stateRef.current) !== navigationKey(remote)) {
            // Either an older local navigation was accepted while the speaker kept
            // moving, or the server rejected ours as stale. Do not snap back to
            // the server's slide; publish the latest local position on top of
            // this revision instead.
            delay = MIN_RECONNECT_MS;
            setStatus('connected');
            sendNavigation(socket);
            return;
          }
        }
        revisionRef.current = remote.revision;
        if (role === 'notes') {
          requestNotes(socket, applyRemoteState ? remote.presentationId : activePresentationRef.current);
        }
        if (!applyRemoteState) {
          setStatus('connected');
          return;
        }
        const presentation = presentations.find((item) => item.id === remote.presentationId);
        if (!presentation) {
          setStatus('error');
          setError(`Unknown presentation "${remote.presentationId}"`);
          return;
        }
        delay = MIN_RECONNECT_MS;
        const nextIndex = Math.max(0, Math.min(remote.slideIndex, presentation.slides.length - 1));
        activePresentationRef.current = remote.presentationId;
        lastRemoteRef.current = `${remote.presentationId}:${nextIndex}:${presentation.slides.length}:${remote.theme}`;
        if (stateRef.current.presentationId !== remote.presentationId) dispatch(selectPresentation(remote.presentationId));
        dispatch(goToSlide({ index: nextIndex, totalSlides: presentation.slides.length }));
        if (isThemeId(remote.theme)) dispatch(setTheme(remote.theme));
        setStatus('connected');
      };
      socket.onclose = (event) => {
        if (disposed || socketRef.current !== socket) return;
        socketRef.current = null;
        if ([1002, 1008].includes(event.code)) {
          setStatus('error');
          setError(event.reason || 'The synchronization server rejected this connection.');
          return;
        }
        setStatus('disconnected');
        retryTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_RECONNECT_MS);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearPendingNavigation();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [applyRemoteState, clearPendingNavigation, dispatch, enabled, requestNotes, role, sendNavigation]);

  const notesLoaded = enabled && notesPresentationRef.current === presentationId;
  const visibleNotes = notesLoaded ? notes : {};
  const visibleSparklePrompts = notesLoaded ? sparklePrompts : {};
  return { status, error, notes: visibleNotes, notesLoaded, sparklePrompts: visibleSparklePrompts };
}
