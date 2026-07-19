import { defineConfig } from 'vite';

// The Even App WebView loads the built app from a plain static bundle, so
// relative asset paths are required (no assumption about the mount path).
export default defineConfig({
  base: './',
  server: { port: 5190 },
});
