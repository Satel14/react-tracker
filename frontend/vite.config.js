import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ROUTE_META, canonicalFor } from './src/helpers/routeMeta';
import { renderHead } from './src/helpers/renderHead';

// Writes one static shell per fixed route beside the built index.html, so a
// crawler asking for /leaderboards gets that route's title, description and
// canonical instead of the homepage's. Cloudflare Pages serves the flat
// build/leaderboards.html at /leaderboards ahead of its single-page-app
// fallback, which is still what every dynamic route gets.
//
// It lives here rather than in a standalone script because a script run by
// `node` would need the package marked as ESM to import these helpers -- and
// `"type": "module"` changes Rollup's CommonJS interop, which silently turned
// `import CountUp from "react-countup"` into a namespace object and took the
// homepage down. Vite bundles this config with esbuild, so the same imports
// cost nothing here.
const prerenderHead = () => ({
  name: 'prerender-head',
  apply: 'build',
  // closeBundle, not generateBundle: the shell has to be on disk before it can
  // be read, and only the route files are written back.
  closeBundle() {
    const buildDir = new URL('./build/', import.meta.url);
    const shellPath = fileURLToPath(new URL('index.html', buildDir));
    if (!existsSync(shellPath)) {
      throw new Error(`prerender-head: ${shellPath} is missing`);
    }

    // Read once, before writing anything: build/index.html is itself one of the
    // outputs, so re-reading per route would feed the homepage's substitutions
    // into the next route's shell.
    const shell = readFileSync(shellPath, 'utf8');

    const written = ROUTE_META.map((route) => {
      if (route.file === '404.html') {
        // Pages reads a top-level 404.html as "this is not a single-page app"
        // and stops falling back to the shell, which 404s every deep link.
        throw new Error('prerender-head: refusing to write a top-level 404.html');
      }
      return { route, html: renderHead(shell, route) };
    });

    for (const { route, html } of written) {
      writeFileSync(fileURLToPath(new URL(route.file, buildDir)), html);
    }

    // Check the output rather than trusting it: a wrong canonical is invisible
    // until Google has already read it.
    for (const { route } of written) {
      const emitted = readFileSync(fileURLToPath(new URL(route.file, buildDir)), 'utf8');
      const canonical = `<link rel="canonical" href="${canonicalFor(route.path)}" />`;
      if (!emitted.includes(canonical)) {
        throw new Error(`prerender-head: ${route.file} is missing ${canonical}`);
      }
      if ((emitted.match(/rel="canonical"/g) || []).length !== 1) {
        throw new Error(`prerender-head: ${route.file} does not have exactly one canonical`);
      }
    }

    this.info(`wrote ${written.length} route shells`);
  },
});

export default defineConfig({
  plugins: [react(), prerenderHead()],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
  envPrefix: 'VITE_',
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "logic",
          environment: "node",
          globals: true,
          css: false,
          include: [
            "src/helpers/**/*.test.js",
            "src/api/**/*.test.js",
            "src/Language/**/*.test.js",
            "src/component/charts/replayEngine.test.js",
            "src/testProjects.logic.test.js",
            "src/style/**/*.test.js",
            "src/router/navigationTargets.test.js",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          css: false,
          setupFiles: "./src/setupTests.js",
          include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
          exclude: [
            "node_modules/**",
            "build/**",
            "src/helpers/**/*.test.js",
            "src/api/**/*.test.js",
            "src/Language/**/*.test.js",
            "src/component/charts/replayEngine.test.js",
            "src/testProjects.logic.test.js",
            "src/style/**/*.test.js",
            "src/router/navigationTargets.test.js",
          ],
        },
      },
    ],
  },
});
