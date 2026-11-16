/// <reference types="vite/client" />

import type { DebugAdapter } from './debugAdapter';

declare global {
  interface ViteTypeOptions {
    strictImportMetaEnv: unknown;
  }

  interface ImportMetaEnv {
    readonly VITE_ENABLE_DEBUG_CLI?: string;
    readonly VITE_GIT_REVISION?: string;
    readonly VITE_SYNC_SERVER_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __OK_SHOW_DEBUG__?: DebugAdapter;
  }
}
