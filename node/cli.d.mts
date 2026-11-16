import type { ResolvedProject } from './project.mjs';

export const HELP: string;

export interface CliOptions {
  root?: string;
  config?: string;
  mode?: string;
  port?: number;
  host?: string | true;
  help?: true;
  /** init: target folder, deck id, title, ok-show dependency spec. */
  dir?: string;
  deck?: string;
  title?: string;
  engine?: string;
  install?: true;
  force?: true;
}

export function parseCliArgs(argv: string[]): { command: string; options: CliOptions; forwarded: string[] };
export function findFreePort(start: number, options?: { host?: string; attempts?: number }): Promise<number>;
export function controlLinks(options: { localUrl: string; networkUrls?: string[]; token: string; session?: string }): {
  deck: string;
  presenter: string;
  remotePresenters: string[];
};
export function info(project: ResolvedProject): Record<string, string | false | null>;
export function version(): string;
/** Runs a command. Resolves to an exit code, or `undefined` while a server keeps running. */
export function main(argv?: string[]): Promise<number | undefined>;
