export function findTailscaleCli(env?: NodeJS.ProcessEnv, exists?: (path: string) => boolean): string;
export function tailscaleHostname(status: unknown): string;
export function prepareTailscaleHttps(root: string, options?: { run?: typeof import('node:child_process').execFileSync }): { hostname: string; cert: Buffer; key: Buffer };
