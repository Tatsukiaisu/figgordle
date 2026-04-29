import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/figgordle/',
  build: {
    // Firestore (~595 kB) and Three.js/MinionSSJ (~546 kB) are third-party
    // vendor libs already isolated in lazy chunks loaded on demand — not part
    // of the initial bundle. Raise the size warning threshold above them so it
    // still flags genuine regressions in the main entry chunk.
    chunkSizeWarningLimit: 700,
  },
});
