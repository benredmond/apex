import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

// Parse existing Jest config for compatibility
const jestConfig = await import('./jest.config.js').then(m => m.default);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js', 'tests/**/*.test.vitest.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'src/**/*.d.ts',
        'src/cli/**/*',
        'src/mcp/index.js',
        'node_modules/**',
        'tests/**',
        'coverage/**',
        'dist/**',
        '*.config.ts',
        '*.config.js'
      ]
    },
    setupFiles: [],
    testTimeout: 30000,
    pool: 'threads',  // Better isolation than Jest
    poolOptions: {
      threads: {
        singleThread: true  // For database tests
      }
    }
  },
  resolve: {
    conditions: ['node'],
    alias: {
      // Handle .js extensions in TypeScript imports
      '^(.*)\\.js$': '$1'
    }
  },
  esbuild: {
    target: 'es2022'
  }
});