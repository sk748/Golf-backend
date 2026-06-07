import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The backend (Flask) runs at http://localhost:5000. In dev we proxy /api/* to
// it so the frontend always uses relative /api paths and there is no CORS dance
// (CLAUDE.md §"Base + proxy").
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
