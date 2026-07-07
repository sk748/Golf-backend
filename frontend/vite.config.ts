import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The backend (Flask) runs at http://localhost:5000. In dev we proxy /api/* to
// it so the frontend always uses relative /api paths and there is no CORS dance
// (CLAUDE.md §"Base + proxy").
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to all interfaces and accept the cloud IDE's proxy host (ONA /
    // Gitpod / Codespaces) so the forwarded URL can reach the dev server.
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
