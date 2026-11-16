#!/usr/bin/env node
import process from 'node:process';
import { main } from '../node/cli.mjs';

try {
  const code = await main(process.argv.slice(2));
  // Long-running commands (dev, preview, sync) return undefined and keep the process alive.
  if (code !== undefined) process.exitCode = code;
} catch (error) {
  console.error(`ok-show: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
