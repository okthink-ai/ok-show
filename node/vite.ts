import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import react from '@vitejs/plugin-react';
import { mergeConfig, normalizePath, searchForWorkspaceRoot } from 'vite';
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';
import { practiceMarkdownPlugin } from '../scripts/practice-markdown';
import { listManuscripts, listTemplateStylesheets } from './project.mjs';
import type { ResolvedProject } from './project.mjs';

export const VIRTUAL_PRESENTATIONS = 'virtual:ok-vibe-slides/presentations';
export const VIRTUAL_MANUSCRIPTS = 'virtual:ok-vibe-slides/manuscripts';
export const VIRTUAL_PROJECT = 'virtual:ok-vibe-slides/project';
export const VIRTUAL_STYLES = 'virtual:ok-vibe-slides/styles';
const VIRTUAL_IDS = [VIRTUAL_PRESENTATIONS, VIRTUAL_MANUSCRIPTS, VIRTUAL_PROJECT, VIRTUAL_STYLES];

/**
 * Packages the engine and the decks must share one copy of. A project that
 * installs ok-vibe-slides through a symlink would otherwise load a second
 * React from its own node_modules and break hooks.
 */
export const SHARED_DEPENDENCIES = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-redux',
  '@reduxjs/toolkit',
];

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function gitRevision(cwd: string): string {
  if (process.env.VITE_GIT_REVISION) return process.env.VITE_GIT_REVISION;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function listFiles(directory: string, prefix = ''): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFiles(join(directory, entry.name), path);
    return entry.isFile() ? [path] : [];
  });
}

/** Engine public files (favicon, template placeholders) the project does not override. */
export function inheritedPublicFiles(project: ResolvedProject): string[] {
  const enginePublic = join(project.engineRoot, 'public');
  if (project.isEngine || project.publicDir === enginePublic) return [];
  const projectPublic = project.publicDir;
  return listFiles(enginePublic).filter((file) => !projectPublic || !existsSync(join(projectPublic, file)));
}

export function presentationsModule(project: ResolvedProject): string {
  return `export { presentations } from ${JSON.stringify(normalizePath(project.presentationsEntry))};\n`;
}

export function manuscriptsModule(project: ResolvedProject): string {
  const manuscripts = listManuscripts(project.presentationsDir);
  const imports = manuscripts.map(({ file }, index) => `import * as manuscript${index} from ${JSON.stringify(`${normalizePath(file)}?practice`)};`);
  const entries = manuscripts.map(({ presentationId }, index) => `  ${JSON.stringify(presentationId)}: { html: manuscript${index}.default, source: manuscript${index}.source },`);
  return [...imports, 'export const manuscripts = {', ...entries, '};', ''].join('\n');
}

export function projectModule(project: ResolvedProject): string {
  const values = {
    presentationsDir: project.paths.presentationsDir,
    engineDir: project.paths.engineDir,
    // Inside the engine repository every template is already an engine template.
    templateStylesheets: project.isEngine ? {} : listTemplateStylesheets(project.root, project.templatesDir),
  };
  return Object.entries(values).map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`).join('\n') + '\n';
}

/** Side-effect imports of the project's stylesheets, after the engine's global styles. */
export function stylesModule(project: ResolvedProject): string {
  return project.styles.map((file) => `import ${JSON.stringify(normalizePath(file))};\n`).join('');
}

/**
 * Engine `<head>` tags a project's `head` replaces when it supplies its own:
 * a page has one favicon and one description, so the engine's defaults go.
 */
const REPLACEABLE_HEAD_TAGS = [
  /<link\b[^>]*\brel=["'](?:shortcut )?icon["'][^>]*>/i,
  /<meta\b[^>]*\bname=["']description["'][^>]*>/i,
];

/** Apply `title` and `head` from the project config to the engine's index.html. */
export function projectHtml(html: string, project: Pick<ResolvedProject, 'title' | 'head'>): string {
  let result = html;
  if (project.title) result = result.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(project.title)}</title>`);
  if (project.head) {
    for (const tag of REPLACEABLE_HEAD_TAGS) {
      if (!tag.test(project.head)) continue;
      const global = new RegExp(`[ \\t]*${tag.source}[ \\t]*\\n?`, 'gi');
      const [headStart, headEnd] = [result.indexOf('<head'), result.indexOf('</head>')];
      if (headStart === -1 || headEnd === -1) continue;
      result = result.slice(0, headStart) + result.slice(headStart, headEnd).replace(global, '') + result.slice(headEnd);
    }
    result = result.replace('</head>', `${project.head}\n  </head>`);
  }
  return result;
}

