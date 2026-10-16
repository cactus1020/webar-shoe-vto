import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/shoe_vto/',
  build: { rollupOptions: { input: { main: 'index.html', studio: 'studio.html' } } },
  define: { __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    https: true
  },
  optimizeDeps: {
    include: ['three', '@mediapipe/tasks-vision']
  }
});
