import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/auth': api, '/racers': api, '/races': api, '/bets': api, '/me': api, '/stats': api },
  },
  build: { outDir: 'dist' },
});