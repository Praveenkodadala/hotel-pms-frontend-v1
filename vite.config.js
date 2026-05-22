import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // VITE_API_TARGET: internal proxy target (used by Vite dev server)
  //   local dev:  http://localhost:4000  (default)
  //   docker:     http://backend:4000    (set via environment)
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],

    server: {
      host: '0.0.0.0',   // needed for Docker to expose port
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target:       apiTarget,
          changeOrigin: true,
          secure:       false,
        },
      },
    },

    build: {
      outDir:    'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            charts:  ['recharts'],
            http:    ['axios'],
          },
        },
      },
    },
  };
});
