export type AppRoute = 'presentation' | 'notes' | 'export';

export function resolveAppRoute(pathname: string, hash = ''): AppRoute {
  if (pathname === '/notes' || hash === '#notes') return 'notes';
  if (pathname === '/export' || hash === '#export') return 'export';
  return 'presentation';
}
