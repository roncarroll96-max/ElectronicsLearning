import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fingerprint, serviceWorkerSource } from './src/serviceWorker';

/**
 * Offline support: writes sw.js into the build with the list of files to keep
 * (the page, scripts, styles, icon and the Latin fonts) and a version made from
 * their names, so each new build replaces the old copy. The worker itself is
 * in src/serviceWorker.ts.
 */
function offline(): Plugin {
  return {
    name: 'circuit-lab-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && (!/\.(woff2?|ttf)$/.test(f) || /-latin-(wght|standard)-normal/.test(f)),
      );
      const precache = ['./', 'index.html', 'favicon.svg', 'sim-audio-worklet.js', ...files.filter((f) => f !== 'index.html')];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(fingerprint(precache.join('\n')), precache) });
    },
  };
}

// base './' so the built site works from any folder, including GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react(), offline()],
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
});
