import { formatElapsedTime, presenterPace, timerElapsedMs } from '../utils/presenterTimer';
import type { PaceState } from '../utils/presenterTimer';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { pausePresenterTimer, resetPresenterTimer, startPresenterTimer } from '../store/uiSlice';
import MaterialIcon from './MaterialIcon';

const RESET_HOLD_MS = 700;

/**
 * The clock's start and pauses live in Redux; the tick stays local, so a clock
 * tick never re-renders the manuscript or slide previews.
 */
function useElapsedMs(): { elapsedMs: number; running: boolean } {
  const timer = useAppSelector((state) => state.ui.presenterTimer);
  const [now, setNow] = useState(() => Date.now());
  const running = timer.runningSince !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);
  return { elapsedMs: timerElapsedMs(timer, running ? now : 0), running };
}

export default function PresenterTimer() {
  const dispatch = useAppDispatch();
  const { elapsedMs, running } = useElapsedMs();
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  const cancelHold = () => { window.clearTimeout(holdTimer.current); setHolding(false); };
  const beginHold = () => {
    if (!elapsedSeconds && !running) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setHolding(false);
      dispatch(resetPresenterTimer());
      navigator.vibrate?.(30);
    }, RESET_HOLD_MS);
  };
  // A pointer must hold; keyboard activation (detail 0) is already deliberate.
  const keyboardReset = (event: MouseEvent) => { if (event.detail === 0) dispatch(resetPresenterTimer()); };
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  return <section className="speaker-notes__timer" aria-label="Presentation timer">
    <time dateTime={`PT${elapsedSeconds}S`} data-testid="presentation-timer" data-running={running}>{formatElapsedTime(elapsedSeconds)}</time>
    <button type="button" onClick={() => dispatch(running ? pausePresenterTimer(Date.now()) : startPresenterTimer(Date.now()))} aria-label={running ? 'Pause timer' : 'Start timer'} title={running ? 'Pause timer' : 'Start timer'}>
      <MaterialIcon name={running ? 'pause' : 'play_arrow'} size="small" />
    </button>
    <button type="button" className={`speaker-notes__timer-reset${holding ? ' speaker-notes__timer-reset--holding' : ''}`}
      aria-label="Reset timer (hold)" title="Hold to reset" disabled={!elapsedSeconds && !running}
      style={{ '--hold-ms': `${RESET_HOLD_MS}ms` } as CSSProperties}
      onPointerDown={beginHold} onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
      onContextMenu={(event) => event.preventDefault()} onClick={keyboardReset}>
      <MaterialIcon name="restart_alt" size="small" />
    </button>
  </section>;
}

interface PaceProps {
  talkMinutes: number;
  weights: number[];
  slideIndex: number;
}

function usePace({ talkMinutes, weights, slideIndex }: PaceProps) {
  const { elapsedMs } = useElapsedMs();
  const targetMs = talkMinutes * 60_000;
  return { elapsedMs, targetMs, ...presenterPace({ elapsedMs, targetMs, weights, slideIndex }) };
}

function formatDelta(ms: number): string {
  return formatElapsedTime(Math.round(Math.abs(ms) / 1000)).replace(/^0(?=\d:)/, '');
}

const PACE_LABEL: Record<Exclude<PaceState, 'idle' | 'on-pace'>, string> = { ahead: 'ahead', behind: 'behind', over: 'over' };

/** Ahead/behind in words, for the space beside the current slide. */
export function PresenterPaceLabel(props: PaceProps) {
  const { state, deltaMs, remainingMs } = usePace(props);
  const headline = state === 'idle' ? `${props.talkMinutes} min talk`
    : state === 'on-pace' ? 'On pace'
      : state === 'over' ? `${formatDelta(remainingMs)} over`
        : `${formatDelta(deltaMs)} ${PACE_LABEL[state]}`;
  const detail = state === 'idle' ? 'Starts on first Next'
    : state === 'over' ? 'Past the planned time'
      : `${Math.ceil(remainingMs / 60_000)} min left`;
  return <div className="speaker-notes__pace" data-pace={state} aria-live="off">
    <strong>{headline}</strong>
    <span>{detail}</span>
  </div>;
}

/**
 * The clock drawn on the same scale as the slide strip above it: when the fill
 * runs past the current slide's segment, the talk is behind.
 */
export function PresenterTimeBar(props: PaceProps) {
  const { state, elapsedMs, targetMs } = usePace(props);
  const fraction = targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0;
  return <div className="speaker-notes__time-bar" data-pace={state} role="progressbar" aria-label="Talk time used"
    aria-valuemin={0} aria-valuemax={props.talkMinutes} aria-valuenow={Math.floor(elapsedMs / 60_000)}
    aria-valuetext={`${Math.floor(elapsedMs / 60_000)} of ${props.talkMinutes} minutes`}>
    <span style={{ transform: `scaleX(${fraction})` }} />
  </div>;
}
