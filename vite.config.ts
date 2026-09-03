import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard configuration for Mnemosyne OS Cartridges
export default defineConfig({
  plugins: [react()],
  base: './', // Vital for custom protocols (mnemo-plugin://)
  server: {
    host: '127.0.0.1', // Forces IPv4 loopback binding for Electron compatibility
    port: 5206,        // Registered in apps/dev-ports.json
    strictPort: true,  // Fails fast if port is already in use
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  // Vitest reads this block straight from the Vite config, which keeps the
  // cartridge free of a `vitest/config` import it cannot resolve on its own.
  // jsdom because the logic under test uses localStorage and DOMParser —
  // the same surfaces it uses in the app.
  test: {
    environment: 'jsdom',
    globals: true,
    // {ts,tsx}: a .test.tsx used to match nothing here, so a rendering test
    // would have been collected by nobody and passed for ever.
    include: ['src/**/*.test.{ts,tsx}']
  }
} as UserConfig & { test: Record<string, unknown> });
