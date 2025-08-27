export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        allowJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    '**/tests/**/*.test.{ts,js}'
  ],
  testPathIgnorePatterns: [
    'tests/search/discover-enhanced\\.test\\.ts',
    'tests/mcp/tools/lookup-enhanced\\.test\\.ts',
    'tests/mcp/tools/metadata-performance\\.test\\.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/cli/**/*',
    '!src/mcp/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: []
};