const isInside = (directory: string, file: string): boolean => {
  const rel = relative(directory, file);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel);
};

/** Wires a project's decks, manuscripts, and paths into the engine through virtual modules. */
export function okVibeSlidesPlugin(project: ResolvedProject): Plugin[] {
  const inherited = inheritedPublicFiles(project);
  const enginePublic = join(project.engineRoot, 'public');

  const invalidate = (server: ViteDevServer, id: string) => {
    const module = server.moduleGraph.getModuleById(`\0${id}`);
    if (!module) return;
    server.moduleGraph.invalidateModule(module);
    server.ws.send({ type: 'full-reload' });
  };

  const plugin: Plugin = {
    name: 'ok-vibe-slides',
    resolveId(id) {
      if (VIRTUAL_IDS.includes(id)) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${VIRTUAL_PRESENTATIONS}`) return presentationsModule(project);
      if (id === `\0${VIRTUAL_MANUSCRIPTS}`) return manuscriptsModule(project);
      if (id === `\0${VIRTUAL_PROJECT}`) return projectModule(project);
      if (id === `\0${VIRTUAL_STYLES}`) return stylesModule(project);
    },
    transformIndexHtml(html) {
      return projectHtml(html, project);
    },
    configureServer(server) {
      // Vite watches its root (the engine); decks and templates live in the project.
      server.watcher.add([project.presentationsDir, project.templatesDir]);
      const onChange = (file: string) => {
        if (isInside(project.presentationsDir, file) && file.endsWith(`${sep}manuscript.md`)) invalidate(server, VIRTUAL_MANUSCRIPTS);
        if (isInside(project.templatesDir, file) && file.endsWith('.css')) invalidate(server, VIRTUAL_PROJECT);
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      // Editing ok-vibe-slides.config.* restarts the server, the way editing vite.config does.
      if (project.configFile) {
        const configFile = project.configFile;
        server.watcher.add(configFile);
        server.watcher.on('change', (file) => {
          if (resolve(file) !== configFile) return;
          server.config.logger.info(`${relative(project.root, configFile)} changed, restarting server...`, { timestamp: true });
          void server.restart();
        });
      }

      if (inherited.length === 0) return;
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        if (!inherited.includes(path)) return next();
        const file = join(enginePublic, path);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const fileName of inherited) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(enginePublic, fileName)) });
      }
    },
  };

  return [plugin, practiceMarkdownPlugin({ presentationsDir: project.presentationsDir })];
}

export interface EngineViteOptions {
  /** Internal port of the notes service that `/speaker-sync` proxies to. */
  syncPort?: number;
}

/** The complete Vite config the CLI runs: engine app shell at the root, the project's decks through the plugin. */
export function createViteConfig(project: ResolvedProject, _env: ConfigEnv, { syncPort = Number(process.env.SYNC_PORT || 5200) }: EngineViteOptions = {}): UserConfig {
  const base: UserConfig = {
    root: project.engineRoot,
    // Keep the project's optimized-dependency cache out of a shared engine checkout.
    cacheDir: project.isEngine ? undefined : resolve(project.root, 'node_modules/.vite-ok-vibe-slides'),
    envDir: project.root,
    publicDir: project.publicDir,
    plugins: [react(), okVibeSlidesPlugin(project)],
    define: {
      'import.meta.env.VITE_GIT_REVISION': JSON.stringify(gitRevision(project.root)),
    },
    resolve: {
      dedupe: SHARED_DEPENDENCIES,
    },
    server: {
      port: 5199,
      host: true,
      allowedHosts: [],
      fs: {
        allow: [searchForWorkspaceRoot(project.root), project.engineRoot],
      },
      proxy: {
        '/speaker-sync': {
          target: `ws://127.0.0.1:${syncPort}`,
          ws: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: project.outDir,
      emptyOutDir: true,
    },
  };
  return mergeConfig(base, project.vite);
}
