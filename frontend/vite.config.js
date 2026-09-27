import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      output: {
        // React changes far less often than the portal: its own file stays cached across releases.
        manualChunks: (id) => (/node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'vendor' : undefined),
      },
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:5000' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:5000' },
  },
});
