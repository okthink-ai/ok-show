import { defineConfig } from 'vite'
import { loadProject } from './node/project.mjs'
import { createViteConfig } from './node/vite'

/**
 * The engine's Vite config. `ok-vibe-slides dev|build|preview` loads this file
 * for any project, passing the project root in OK_VIBE_SLIDES_ROOT; run
 * directly (`vite`, Vitest), the project is this repository and its demo deck.
 */
export default defineConfig(async (env) => {
  const project = await loadProject({
    root: process.env.OK_VIBE_SLIDES_ROOT || import.meta.dirname,
    configFile: process.env.OK_VIBE_SLIDES_CONFIG || undefined,
    command: env.command,
    mode: env.mode,
  })
  return createViteConfig(project, env)
})
