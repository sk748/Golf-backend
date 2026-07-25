import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The backend (Flask) runs at http://localhost:5000. In dev we proxy /api/* to
// it so the frontend always uses relative /api paths and there is no CORS dance
// (CLAUDE.md §"Base + proxy").
// NOTE: on macOS, port 5000 is commonly occupied by the AirPlay Receiver
// (System Settings → General → AirDrop & Handoff → AirPlay Receiver) — if so,
// run the backend on another port (e.g. 5055) and point this target at it.
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
        target: 'http://localhost:5055',
        changeOrigin: true,
      },
    },
  },
});
