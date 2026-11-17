import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const MACOS_APP_CLI = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

export function findTailscaleCli(env = process.env, exists = existsSync) {
  const candidates = [
    env.TAILSCALE_CLI,
    ...(env.PATH || '').split(delimiter).map((directory) => join(directory, 'tailscale')),
    MACOS_APP_CLI,
  ].filter(Boolean);
  return candidates.find((candidate) => exists(candidate)) || '';
}

export function tailscaleHostname(status) {
  const hostname = String(status?.Self?.DNSName || '').replace(/\.$/, '');
  if (status?.BackendState !== 'Running' || !/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/i.test(hostname)) {
    throw new Error('ok-show --https needs a connected Tailscale account with MagicDNS and HTTPS enabled.');
  }
  return hostname;
}

export function prepareTailscaleHttps(root, { run = execFileSync } = {}) {
  const cli = findTailscaleCli();
  if (!cli) throw new Error('ok-show --https could not find the Tailscale CLI or macOS app.');
  let status;
  try {
    status = JSON.parse(run(cli, ['status', '--json'], { encoding: 'utf8' }));
  } catch {
    throw new Error('ok-show --https could not read Tailscale status. Sign in to Tailscale and try again.');
  }
  const hostname = tailscaleHostname(status);
  const directory = join(root, '.tmp', 'tailscale-https');
  const certPath = join(directory, `${hostname}.crt`);
  const keyPath = join(directory, `${hostname}.key`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  run(cli, ['cert', '--min-validity=1h', `--cert-file=${certPath}`, `--key-file=${keyPath}`, hostname], { stdio: 'inherit' });
  chmodSync(keyPath, 0o600);
  return { hostname, cert: readFileSync(certPath), key: readFileSync(keyPath) };
}
