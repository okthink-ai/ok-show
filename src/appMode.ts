import type { AppRoute } from './routing';

export type AppSurface = 'authoring' | 'presentation' | 'notes' | 'export' | 'not-found';

export function resolveAppSurface(route: AppRoute, authoringEnabled: boolean): AppSurface {
  if (route === 'export') return 'export';
  if (route === 'notes') return authoringEnabled ? 'notes' : 'not-found';
  return authoringEnabled ? 'authoring' : 'presentation';
}
