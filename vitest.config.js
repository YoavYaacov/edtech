import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Tests only (the production build uses vite.config.js, unchanged).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test/setup.js'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
