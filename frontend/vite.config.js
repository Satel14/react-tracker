import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
          ],
        },
      },
    ],
  },
});
