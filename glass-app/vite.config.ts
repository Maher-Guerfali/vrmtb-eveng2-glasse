import { defineConfig } from 'vite';

// The Even App WebView loads the built app from a plain static bundle, so
// relative asset paths are required (no assumption about the mount path).
export default defineConfig({
  base: './',
  // host:true binds to the LAN interface - required for QR sideloading, since
  // the Even App on the phone loads the app straight from this dev server.
  server: { port: 5190, host: true },
  preview: { port: 5190, host: true },
});
