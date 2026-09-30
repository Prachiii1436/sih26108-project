import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // VITE_BASE_PATH is read from frontend/.env (see .env.example). It becomes
  // import.meta.env.BASE_URL, which drives asset URLs, the react-router
  // basename (src/main.tsx) and the auto-detected API base (src/services/api.ts).
  // The dev server always serves from '/', so only the build is sub-path aware.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    base: mode === 'production' ? env.VITE_BASE_PATH || '/' : '/',
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        // Keeps the browser on a single origin in development -> no CORS surprises.
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
