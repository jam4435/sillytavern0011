import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/武侠/test/setup.ts'],
    include: ['./src/武侠/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
