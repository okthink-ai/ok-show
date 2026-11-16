import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { markNavHintSeen } from '../store/uiSlice';
import './NavigationHint.css';

const SHOW_DELAY_MS = 400;
const AUTO_DISMISS_MS = 3000;
const EXIT_MS = 500;

interface NavigationHintProps {
  /** The hint only introduces the controls on the opening slide. */
  isFirstSlide: boolean;
}

/**
 * First-visit overlay on phones that shows the tap zones: left side back,
 * the rest forward. It is marked seen as soon as it appears, so leaving
 * early still counts, and it never blocks taps once dismissed.
 */
const NavigationHint: FC<NavigationHintProps> = ({ isFirstSlide }) => {
  const dispatch = useAppDispatch();
  const isMobile = useAppSelector((state) => state.ui.isMobile);
  const seen = useAppSelector((state) => state.ui.navHintSeen);
  // Marking it seen on show must not cancel the hint that is on screen.
  const [eligible, setEligible] = useState(!seen);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const active = eligible && isMobile && isFirstSlide;

  useEffect(() => {
    if (!active || visible) return;
    const timer = window.setTimeout(() => {
      setVisible(true);
      dispatch(markNavHintSeen());
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, visible, dispatch]);

  useEffect(() => {
    if (!visible || exiting) return;
    const timer = window.setTimeout(() => setExiting(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [visible, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      setEligible(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  if (!visible || !active) return null;

  return (
    <div
      className={`nav-hint${exiting ? ' nav-hint--exiting' : ''}`}
      data-testid="nav-hint"
      onClick={() => setExiting(true)}
    >
      <div className="nav-hint__zone nav-hint__zone--left">
        <div className="nav-hint__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
        <span className="nav-hint__label">Tap to go back</span>
      </div>
      <div className="nav-hint__zone nav-hint__zone--right">
        <div className="nav-hint__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
        <span className="nav-hint__label">Tap to advance</span>
      </div>
    </div>
  );
};

export default NavigationHint;
