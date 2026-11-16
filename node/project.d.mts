import type { UserConfig } from 'vite';

/** `ok-vibe-slides.config.{ts,mts,js,mjs}` in the project root. Every option is optional. */
export interface OkVibeSlidesConfig {
  /** Folder of deck folders plus an `index.ts` exporting `presentations`. Default `src/data/presentations`. */
  presentationsDir?: string;
  /** Project-local slide templates; their `.css` files are named in review packets. Default `src/components/slides`. */
  templatesDir?: string;
  /** Static files served at `/`. The engine's own public files fill any gaps. Default `public`; `false` disables it. */
  publicDir?: string | false;
  /** Where `ok-vibe-slides build` writes the public site. Default `dist`. */
  outDir?: string;
  /** The page `<title>`. */
  title?: string;
  /** HTML added to the end of `<head>`: fonts, favicon links, social meta tags. */
  head?: string;
  /** Project stylesheets loaded after the engine's global styles, in order. Use them to override design tokens. */
  styles?: string[];
  /** Extra Vite config merged over the engine's (plugins, aliases, `define`, …). */
  vite?: UserConfig;
}

export interface ResolvedProject {
  root: string;
  configFile: string | null;
  engineRoot: string;
  isEngine: boolean;
  presentationsDir: string;
  presentationsEntry: string;
  templatesDir: string;
  publicDir: string | false;
  outDir: string;
  title: string | undefined;
  head: string;
  styles: string[];
  vite: UserConfig;
  paths: {
    presentationsDir: string;
    templatesDir: string;
    engineDir: string;
  };
}

export const ENGINE_ROOT: string;
export const PACKAGE_NAME: string;
export const CONFIG_FILES: string[];
export const DEFAULTS: Readonly<{ presentationsDir: string; templatesDir: string; publicDir: string; outDir: string }>;

export function defineConfig(config: OkVibeSlidesConfig): OkVibeSlidesConfig;
export function projectRelative(root: string, path: string): string;
export function findConfigFile(root: string): string | null;
export function findPresentationsEntry(presentationsDir: string): string | null;
export function engineDirFor(root: string, engineRoot?: string): string;
export function listTemplateStylesheets(root: string, templatesDir: string): Record<string, string>;
export function listManuscripts(presentationsDir: string): Array<{ presentationId: string; file: string }>;
export function resolveProject(
  rawConfig?: OkVibeSlidesConfig,
  options?: { root?: string; configFile?: string | null; engineRoot?: string },
): ResolvedProject;
export function loadProject(options?: {
  root?: string;
  configFile?: string;
  command?: 'serve' | 'build';
  mode?: string;
  engineRoot?: string;
}): Promise<ResolvedProject>;
