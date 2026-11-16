import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function findEnvFile(startDirectory) {
  let directory = startDirectory;

  while (true) {
    const candidate = resolve(directory, '.env');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function parseEnvFile(filePath) {
  const values = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }

  return values;
}

const envFile = findEnvFile(process.cwd());
const loaded = envFile ? parseEnvFile(envFile) : {};
const env = { ...loaded, ...process.env };
const separatorIndex = process.argv.indexOf('--');
const command = process.argv.slice(separatorIndex === -1 ? 2 : separatorIndex + 1);

if (command.length === 0) {
  console.error('Usage: node scripts/with-env.mjs -- <command> [args...]');
  process.exit(1);
}

const child = spawn(command[0], command.slice(1), {
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
