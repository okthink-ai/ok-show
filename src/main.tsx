import DebugProfiler from './debug/DebugProfiler';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store/store';
// Global styles - must be imported before components
import './styles/design-system.css';
import './styles/animations.css';
import './index.css';
import PublicApp from './PublicApp';
import ExportView from './components/ExportView';
import { resolveAppSurface } from './appMode';
import { resolveAppRoute } from './routing';
import { presentations } from './project/presentations';
import ThemeController from './components/ThemeController';
import PresentationTitle from './components/PresentationTitle';
import { createDebugAdapter } from './debugAdapter';
// Last, so the project's stylesheets (`styles` in ok-show.config) win
// over the engine's global styles and every template stylesheet.
import 'virtual:ok-show/styles';

const route = resolveAppRoute(window.location.pathname, window.location.hash);
const appSurface = resolveAppSurface(route, import.meta.env.DEV);

if (import.meta.env.VITE_ENABLE_DEBUG_CLI === 'true') {
  window.__OK_SHOW_DEBUG__ = createDebugAdapter(store, presentations);
}

async function mountRoute() {
  const AuthoringApp = import.meta.env.DEV && appSurface === 'authoring' ? (await import('./App')).default : null;
  const SpeakerNotesView = import.meta.env.DEV && appSurface === 'notes' ? (await import('./components/SpeakerNotesView')).default : null;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DebugProfiler id="App"><Provider store={store}>
        <ThemeController />
        <PresentationTitle />
        {appSurface === 'export' && <ExportView />}
        {appSurface === 'presentation' && <PublicApp />}
        {appSurface === 'authoring' && AuthoringApp && (
          <AuthoringApp />
        )}
        {appSurface === 'notes' && SpeakerNotesView && (
          <SpeakerNotesView />
        )}
        {appSurface === 'not-found' && (
          <main>
            <h1>Not found</h1>
            <p>This authoring route is not available on the public presentation.</p>
            <a href="/">Open the presentation</a>
          </main>
        )}
      </Provider></DebugProfiler>
    </StrictMode>
  );
}

void mountRoute();
