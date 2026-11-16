import { Profiler } from 'react';
import type { ReactNode } from 'react';
import { performanceRecorder } from './performance';

export default function DebugProfiler({ id, children }: { id: string; children: ReactNode }) {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_CLI === 'true'
    ? <Profiler id={id} onRender={performanceRecorder.onRender}>{children}</Profiler>
    : children;
}
