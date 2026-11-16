export const INIT_HELP: string;

export function slugify(value: string): string;
/** The engine's GitHub repository as an install spec. */
export const GITHUB_SPEC: string;
export function defaultEngineSpec(targetDir: string, engineRoot?: string): string;
export function rewriteImports(source: string, options: { from: string; to: string; copies: Map<string, string> }): string;

export interface InitPlan {
  root: string;
  deckId: string;
  title: string;
  /** Project-relative path → contents. */
  files: Map<string, string>;
}

export function planInit(options: { targetDir: string; deckId?: string; title?: string; engineSpec?: string; date?: Date }): InitPlan;
export function writeInit(plan: InitPlan, options?: { force?: boolean }): { overwritten: string[] };
export function init(options?: { dir?: string; deck?: string; title?: string; engine?: string; install?: boolean; force?: boolean }): Promise<number>;
