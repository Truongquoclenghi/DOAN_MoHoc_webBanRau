import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app talks to the Laravel API on port 8000 through this proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/storage': 'http://127.0.0.1:8000',
    },
  },
});
